#![allow(unused_must_use)]
use super::*;
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::{NearToken, testing_env};
use std::collections::HashMap;

const START: u64 = 1_000_000;
const EPOCH: u64 = 1_000;
const ROOT: &str = "root.t";

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn params(n: u8) -> Params {
    Params {
        troll_count: n,
        toll_bps: 25,
        feed_target: 2,
        reward_per_epoch: U128(3_000),
        starve_burn_bps: 100,
        epoch_ms: EPOCH,
        launch_window_ms: 5 * EPOCH,
        launch_claim_amount: U128(100_000),
        min_counted_transfer: U128(10),
    }
}

fn ctx(current: &AccountId, pred: &AccountId, ms: u64, yocto: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(current.clone())
        .predecessor_account_id(pred.clone())
        .signer_account_id(pred.clone())
        .block_timestamp(ms * 1_000_000)
        .attached_deposit(NearToken::from_yoctonear(yocto))
        .prepaid_gas(Gas::from_tgas(300));
    testing_env!(b.build());
}

/// Several trolls sharing one mocked storage; the test plays the runtime.
struct Net {
    t: Vec<Troll>,
    ids: Vec<AccountId>,
    now: u64,
}

impl Net {
    /// `n` trolls with ranges split on single letters; troll `i` holds ids starting with `first_letter(i)`.
    fn new(n: u8, total: u128, launch: u128) -> Self {
        let ids: Vec<AccountId> = (0..n).map(|i| acc(&format!("troll{i}.t"))).collect();
        let t = ids
            .iter()
            .map(|id| {
                ctx(id, &acc("deployer.t"), START, 0);
                Troll::new(acc(ROOT), ids.clone(), params(n), START, U128(total), U128(launch))
            })
            .collect();
        Net { t, ids, now: START }
    }

    /// The `k`-th account (in a fixed name sequence) whose home is troll `i`; independent of how
    /// `home_index` maps ids to trolls.
    fn user(&self, i: usize, k: usize) -> AccountId {
        (0..)
            .map(|j| acc(&format!("{}{j}.u", (b'a' + (j % 26) as u8) as char)))
            .filter(|a| home_index(self.ids.len(), a.as_str()) == i)
            .nth(k)
            .unwrap()
    }

    fn as_<R>(&mut self, i: usize, pred: &AccountId, yocto: u128, f: impl FnOnce(&mut Troll) -> R) -> R {
        ctx(&self.ids[i], pred, self.now, yocto);
        f(&mut self.t[i])
    }

    fn min(&self) -> u128 {
        self.t[0].storage_min().as_yoctonear()
    }

    /// Registers `who` at its home troll (NEP-145) unless already registered.
    fn reg(&mut self, who: &AccountId) {
        let h = home_index(self.ids.len(), who.as_str());
        if self.t[h].storage_balance_of(who.clone()).is_none() {
            let (w, m) = (who.clone(), self.min());
            self.as_(h, who, m, |t| t.storage_deposit(Some(w), None));
        }
    }

    /// Transfer, registering the receiver at its home troll first.
    fn transfer(&mut self, i: usize, from: &AccountId, to: &AccountId, amount: u128) -> PromiseOrValue<bool> {
        self.reg(to);
        self.transfer_raw(i, from, to, amount)
    }

    fn transfer_raw(&mut self, i: usize, from: &AccountId, to: &AccountId, amount: u128) -> PromiseOrValue<bool> {
        let to = to.clone();
        self.as_(i, from, 1, |t| t.ft_transfer(to, U128(amount), None))
    }

    fn launch(&mut self, i: usize, who: &AccountId) -> u128 {
        let m = self.min();
        self.as_(i, who, m, |t| t.claim_launch()).0
    }

    fn bal(&self, i: usize, who: &AccountId) -> u128 {
        self.t[i].ft_balance_of(who.clone()).0
    }

    /// Delivers a cross-troll credit from troll `src` to troll `dst` (the runtime's job).
    fn credit(&mut self, src: usize, dst: usize, sender: &AccountId, receiver: &AccountId, net: u128) {
        let (s, r, from) = (sender.clone(), receiver.clone(), self.ids[src].clone());
        self.as_(dst, &from, 0, |t| t.credit(s, r, U128(net)));
    }

    fn on_credit(&mut self, src: usize, sender: &AccountId, amount: u128, toll: u128, ok: bool) -> bool {
        let (s, me) = (sender.clone(), self.ids[src].clone());
        let res = if ok { Ok(()) } else { Err(PromiseError::Failed) };
        self.as_(src, &me, 0, |t| t.on_credit(s, U128(amount), U128(toll), res))
    }
}

fn toll(a: u128) -> u128 {
    bps_of(a, 25)
}

// ---------- init ----------

#[test]
fn init_splits_supply_and_launch_pool() {
    let net = Net::new(3, 1_000, 400);
    let pools: Vec<_> = net.t.iter().map(|t| (t.index, t.launch_pool, t.hoard, t.supply)).collect();
    assert_eq!(pools, vec![(0, 134, 200, 334), (1, 133, 200, 333), (2, 133, 200, 333)]);
    assert_eq!(net.t.iter().map(|t| t.supply).sum::<u128>(), 1_000);
}

#[test]
#[should_panic(expected = "this account is not in trolls")]
fn init_rejects_foreign_account() {
    let ids = vec![acc("troll0.t"), acc("troll1.t")];
    ctx(&acc("other.t"), &acc("d.t"), START, 0);
    Troll::new(acc(ROOT), ids, params(2), START, U128(10), U128(0));
}

#[test]
#[should_panic(expected = "duplicate troll account")]
fn init_rejects_duplicate_trolls() {
    let ids = vec![acc("troll0.t"), acc("troll1.t"), acc("troll0.t")];
    ctx(&ids[0], &acc("d.t"), START, 0);
    Troll::new(acc(ROOT), ids, params(3), START, U128(10), U128(0));
}

// ---------- launch ----------

#[test]
fn claim_launch_once_per_account_at_home() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let a = net.user(0, 1);
    assert_eq!(net.launch(0, &a), 100_000);
    assert_eq!(net.bal(0, &a), 100_000);
    assert_eq!(net.t[0].launch_pool, 100_000);
    assert!(net.t[0].has_claimed_launch(a));
    assert!(get_logs()[0].contains("\"launch claim\""));
}

#[test]
#[should_panic(expected = "already claimed")]
fn claim_launch_twice_rejected() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let a = net.user(0, 1);
    net.launch(0, &a);
    net.launch(0, &a);
}

