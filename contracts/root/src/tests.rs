use super::*;
use near_sdk::test_utils::{VMContextBuilder, get_created_receipts, get_logs};
use near_sdk::{PromiseResult, RuntimeFeesConfig, testing_env, test_vm_config};

const START: u64 = 1_000_000;
const EPOCH: u64 = 1_000;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn root_id() -> AccountId {
    acc("root.t")
}

fn trolls() -> Vec<AccountId> {
    vec![acc("troll0.t"), acc("troll1.t"), acc("troll2.t")]
}

fn params() -> Params {
    Params {
        troll_count: 3,
        toll_bps: 25,
        feed_target: 2,
        reward_per_epoch: U128(3_001),
        starve_burn_bps: 100,
        epoch_ms: EPOCH,
        launch_window_ms: 5 * EPOCH,
        launch_claim_amount: U128(100),
        min_counted_transfer: U128(10),
        claim_fee: U128(0),
        settle_bounty: U128(0),
    }
}

fn metadata() -> FungibleTokenMetadata {
    FungibleTokenMetadata {
        spec: "ft-1.0.0".into(),
        name: "Sharded Trolls".into(),
        symbol: "TROLL".into(),
        icon: None,
        reference: None,
        reference_hash: None,
        decimals: 24,
    }
}

fn ctx(pred: &AccountId, ms: u64, results: Vec<PromiseResult>) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(root_id())
        .predecessor_account_id(pred.clone())
        .block_timestamp(ms * 1_000_000)
        .prepaid_gas(Gas::from_tgas(300));
    testing_env!(b.build(), test_vm_config(), RuntimeFeesConfig::test(), Default::default(), results);
}

fn new_root() -> Root {
    ctx(&acc("deployer.t"), START, vec![]);
    Root::new(params(), trolls(), START, U128(1_000), metadata())
}

fn report(epoch: u64, senders: u32, supply: u128) -> EpochReport {
    EpochReport { epoch, senders, supply: U128(supply), in_flight: U128(0), hoard: U128(0), launch_pool: U128(0), food: U128(0), minted: U128(0), burned: U128(0) }
}

fn ok(r: &EpochReport) -> PromiseResult {
    PromiseResult::Successful(serde_json::to_vec(r).unwrap())
}

/// Runs `on_reports` as the runtime would after the joined report promises resolve.
fn resolve(root: &mut Root, epoch: u64, results: Vec<PromiseResult>) -> bool {
    ctx(&root_id(), START + (epoch + 1) * EPOCH, results);
    let attempt = root.attempt;
    root.on_reports(epoch, attempt)
}

fn ctx_at(pred: &AccountId, ms: u64, height: u64, tgas: u64, results: Vec<PromiseResult>) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(root_id())
        .predecessor_account_id(pred.clone())
        .block_timestamp(ms * 1_000_000)
        .block_height(height)
        .prepaid_gas(Gas::from_tgas(tgas));
    testing_env!(b.build(), test_vm_config(), RuntimeFeesConfig::test(), Default::default(), results);
}

#[test]
#[should_panic(expected = "attach at least 250 Tgas")]
fn settle_requires_enough_gas() {
    let mut r = new_root();
    ctx_at(&acc("anyone.t"), START + EPOCH, 10, 249, vec![]);
    let _ = r.settle(0);
}

#[test]
#[should_panic(expected = "settlement in progress")]
fn stuck_settlement_cannot_be_restarted_before_the_timeout() {
    let mut r = new_root();
    ctx_at(&acc("anyone.t"), START + EPOCH, 100, 300, vec![]);
    let _ = r.settle(0);
    ctx_at(&acc("anyone.t"), START + EPOCH, 100 + SETTLE_TIMEOUT_BLOCKS - 1, 300, vec![]);
    let _ = r.settle(0);
}

