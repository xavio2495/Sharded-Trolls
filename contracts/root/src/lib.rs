//! Root: token metadata, supply bookkeeping and the per-epoch Feeding across the
//! trolls. Ordinary transfers never touch it.
use near_contract_standards::fungible_token::metadata::FungibleTokenMetadata;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json};
use near_sdk::{AccountId, Gas, NearToken, PanicOnDefault, Promise, env, ext_contract, near, require};
use troll_types::{
    EpochReport, Outcome, Params, emit_troll_event, epoch_at, home_index, now_ms, outcome_effect, validate_metadata_sizes,
    validate_setup,
};

pub const GAS_FOR_REPORT: Gas = Gas::from_tgas(10);
pub const GAS_FOR_APPLY: Gas = Gas::from_tgas(10);
pub const GAS_FOR_ON_REPORTS: Gas = Gas::from_tgas(110);
/// Minimum gas for `settle`: the report calls, `on_reports` and `settle`'s own work, with margin.
/// A call with less fails up front instead of starting a settlement `on_reports` can't finish.
pub const GAS_FOR_SETTLE_MIN: Gas = Gas::from_tgas(250);
/// Blocks after which an unfinished settlement may be started again. A settlement normally
/// finishes within a few blocks; this only matters if `on_reports` never completes.
pub const SETTLE_TIMEOUT_BLOCKS: u64 = 600;
/// NEAR the root keeps on top of its storage before it pays a settle bounty.
pub const BOUNTY_RESERVE: NearToken = NearToken::from_millinear(10);
const MAX_REPORT_LEN: usize = 1_024;

/// `json!` serialized to a `String`.
macro_rules! json_str {
    ($($t:tt)*) => { json!($($t)*).to_string() };
}

#[ext_contract(ext_troll)]
pub trait TrollApi {
    fn report(&mut self, epoch: u64) -> EpochReport;
    fn apply(&mut self, epoch: u64, outcome: Outcome);
}

#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
pub struct RootInfo {
    pub next_epoch: u64,
    pub current_epoch: u64,
    pub settling: Option<u64>,
    pub streak: u64,
    pub best_streak: u64,
    pub total_supply: U128,
    pub troll_supply: Vec<U128>,
    pub troll_in_flight: Vec<U128>,
    pub last_senders: Vec<u32>,
}

#[near(contract_state, contract_metadata(standard(standard = "nep148", version = "1.0.0"), standard(standard = "nep297", version = "1.0.0")))]
#[derive(PanicOnDefault)]
pub struct Root {
    params: Params,
    trolls: Vec<AccountId>,
    start_ms: u64,
    metadata: FungibleTokenMetadata,
    initial_supply: u128,
    /// Exact total supply right after the last settlement is applied: initial supply plus
    /// everything minted, minus everything burned, including that settlement's own effects.
    total_supply: u128,
    troll_supply: Vec<u128>,
    troll_in_flight: Vec<u128>,
    last_senders: Vec<u32>,
    streak: u64,
    best_streak: u64,
    /// Settlement runs epoch by epoch; this is the next one to settle.
    next_epoch: u64,
    /// Set while a settlement's reports are in flight.
    settling: Option<u64>,
    /// Block height at which the current settlement started.
    settling_since: u64,
    /// Counts settlement attempts; `on_reports` acts only for the latest one.
    attempt: u64,
    /// Who started the latest settlement attempt; paid the settle bounty if it succeeds.
    settler: AccountId,
}

#[near]
impl Root {
    /// Every account's home is `trolls[home_index(trolls.len(), account_id)]`. The same `trolls`
    /// (same order), `params`, `start_ms` and supplies must be given to every troll.
    #[init]
    pub fn new(
        params: Params,
        trolls: Vec<AccountId>,
        start_ms: u64,
        total_supply: U128,
        metadata: FungibleTokenMetadata,
    ) -> Self {
        validate_setup(&params, &trolls);
        metadata.assert_valid();
        validate_metadata_sizes(&metadata.name, &metadata.symbol, metadata.icon.as_ref(), metadata.reference.as_ref());
        let n = trolls.len();
        let share = total_supply.0 / n as u128;
        let mut troll_supply = vec![share; n];
        troll_supply[0] += total_supply.0 % n as u128;
        Self {
            params,
            trolls,
            start_ms,
            metadata,
            initial_supply: total_supply.0,
            total_supply: total_supply.0,
            troll_supply,
            troll_in_flight: vec![0; n],
            last_senders: vec![0; n],
            streak: 0,
            best_streak: 0,
            next_epoch: 0,
            settling: None,
            settling_since: 0,
            attempt: 0,
            settler: env::current_account_id(),
        }
    }