#[test]
#[should_panic(expected = "claim at your home troll")]
fn claim_launch_away_from_home_rejected() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let a = net.user(0, 1);
    net.launch(1, &a);
}

#[test]
#[should_panic(expected = "launch window closed")]
fn claim_launch_after_window_rejected() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    net.now = START + 5 * EPOCH;
    let a = net.user(0, 1);
    net.launch(0, &a);
}

#[test]
#[should_panic(expected = "launch allocation exhausted")]
fn claim_launch_exhausted() {
    let mut net = Net::new(3, 1_000_000, 300_000);
    for k in 0..2 {
        let a = net.user(0, k);
        net.launch(0, &a);
    }
}

#[test]
fn sybil_sub_accounts_each_claim_once() {
    // Distinct accounts are distinct claimers; the contract cannot tell sub-accounts apart.
    let mut net = Net::new(3, 1_000_000, 900_000);
    // a parent and its sub-account that both live on troll 0
    let (x, y) = (0..)
        .map(|k| (acc(&format!("bob{k}.u")), acc(&format!("a.bob{k}.u"))))
        .find(|(x, y)| home_index(3, x.as_str()) == 0 && home_index(3, y.as_str()) == 0)
        .unwrap();
    net.launch(0, &x);
    net.launch(0, &y);
    assert_eq!(net.t[0].launch_pool, 100_000);
}

// ---------- same-troll transfers ----------

#[test]
fn same_troll_transfer_moves_balance_in_one_step() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, b) = (net.user(0, 1), net.user(0, 2));
    net.launch(0, &a);
    let r = net.transfer(0, &a, &b, 30_000);
    assert!(matches!(r, PromiseOrValue::Value(true)));
    assert_eq!((net.bal(0, &a), net.bal(0, &b)), (70_000, 30_000));
    assert_eq!(net.t[0].supply, 333_334, "supply unchanged, no toll on same-troll");
    assert!(get_logs()[0].contains("\"ft_transfer\""));
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn transfer_requires_one_yocto() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, b) = (net.user(0, 1), net.user(0, 2));
    net.launch(0, &a);
    net.as_(0, &a, 0, |t| t.ft_transfer(b, U128(1), None));
}

#[test]
#[should_panic(expected = "insufficient balance")]
fn overdraft_rejected() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, b) = (net.user(0, 1), net.user(0, 2));
    net.launch(0, &a);
    net.transfer(0, &a, &b, 100_001);
}

#[test]
#[should_panic(expected = "sender and receiver must differ")]
fn self_transfer_rejected() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let a = net.user(0, 1);
    net.launch(0, &a);
    net.transfer(0, &a, &a, 1);
}

// ---------- cross-troll transfers ----------

#[test]
fn cross_troll_transfer_credits_then_burns_toll() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, c) = (net.user(0, 1), net.user(2, 1));
    net.launch(0, &a);
    let r = net.transfer(0, &a, &c, 40_000);
    assert!(matches!(r, PromiseOrValue::Promise(_)));
    assert_eq!(net.bal(0, &a), 60_000);
    assert_eq!((net.t[0].supply, net.t[0].in_flight), (293_334, 40_000));

    net.credit(0, 2, &a, &c, 40_000 - toll(40_000));
    assert_eq!(net.bal(2, &c), 39_900);
    assert_eq!(net.t[2].supply, 333_333 + 39_900);

    assert!(net.on_credit(0, &a, 40_000, toll(40_000), true));
    assert_eq!((net.t[0].in_flight, net.t[0].burned), (0, 100));
    assert!(get_logs()[0].contains("\"ft_burn\""));
    let total: u128 = net.t.iter().map(|t| t.supply).sum::<u128>() + net.t.iter().map(|t| t.burned).sum::<u128>();
    assert_eq!(total, 1_000_000);
}

#[test]
fn failed_credit_refunds_in_full() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, c) = (net.user(0, 1), net.user(2, 1));
    net.launch(0, &a);
    net.transfer(0, &a, &c, 40_000);
    assert!(!net.on_credit(0, &a, 40_000, 100, false));
    assert_eq!(net.bal(0, &a), 100_000);
    assert_eq!((net.t[0].supply, net.t[0].in_flight, net.t[0].burned), (333_334, 0, 0));
    assert!(get_logs()[0].contains("credit_refunded"));
}

#[test]
#[should_panic(expected = "only sibling trolls can credit")]
fn fake_troll_cannot_credit() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let c = net.user(2, 1);
    net.as_(2, &acc("evil.t"), 0, |t| t.credit(acc("x.u"), c, U128(1_000_000)));
}

#[test]
#[should_panic(expected = "only sibling trolls can credit")]
fn troll_cannot_credit_itself() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let c = net.user(2, 1);
    let me = net.ids[2].clone();
    net.as_(2, &me, 0, |t| t.credit(acc("x.u"), c, U128(1)));
}

#[test]
fn home_troll_view_matches_ranges() {
    let net = Net::new(3, 1, 0);
    for i in 0..3 {
        assert_eq!(net.t[0].home_troll(net.user(i, 7)), net.ids[i]);
    }
}

// ---------- distinct senders ----------

#[test]
fn distinct_senders_counted_once_per_epoch_above_minimum() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, b, c) = (net.user(0, 1), net.user(0, 2), net.user(2, 1));
    net.launch(0, &a);
    net.launch(0, &b);
    net.transfer(0, &a, &b, 9); // below min_counted_transfer
    assert_eq!(net.t[0].senders_in(0), 0);
    net.transfer(0, &a, &b, 10);
    net.transfer(0, &a, &c, 10); // cross-troll counts at the source too
    assert_eq!(net.t[0].senders_in(0), 1);
    net.transfer(0, &b, &a, 10);
    assert_eq!(net.t[0].senders_in(0), 2);
    net.now += EPOCH;
    net.transfer(0, &a, &b, 10);
    assert_eq!((net.t[0].senders_in(0), net.t[0].senders_in(1)), (2, 1));
    assert!(net.t[0].is_feeder(1, a.clone()) && !net.t[0].is_feeder(1, b));
}

// ---------- report / apply / claim ----------

fn root() -> AccountId {
    acc(ROOT)
}

#[test]
#[should_panic(expected = "only the root")]
fn report_only_root() {
    let mut net = Net::new(3, 1_000, 0);
    net.now += EPOCH;
    net.as_(0, &acc("evil.t"), 0, |t| t.report(0));
}