#[test]
fn stuck_settlement_restarts_after_the_timeout_and_ignores_the_stale_attempt() {
    let mut r = new_root();
    ctx_at(&acc("anyone.t"), START + EPOCH, 100, 300, vec![]);
    let _ = r.settle(0);
    // attempt 1's on_reports never completes (for example it ran out of gas)
    ctx_at(&acc("anyone.t"), START + EPOCH, 100 + SETTLE_TIMEOUT_BLOCKS, 300, vec![]);
    let _ = r.settle(0);
    assert!(get_logs().join("").contains("settle_expired"));
    assert_eq!((r.info().settling, r.attempt), (Some(0), 2));
    let reps = || (0..3).map(|_| ok(&report(0, 5, 333))).collect::<Vec<_>>();
    // a late attempt-1 callback changes nothing
    ctx_at(&root_id(), START + 2 * EPOCH, 700, 300, reps());
    assert!(!r.on_reports(0, 1));
    assert!(get_logs().join("").contains("settle_stale"));
    assert_eq!((r.info().settling, r.info().next_epoch, r.streak()), (Some(0), 0, (0, 0)));
    // attempt 2 settles
    ctx_at(&root_id(), START + 2 * EPOCH, 701, 300, reps());
    assert!(r.on_reports(0, 2));
    assert_eq!((r.info().settling, r.info().next_epoch, r.streak()), (None, 1, (1, 1)));
    // and attempt 1 arriving even later is still ignored
    ctx_at(&root_id(), START + 2 * EPOCH, 702, 300, reps());
    assert!(!r.on_reports(0, 1));
    assert_eq!((r.info().next_epoch, r.streak()), (1, (1, 1)));
}

#[test]
#[should_panic(expected = "metadata icon over 1024 bytes")]
fn init_rejects_a_large_icon() {
    ctx(&acc("deployer.t"), START, vec![]);
    let m = FungibleTokenMetadata { icon: Some("x".repeat(1025)), ..metadata() };
    Root::new(params(), trolls(), START, U128(1_000), m);
}

#[test]
fn bad_reports_cannot_overflow_the_books() {
    let mut r = new_root();
    let mut reps = vec![report(0, 0, u128::MAX), report(0, 0, 1), report(0, 0, 1)];
    reps[0].minted = U128(u128::MAX);
    reps[1].minted = U128(u128::MAX);
    r.decide(0, &reps);
    assert_eq!(r.ft_total_supply().0, u128::MAX);
}

#[test]
fn init_state() {
    let r = new_root();
    assert_eq!(r.ft_total_supply().0, 1_000);
    assert_eq!(r.info().troll_supply, vec![U128(334), U128(333), U128(333)]);
    for who in ["alice.near", "kim.near", "zed.near"] {
        assert_eq!(r.home_troll(acc(who)), trolls()[home_index(3, who)]);
    }
    assert_eq!(r.streak(), (0, 0));
    assert_eq!(r.ft_metadata().decimals, 24);
}

#[test]
#[should_panic(expected = "trolls.len() must equal troll_count")]
fn init_rejects_wrong_troll_count() {
    ctx(&acc("d.t"), START, vec![]);
    Root::new(params(), trolls()[..2].to_vec(), START, U128(1), metadata());
}

#[test]
#[should_panic(expected = "epoch not finished")]
fn settle_before_epoch_end_rejected() {
    let mut r = new_root();
    ctx(&acc("anyone.t"), START + EPOCH - 1, vec![]);
    let _ = r.settle(0);
}

#[test]
fn settle_fans_out_reports_and_locks() {
    let mut r = new_root();
    ctx(&acc("anyone.t"), START + EPOCH, vec![]);
    let _ = r.settle(0);
    assert_eq!(r.info().settling, Some(0));
    // 3 report calls + the joined callback
    assert_eq!(get_created_receipts().len(), 4);
}

#[test]
#[should_panic(expected = "settlement in progress")]
fn settle_twice_while_in_flight_rejected() {
    let mut r = new_root();
    ctx(&acc("anyone.t"), START + EPOCH, vec![]);
    let _ = r.settle(0);
    let _ = r.settle(0);
}

#[test]
#[should_panic(expected = "settle the next unsettled epoch")]
fn settle_same_epoch_twice_rejected() {
    let mut r = new_root();
    ctx(&acc("anyone.t"), START + EPOCH, vec![]);
    let _ = r.settle(0);
    let reps: Vec<_> = (0..3).map(|_| ok(&report(0, 5, 333))).collect();
    assert!(resolve(&mut r, 0, reps));
    ctx(&acc("anyone.t"), START + 2 * EPOCH, vec![]);
    let _ = r.settle(0);
}

#[test]
#[should_panic(expected = "settle the next unsettled epoch")]
fn settle_cannot_skip_epochs() {
    let mut r = new_root();
    ctx(&acc("anyone.t"), START + 3 * EPOCH, vec![]);
    let _ = r.settle(1);
}

