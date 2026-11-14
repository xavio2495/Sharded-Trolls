//! Root: token metadata, supply bookkeeping and the per-epoch Feeding across the
//! trolls. Ordinary transfers never touch it.
use near_contract_standards::fungible_token::metadata::FungibleTokenMetadata;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json};
use near_sdk::{AccountId, Gas, PanicOnDefault, Promise, env, ext_contract, near, require};
use troll_types::{
    EpochReport, Outcome, Params, emit_troll_event, epoch_at, home_index, now_ms, outcome_effect, validate_setup,
};

pub const GAS_FOR_REPORT: Gas = Gas::from_tgas(10);
pub const GAS_FOR_APPLY: Gas = Gas::from_tgas(10);
pub const GAS_FOR_ON_REPORTS: Gas = Gas::from_tgas(110);
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
        }
    }

    /// Anyone may settle the next finished epoch. Asks every troll for its report,
    /// then decides fed/starved in `on_reports`. Attach about 250 Tgas.
    pub fn settle(&mut self, epoch: u64) -> Promise {
        require!(self.settling.is_none(), "settlement in progress");
        require!(epoch == self.next_epoch, "settle the next unsettled epoch");
        require!(epoch < self.current_epoch(), "epoch not finished");
        self.settling = Some(epoch);
        let mut reports = ext_troll::ext(self.trolls[0].clone()).with_static_gas(GAS_FOR_REPORT).report(epoch);
        for t in &self.trolls[1..] {
            reports = reports.and(ext_troll::ext(t.clone()).with_static_gas(GAS_FOR_REPORT).report(epoch));
        }
        reports.then(Self::ext(env::current_account_id()).with_static_gas(GAS_FOR_ON_REPORTS).on_reports(epoch))
    }

    /// Never panics, so a failed report can't leave the settlement locked; the epoch can be retried.
    #[private]
    pub fn on_reports(&mut self, epoch: u64) -> bool {
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
        let minted: u128 = reports.iter().zip(&effects).map(|(r, (m, _))| r.minted.0 + m).sum();
        let burned: u128 = reports.iter().zip(&effects).map(|(r, (_, b))| r.burned.0 + b).sum();
        // Saturating so that a bad report can never make on_reports panic and lock settlement.
        self.total_supply = (self.initial_supply + minted).saturating_sub(burned);
        self.troll_supply = reports.iter().zip(&effects).map(|(r, (m, b))| (r.supply.0 + m).saturating_sub(*b)).collect();
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
