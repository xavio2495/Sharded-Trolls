//! One troll: the slice of the token ledger for the holders whose home it is (by hash of
//! the account id). Same-troll transfers settle in one receipt; cross-troll transfers debit
//! here and send a `credit` to the receiver's home troll.
use near_sdk::json_types::U128;
use near_sdk::{
    AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue, assert_one_yocto, env,
    ext_contract, near, require,
};
use troll_types::{
    EpochReport, Outcome, Params, REPORT_FORMAT, bps_of, reward_expired, emit_ft_burn, launch_closed_by, reward_funding, starve_burned, emit_ft_mint, emit_ft_transfer, emit_troll_event, epoch_at,
    home_index, now_ms, validate_metadata_sizes, validate_setup,
};

mod kv;
use kv::Map;

pub const GAS_FOR_CREDIT: Gas = Gas::from_tgas(5);
pub const GAS_FOR_ON_CREDIT: Gas = Gas::from_tgas(5);
pub const GAS_FOR_FT_ON_TRANSFER: Gas = Gas::from_tgas(35);
/// Resolve callbacks: a promise result, one account read and write, one log. Twice the
/// usual 5 Tgas, because a cross-troll resolve that fails is booked as "receiver kept everything".
pub const GAS_FOR_RESOLVE: Gas = Gas::from_tgas(10);
/// `credit_call` itself plus the receiver's `ft_on_transfer` and the destination's resolve.
pub const GAS_FOR_CREDIT_CALL: Gas = Gas::from_tgas(10 + 35 + 10);
/// Longest `msg` `ft_transfer_call` accepts. `credit_call` parses and forwards it, so its gas
/// grows with the length; a bound keeps it within the reserved gas at the minimum attached.
pub const MAX_MSG_LEN: usize = 4096;
/// Minimum gas for `ft_transfer_call`. With it and `MAX_MSG_LEN`, `credit_call` always has room to
/// finish its own work, so it fails only after crediting (see `on_credit_call`).
pub const GAS_FOR_TRANSFER_CALL_MIN: Gas = Gas::from_tgas(100);
/// What `credit_call` returns when it did not credit (receiver not registered). Larger than any
/// real unused amount, which is at most the amount credited.
pub const NOT_CREDITED: u128 = u128::MAX;
const MAX_RESULT_LEN: usize = 64;

#[ext_contract(ext_root)]
pub trait RootBounty {
    fn fund_bounty(&mut self);
}

/// Gas for forwarding a claim fee into the root's bounty budget.
pub const GAS_FOR_FUND_BOUNTY: Gas = Gas::from_tgas(3);

#[ext_contract(ext_sibling)]
pub trait Sibling {
    fn credit(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128, toll: U128);
    fn credit_call(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128, toll: U128, msg: String);
}

#[ext_contract(ext_receiver)]
pub trait Receiver {
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128>;
}

/// The `U128` a single promise returned, or `None` if it failed or returned something else.
fn promise_u128() -> Option<u128> {
    env::promise_result_checked(0, MAX_RESULT_LEN)
        .ok()
        .and_then(|b| near_sdk::serde_json::from_slice::<U128>(&b).ok())
        .map(|v| v.0)
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Pool {
    pub share: U128,
    pub remaining: U128,
    /// Feeder slots that can still take a share. At zero the pool is removed and whatever is
    /// left (rounding dust, forfeited or abandoned shares) goes back to food.
    pub open: u32,
    /// Last epoch in which shares can be taken: the epoch the pool was created in, plus
    /// `claim_epochs`. After it the pool can be swept back into food.
    pub deadline: u64,
}

/// NEP-148 token metadata, same JSON shape as the standard's. `reference_hash` stays the
/// base64 string it arrives as.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct FungibleTokenMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
    pub decimals: u8,
}

/// NEP-145 storage balance (same JSON shape as the standard's).
#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
pub struct StorageBalance {
    pub total: NearToken,
    pub available: NearToken,
}

/// NEP-145 storage balance bounds.
#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
pub struct StorageBalanceBounds {
    pub min: NearToken,
    pub max: Option<NearToken>,
}

/// A registered holder. Fixed size, so the NEP-145 deposit covers all of it.
#[near(serializers = [borsh])]
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Account {
    pub balance: u128,
    /// Epochs this account fed and has not been paid for yet, stored as `epoch + 1` (0 = empty).
    pub fed: [u64; 2],
    /// Sent but not yet resolved (cross-troll transfers, transfer-and-calls). While non-zero the
    /// account cannot unregister, so any refund lands on a record whose storage was paid for.
    pub pending: u128,
}

#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
pub struct TrollInfo {
    pub index: u8,
    pub root: AccountId,
    pub epoch: u64,
    pub senders_this_epoch: u32,
    pub supply: U128,
    pub in_flight: U128,
    pub hoard: U128,
    pub launch_pool: U128,
    pub food: U128,
    pub minted: U128,
    pub burned: U128,
    pub last_applied: Option<u64>,
}

