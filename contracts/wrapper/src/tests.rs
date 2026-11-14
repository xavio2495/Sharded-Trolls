use super::*;
use near_sdk::test_utils::{VMContextBuilder, get_created_receipts, get_logs};
use near_sdk::{PromiseResult, RuntimeFeesConfig, test_vm_config, testing_env};

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(pred: &str, yocto: u128, results: Vec<PromiseResult>) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("wtroll.t"))
        .predecessor_account_id(acc(pred))
        .attached_deposit(NearToken::from_yoctonear(yocto))
        .prepaid_gas(Gas::from_tgas(300));
    testing_env!(b.build(), test_vm_config(), RuntimeFeesConfig::test(), Default::default(), results);
}

fn wrapper() -> Wrapper {
    ctx("deployer.t", 0, vec![]);
    let meta = FungibleTokenMetadata {
        spec: "ft-1.0.0".into(),
        name: "Wrapped Sharded Trolls".into(),
        symbol: "wTROLL".into(),
        icon: None,
        reference: None,
        reference_hash: None,
        decimals: 24,
    };
    Wrapper::new(acc("troll0.t"), meta)
}

fn register(w: &mut Wrapper, who: &str) {
    let min = w.storage_balance_bounds().min.as_yoctonear();
    ctx(who, min, vec![]);
    w.storage_deposit(None, None);
}

fn wrap(w: &mut Wrapper, who: &str, amount: u128) -> u128 {
    ctx("troll0.t", 0, vec![]);
    match w.ft_on_transfer(acc(who), U128(amount), String::new()) {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => panic!("expected a value"),
    }
}

#[test]
fn wrap_mints_one_to_one_for_registered_sender() {
    let mut w = wrapper();
    register(&mut w, "alice.t");
    assert_eq!(wrap(&mut w, "alice.t", 500), 0);
    assert_eq!((w.ft_balance_of(acc("alice.t")).0, w.ft_total_supply().0), (500, 500));
    assert!(get_logs()[0].contains("ft_mint"));
}

#[test]
fn wrap_from_unregistered_sender_returns_everything() {
    let mut w = wrapper();
    assert_eq!(wrap(&mut w, "bob.t", 500), 500);
    assert_eq!(w.ft_total_supply().0, 0);
}

#[test]
#[should_panic(expected = "only the troll token can be wrapped")]
fn wrap_from_any_other_token_rejected() {
    let mut w = wrapper();
    register(&mut w, "alice.t");
    ctx("troll1.t", 0, vec![]);
    let _ = w.ft_on_transfer(acc("alice.t"), U128(500), String::new());
}

#[test]
fn unwrap_burns_and_pays_out_from_the_troll() {
    let mut w = wrapper();
    register(&mut w, "alice.t");
    wrap(&mut w, "alice.t", 500);
    ctx("alice.t", 1, vec![]);
    let _ = w.unwrap(U128(200));
    assert_eq!((w.ft_balance_of(acc("alice.t")).0, w.ft_total_supply().0), (300, 300));
    let receipts = get_created_receipts();
    assert_eq!(receipts[0].receiver_id, acc("troll0.t"));
    ctx("wtroll.t", 0, vec![PromiseResult::Successful(b"true".to_vec())]);
    assert!(w.on_unwrap(acc("alice.t"), U128(200)));
    assert_eq!(w.ft_total_supply().0, 300);
}

#[test]
fn failed_or_refunded_unwrap_restores_wrapped_tokens() {
    let mut w = wrapper();
    register(&mut w, "alice.t");
    wrap(&mut w, "alice.t", 500);
    for result in [PromiseResult::Failed, PromiseResult::Successful(b"false".to_vec())] {
        ctx("alice.t", 1, vec![]);
        let _ = w.unwrap(U128(200));
        ctx("wtroll.t", 0, vec![result]);
        assert!(!w.on_unwrap(acc("alice.t"), U128(200)));
        assert_eq!(w.ft_balance_of(acc("alice.t")).0, 500);
    }
}

#[test]
#[should_panic(expected = "The account doesn't have enough balance")]
fn unwrap_more_than_held_rejected() {
    let mut w = wrapper();
    register(&mut w, "alice.t");
    wrap(&mut w, "alice.t", 500);
    ctx("alice.t", 1, vec![]);
    let _ = w.unwrap(U128(501));
}

#[test]
#[should_panic(expected = "unwrap in flight")]
fn cannot_unregister_with_an_unwrap_in_flight() {
    // Otherwise a failed payout would re-register the account for free and a second
    // unregister would pay out a storage deposit nobody paid.
    let mut w = wrapper();
    register(&mut w, "alice.t");
    wrap(&mut w, "alice.t", 500);
    ctx("alice.t", 1, vec![]);
    let _ = w.unwrap(U128(500));
    ctx("alice.t", 1, vec![]);
    w.storage_unregister(None);
}

#[test]
fn unregister_allowed_after_the_unwrap_resolves() {
    let mut w = wrapper();
    register(&mut w, "alice.t");
    wrap(&mut w, "alice.t", 500);
    ctx("alice.t", 1, vec![]);
    let _ = w.unwrap(U128(500));
    ctx("wtroll.t", 0, vec![PromiseResult::Successful(b"true".to_vec())]);
    assert!(w.on_unwrap(acc("alice.t"), U128(500)));
    ctx("alice.t", 1, vec![]);
    assert!(w.storage_unregister(None));
}