#[test]
fn all_fed_extends_streak_and_rewards_every_troll() {
    let mut r = new_root();
    ctx(&acc("anyone.t"), START + EPOCH, vec![]);
    let _ = r.settle(0);
    let reps = vec![ok(&report(0, 2, 400)), ok(&report(0, 3, 300)), ok(&report(0, 9, 299))];
    assert!(resolve(&mut r, 0, reps));
    let info = r.info();
    assert_eq!((info.streak, info.best_streak, info.next_epoch, info.settling), (1, 1, 1, None));
    assert_eq!(info.total_supply.0, 1_000 + 1_000 + 999 + 999, "initial plus this settlement's mints");
    assert_eq!(info.last_senders, vec![2, 3, 9]);
    assert_eq!(get_created_receipts().len(), 3, "one apply per troll");
    let logs = get_logs().join("\n");
    assert!(logs.contains("feeding_settled") && logs.contains("\"fed\":true") && logs.contains("\"streak\":1"));
}

#[test]
fn decide_rewards_split_evenly() {
    let mut r = new_root();
    let out = r.decide(0, &[report(0, 2, 1), report(0, 2, 1), report(0, 2, 1)]);
    assert_eq!(out, vec![Outcome::Reward { amount: U128(1_000) }; 3]);
}

#[test]
fn one_starved_troll_burns_and_resets_streak() {
    let mut r = new_root();
    for e in 0..2 {
        r.decide(e, &[report(e, 2, 1), report(e, 2, 1), report(e, 2, 1)]);
    }
    assert_eq!(r.streak(), (2, 2));
    let out = r.decide(2, &[report(2, 5, 1), report(2, 1, 1), report(2, 2, 1)]);
    assert_eq!(out, vec![Outcome::NoOp, Outcome::Burn { bps: 100 }, Outcome::NoOp]);
    assert_eq!(r.streak(), (0, 2));
    let logs = get_logs().join("\n");
    assert!(logs.contains("troll_starved") && logs.contains("troll1.t") && !logs.contains("troll0.t\",\"senders"));
}

#[test]
fn failed_report_unlocks_without_advancing() {
    let mut r = new_root();
    ctx(&acc("anyone.t"), START + EPOCH, vec![]);
    let _ = r.settle(0);
    let reps = vec![ok(&report(0, 2, 1)), PromiseResult::Failed, ok(&report(0, 2, 1))];
    assert!(!resolve(&mut r, 0, reps));
    let info = r.info();
    assert_eq!((info.next_epoch, info.settling, info.streak), (0, None, 0));
    assert!(get_logs().join("").contains("settle_failed"));
    assert_eq!(get_created_receipts().len(), 0, "no apply on failure");
    // retry works
    ctx(&acc("anyone.t"), START + EPOCH, vec![]);
    let _ = r.settle(0);
}

#[test]
fn report_for_wrong_epoch_is_a_failure() {
    let mut r = new_root();
    ctx(&acc("anyone.t"), START + EPOCH, vec![]);
    let _ = r.settle(0);
    let reps = vec![ok(&report(0, 2, 1)), ok(&report(7, 2, 1)), ok(&report(0, 2, 1))];
    assert!(!resolve(&mut r, 0, reps));
}

#[test]
fn total_supply_includes_the_settlement_own_mint_and_burn() {
    let mut r = new_root();
    // fed: each troll mints (3_001 / 3) / senders * senders
    let mut reps = vec![report(0, 2, 400), report(0, 3, 300), report(0, 7, 300)];
    reps[0].hoard = U128(150);
    r.decide(0, &reps);
    // 1_000 per troll: 1_000, 999, 994 minted
    assert_eq!(r.ft_total_supply().0, 1_000 + 1_000 + 999 + 994);
    assert_eq!(r.info().troll_supply, vec![U128(1_400), U128(1_299), U128(1_294)]);
    // starved: troll 0 burns 1% of a 1_999 hoard (19, rounded down like the troll)
    let mut reps = vec![report(1, 0, 3_000), report(1, 9, 0), report(1, 9, 0)];
    reps[0].hoard = U128(1_999);
    reps[1].minted = U128(2_993); // cumulative counters from the troll reports
    reps[2].burned = U128(7);
    r.decide(1, &reps);
    assert_eq!(r.ft_total_supply().0, 1_000 + 2_993 - 7 - 19);
    assert_eq!(r.info().troll_supply[0], U128(3_000 - 19));
}

// ---------- settle bounty ----------

const BOUNTY: u128 = 5 * 10u128.pow(21); // 0.005 NEAR

fn bounty_root() -> Root {
    ctx(&acc("deployer.t"), START, vec![]);
    Root::new(Params { settle_bounty: U128(BOUNTY), ..params() }, trolls(), START, U128(1_000), metadata())
}