#[near(contract_state, contract_metadata(standard(standard = "nep141", version = "1.0.0"), standard(standard = "nep145", version = "1.0.0"), standard(standard = "nep148", version = "1.0.0"), standard(standard = "nep297", version = "1.0.0")))]
#[derive(PanicOnDefault)]
pub struct Troll {
    root: AccountId,
    index: u8,
    trolls: Vec<AccountId>,
    params: Params,
    metadata: FungibleTokenMetadata,
    start_ms: u64,
    accounts: Map<AccountId, Account>,
    /// Balances + hoard + launch pool + food + unclaimed reward pools. Excludes `in_flight`.
    supply: u128,
    in_flight: u128,
    hoard: u128,
    launch_pool: u128,
    /// Tolls eaten from cross-troll transfers arriving here, not yet paid out as rewards.
    food: u128,
    /// Feeder slots of a not-yet-applied epoch that were given up (forfeited, or the account
    /// unregistered) and will never take a share.
    dropped: Map<u64, u32>,
    /// Lowest epoch that may still have a reward pool; `apply` sweeps expired pools from here.
    sweep_cursor: u64,
    initial: u128,
    minted: u128,
    burned: u128,
    senders: Map<u64, u32>,
    pools: Map<u64, Pool>,
    launch_claimed: Map<AccountId, ()>,
    last_applied: Option<u64>,
    /// Bytes one account record takes for the longest account id; holders prepay it (NEP-145).
    account_storage_usage: u64,
}

/// Storage prefix that includes the troll index, so several trolls can share one
/// mocked storage in tests without colliding.
fn key(tag: u8, index: u8) -> Vec<u8> {
    vec![tag, index]
}

/// Integer share of `total` for troll `index` out of `n`; troll 0 also takes the remainder.
fn split(total: u128, n: u8, index: u8) -> u128 {
    total / n as u128 + if index == 0 { total % n as u128 } else { 0 }
}

#[near]
impl Troll {
    /// Every account's home is `trolls[home_index(trolls.len(), account_id)]`, so `trolls`
    /// must be given in the same order to the root and every troll. The caller must be one of `trolls`.
    #[init]
    pub fn new(
        root: AccountId,
        trolls: Vec<AccountId>,
        params: Params,
        metadata: FungibleTokenMetadata,
        start_ms: u64,
        total_supply: U128,
        launch_supply: U128,
    ) -> Self {
        validate_setup(&params, &trolls);
        require!(metadata.spec == "ft-1.0.0", "metadata spec must be ft-1.0.0");
        validate_metadata_sizes(&metadata.name, &metadata.symbol, metadata.icon.as_ref(), metadata.reference.as_ref());
        require!(metadata.reference.is_some() == metadata.reference_hash.is_some(), "reference and reference_hash go together");
        // 32 bytes in padded base64
        require!(metadata.reference_hash.as_ref().is_none_or(|h| h.len() == 44 && h.ends_with('=')), "reference_hash must be 32 bytes");
        require!(launch_supply.0 <= total_supply.0, "launch_supply > total_supply");
        let me = env::current_account_id();
        let index = trolls.iter().position(|t| *t == me).expect("this account is not in trolls") as u8;
        let n = params.troll_count;
        let launch_pool = split(launch_supply.0, n, index);
        let hoard = split(total_supply.0 - launch_supply.0, n, index);
        let mut this = Self {
            root,
            index,
            trolls,
            params,
            metadata,
            start_ms,
            accounts: Map::new(key(b'a', index)),
            supply: launch_pool + hoard,
            in_flight: 0,
            hoard,
            launch_pool,
            food: 0,
            dropped: Map::new(key(b'd', index)),
            sweep_cursor: 0,
            initial: launch_pool + hoard,
            minted: 0,
            burned: 0,
            senders: Map::new(key(b's', index)),
            pools: Map::new(key(b'p', index)),
            launch_claimed: Map::new(key(b'l', index)),
            last_applied: None,
            account_storage_usage: 0,
        };
        this.measure_account_storage();
        emit_ft_mint(&me, this.initial, "initial supply");
        this
    }

    // ---------- holders ----------