#[test]
#[should_panic(expected = "only the root")]
fn apply_only_root() {
    let mut net = Net::new(3, 1_000, 0);
    net.now += EPOCH;
    net.as_(0, &acc("evil.t"), 0, |t| t.apply(0, Outcome::Burn { bps: 10_000 }));
}

#[test]
#[should_panic(expected = "epoch not finished")]
fn report_before_epoch_end_rejected() {
    let mut net = Net::new(3, 1_000, 0);
    net.as_(0, &root(), 0, |t| t.report(0));
}

#[test]
#[should_panic(expected = "epoch already applied")]
fn apply_twice_rejected() {
    let mut net = Net::new(3, 1_000, 0);
    net.now += EPOCH;
    net.as_(0, &root(), 0, |t| t.apply(0, Outcome::NoOp));
    net.as_(0, &root(), 0, |t| t.apply(0, Outcome::NoOp));
}

#[test]
fn report_reflects_counters() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, b) = (net.user(0, 1), net.user(0, 2));
    net.launch(0, &a);
    net.transfer(0, &a, &b, 10);
    net.now += EPOCH;
    let r = net.as_(0, &root(), 0, |t| t.report(0));
    assert_eq!(
        r,
        EpochReport {
            epoch: 0,
            senders: 1,
            supply: U128(333_334),
            in_flight: U128(0),
            hoard: U128(133_334),
            minted: U128(0),
            burned: U128(0)
        }
    );
}

#[test]
fn reward_pool_split_among_feeders_and_claimed_once() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, b, c) = (net.user(0, 1), net.user(0, 2), net.user(0, 3));
    net.launch(0, &a);
    net.launch(0, &b);
    net.transfer(0, &a, &c, 10);
    net.transfer(0, &b, &c, 10);
    net.now += EPOCH;
    net.as_(0, &root(), 0, |t| t.apply(0, Outcome::Reward { amount: U128(1_001) }));
    assert_eq!(net.t[0].pool(0), Some(Pool { share: U128(500), remaining: U128(1_000) }));
    assert_eq!((net.t[0].minted, net.t[0].supply), (1_000, 334_334));
    assert_eq!(net.as_(0, &a, 0, |t| t.claim(0)).0, 500);
    assert_eq!(net.bal(0, &a), 100_000 - 10 + 500);
    assert_eq!(net.t[0].pool(0).unwrap().remaining.0, 500);
    assert_eq!(net.t[0].supply, 334_334, "claim moves pool to balance");
}

#[test]
#[should_panic(expected = "not a feeder or already claimed")]
fn claim_replay_rejected() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, c) = (net.user(0, 1), net.user(0, 3));
    net.launch(0, &a);
    net.transfer(0, &a, &c, 10);
    net.now += EPOCH;
    net.as_(0, &root(), 0, |t| t.apply(0, Outcome::Reward { amount: U128(1_000) }));
    net.as_(0, &a, 0, |t| t.claim(0));
    net.as_(0, &a, 0, |t| t.claim(0));
}

#[test]
#[should_panic(expected = "not a feeder or already claimed")]
fn non_feeder_claim_rejected() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, c) = (net.user(0, 1), net.user(0, 3));
    net.launch(0, &a);
    net.transfer(0, &a, &c, 10);
    net.now += EPOCH;
    net.as_(0, &root(), 0, |t| t.apply(0, Outcome::Reward { amount: U128(1_000) }));
    net.as_(0, &c, 0, |t| t.claim(0));
}

#[test]
#[should_panic(expected = "no reward for this epoch")]
fn claim_without_reward_rejected() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, c) = (net.user(0, 1), net.user(0, 3));
    net.launch(0, &a);
    net.transfer(0, &a, &c, 10);
    net.now += EPOCH;
    net.as_(0, &root(), 0, |t| t.apply(0, Outcome::NoOp));
    net.as_(0, &a, 0, |t| t.claim(0));
}

#[test]
fn starve_burns_hoard_slice_only() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    net.now += EPOCH;
    net.as_(0, &root(), 0, |t| t.apply(0, Outcome::Burn { bps: 100 }));
    assert_eq!((net.t[0].hoard, net.t[0].launch_pool, net.t[0].burned), (132_001, 200_000, 1_333));
    assert_eq!(net.t[0].supply, 332_001);
    assert!(get_logs()[0].contains("starved epoch 0"));
}

// ---------- conservation under random transfers and failed credits ----------

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

fn pool_total(t: &Troll) -> u128 {
    (0..=t.current_epoch()).filter_map(|e| t.pool(e)).map(|p| p.remaining.0).sum()
}

struct Credit {
    src: usize,
    dst: usize,
    sender: AccountId,
    receiver: AccountId,
    amount: u128,
    toll: u128,
}