    /// Anyone may settle the next finished epoch. Asks every troll for its report,
    /// then decides fed/starved in `on_reports`. Attach at least 250 Tgas.
    /// If a settlement started more than `SETTLE_TIMEOUT_BLOCKS` ago never finished, this starts
    /// it again; the earlier attempt's `on_reports`, if it still arrives, is ignored.
    pub fn settle(&mut self, epoch: u64) -> Promise {
        require!(env::prepaid_gas() >= GAS_FOR_SETTLE_MIN, "attach at least 250 Tgas");
        if let Some(e) = self.settling {
            require!(env::block_height() >= self.settling_since + SETTLE_TIMEOUT_BLOCKS, "settlement in progress");
            emit_troll_event("settle_expired", &json_str!({ "epoch": e, "attempt": self.attempt }));
            self.settling = None;
        }
        require!(epoch == self.next_epoch, "settle the next unsettled epoch");
        require!(epoch < self.current_epoch(), "epoch not finished");
        self.settling = Some(epoch);
        self.settling_since = env::block_height();
        self.attempt += 1;
        self.settler = env::predecessor_account_id();
        // Reports have a fixed cost; any gas left over goes to `on_reports`.
        let report = |t: &AccountId| ext_troll::ext(t.clone()).with_static_gas(GAS_FOR_REPORT).with_unused_gas_weight(0).report(epoch);
        let mut reports = report(&self.trolls[0]);
        for t in &self.trolls[1..] {
            reports = reports.and(report(t));
        }
        reports.then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_FOR_ON_REPORTS)
                .with_unused_gas_weight(1)
                .on_reports(epoch, self.attempt),
        )
    }

    /// Never panics, so a failed report can't leave the settlement locked; the epoch can be retried.
    /// Ignores a stale attempt (one replaced after a timeout).
    #[private]
    pub fn on_reports(&mut self, epoch: u64, attempt: u64) -> bool {
        if self.settling != Some(epoch) || self.attempt != attempt {
            emit_troll_event("settle_stale", &json_str!({ "epoch": epoch, "attempt": attempt }));
            return false;
        }
        self.settling = None;
        let n = self.trolls.len() as u64;
        let mut reports = Vec::with_capacity(n as usize);
        for i in 0..env::promise_results_count().min(n) {
            match env::promise_result_checked(i, MAX_REPORT_LEN)
                .ok()
                .and_then(|b| serde_json::from_slice::<EpochReport>(&b).ok())
            {
                Some(r) if r.epoch == epoch => reports.push(r),
                _ => break,
            }
        }
        if reports.len() as u64 != n {
            emit_troll_event("settle_failed", &json_str!({ "epoch": epoch, "reports": reports.len() }));
            return false;
        }
        for (i, outcome) in self.decide(epoch, &reports).into_iter().enumerate() {
            ext_troll::ext(self.trolls[i].clone()).with_static_gas(GAS_FOR_APPLY).apply(epoch, outcome).detach();
        }
        self.pay_bounty(epoch);
        true
    }

    // ---------- views ----------

    pub fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.clone()
    }

    /// Total supply as of the last settlement, including that settlement's own mints and burns.
    /// Toll burns since then show up at the next settlement. Exact live figures are on each troll.
    pub fn ft_total_supply(&self) -> U128 {
        U128(self.total_supply)
    }

    pub fn trolls(&self) -> Vec<AccountId> {
        self.trolls.clone()
    }

    pub fn home_troll(&self, account_id: AccountId) -> AccountId {
        self.trolls[home_index(self.trolls.len(), account_id.as_str())].clone()
    }

    pub fn params(&self) -> Params {
        self.params.clone()
    }

    /// (current streak, best streak)
    pub fn streak(&self) -> (u64, u64) {
        (self.streak, self.best_streak)
    }

    pub fn current_epoch(&self) -> u64 {
        epoch_at(now_ms(), self.start_ms, self.params.epoch_ms)
    }

    pub fn info(&self) -> RootInfo {
        RootInfo {
            next_epoch: self.next_epoch,
            current_epoch: self.current_epoch(),
            settling: self.settling,
            streak: self.streak,
            best_streak: self.best_streak,
            total_supply: U128(self.total_supply),
            troll_supply: self.troll_supply.iter().map(|s| U128(*s)).collect(),
            troll_in_flight: self.troll_in_flight.iter().map(|s| U128(*s)).collect(),
            last_senders: self.last_senders.clone(),
        }
    }
}