/// A context for the root with `balance` yoctoNEAR and the given promise results.
fn ctx_balance(pred: &AccountId, ms: u64, height: u64, balance: u128, results: Vec<PromiseResult>) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(root_id())
        .predecessor_account_id(pred.clone())
        .block_timestamp(ms * 1_000_000)
        .block_height(height)
        .account_balance(near_sdk::NearToken::from_yoctonear(balance))
        .prepaid_gas(Gas::from_tgas(300));
    testing_env!(b.build(), test_vm_config(), RuntimeFeesConfig::test(), Default::default(), results);
}

fn three_reports() -> Vec<PromiseResult> {
    (0..3).map(|_| ok(&report(0, 5, 333))).collect()
}

/// Bounty transfers created by the last call: (receiver, yoctoNEAR).
fn bounty_transfers() -> Vec<(String, u128)> {
    get_created_receipts()
        .into_iter()
        .filter_map(|rc| match &rc.actions[0] {
            near_sdk::mock::MockAction::Transfer { deposit, .. } => Some((rc.receiver_id.to_string(), deposit.as_yoctonear())),
            _ => None,
        })
        .collect()
}

const RICH: u128 = 10u128.pow(25); // 10 NEAR

#[test]
fn settle_bounty_is_paid_to_the_settler_on_success() {
    let mut r = bounty_root();
    ctx_balance(&acc("keeper.t"), START + EPOCH, 10, RICH, vec![]);
    let _ = r.settle(0);
    ctx_balance(&root_id(), START + EPOCH, 12, RICH, three_reports());
    assert!(r.on_reports(0, 1));
    assert_eq!(bounty_transfers(), vec![("keeper.t".to_string(), BOUNTY)]);
    assert!(get_logs().join("").contains("settle_bounty_paid"));
}

#[test]
fn settle_bounty_is_skipped_without_panicking_when_the_balance_is_low() {
    let mut r = bounty_root();
    ctx_balance(&acc("keeper.t"), START + EPOCH, 10, RICH, vec![]);
    let _ = r.settle(0);
    // storage plus 0.01 NEAR reserve is not covered once the bounty is added
    let storage = env::storage_byte_cost().as_yoctonear() * env::storage_usage() as u128;
    let low = storage + BOUNTY_RESERVE.as_yoctonear() + BOUNTY - 1;
    ctx_balance(&root_id(), START + EPOCH, 12, low, three_reports());
    assert!(r.on_reports(0, 1), "the settlement itself still goes through");
    assert!(bounty_transfers().is_empty());
    assert!(get_logs().join("").contains("settle_bounty_skipped"));
    assert_eq!(r.info().next_epoch, 1);
}

#[test]
fn no_bounty_on_a_failed_or_stale_settlement() {
    let mut r = bounty_root();
    ctx_balance(&acc("keeper.t"), START + EPOCH, 10, RICH, vec![]);
    let _ = r.settle(0);
    // a failed report: settle_failed, no bounty
    let reps = vec![ok(&report(0, 5, 1)), PromiseResult::Failed, ok(&report(0, 5, 1))];
    ctx_balance(&root_id(), START + EPOCH, 12, RICH, reps);
    assert!(!r.on_reports(0, 1));
    assert!(bounty_transfers().is_empty());
    // retried by someone else; the old attempt's callback is stale and pays nothing
    ctx_balance(&acc("other.t"), START + EPOCH, 20, RICH, vec![]);
    let _ = r.settle(0);
    ctx_balance(&root_id(), START + EPOCH, 22, RICH, three_reports());
    assert!(!r.on_reports(0, 1));
    assert!(bounty_transfers().is_empty());
}

#[test]
fn only_the_latest_attempts_settler_is_paid() {
    let mut r = bounty_root();
    ctx_balance(&acc("first.t"), START + EPOCH, 100, RICH, vec![]);
    let _ = r.settle(0);
    ctx_balance(&acc("second.t"), START + EPOCH, 100 + SETTLE_TIMEOUT_BLOCKS, RICH, vec![]);
    let _ = r.settle(0);
    ctx_balance(&root_id(), START + EPOCH, 101 + SETTLE_TIMEOUT_BLOCKS, RICH, three_reports());
    assert!(!r.on_reports(0, 1));
    assert!(bounty_transfers().is_empty());
    ctx_balance(&root_id(), START + EPOCH, 102 + SETTLE_TIMEOUT_BLOCKS, RICH, three_reports());
    assert!(r.on_reports(0, 2));
    assert_eq!(bounty_transfers(), vec![("second.t".to_string(), BOUNTY)]);
}