fn conservation_run(seed: u64, steps: usize) {
    const N: usize = 8;
    const USERS: usize = 6;
    let (total, launch) = (1_000_000_000u128, 8 * USERS as u128 * 100_000);
    let mut net = Net::new(N as u8, total, launch);
    let mut rng = Rng(seed);
    let users: Vec<(usize, AccountId)> = (0..N).flat_map(|i| (0..USERS).map(move |k| (i, k))).map(|(i, k)| (i, net.user(i, k))).collect();
    // Shadow model of every balance, keyed by (troll, account).
    let mut model: HashMap<(usize, AccountId), u128> = HashMap::new();
    for (i, u) in &users {
        net.launch(*i, u);
        model.insert((*i, u.clone()), 100_000);
    }
    let mut credits: Vec<Credit> = vec![];
    let mut callbacks: Vec<(Credit, bool)> = vec![];
    let (mut transfers, mut cross, mut failed, mut auto_paid, mut claimed) = (0, 0, 0, 0u128, 0u128);

    let check = |net: &Net, callbacks: &[(Credit, bool)], model: &HashMap<(usize, AccountId), u128>| {
        let supply: u128 = net.t.iter().map(|t| t.supply).sum();
        let in_flight: u128 = net.t.iter().map(|t| t.in_flight).sum();
        let burned: u128 = net.t.iter().map(|t| t.burned).sum();
        let minted: u128 = net.t.iter().map(|t| t.minted).sum();
        // Credits already delivered whose source has not yet seen the callback are counted twice.
        let delivered: u128 = callbacks.iter().filter(|(_, ok)| *ok).map(|(c, _)| c.amount - c.toll).sum();
        assert_eq!(supply + in_flight - delivered + burned, total + minted, "conservation");
        for (i, t) in net.t.iter().enumerate() {
            let held: u128 = model.iter().filter(|((ti, _), _)| *ti == i).map(|(_, v)| v).sum();
            assert_eq!(t.supply, held + t.hoard + t.launch_pool + pool_total(t), "troll {i} supply = holdings");
        }
    };

    for step in 0..steps {
        match rng.below(100) {
            // transfer
            0..=59 => {
                let (i, from) = users[rng.below(users.len() as u64) as usize].clone();
                let bal = model[&(i, from.clone())];
                if bal == 0 {
                    continue;
                }
                let (_, to) = users[rng.below(users.len() as u64) as usize].clone();
                if to == from {
                    continue;
                }
                let amount = 1 + rng.below(bal as u64) as u128;
                let dst = home_index(N, to.as_str());
                let pools_before = pool_total(&net.t[i]);
                net.transfer(i, &from, &to, amount);
                // A counted send auto-pays the sender's settled rewards out of the pools.
                let auto = pools_before - pool_total(&net.t[i]);
                auto_paid += auto;
                *model.get_mut(&(i, from.clone())).unwrap() += auto;
                *model.get_mut(&(i, from.clone())).unwrap() -= amount;
                transfers += 1;
                if dst == i {
                    *model.entry((i, to)).or_default() += amount;
                } else {
                    cross += 1;
                    credits.push(Credit { src: i, dst, sender: from, receiver: to, amount, toll: toll(amount) });
                }
            }
            // deliver a credit, or fail it (about 1 in 5)
            60..=79 if !credits.is_empty() => {
                let c = credits.swap_remove(rng.below(credits.len() as u64) as usize);
                let ok = rng.below(5) != 0;
                if ok {
                    net.credit(c.src, c.dst, &c.sender, &c.receiver, c.amount - c.toll);
                    *model.entry((c.dst, c.receiver.clone())).or_default() += c.amount - c.toll;
                } else {
                    failed += 1;
                }
                callbacks.push((c, ok));
            }
            // source callback
            80..=97 if !callbacks.is_empty() => {
                let (c, ok) = callbacks.swap_remove(rng.below(callbacks.len() as u64) as usize);
                assert_eq!(net.on_credit(c.src, &c.sender, c.amount, c.toll, ok), ok);
                if !ok {
                    *model.get_mut(&(c.src, c.sender.clone())).unwrap() += c.amount;
                }
            }
            // epoch ends: root applies a random outcome per troll, some feeders claim
            98..=99 => {
                let epoch = net.t[0].current_epoch();
                net.now += EPOCH;
                for i in 0..N {
                    let outcome = match rng.below(3) {
                        0 => Outcome::Reward { amount: U128(rng.below(1_000_000) as u128) },
                        1 => Outcome::Burn { bps: rng.below(10_001) as u16 },
                        _ => Outcome::NoOp,
                    };
                    let r = net.as_(i, &root(), 0, |t| t.report(epoch));
                    assert_eq!((r.minted.0, r.burned.0), (net.t[i].minted, net.t[i].burned));
                    net.as_(i, &root(), 0, |t| t.apply(epoch, outcome));
                    if net.t[i].pool(epoch).is_some() {
                        for (_, u) in users.iter().filter(|(ui, _)| *ui == i) {
                            if net.t[i].is_feeder(epoch, u.clone()) && rng.below(2) == 0 {
                                let got = net.as_(i, u, 0, |t| t.claim(epoch)).0;
                                claimed += got;
                                *model.get_mut(&(i, u.clone())).unwrap() += got;
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        if step % 50 == 0 {
            check(&net, &callbacks, &model);
        }
    }

    // Drain everything in flight, then the books must close exactly.
    for c in credits.drain(..) {
        net.credit(c.src, c.dst, &c.sender, &c.receiver, c.amount - c.toll);
        *model.entry((c.dst, c.receiver.clone())).or_default() += c.amount - c.toll;
        callbacks.push((c, true));
    }
    for (c, ok) in callbacks.drain(..) {
        net.on_credit(c.src, &c.sender, c.amount, c.toll, ok);
        if !ok {
            *model.get_mut(&(c.src, c.sender.clone())).unwrap() += c.amount;
        }
    }
    check(&net, &[], &model);
    assert_eq!(net.t.iter().map(|t| t.in_flight).sum::<u128>(), 0);
    for ((i, u), v) in &model {
        assert_eq!(net.bal(*i, u), *v, "balance of {u} at troll {i}");
    }
    let minted: u128 = net.t.iter().map(|t| t.minted).sum();
    let burned: u128 = net.t.iter().map(|t| t.burned).sum();
    assert_eq!(total + minted - burned, net.t.iter().map(|t| t.supply).sum::<u128>(), "books close at rest");
    assert!(transfers > 3_000 && cross > 1_000 && failed > 50, "coverage: {transfers} {cross} {failed}");
    assert!(auto_paid > 0 && claimed > 0, "rewards in play: auto {auto_paid}, claimed {claimed}");
}

// One seed per test: each test thread gets its own fresh mocked storage.
#[test]
fn conservation_10k_random_transfers_seed_a() {
    conservation_run(0x9E37_79B9_7F4A_7C15, 10_000);
}

#[test]
fn conservation_10k_random_transfers_seed_b() {
    conservation_run(42, 10_000);
}

#[test]
fn conservation_10k_random_transfers_seed_c() {
    conservation_run(7_777_777, 10_000);
}

// ---------- NEP-145 storage ----------

#[test]
fn storage_bounds_cover_a_max_length_account() {
    let net = Net::new(3, 1, 0);
    let b = net.t[0].storage_balance_bounds();
    assert_eq!(b.max, Some(b.min));
    // 64-byte id + prefix + u128 value, at the mocked byte cost
    let bytes = b.min.as_yoctonear() / env::storage_byte_cost().as_yoctonear();
    assert!((64 + 16..200).contains(&bytes), "{bytes} bytes");
}

#[test]
fn storage_deposit_registers_and_refunds_excess() {
    let mut net = Net::new(3, 1, 0);
    let (a, payer) = (net.user(0, 1), acc("payer.t"));
    let m = net.min();
    let sb = net.as_(0, &payer, m + 5, |t| t.storage_deposit(Some(a.clone()), Some(true)));
    assert_eq!((sb.total.as_yoctonear(), sb.available.as_yoctonear()), (m, 0));
    assert!(net.t[0].storage_balance_of(a.clone()).is_some());
    assert_eq!(net.bal(0, &a), 0);
    assert_eq!(near_sdk::test_utils::get_created_receipts().len(), 1, "refund of the excess");
    // second deposit is refunded in full and changes nothing
    net.as_(0, &payer, m, |t| t.storage_deposit(Some(a.clone()), None));
    assert!(net.t[0].storage_balance_of(a).is_some());
}

#[test]
#[should_panic(expected = "attach at least")]
fn storage_deposit_below_min_rejected() {
    let mut net = Net::new(3, 1, 0);
    let a = net.user(0, 1);
    let m = net.min();
    net.as_(0, &a, m - 1, |t| t.storage_deposit(None, None));
}

#[test]
#[should_panic(expected = "register at the account's home troll")]
fn storage_deposit_away_from_home_rejected() {
    let mut net = Net::new(3, 1, 0);
    let a = net.user(0, 1);
    let m = net.min();
    net.as_(1, &a, m, |t| t.storage_deposit(None, None));
}

#[test]
#[should_panic(expected = "attach")]
fn claim_launch_unregistered_without_deposit_rejected() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let a = net.user(0, 1);
    net.as_(0, &a, 0, |t| t.claim_launch());
}

#[test]
fn claim_launch_by_registered_account_needs_no_deposit() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let a = net.user(0, 1);
    net.reg(&a);
    assert_eq!(net.as_(0, &a, 0, |t| t.claim_launch()).0, 100_000);
}

#[test]
#[should_panic(expected = "is not registered")]
fn same_troll_transfer_to_unregistered_rejected() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, b) = (net.user(0, 1), net.user(0, 2));
    net.launch(0, &a);
    net.transfer_raw(0, &a, &b, 10);
}

#[test]
fn cross_troll_transfer_to_unregistered_receiver_is_refunded() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, c) = (net.user(0, 1), net.user(2, 1));
    net.launch(0, &a);
    net.transfer_raw(0, &a, &c, 40_000);
    let before = net.t[2].supply;
    let (from, (s, r)) = (net.ids[0].clone(), (a.clone(), c.clone()));
    ctx(&net.ids[2], &from, net.now, 0);
    let dest = &mut net.t[2];
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| dest.credit(s, r, U128(39_900))));
    assert!(res.is_err(), "credit must fail for an unregistered receiver");
    assert_eq!(net.t[2].supply, before, "failed credit changes nothing at the destination");
    assert!(!net.on_credit(0, &a, 40_000, 100, false));
    assert_eq!(net.bal(0, &a), 100_000);
    assert_eq!((net.t[0].supply, net.t[0].in_flight, net.t[0].burned), (333_334, 0, 0));
}