    /// NEP-141 transfer. Routes to the receiver's home troll; cross-troll transfers
    /// feed the toll to the receiving troll once the credit is confirmed, and refund in full if it fails.
    /// Resolves to `true` when the receiver was credited.
    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) -> PromiseOrValue<bool> {
        assert_one_yocto();
        let sender_id = env::predecessor_account_id();
        let amount = amount.0;
        require!(amount > 0, "amount must be > 0");
        require!(sender_id != receiver_id, "sender and receiver must differ");
        self.debit(&sender_id, amount);
        self.count_sender(&sender_id, amount);

        let dest = home_index(self.trolls.len(), receiver_id.as_str());
        if dest == self.index as usize {
            self.add_balance(&receiver_id, amount);
            emit_ft_transfer(&sender_id, &receiver_id, amount, memo.as_deref());
            return PromiseOrValue::Value(true);
        }
        self.send_out(&sender_id, amount, dest);
        self.add_pending(&sender_id, amount);
        let toll = bps_of(amount, self.params.toll_bps);
        ext_sibling::ext(self.trolls[dest].clone())
            .with_static_gas(GAS_FOR_CREDIT)
            .credit(sender_id.clone(), receiver_id, U128(amount - toll), U128(toll))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_ON_CREDIT)
                    .on_credit(sender_id, U128(amount), U128(toll)),
            )
            .into()
    }

    /// NEP-141 transfer-and-call. Same troll: standard semantics. Cross troll: the receiver's
    /// home troll credits and calls `ft_on_transfer`; the unused part comes back to the sender
    /// here. Resolves to the amount the receiver kept. Attach at least 100 Tgas.
    #[payable]
    pub fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        assert_one_yocto();
        require!(env::prepaid_gas() >= GAS_FOR_TRANSFER_CALL_MIN, "attach at least 100 Tgas");
        require!(msg.len() <= MAX_MSG_LEN, "msg longer than 4096 bytes");
        let sender_id = env::predecessor_account_id();
        let amount = amount.0;
        require!(amount > 0, "amount must be > 0");
        require!(sender_id != receiver_id, "sender and receiver must differ");
        self.debit(&sender_id, amount);
        self.count_sender(&sender_id, amount);
        self.add_pending(&sender_id, amount);
        let me = env::current_account_id();

        let dest = home_index(self.trolls.len(), receiver_id.as_str());
        if dest == self.index as usize {
            self.add_balance(&receiver_id, amount);
            emit_ft_transfer(&sender_id, &receiver_id, amount, memo.as_deref());
            return ext_receiver::ext(receiver_id.clone())
                .with_static_gas(GAS_FOR_FT_ON_TRANSFER)
                .with_unused_gas_weight(1)
                .ft_on_transfer(sender_id.clone(), U128(amount), msg)
                .then(Self::ext(me).with_static_gas(GAS_FOR_RESOLVE).with_unused_gas_weight(0).ft_resolve_transfer(
                    sender_id,
                    receiver_id,
                    U128(amount),
                ))
                .into();
        }
        self.send_out(&sender_id, amount, dest);
        let toll = bps_of(amount, self.params.toll_bps);
        ext_sibling::ext(self.trolls[dest].clone())
            .with_static_gas(GAS_FOR_CREDIT_CALL)
            .with_unused_gas_weight(1)
            .credit_call(sender_id.clone(), receiver_id, U128(amount - toll), U128(toll), msg)
            .then(Self::ext(me).with_static_gas(GAS_FOR_ON_CREDIT).with_unused_gas_weight(0).on_credit_call(sender_id, U128(amount), U128(toll)))
            .into()
    }

    /// Same-troll `ft_transfer_call` resolution: takes back what the receiver did not use.
    #[private]
    pub fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let back = self.take_back(&receiver_id, amount.0);
        self.resolve_pending(&sender_id, amount.0, back);
        if back > 0 {
            emit_ft_transfer(&receiver_id, &sender_id, back, Some("refund"));
        }
        U128(amount.0 - back)
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.accounts.get(&account_id).map_or(0, |a| a.balance))
    }

    /// Feeder pulls its share of epoch `epoch`'s reward pool. Once per feeder per epoch.
    /// Unclaimed shares are also paid automatically on the feeder's next counted send.
    pub fn claim(&mut self, epoch: u64) -> U128 {
        let who = env::predecessor_account_id();
        let mut a = self.accounts.get(&who).unwrap_or_default();
        let slot = a.fed.iter().position(|s| *s == epoch + 1);
        require!(slot.is_some(), "not a feeder or already claimed");
        // A pool exists while any unexpired slot refers to it, so only an unrewarded or swept
        // epoch lacks one.
        require!(self.pools.contains_key(&epoch), "no reward for this epoch");
        require!(!self.expired(epoch), "claim deadline passed");
        a.fed[slot.unwrap()] = 0;
        let share = self.take_share(epoch, &who);
        a.balance += share;
        self.accounts.insert(&who, &a);
        U128(share)
    }

    /// One launch claim per account, at its home troll, during the launch window.
    /// Registers the caller if needed. Attach the claim fee, plus `storage_balance_bounds().min` if not
    /// registered yet; any excess is refunded. The fee goes to the root's settle-bounty budget,
    /// less the storage this claim's record takes here, which this contract keeps.
    #[payable]
    pub fn claim_launch(&mut self) -> U128 {
        let who = env::predecessor_account_id();
        let now = now_ms();
        require!(now >= self.start_ms, "launch has not started");
        require!(now < self.start_ms + self.params.launch_window_ms, "launch window closed");
        require!(home_index(self.trolls.len(), who.as_str()) == self.index as usize, "claim at your home troll");
        let amount = self.params.launch_claim_amount.0;
        require!(self.launch_pool >= amount, "launch allocation exhausted");
        require!(!self.launch_claimed.contains_key(&who), "already claimed");
        let before = env::storage_usage();
        self.launch_claimed.insert(&who, &());
        let record = env::storage_byte_cost().saturating_mul((env::storage_usage() - before) as u128);
        self.launch_pool -= amount;
        let deposit = env::attached_deposit();
        let fee = NearToken::from_yoctonear(self.params.claim_fee.0);
        let registered = self.accounts.contains_key(&who);
        let due = if registered { fee } else { fee.saturating_add(self.storage_min()) };
        require!(deposit >= due, format!("attach {} yoctoNEAR (claim fee plus storage if not registered)", due.as_yoctonear()));
        if !registered {
            self.accounts.insert(&who, &Account::default());
        }
        let refund = deposit.saturating_sub(due);
        if !refund.is_zero() {
            Promise::new(who.clone()).transfer(refund).detach();
        }
        let to_root = fee.saturating_sub(record);
        if !to_root.is_zero() {
            ext_root::ext(self.root.clone())
                .with_attached_deposit(to_root)
                .with_static_gas(GAS_FOR_FUND_BOUNTY)
                .with_unused_gas_weight(0)
                .fund_bounty()
                .detach();
        }
        self.add_balance(&who, amount);
        emit_ft_transfer(&env::current_account_id(), &who, amount, Some("launch claim"));
        U128(amount)
    }

    // ---------- sibling trolls ----------

    /// Cross-troll leg. Only sibling trolls may call it. The receiver gets `amount`; this troll
    /// eats `toll` (the source took it from the sender), which funds its feeders' rewards.
    /// An unregistered receiver panics before anything changes, so nothing is eaten.
    pub fn credit(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128, toll: U128) {
        let caller = env::predecessor_account_id();
        require!(
            caller != env::current_account_id() && self.trolls.contains(&caller),
            "only sibling trolls can credit"
        );
        self.add_balance(&receiver_id, amount.0);
        self.supply += amount.0 + toll.0;
        emit_ft_mint(&receiver_id, amount.0, &format!("cross-troll from {sender_id} via {caller}"));
        if toll.0 > 0 {
            self.food += toll.0;
            let me = env::current_account_id();
            emit_ft_mint(&me, toll.0, &format!("troll toll from {sender_id}"));
            emit_troll_event("toll_eaten", &format!(r#"{{"account_id":"{sender_id}","amount":"{}"}}"#, toll.0));
        }
    }

    /// Cross-troll leg of `ft_transfer_call`, at the receiver's home troll. Only sibling trolls.
    /// Resolves to the unused amount, or to `NOT_CREDITED` if the receiver is not registered here.
    /// It does not panic on that, so a failed result at the source can only come from a later step,
    /// after the credit landed.
    pub fn credit_call(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
        toll: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        if !self.accounts.contains_key(&receiver_id) {
            let caller = env::predecessor_account_id();
            require!(caller != env::current_account_id() && self.trolls.contains(&caller), "only sibling trolls can credit");
            return PromiseOrValue::Value(U128(NOT_CREDITED));
        }
        self.credit(sender_id.clone(), receiver_id.clone(), amount, toll);
        ext_receiver::ext(receiver_id.clone())
            .with_static_gas(GAS_FOR_FT_ON_TRANSFER)
                .with_unused_gas_weight(1)
            .ft_on_transfer(sender_id.clone(), amount, msg)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_FOR_RESOLVE).with_unused_gas_weight(0).resolve_credit_call(
                sender_id,
                receiver_id,
                amount,
            ))
            .into()
    }

    /// Takes back what the receiver did not use and returns that amount to the source troll,
    /// which refunds it to the sender. Never panics.
    #[private]
    pub fn resolve_credit_call(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let back = self.take_back(&receiver_id, amount.0);
        if back > 0 {
            self.supply -= back;
            emit_ft_burn(&receiver_id, back, &format!("cross-troll return to {sender_id}"));
        }
        U128(back)
    }

    /// Source side of a cross-troll `ft_transfer_call`.
    /// - `NOT_CREDITED`: the destination refused before crediting; the sender gets everything back.
    /// - An amount: the credit happened and this much came back unused; it is refunded.
    /// - A failure or anything unreadable: the credit happened (`credit_call` only reports refusal
    ///   by value) but the destination's resolve did not finish, so the receiver kept everything
    ///   there. Nothing is refunded; refunding would create tokens.
    #[private]
    pub fn on_credit_call(&mut self, sender_id: AccountId, amount: U128, toll: U128) -> U128 {
        self.in_flight -= amount.0;
        let net = amount.0 - toll.0;
        let unused = match promise_u128() {
            Some(NOT_CREDITED) => {
                self.refund_failed_credit(&sender_id, amount.0);
                return U128(0);
            }
            Some(unused) => unused.min(net),
            None => {
                emit_troll_event("credit_unresolved", &format!(r#"{{"account_id":"{sender_id}","amount":"{net}"}}"#));
                0
            }
        };
        self.supply += unused;
        self.resolve_pending(&sender_id, amount.0, unused);
        if unused > 0 {
            emit_ft_mint(&sender_id, unused, "cross-troll return");
        }
        self.book_toll(&sender_id, toll.0);
        U128(net - unused)
    }

    #[private]
    pub fn on_credit(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        toll: U128,
        #[callback_result] credited: Result<(), PromiseError>,
    ) -> bool {
        self.in_flight -= amount.0;
        if credited.is_ok() {
            self.resolve_pending(&sender_id, amount.0, 0);
            self.book_toll(&sender_id, toll.0);
            true
        } else {
            self.refund_failed_credit(&sender_id, amount.0);
            false
        }
    }

    // ---------- root ----------

    /// Counters for a finished epoch. Only the root.
    pub fn report(&mut self, epoch: u64) -> EpochReport {
        self.assert_root();
        require!(epoch < self.current_epoch(), "epoch not finished");
        EpochReport {
            format: REPORT_FORMAT,
            epoch,
            senders: self.senders_in(epoch),
            supply: U128(self.supply),
            in_flight: U128(self.in_flight),
            hoard: U128(self.hoard),
            launch_pool: U128(self.reward_launch_pool(epoch)),
            food: U128(self.food),
            minted: U128(self.minted),
            burned: U128(self.burned),
        }
    }

    /// Applies the root's decision for a finished epoch. Only the root; each epoch at most once, in order.
    pub fn apply(&mut self, epoch: u64, outcome: Outcome) {
        self.assert_root();
        require!(epoch < self.current_epoch(), "epoch not finished");
        require!(self.last_applied.is_none_or(|l| epoch > l), "epoch already applied");
        match &outcome {
            Outcome::Reward { amount, .. } => require!(
                amount.0 <= self.params.reward_per_epoch.0 / self.params.troll_count as u128,
                "reward above params"
            ),
            Outcome::Burn { bps } => require!(*bps <= self.params.starve_burn_bps, "burn above params"),
            Outcome::NoOp => {}
        }
        self.last_applied = Some(epoch);
        // This epoch's counters are no longer needed once it is applied.
        let feeders = self.senders_in(epoch);
        self.senders.remove(&epoch);
        let dropped = self.dropped.get(&epoch).unwrap_or(0);
        self.dropped.remove(&epoch);
        let me = env::current_account_id();
        // Sweep expired pools, oldest first, a few steps per apply. Deadlines follow the order in
        // which pools were created, so the oldest pool always expires first; the cursor moves at
        // most 3 epochs per apply and one epoch is added per apply, so it keeps up.
        for _ in 0..3 {
            let c = self.sweep_cursor;
            if c >= epoch {
                break;
            }
            match self.pools.get(&c) {
                None => self.sweep_cursor += 1,
                Some(p) if reward_expired(p.deadline, self.current_epoch()) => {
                    self.sweep_pool(c);
                    self.sweep_cursor += 1;
                }
                Some(_) => break,
            }
        }
        match outcome {
            Outcome::Reward { amount, food } => {
                // Food first (at most what the root booked), then unclaimed launch tokens, then new
                // tokens. The first two are already supply held by this troll; they just move.
                let food = food.0.min(self.food);
                let (from_reserve, minted) = reward_funding(amount.0, feeders, food + self.reward_launch_pool(epoch));
                let total = from_reserve + minted;
                if total == 0 {
                    return;
                }
                let share = total / feeders as u128;
                let open = feeders.saturating_sub(dropped);
                let from_food = from_reserve.min(food);
                let from_pool = from_reserve - from_food;
                self.food -= from_food;
                self.launch_pool -= from_pool;
                if from_food > 0 {
                    emit_troll_event("reward_from_food", &format!(r#"{{"epoch":{epoch},"amount":"{from_food}"}}"#));
                }
                self.supply += minted;
                self.minted += minted;
                if minted > 0 {
                    emit_ft_mint(&me, minted, &format!("feeding reward epoch {epoch}"));
                }
                if from_pool > 0 {
                    emit_troll_event("reward_from_launch_pool", &format!(r#"{{"epoch":{epoch},"amount":"{from_pool}"}}"#));
                }
                let deadline = self.current_epoch() + self.params.claim_epochs;
                self.store_pool(epoch, Pool { share: U128(share), remaining: U128(total), open, deadline });
            }
            Outcome::Burn { bps } => {
                let amount = starve_burned(self.hoard, bps);
                if amount == 0 {
                    return;
                }
                self.hoard -= amount;
                self.supply -= amount;
                self.burned += amount;
                emit_ft_burn(&me, amount, &format!("starved epoch {epoch}"));
            }
            Outcome::NoOp => {}
        }
    }

    /// Removes the reward pool of `epoch` once its claim deadline has passed and returns what is
    /// left to food. Anyone may call it; `apply` does it for one epoch each time.
    pub fn sweep(&mut self, epoch: u64) -> U128 {
        require!(self.pools.contains_key(&epoch), "no pool for this epoch");
        require!(self.expired(epoch), "claim deadline not passed");
        U128(self.sweep_pool(epoch))
    }

    // ---------- views ----------

    pub fn current_epoch(&self) -> u64 {
        epoch_at(now_ms(), self.start_ms, self.params.epoch_ms)
    }

    /// Counted senders of `epoch` until it is applied; zero after that (the entry is pruned).
    pub fn senders_in(&self, epoch: u64) -> u32 {
        self.senders.get(&epoch).unwrap_or(0)
    }

    /// True while `account_id` fed in `epoch` and has not been paid (or forfeited) for it.
    pub fn is_feeder(&self, epoch: u64, account_id: AccountId) -> bool {
        self.accounts.get(&account_id).is_some_and(|a| a.fed.contains(&(epoch + 1)))
    }

    pub fn pool(&self, epoch: u64) -> Option<Pool> {
        self.pools.get(&epoch)
    }

    pub fn home_troll(&self, account_id: AccountId) -> AccountId {
        self.trolls[home_index(self.trolls.len(), account_id.as_str())].clone()
    }

    pub fn has_claimed_launch(&self, account_id: AccountId) -> bool {
        self.launch_claimed.contains_key(&account_id)
    }

    pub fn params(&self) -> Params {
        self.params.clone()
    }

    pub fn trolls(&self) -> Vec<AccountId> {
        self.trolls.clone()
    }

    /// NEP-148 metadata; the same on the root and every troll.
    pub fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.clone()
    }

    /// This troll's share of the supply: balances, hoard, launch pool and unclaimed reward
    /// pools held here. Outgoing cross-troll amounts are logged as burned when they leave and
    /// as minted when they arrive, so this matches the sum of this contract's own events.
    /// The token-wide total is the sum over all trolls (plus anything in flight).
    pub fn ft_total_supply(&self) -> U128 {
        U128(self.supply)
    }

    pub fn info(&self) -> TrollInfo {
        let epoch = self.current_epoch();
        TrollInfo {
            index: self.index,
            root: self.root.clone(),
            epoch,
            senders_this_epoch: self.senders_in(epoch),
            supply: U128(self.supply),
            in_flight: U128(self.in_flight),
            hoard: U128(self.hoard),
            launch_pool: U128(self.launch_pool),
            food: U128(self.food),
            minted: U128(self.minted),
            burned: U128(self.burned),
            last_applied: self.last_applied,
        }
    }
}

impl Troll {
    fn assert_root(&self) {
        require!(env::predecessor_account_id() == self.root, "only the root");
    }

    fn debit(&mut self, who: &AccountId, amount: u128) {
        let mut a = self.accounts.get(who).unwrap_or_default();
        require!(a.balance >= amount, "insufficient balance");
        a.balance -= amount;
        self.accounts.insert(who, &a);
    }

    /// Credits a registered account; panics otherwise (a cross-troll credit then refunds the sender).
    fn add_balance(&mut self, who: &AccountId, amount: u128) {
        let mut a = self.accounts.get(who).unwrap_or_else(|| env::panic_str(&format!("{who} is not registered")));
        a.balance += amount;
        self.accounts.insert(who, &a);
    }

    /// Moves a debited cross-troll amount out of this troll's supply into `in_flight`.
    fn send_out(&mut self, who: &AccountId, amount: u128, dest: usize) {
        self.supply -= amount;
        self.in_flight += amount;
        emit_ft_burn(who, amount, &format!("cross-troll to {}", self.trolls[dest]));
    }

    /// The destination did not credit: the sender gets the whole amount back here.
    fn refund_failed_credit(&mut self, who: &AccountId, amount: u128) {
        self.supply += amount;
        self.resolve_pending(who, amount, amount);
        emit_ft_mint(who, amount, "cross-troll refund");
        emit_troll_event("credit_refunded", &format!(r#"{{"account_id":"{who}","amount":"{amount}"}}"#));
    }

    /// Notes the toll of a confirmed cross-troll transfer. Nothing is burned: the destination
    /// minted the amount minus the toll to the receiver and the toll to itself as food.
    fn book_toll(&mut self, who: &AccountId, toll: u128) {
        if toll > 0 {
            emit_troll_event("toll", &format!(r#"{{"account_id":"{who}","amount":"{toll}"}}"#));
        }
    }

    fn add_pending(&mut self, who: &AccountId, amount: u128) {
        let mut a = self.accounts.get(who).unwrap_or_default();
        a.pending += amount;
        self.accounts.insert(who, &a);
    }

    /// Closes `sent` of `who`'s pending amount and credits `refund` of it back. The record
    /// exists: an account with anything pending cannot unregister.
    fn resolve_pending(&mut self, who: &AccountId, sent: u128, refund: u128) {
        let mut a = self.accounts.get(who).unwrap_or_default();
        a.pending -= sent;
        a.balance += refund;
        self.accounts.insert(who, &a);
    }

    /// For a transfer-and-call resolution: the unused amount the receiver reported (all of it if
    /// the call failed or returned garbage), capped by what the receiver still holds; debited.
    fn take_back(&mut self, receiver_id: &AccountId, amount: u128) -> u128 {
        let unused = promise_u128().unwrap_or(amount).min(amount);
        let Some(mut a) = self.accounts.get(receiver_id) else {
            return 0;
        };
        let back = unused.min(a.balance);
        if back > 0 {
            a.balance -= back;
            self.accounts.insert(receiver_id, &a);
        }
        back
    }

    /// Pays `who` one share of `epoch`'s pool if there is one; returns the amount (the caller credits it).
    fn take_share(&mut self, epoch: u64, who: &AccountId) -> u128 {
        let Some(mut pool) = self.pools.get(&epoch) else {
            return 0;
        };
        let share = pool.share.0;
        pool.remaining.0 -= share;
        pool.open -= 1;
        self.store_pool(epoch, pool);
        emit_ft_transfer(&env::current_account_id(), who, share, Some("feeding reward"));
        share
    }

    /// Keeps a pool while some slot can still take from it; otherwise removes it and returns
    /// what is left to food (it stays supply held by this troll).
    fn store_pool(&mut self, epoch: u64, pool: Pool) {
        if pool.open > 0 {
            self.pools.insert(&epoch, &pool);
            return;
        }
        self.pools.remove(&epoch);
        if pool.remaining.0 > 0 {
            self.food += pool.remaining.0;
            emit_troll_event("reward_leftover_to_food", &format!(r#"{{"epoch":{epoch},"amount":"{}"}}"#, pool.remaining.0));
        }
    }

    /// True if `epoch` has a reward pool whose claim deadline has passed.
    fn expired(&self, epoch: u64) -> bool {
        self.pools.get(&epoch).is_some_and(|p| reward_expired(p.deadline, self.current_epoch()))
    }

    /// Logs a share given up without pay, so lost rewards are visible.
    fn note_unpaid(&self, who: &AccountId, epoch: u64, reason: &str) {
        emit_troll_event("reward_unpaid", &format!(r#"{{"account_id":"{who}","epoch":{epoch},"reason":"{reason}"}}"#));
    }

    /// Deletes the pool of an expired epoch; what is left goes back to food. Slots that still name
    /// the epoch are cleared without pay when their account next sends, claims or unregisters.
    fn sweep_pool(&mut self, epoch: u64) -> u128 {
        let Some(pool) = self.pools.get(&epoch) else { return 0 };
        self.pools.remove(&epoch);
        self.food += pool.remaining.0;
        emit_troll_event("reward_expired", &format!(r#"{{"epoch":{epoch},"amount":"{}"}}"#, pool.remaining.0));
        pool.remaining.0
    }

    /// A feeder slot for `epoch` will never be paid (forfeited, or its account left).
    fn release_slot(&mut self, epoch: u64) {
        if self.last_applied.is_some_and(|l| epoch <= l) {
            if let Some(mut pool) = self.pools.get(&epoch) {
                pool.open -= 1;
                self.store_pool(epoch, pool);
            }
        } else {
            let n = self.dropped.get(&epoch).unwrap_or(0);
            self.dropped.insert(&epoch, &(n + 1));
        }
    }

    /// Unclaimed launch tokens available to fund `epoch`'s reward: all of them once the launch
    /// window has closed by the end of that epoch, none before.
    fn reward_launch_pool(&self, epoch: u64) -> u128 {
        if launch_closed_by(epoch, &self.params) { self.launch_pool } else { 0 }
    }

    fn storage_min(&self) -> NearToken {
        env::storage_byte_cost().saturating_mul(self.account_storage_usage as u128)
    }

    fn measure_account_storage(&mut self) {
        let before = env::storage_usage();
        let probe: AccountId = "a".repeat(64).parse().unwrap();
        self.accounts.insert(&probe, &Account { balance: u128::MAX, fed: [u64::MAX; 2], pending: u128::MAX });
        self.account_storage_usage = env::storage_usage() - before;
        self.accounts.remove(&probe);
    }

    /// Counts `who` as a feeder of the current epoch (once). Settled epochs in the account's
    /// two fed slots are paid out (if rewarded) and freed first; if both slots still hold
    /// unsettled epochs, the oldest is forfeited.
    fn count_sender(&mut self, who: &AccountId, amount: u128) {
        if amount < self.params.min_counted_transfer.0 {
            return;
        }
        let epoch = self.current_epoch();
        let mut a = self.accounts.get(who).unwrap_or_default();
        if a.fed.contains(&(epoch + 1)) {
            return;
        }
        for i in 0..a.fed.len() {
            let tag = a.fed[i];
            if tag != 0 && self.last_applied.is_some_and(|l| tag - 1 <= l) {
                if self.expired(tag - 1) {
                    self.note_unpaid(who, tag - 1, "expired");
                    self.release_slot(tag - 1);
                } else {
                    a.balance += self.take_share(tag - 1, who);
                }
                a.fed[i] = 0;
            }
        }
        let i = match a.fed.iter().position(|s| *s == 0) {
            Some(i) => i,
            None => {
                let i = if a.fed[0] <= a.fed[1] { 0 } else { 1 };
                emit_troll_event(
                    "reward_forfeited",
                    &format!(r#"{{"account_id":"{who}","epoch":{}}}"#, a.fed[i] - 1),
                );
                self.release_slot(a.fed[i] - 1);
                i
            }
        };
        a.fed[i] = epoch + 1;
        self.accounts.insert(who, &a);
        let n = self.senders_in(epoch);
        self.senders.insert(&epoch, &(n + 1));
    }
}

/// NEP-145. Registration costs a fixed `min` (= `max`); there is never withdrawable storage.
/// Accounts register at their home troll, where their balance lives.
#[near]
impl Troll {
    #[payable]
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        let _ = registration_only;
        let deposit = env::attached_deposit();
        let caller = env::predecessor_account_id();
        let account_id = account_id.unwrap_or_else(|| caller.clone());
        require!(
            home_index(self.trolls.len(), account_id.as_str()) == self.index as usize,
            "register at the account's home troll"
        );
        // The trolls' own holdings (hoard, pools) are not account records; tokens sent to a troll
        // id would be stuck, since no one signs for it.
        require!(!self.trolls.contains(&account_id), "troll accounts cannot hold tokens");
        let min = self.storage_min();
        let refund = if self.accounts.contains_key(&account_id) {
            deposit
        } else {
            require!(deposit >= min, format!("attach at least {} yoctoNEAR", min.as_yoctonear()));
            self.accounts.insert(&account_id, &Account::default());
            deposit.saturating_sub(min)
        };
        if !refund.is_zero() {
            Promise::new(caller).transfer(refund).detach();
        }
        StorageBalance { total: min, available: NearToken::from_yoctonear(0) }
    }

    #[payable]
    pub fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        assert_one_yocto();
        let who = env::predecessor_account_id();
        require!(self.accounts.contains_key(&who), format!("{who} is not registered"));
        require!(amount.is_none_or(|a| a.is_zero()), "no storage balance available to withdraw");
        StorageBalance { total: self.storage_min(), available: NearToken::from_yoctonear(0) }
    }

    /// Without `force`, the token balance must be zero. With `force`, the remaining balance is burned.
    #[payable]
    pub fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        assert_one_yocto();
        let who = env::predecessor_account_id();
        let Some(Account { balance, pending, fed }) = self.accounts.get(&who) else {
            return false;
        };
        require!(pending == 0, "transfers in flight; try again after they resolve");
        // Rewards that can still be taken are paid out first, so they are never dropped silently;
        // the rest (unsettled or expired) are given up and end up back in food.
        let mut bal = balance;
        for tag in fed.into_iter().filter(|t| *t != 0) {
            let e = tag - 1;
            let settled = self.last_applied.is_some_and(|l| e <= l);
            if settled && self.pools.contains_key(&e) && !self.expired(e) {
                bal += self.take_share(e, &who);
            } else {
                if !settled || self.pools.contains_key(&e) {
                    self.note_unpaid(&who, e, if settled { "expired" } else { "unregistered" });
                }
                self.release_slot(e);
            }
        }
        if bal > 0 {
            require!(
                force == Some(true),
                "token balance (with any unclaimed rewards) is not zero; move it first, or use force to burn it"
            );
            self.supply -= bal;
            self.burned += bal;
            emit_ft_burn(&who, bal, "storage_unregister");
        }
        self.accounts.remove(&who);
        Promise::new(who).transfer(self.storage_min().saturating_add(NearToken::from_yoctonear(1))).detach();
        true
    }

    pub fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        let min = self.storage_min();
        StorageBalanceBounds { min, max: Some(min) }
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.accounts
            .contains_key(&account_id)
            .then(|| StorageBalance { total: self.storage_min(), available: NearToken::from_yoctonear(0) })
    }
}

#[cfg(test)]
mod tests;