impl Root {
    /// Pays the settle bounty to the latest attempt's settler, only if the balance still covers
    /// storage plus `BOUNTY_RESERVE` afterwards. Checks first, so it never fails `on_reports`.
    fn pay_bounty(&mut self, epoch: u64) {
        let bounty = self.params.settle_bounty.0;
        if bounty == 0 {
            return;
        }
        let reserve = env::storage_byte_cost()
            .saturating_mul(env::storage_usage() as u128)
            .saturating_add(BOUNTY_RESERVE)
            .as_yoctonear();
        let account_id = self.settler.clone();
        if env::account_balance().as_yoctonear() >= reserve.saturating_add(bounty) {
            Promise::new(account_id.clone()).transfer(NearToken::from_yoctonear(bounty)).detach();
            emit_troll_event("settle_bounty_paid", &json_str!({ "epoch": epoch, "account_id": account_id, "amount": U128(bounty) }));
        } else {
            emit_troll_event("settle_bounty_skipped", &json_str!({ "epoch": epoch, "account_id": account_id, "amount": U128(bounty) }));
        }
    }

    /// The Feeding: all trolls fed → streak + 1 and every troll mints its reward share;
    /// otherwise the streak resets and each starving troll burns part of its hoard.
    fn decide(&mut self, epoch: u64, reports: &[EpochReport]) -> Vec<Outcome> {
        self.troll_in_flight = reports.iter().map(|r| r.in_flight.0).collect();
        self.last_senders = reports.iter().map(|r| r.senders).collect();
        self.next_epoch = epoch + 1;

        let target = self.params.feed_target;
        let fed = reports.iter().all(|r| r.senders >= target);
        let outcomes = if fed {
            self.streak += 1;
            self.best_streak = self.best_streak.max(self.streak);
            let amount = U128(self.params.reward_per_epoch.0 / self.trolls.len() as u128);
            vec![Outcome::Reward { amount }; reports.len()]
        } else {
            self.streak = 0;
            reports
                .iter()
                .enumerate()
                .map(|(i, r)| {
                    if r.senders >= target {
                        return Outcome::NoOp;
                    }
                    emit_troll_event(
                        "troll_starved",
                        &json_str!({ "epoch": epoch, "troll": self.trolls[i], "senders": r.senders, "feed_target": target }),
                    );
                    Outcome::Burn { bps: self.params.starve_burn_bps }
                })
                .collect()
        };
        // Book the outcomes exactly as each troll will apply them (shared rounding).
        let effects: Vec<(u128, u128)> = reports.iter().zip(&outcomes).map(|(r, o)| outcome_effect(r, o)).collect();
        // Saturating throughout so that a bad report can never make on_reports panic.
        let minted = reports.iter().zip(&effects).fold(0u128, |s, (r, (m, _))| s.saturating_add(r.minted.0.saturating_add(*m)));
        let burned = reports.iter().zip(&effects).fold(0u128, |s, (r, (_, b))| s.saturating_add(r.burned.0.saturating_add(*b)));
        self.total_supply = self.initial_supply.saturating_add(minted).saturating_sub(burned);
        self.troll_supply = reports.iter().zip(&effects).map(|(r, (m, b))| r.supply.0.saturating_add(*m).saturating_sub(*b)).collect();
        emit_troll_event(
            "feeding_settled",
            &json_str!({ "epoch": epoch, "fed": fed, "senders": self.last_senders, "total_supply": U128(self.total_supply) }),
        );
        emit_troll_event("streak", &json_str!({ "epoch": epoch, "streak": self.streak, "best_streak": self.best_streak }));
        outcomes
    }
}

#[cfg(test)]
mod tests;