#[test]
fn unregister_requires_zero_balance_or_force_burns() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, b) = (net.user(0, 1), net.user(0, 2));
    net.launch(0, &a);
    net.reg(&b);
    assert!(net.as_(0, &b, 1, |t| t.storage_unregister(None)));
    assert!(net.t[0].storage_balance_of(b.clone()).is_none());
    assert!(!net.as_(0, &b, 1, |t| t.storage_unregister(None)), "not registered any more");
    assert!(net.as_(0, &a, 1, |t| t.storage_unregister(Some(true))));
    assert_eq!((net.t[0].supply, net.t[0].burned), (233_334, 100_000));
}

#[test]
#[should_panic(expected = "token balance is not zero")]
fn unregister_with_balance_without_force_rejected() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let a = net.user(0, 1);
    net.launch(0, &a);
    net.as_(0, &a, 1, |t| t.storage_unregister(None));
}

#[test]
#[should_panic(expected = "transfers in flight")]
fn cannot_unregister_with_a_cross_troll_transfer_in_flight() {
    // Otherwise the refund would recreate the record for free and a second unregister would
    // pay out a storage deposit nobody paid: a slow drain of the troll's NEAR.
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, c) = (net.user(0, 1), net.user(2, 1));
    net.launch(0, &a);
    net.transfer_raw(0, &a, &c, 100_000);
    net.as_(0, &a, 1, |t| t.storage_unregister(None));
}

#[test]
#[should_panic(expected = "transfers in flight")]
fn cannot_unregister_with_a_transfer_call_in_flight() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, w) = (net.user(0, 1), net.user(0, 9));
    net.launch(0, &a);
    call(&mut net, 0, &a, &w, 100_000);
    net.as_(0, &a, 1, |t| t.storage_unregister(Some(true)));
}

#[test]
fn unregister_allowed_once_everything_resolved() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, c, w) = (net.user(0, 1), net.user(2, 1), net.user(0, 9));
    net.launch(0, &a);
    net.transfer_raw(0, &a, &c, 50_000); // c unregistered: credit will fail
    assert!(!net.on_credit(0, &a, 50_000, 125, false));
    call(&mut net, 0, &a, &w, 100_000);
    as_cb(&mut net, 0, Some(br#""0""#), |t| t.ft_resolve_transfer(a.clone(), w.clone(), U128(100_000)));
    assert_eq!(net.t[0].accounts.get(&a).unwrap().pending, 0);
    assert_eq!(net.bal(0, &a), 0);
    assert!(net.as_(0, &a, 1, |t| t.storage_unregister(None)));
}

#[test]
fn troll_burning_more_than_it_issued_still_reports_and_settles() {
    // A troll's burns include tokens that arrived from other trolls, so per troll
    // burned > initial + minted is possible; reports must not underflow.
    use near_contract_standards::fungible_token::metadata::FungibleTokenMetadata;
    let total = 300_000u128;
    let mut net = Net::new(3, total, total);
    ctx(&acc(ROOT), &acc("deployer.t"), START, 0);
    let meta = FungibleTokenMetadata {
        spec: "ft-1.0.0".into(),
        name: "T".into(),
        symbol: "T".into(),
        icon: None,
        reference: None,
        reference_hash: None,
        decimals: 24,
    };
    let mut root = root::Root::new(params(3), net.ids.clone(), START, U128(total), meta);
    let (a, b) = (net.user(0, 1), net.user(1, 1));
    net.launch(0, &a);
    net.launch(1, &b);
    net.transfer(0, &a, &b, 100_000);
    net.credit(0, 1, &a, &b, 100_000 - toll(100_000));
    net.on_credit(0, &a, 100_000, toll(100_000), true);
    assert!(net.as_(1, &b, 1, |t| t.storage_unregister(Some(true))));
    assert!(net.t[1].burned > net.t[1].initial + net.t[1].minted);
    net.now += EPOCH;
    settle(&mut net, &mut root, 0);
    assert_eq!(root.ft_total_supply().0, troll_total(&net));
    assert_eq!(root.ft_total_supply().0, total - toll(100_000) - (200_000 - toll(100_000)));
}

// ---------- fed slots: auto-claim, freeing, forfeit ----------

/// One counted send by `a` (to `b`, same troll) in the current epoch.
fn feed(net: &mut Net, a: &AccountId, b: &AccountId) {
    net.transfer(0, a, b, 10);
}

fn apply(net: &mut Net, epoch: u64, o: Outcome) {
    net.as_(0, &root(), 0, |t| t.apply(epoch, o));
}

#[test]
fn reward_auto_paid_on_next_epoch_send() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, b) = (net.user(0, 1), net.user(0, 2));
    net.launch(0, &a);
    feed(&mut net, &a, &b);
    net.now += EPOCH;
    apply(&mut net, 0, Outcome::Reward { amount: U128(700) });
    assert!(net.t[0].is_feeder(0, a.clone()));
    feed(&mut net, &a, &b); // epoch 1 send pays epoch 0's share
    assert_eq!(net.bal(0, &a), 100_000 - 20 + 700);
    assert!(!net.t[0].is_feeder(0, a.clone()) && net.t[0].is_feeder(1, a.clone()));
    assert_eq!(net.t[0].pool(0).unwrap().remaining.0, 0);
    assert!(get_logs().iter().any(|l| l.contains("feeding reward")));
}

#[test]
#[should_panic(expected = "not a feeder or already claimed")]
fn manual_claim_after_auto_pay_rejected() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, b) = (net.user(0, 1), net.user(0, 2));
    net.launch(0, &a);
    feed(&mut net, &a, &b);
    net.now += EPOCH;
    apply(&mut net, 0, Outcome::Reward { amount: U128(700) });
    feed(&mut net, &a, &b);
    net.as_(0, &a, 0, |t| t.claim(0));
}

#[test]
fn starved_epoch_slot_is_freed_without_payout() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, b) = (net.user(0, 1), net.user(0, 2));
    net.launch(0, &a);
    feed(&mut net, &a, &b); // epoch 0
    net.now += EPOCH;
    apply(&mut net, 0, Outcome::Burn { bps: 100 });
    feed(&mut net, &a, &b); // epoch 1 frees slot 0
    net.now += EPOCH;
    apply(&mut net, 1, Outcome::NoOp);
    feed(&mut net, &a, &b); // epoch 2 frees slot 1; nothing forfeited
    assert_eq!(net.bal(0, &a), 100_000 - 30);
    assert!(!net.t[0].is_feeder(0, a.clone()) && !net.t[0].is_feeder(1, a.clone()));
    assert!(net.t[0].is_feeder(2, a.clone()));
    assert!(!get_logs().iter().any(|l| l.contains("reward_forfeited")));
    assert_eq!(net.t[0].senders_in(2), 1);
}

#[test]
fn late_settlement_forfeits_the_oldest_slot() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, b) = (net.user(0, 1), net.user(0, 2));
    net.launch(0, &a);
    for _ in 0..3 {
        feed(&mut net, &a, &b); // epochs 0, 1, 2 with nothing settled
        net.now += EPOCH;
    }
    assert!(get_logs().iter().any(|l| l.contains("reward_forfeited") && l.contains(r#""epoch":0"#)));
    assert!(!net.t[0].is_feeder(0, a.clone()));
    assert!(net.t[0].is_feeder(1, a.clone()) && net.t[0].is_feeder(2, a.clone()));
    // epoch 0 still counted a as a sender; its pool share stays unclaimable
    apply(&mut net, 0, Outcome::Reward { amount: U128(500) });
    assert_eq!(net.t[0].pool(0).unwrap().remaining.0, 500);
    apply(&mut net, 1, Outcome::Reward { amount: U128(300) });
    assert_eq!(net.as_(0, &a, 0, |t| t.claim(1)).0, 300);
}

#[test]
fn record_size_is_fixed_whatever_the_activity() {
    use near_sdk::borsh::to_vec;
    let full = Account { balance: u128::MAX, fed: [u64::MAX; 2], pending: u128::MAX };
    assert_eq!(to_vec(&full).unwrap().len(), to_vec(&Account::default()).unwrap().len());
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, b) = (net.user(0, 1), net.user(0, 2));
    net.launch(0, &a);
    for _ in 0..10 {
        feed(&mut net, &a, &b);
        net.now += EPOCH;
    }
    // per-account feeding state never holds more than two epochs
    let tracked = (0..10).filter(|e| net.t[0].is_feeder(*e, a.clone())).count();
    assert_eq!(tracked, 2);
}

// ---------- settlement bookkeeping: the real root against real trolls ----------

/// Settles `epoch` end to end: each troll reports, the root's `on_reports` books it, and each
/// troll applies exactly the `apply` call the root emitted.
fn settle(net: &mut Net, root: &mut root::Root, epoch: u64) {
    use near_sdk::test_utils::get_created_receipts;
    use near_sdk::test_utils::test_env::alice;
    use near_sdk::{PromiseResult, RuntimeFeesConfig, test_vm_config};
    ctx(&acc(ROOT), &alice(), net.now, 0);
    let _ = root.settle(epoch);
    let results: Vec<PromiseResult> = (0..net.t.len())
        .map(|i| {
            let r = net.as_(i, &acc(ROOT), 0, |t| t.report(epoch));
            PromiseResult::Successful(near_sdk::serde_json::to_vec(&r).unwrap())
        })
        .collect();
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc(ROOT)).predecessor_account_id(acc(ROOT)).block_timestamp(net.now * 1_000_000);
    testing_env!(b.build(), test_vm_config(), RuntimeFeesConfig::test(), Default::default(), results);
    assert!(root.on_reports(epoch));
    let applies: Vec<(usize, Outcome)> = get_created_receipts()
        .into_iter()
        .map(|rc| {
            let i = net.ids.iter().position(|id| *id == rc.receiver_id).unwrap();
            let near_sdk::mock::MockAction::FunctionCallWeight { method_name, args, .. } = &rc.actions[0] else {
                panic!("expected a function call")
            };
            assert_eq!(method_name, b"apply");
            let v: near_sdk::serde_json::Value = near_sdk::serde_json::from_slice(args).unwrap();
            (i, near_sdk::serde_json::from_value(v["outcome"].clone()).unwrap())
        })
        .collect();
    assert_eq!(applies.len(), net.t.len());
    for (i, o) in applies {
        net.as_(i, &acc(ROOT), 0, |t| t.apply(epoch, o));
    }
}

fn troll_total(net: &Net) -> u128 {
    net.t.iter().map(|t| t.supply + t.in_flight).sum()
}

#[test]
fn root_total_supply_matches_trolls_after_each_settlement() {
    use near_contract_standards::fungible_token::metadata::FungibleTokenMetadata;
    let (total, launch) = (1_000_000_000u128, 600_000);
    let mut net = Net::new(3, total, launch);
    ctx(&acc(ROOT), &acc("deployer.t"), START, 0);
    let meta = FungibleTokenMetadata {
        spec: "ft-1.0.0".into(),
        name: "T".into(),
        symbol: "T".into(),
        icon: None,
        reference: None,
        reference_hash: None,
        decimals: 24,
    };
    let mut root = root::Root::new(params(3), net.ids.clone(), START, U128(total), meta);
    let users: Vec<Vec<AccountId>> = (0..3).map(|i| (0..2).map(|k| net.user(i, k)).collect()).collect();
    for (i, us) in users.iter().enumerate() {
        for u in us {
            net.launch(i, u);
        }
    }
    // epoch 0: everyone feeds, including cross-troll sends whose tolls burn
    for i in 0..3 {
        let (a, b, c) = (users[i][0].clone(), users[i][1].clone(), users[(i + 1) % 3][0].clone());
        net.transfer(i, &a, &b, 1_000);
        net.transfer(i, &b, &c, 40_000);
        let dst = (i + 1) % 3;
        net.credit(i, dst, &b, &c, 40_000 - toll(40_000));
        net.on_credit(i, &b, 40_000, toll(40_000), true);
    }
    net.now += EPOCH;
    settle(&mut net, &mut root, 0);
    assert_eq!(root.streak(), (1, 1));
    let minted: u128 = net.t.iter().map(|t| t.minted).sum();
    assert_eq!(minted, 3_000, "1,000 per troll split between 2 feeders");
    assert_eq!(root.ft_total_supply().0, troll_total(&net), "after a fed epoch");
    assert_eq!(root.info().troll_supply, net.t.iter().map(|t| U128(t.supply)).collect::<Vec<_>>());

    // epoch 1: only troll 0 is fed; trolls 1 and 2 starve and burn 1% of odd-sized hoards
    let (a, b) = (users[0][0].clone(), users[0][1].clone());
    net.transfer(0, &a, &b, 10);
    net.transfer(0, &b, &a, 10);
    net.now += EPOCH;
    settle(&mut net, &mut root, 1);
    assert_eq!(root.streak(), (0, 1));
    assert!(net.t[1].burned > 0 && net.t[2].burned > 0);
    assert_eq!(root.ft_total_supply().0, troll_total(&net), "after a starved epoch");
    let net_issued: u128 = total + net.t.iter().map(|t| t.minted).sum::<u128>() - net.t.iter().map(|t| t.burned).sum::<u128>();
    assert_eq!(root.ft_total_supply().0, net_issued);
}

// ---------- ft_transfer_call ----------

/// Runs `f` on troll `i` as a callback that sees one promise result.
fn as_cb<R>(net: &mut Net, i: usize, result: Option<&[u8]>, f: impl FnOnce(&mut Troll) -> R) -> R {
    use near_sdk::{PromiseResult, RuntimeFeesConfig, test_vm_config};
    let r = match result {
        Some(b) => PromiseResult::Successful(b.to_vec()),
        None => PromiseResult::Failed,
    };
    let mut b = VMContextBuilder::new();
    let me = net.ids[i].clone();
    b.current_account_id(me.clone()).predecessor_account_id(me).block_timestamp(net.now * 1_000_000);
    testing_env!(b.build(), test_vm_config(), RuntimeFeesConfig::test(), Default::default(), vec![r]);
    f(&mut net.t[i])
}

fn total_books(net: &Net) -> u128 {
    net.t.iter().map(|t| t.supply + t.in_flight + t.burned).sum::<u128>() - net.t.iter().map(|t| t.minted).sum::<u128>()
}

fn call(net: &mut Net, i: usize, from: &AccountId, to: &AccountId, amount: u128) -> PromiseOrValue<U128> {
    net.reg(to);
    let to = to.clone();
    net.as_(i, from, 1, |t| t.ft_transfer_call(to, U128(amount), None, "wrap".into()))
}

#[test]
fn same_troll_transfer_call_refunds_unused() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, w) = (net.user(0, 1), net.user(0, 9));
    net.launch(0, &a);
    assert!(matches!(call(&mut net, 0, &a, &w, 1_000), PromiseOrValue::Promise(_)));
    assert_eq!((net.bal(0, &a), net.bal(0, &w)), (99_000, 1_000));
    let used = as_cb(&mut net, 0, Some(br#""300""#), |t| t.ft_resolve_transfer(a.clone(), w.clone(), U128(1_000)));
    assert_eq!(used.0, 700);
    assert_eq!((net.bal(0, &a), net.bal(0, &w)), (99_300, 700));
    assert_eq!(total_books(&net), 1_000_000);
}

#[test]
fn same_troll_transfer_call_failed_or_garbage_refunds_all() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, w) = (net.user(0, 1), net.user(0, 9));
    net.launch(0, &a);
    call(&mut net, 0, &a, &w, 1_000);
    assert_eq!(as_cb(&mut net, 0, None, |t| t.ft_resolve_transfer(a.clone(), w.clone(), U128(1_000))).0, 0);
    call(&mut net, 0, &a, &w, 1_000);
    assert_eq!(as_cb(&mut net, 0, Some(b"oops"), |t| t.ft_resolve_transfer(a.clone(), w.clone(), U128(1_000))).0, 0);
    assert_eq!((net.bal(0, &a), net.bal(0, &w)), (100_000, 0));
}

#[test]
fn resolve_takes_back_at_most_what_the_receiver_still_holds() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, w, x) = (net.user(0, 1), net.user(0, 9), net.user(0, 8));
    net.launch(0, &a);
    call(&mut net, 0, &a, &w, 1_000);
    net.transfer(0, &w, &x, 900); // receiver spent most of it meanwhile
    let used = as_cb(&mut net, 0, Some(br#""1000""#), |t| t.ft_resolve_transfer(a.clone(), w.clone(), U128(1_000)));
    assert_eq!(used.0, 900);
    assert_eq!((net.bal(0, &a), net.bal(0, &w)), (99_100, 0));
}

#[test]
fn cross_troll_transfer_call_returns_unused_to_the_source() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, w) = (net.user(0, 1), net.user(2, 9));
    net.launch(0, &a);
    call(&mut net, 0, &a, &w, 40_000);
    assert_eq!((net.t[0].in_flight, net.bal(0, &a)), (40_000, 60_000));
    // destination: credit 39_900 and call the receiver
    let from = net.ids[0].clone();
    let (s, r) = (a.clone(), w.clone());
    net.as_(2, &from, 0, |t| t.credit_call(s, r, U128(39_900), "wrap".into()));
    assert_eq!(net.bal(2, &w), 39_900);
    // receiver used 30_000 and returned 9_900; destination takes it back and reports it
    let back = as_cb(&mut net, 2, Some(br#""9900""#), |t| t.resolve_credit_call(a.clone(), w.clone(), U128(39_900)));
    assert_eq!((back.0, net.bal(2, &w)), (9_900, 30_000));
    // source: refund the unused part, burn the toll, report what was used
    let used = as_cb(&mut net, 0, Some(br#""9900""#), |t| t.on_credit_call(a.clone(), U128(40_000), U128(100)));
    assert_eq!(used.0, 30_000);
    assert_eq!((net.bal(0, &a), net.t[0].in_flight, net.t[0].burned), (69_900, 0, 100));
    assert_eq!(total_books(&net), 1_000_000);
}

#[test]
fn cross_troll_transfer_call_to_unregistered_refunds_everything() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, w) = (net.user(0, 1), net.user(2, 9));
    net.launch(0, &a);
    let to = w.clone();
    net.as_(0, &a, 1, |t| t.ft_transfer_call(to, U128(40_000), None, String::new())); // w unregistered
    // the destination refuses by value, without panicking and without crediting
    let from = net.ids[0].clone();
    let (s, r) = (a.clone(), w.clone());
    let res = net.as_(2, &from, 0, |t| t.credit_call(s, r, U128(39_900), String::new()));
    assert!(matches!(res, PromiseOrValue::Value(U128(NOT_CREDITED))));
    assert_eq!(net.t[2].supply, 333_333);
    let refused = format!("\"{NOT_CREDITED}\"");
    let used = as_cb(&mut net, 0, Some(refused.as_bytes()), |t| t.on_credit_call(a.clone(), U128(40_000), U128(100)));
    assert_eq!(used.0, 0);
    assert_eq!((net.bal(0, &a), net.t[0].in_flight, net.t[0].burned), (100_000, 0, 0));
    assert!(get_logs()[0].contains("credit_refunded"));
    assert_eq!(total_books(&net), 1_000_000);
}

#[test]
fn cross_troll_resolve_failure_after_credit_refunds_nothing() {
    // The credit lands and the receiver is called, but the destination's resolve fails (for
    // example out of gas), so its state change is rolled back and the receiver keeps everything.
    // The source then sees a failed result. Refunding then would create tokens.
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, w) = (net.user(0, 1), net.user(2, 9));
    net.launch(0, &a);
    call(&mut net, 0, &a, &w, 40_000);
    let from = net.ids[0].clone();
    let (s, r) = (a.clone(), w.clone());
    net.as_(2, &from, 0, |t| t.credit_call(s, r, U128(39_900), "wrap".into()));
    // resolve_credit_call failed: nothing happens at the destination
    let used = as_cb(&mut net, 0, None, |t| t.on_credit_call(a.clone(), U128(40_000), U128(100)));
    assert_eq!(used.0, 39_900, "receiver kept everything");
    assert_eq!((net.bal(0, &a), net.bal(2, &w)), (60_000, 39_900));
    assert_eq!((net.t[0].in_flight, net.t[0].burned), (0, 100));
    assert!(get_logs().iter().any(|l| l.contains("credit_unresolved")));
    assert_eq!(total_books(&net), 1_000_000, "no tokens created");
    // the sender's pending amount is closed, so it can unregister once its balance is empty
    assert_eq!(net.t[0].accounts.get(&a).unwrap().pending, 0);
    // garbage instead of a failure is treated the same way
    call(&mut net, 0, &a, &w, 1_000);
    let (s, r) = (a.clone(), w.clone());
    net.as_(2, &from, 0, |t| t.credit_call(s, r, U128(998), String::new()));
    as_cb(&mut net, 0, Some(b"oops"), |t| t.on_credit_call(a.clone(), U128(1_000), U128(2)));
    assert_eq!((net.bal(0, &a), net.bal(2, &w)), (59_000, 40_898));
    assert_eq!(total_books(&net), 1_000_000);
}

#[test]
#[should_panic(expected = "attach at least 100 Tgas")]
fn transfer_call_requires_enough_gas() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, w) = (net.user(0, 1), net.user(2, 9));
    net.launch(0, &a);
    let mut b = VMContextBuilder::new();
    b.current_account_id(net.ids[0].clone())
        .predecessor_account_id(a.clone())
        .attached_deposit(NearToken::from_yoctonear(1))
        .block_timestamp(net.now * 1_000_000)
        .prepaid_gas(Gas::from_tgas(99));
    testing_env!(b.build());
    net.t[0].ft_transfer_call(w, U128(1_000), None, String::new());
}

#[test]
#[should_panic(expected = "only sibling trolls can credit")]
fn fake_troll_cannot_probe_credit_call_for_unregistered() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let w = net.user(2, 9);
    net.as_(2, &acc("evil.t"), 0, |t| t.credit_call(acc("x.u"), w, U128(1), String::new()));
}

#[test]
fn cross_troll_receiver_failure_returns_all_but_the_toll() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let (a, w) = (net.user(0, 1), net.user(2, 9));
    net.launch(0, &a);
    call(&mut net, 0, &a, &w, 40_000);
    let from = net.ids[0].clone();
    let (s, r) = (a.clone(), w.clone());
    net.as_(2, &from, 0, |t| t.credit_call(s, r, U128(39_900), String::new()));
    let back = as_cb(&mut net, 2, None, |t| t.resolve_credit_call(a.clone(), w.clone(), U128(39_900)));
    assert_eq!(back.0, 39_900);
    let used = as_cb(&mut net, 0, Some(br#""39900""#), |t| t.on_credit_call(a.clone(), U128(40_000), U128(100)));
    assert_eq!(used.0, 0);
    assert_eq!((net.bal(0, &a), net.bal(2, &w)), (99_900, 0));
    assert_eq!(total_books(&net), 1_000_000);
}

#[test]
#[should_panic(expected = "only sibling trolls can credit")]
fn fake_troll_cannot_credit_call() {
    let mut net = Net::new(3, 1_000_000, 600_000);
    let w = net.user(2, 9);
    net.reg(&w);
    net.as_(2, &acc("evil.t"), 0, |t| t.credit_call(acc("x.u"), w, U128(1), String::new()));
}
