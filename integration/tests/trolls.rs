//! Root + 8 trolls on a sandbox running mainnet's 10-shard layout, so
//! cross-troll credits really cross shards. Users are picked by asking the
//! contracts for their home troll, so the tests do not depend on how homes
//! are assigned.

mod common;

use common::Env;
use near_api::{AccountId, Contract, NearGas, NearToken};
use serde_json::{Value, json};

/// Troll prefixes that land on 8 distinct shards under mainnet's layout.
const PREFIXES: [&str; 8] = ["0", "7", "ax", "f", "h", "kz", "u", "wz"];
const ONE: u128 = 1_000_000_000_000_000_000_000_000; // 1 token, 24 decimals
const TOTAL: u128 = 1_000_000_000 * ONE;
const LAUNCH: u128 = 500_000_000 * ONE;
const CLAIM: u128 = 100_000 * ONE;
const TOLL_BPS: u128 = 25;
const EPOCH_MS: u64 = 60_000;
/// Settle bounty: 0.005 NEAR.
const BOUNTY: u128 = 5_000_000_000_000_000_000_000;

struct Token {
    root: AccountId,
    trolls: Vec<AccountId>,
    start_ms: u64,
}

fn params(feed_target: u32) -> Value {
    json!({
        "troll_count": 8,
        "toll_bps": TOLL_BPS,
        "feed_target": feed_target,
        "reward_per_epoch": (250_000 * ONE).to_string(),
        "starve_burn_bps": 100,
        "epoch_ms": EPOCH_MS,
        "launch_window_ms": 86_400_000u64,
        "launch_claim_amount": CLAIM.to_string(),
        "min_counted_transfer": ONE.to_string(),
        "claim_fee": "0",
        "settle_bounty": BOUNTY.to_string(),
    })
}

fn metadata() -> Value {
    json!({
        "spec": "ft-1.0.0", "name": "Sharded Trolls", "symbol": "TROLL",
        "icon": null, "reference": null, "reference_hash": null, "decimals": 24
    })
}

async fn block_ms(env: &Env) -> testresult::TestResult<u64> {
    let b = near_api::Chain::block().fetch_from(&env.network).await?;
    Ok((b.header.timestamp_nanosec.to_string().parse::<u128>()? / 1_000_000) as u64)
}

async fn deploy(env: &Env, feed_target: u32) -> testresult::TestResult<Token> {
    let troll_wasm = common::wasm("troll")?;
    let root_wasm = common::wasm("root")?;
    let root = common::create_account(env, "trolls.sandbox").await?.0;
    let mut trolls = Vec::new();
    for p in PREFIXES {
        trolls.push(common::create_account(env, &format!("{p}.sandbox")).await?.0);
    }
    let start_ms = block_ms(env).await?;
    let p = params(feed_target);
    for t in &trolls {
        Contract::deploy(t.clone())
            .use_code(troll_wasm.clone())
            .with_init_call(
                "new",
                json!({
                    "root": root, "trolls": trolls, "params": p, "metadata": metadata(),
                    "start_ms": start_ms, "total_supply": TOTAL.to_string(),
                    "launch_supply": LAUNCH.to_string(),
                }),
            )?
            .with_signer(env.signer.clone())
            .send_to(&env.network)
            .await?
            .assert_success();
    }
    Contract::deploy(root.clone())
        .use_code(root_wasm)
        .with_init_call(
            "new",
            json!({
                "params": p, "trolls": trolls, "start_ms": start_ms,
                "total_supply": TOTAL.to_string(),
                "metadata": metadata(),
            }),
        )?
        .with_signer(env.signer.clone())
        .send_to(&env.network)
        .await?
        .assert_success();
    Ok(Token { root, trolls, start_ms })
}

async fn view<T: serde::de::DeserializeOwned + Send + Sync + 'static>(
    env: &Env,
    contract: &AccountId,
    method: &str,
    args: Value,
) -> testresult::TestResult<T> {
    Ok(Contract(contract.clone())
        .call_function(method, args)
        .read_only()
        .fetch_from(&env.network)
        .await?
        .data)
}

async fn call(
    env: &Env,
    signer: &AccountId,
    contract: &AccountId,
    method: &str,
    args: Value,
    deposit: NearToken,
) -> testresult::TestResult<near_api::types::transaction::result::ExecutionFinalResult> {
    Ok(Contract(contract.clone())
        .call_function(method, args)
        .transaction()
        .gas(NearGas::from_tgas(300))
        .deposit(deposit)
        .with_signer(signer.clone(), env.signer.clone())
        .send_to(&env.network)
        .await?
        .into_full()
        .ok_or("transaction did not reach a final result")?)
}

async fn home(env: &Env, t: &Token, who: &AccountId) -> testresult::TestResult<AccountId> {
    view(env, &t.root, "home_troll", json!({ "account_id": who })).await
}

async fn balance(env: &Env, t: &Token, who: &AccountId) -> testresult::TestResult<u128> {
    let troll = home(env, t, who).await?;
    let v: String = view(env, &troll, "ft_balance_of", json!({ "account_id": who })).await?;
    Ok(v.parse()?)
}

async fn storage_min(env: &Env, troll: &AccountId) -> testresult::TestResult<NearToken> {
    let b: Value = view(env, troll, "storage_balance_bounds", json!({})).await?;
    Ok(NearToken::from_yoctonear(b["min"].as_str().unwrap().parse()?))
}

/// Creates `name.sandbox` and registers it at its home troll.
async fn user(env: &Env, t: &Token, name: &str) -> testresult::TestResult<AccountId> {
    let id = common::create_account(env, &format!("{name}.sandbox")).await?.0;
    let troll = home(env, t, &id).await?;
    let min = storage_min(env, &troll).await?;
    call(env, &id, &troll, "storage_deposit", json!({}), min).await?.assert_success();
    Ok(id)
}

/// Finds `count` unused names whose home troll is (or is not) `troll`.
async fn names_at(
    env: &Env,
    t: &Token,
    troll: &AccountId,
    same: bool,
    count: usize,
    tag: &str,
) -> testresult::TestResult<Vec<String>> {
    let mut out = Vec::new();
    for i in 0..10_000 {
        // Spread first letters so both range and hash assignment find matches fast.
        let first = b"0123456789abcdefghijklmnopqrstuvwxyz"[i % 36] as char;
        let name = format!("{first}{tag}{i}");
        let id: AccountId = format!("{name}.sandbox").parse()?;
        if (&home(env, t, &id).await? == troll) == same {
            out.push(name);
            if out.len() == count {
                return Ok(out);
            }
        }
    }
    Err("no matching names".into())
}

async fn claim_launch(env: &Env, t: &Token, who: &AccountId) -> testresult::TestResult<()> {
    let troll = home(env, t, who).await?;
    call(env, who, &troll, "claim_launch", json!({}), NearToken::from_yoctonear(0))
        .await?
        .assert_success();
    Ok(())
}

async fn transfer(
    env: &Env,
    t: &Token,
    from: &AccountId,
    to: &AccountId,
    amount: u128,
) -> testresult::TestResult<bool> {
    let troll = home(env, t, from).await?;
    let r = call(
        env,
        from,
        &troll,
        "ft_transfer",
        json!({ "receiver_id": to, "amount": amount.to_string() }),
        NearToken::from_yoctonear(1),
    )
    .await?;
    Ok(r.json::<bool>()?)
}

/// Σ over trolls of (supply + in_flight) and of burned, from `info()`.
async fn totals(env: &Env, t: &Token) -> testresult::TestResult<(u128, u128)> {
    let (mut held, mut burned) = (0u128, 0u128);
    for troll in &t.trolls {
        let i: Value = view(env, troll, "info", json!({})).await?;
        let n = |k: &str| i[k].as_str().unwrap().parse::<u128>().unwrap();
        held += n("supply") + n("in_flight");
        burned += n("burned");
    }
    Ok((held, burned))
}

/// Σ over trolls of minted and of food, from `info()`.
async fn minted_and_food(env: &Env, t: &Token) -> testresult::TestResult<(u128, u128)> {
    let (mut minted, mut food) = (0u128, 0u128);
    for troll in &t.trolls {
        let i: Value = view(env, troll, "info", json!({})).await?;
        minted += i["minted"].as_str().unwrap().parse::<u128>()?;
        food += i["food"].as_str().unwrap().parse::<u128>()?;
    }
    Ok((minted, food))
}

async fn wait_for_epoch_end(env: &Env, t: &Token, epoch: u64) -> testresult::TestResult<()> {
    let end = t.start_ms + (epoch + 1) * EPOCH_MS;
    while block_ms(env).await? <= end {
        env.sandbox.fast_forward(50).await?;
    }
    Ok(())
}

#[tokio::test]
async fn transfers_tolls_refunds_and_access() -> testresult::TestResult<()> {
    let env = common::start_mainnet_layout().await?;
    let t = deploy(&env, 1).await?;

    let alice = user(&env, &t, "alice").await?;
    let a_troll = home(&env, &t, &alice).await?;
    let same = names_at(&env, &t, &a_troll, true, 1, "same").await?;
    let other = names_at(&env, &t, &a_troll, false, 2, "far").await?;
    let amy = user(&env, &t, &same[0]).await?;
    let bob = user(&env, &t, &other[0]).await?;
    // Not registered anywhere: a cross-troll credit to it must fail and refund.
    let ghost = common::create_account(&env, &format!("{}.sandbox", other[1])).await?.0;

    // Launch claim: once per account.
    claim_launch(&env, &t, &alice).await?;
    assert_eq!(balance(&env, &t, &alice).await?, CLAIM);
    call(&env, &alice, &a_troll, "claim_launch", json!({}), NearToken::from_yoctonear(0))
        .await?
        .assert_failure();

    // Same-troll transfer: exact, no toll.
    assert!(transfer(&env, &t, &alice, &amy, 10 * ONE).await?);
    assert_eq!(balance(&env, &t, &amy).await?, 10 * ONE);

    // Cross-troll transfer: receiver gets amount − toll; the receiver's troll eats the toll.
    let amount = 1_000 * ONE;
    let toll = amount * TOLL_BPS / 10_000;
    assert!(transfer(&env, &t, &alice, &bob, amount).await?);
    assert_eq!(balance(&env, &t, &bob).await?, amount - toll);
    assert_eq!(balance(&env, &t, &alice).await?, CLAIM - 10 * ONE - amount);

    // Cross-troll to an unregistered receiver: full refund, nothing burned.
    let before = balance(&env, &t, &alice).await?;
    let (_, burned_before) = totals(&env, &t).await?;
    assert!(!transfer(&env, &t, &alice, &ghost, 5 * ONE).await?);
    assert_eq!(balance(&env, &t, &alice).await?, before);
    assert_eq!(totals(&env, &t).await?.1, burned_before);

    // Conservation: the toll moved to the receiver's troll as food; nothing was burned.
    let (held, burned) = totals(&env, &t).await?;
    assert_eq!((held, burned), (TOTAL, 0));
    let b_info: Value = view(&env, &home(&env, &t, &bob).await?, "info", json!({})).await?;
    assert_eq!(b_info["food"].as_str().unwrap().parse::<u128>()?, toll);

    // Each troll is a self-describing NEP-141: its own metadata, and its own share of the
    // supply. Nothing is in flight now, so the shares add up to the token-wide total.
    let mut sum = 0u128;
    for troll in &t.trolls {
        let m: Value = view(&env, troll, "ft_metadata", json!({})).await?;
        assert_eq!((m["symbol"].as_str(), m["decimals"].as_u64()), (Some("TROLL"), Some(24)));
        sum += view::<String>(&env, troll, "ft_total_supply", json!({})).await?.parse::<u128>()?;
    }
    assert_eq!(sum, TOTAL);

    // Access control.
    let eve = common::create_account(&env, "eve.sandbox").await?.0;
    let b_troll = home(&env, &t, &bob).await?;
    call(
        &env, &eve, &b_troll, "credit",
        json!({ "sender_id": eve, "receiver_id": bob, "amount": ONE.to_string() }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .assert_failure();
    call(&env, &eve, &a_troll, "report", json!({ "epoch": 0 }), NearToken::from_yoctonear(0))
        .await?
        .assert_failure();
    call(
        &env, &eve, &a_troll, "apply",
        json!({ "epoch": 0, "outcome": { "Reward": { "amount": ONE.to_string() } } }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .assert_failure();
    assert_eq!(balance(&env, &t, &bob).await?, amount - toll);
    Ok(())
}

#[tokio::test]
async fn feeding_all_fed_then_starved() -> testresult::TestResult<()> {
    let env = common::start_mainnet_layout().await?;
    let t = deploy(&env, 1).await?;

    // One feeder per troll, all sending to a sink on troll 0.
    let sink_name = names_at(&env, &t, &t.trolls[0], true, 1, "sink").await?;
    let sink = user(&env, &t, &sink_name[0]).await?;
    let mut feeders = Vec::new();
    for (i, troll) in t.trolls.iter().enumerate() {
        let n = names_at(&env, &t, troll, true, 1, &format!("feed{i}x")).await?;
        let f = user(&env, &t, &n[0]).await?;
        claim_launch(&env, &t, &f).await?;
        feeders.push(f);
    }

    // Settling before the epoch ends is rejected.
    call(&env, &sink, &t.root, "settle", json!({ "epoch": 0 }), NearToken::from_yoctonear(0))
        .await?
        .assert_failure();

    for f in &feeders {
        assert!(transfer(&env, &t, f, &sink, 2 * ONE).await?);
    }
    wait_for_epoch_end(&env, &t, 0).await?;

    // `settle` resolves to whether the settlement went through; fed/starved shows in the streak.
    let settled: bool = call(&env, &sink, &t.root, "settle", json!({ "epoch": 0 }), NearToken::from_yoctonear(0))
        .await?
        .json()?;
    assert!(settled);
    let streak: (u64, u64) = view(&env, &t.root, "streak", json!({})).await?;
    assert_eq!(streak, (1, 1));

    // Settling the same epoch twice is rejected.
    call(&env, &sink, &t.root, "settle", json!({ "epoch": 0 }), NearToken::from_yoctonear(0))
        .await?
        .assert_failure();

    // Each troll minted reward/8 for its single feeder; the feeder claims it.
    let f0 = &feeders[1];
    let f0_troll = home(&env, &t, f0).await?;
    let before = balance(&env, &t, f0).await?;
    call(&env, f0, &f0_troll, "claim", json!({ "epoch": 0 }), NearToken::from_yoctonear(0))
        .await?
        .assert_success();
    assert_eq!(balance(&env, &t, f0).await?, before + 250_000 * ONE / 8);
    call(&env, f0, &f0_troll, "claim", json!({ "epoch": 0 }), NearToken::from_yoctonear(0))
        .await?
        .assert_failure();

    let supply: String = view(&env, &t.root, "ft_total_supply", json!({})).await?;
    let (held, burned) = totals(&env, &t).await?;
    assert_eq!(supply.parse::<u128>()?, held);
    // Tolls the sink's troll ate pay part of its reward, so less than the full reward is minted.
    let (minted, food) = minted_and_food(&env, &t).await?;
    assert!(minted < 250_000 * ONE && minted + 7 * (2 * ONE * TOLL_BPS / 10_000) == 250_000 * ONE);
    assert_eq!(food, 0, "all eaten tolls were paid out");
    assert_eq!(held + burned, TOTAL + minted);

    // Epoch 1: nobody sends, so every troll starves, hoards burn and the streak resets.
    wait_for_epoch_end(&env, &t, 1).await?;
    let settled: bool = call(&env, &sink, &t.root, "settle", json!({ "epoch": 1 }), NearToken::from_yoctonear(0))
        .await?
        .json()?;
    assert!(settled);
    let streak: (u64, u64) = view(&env, &t.root, "streak", json!({})).await?;
    assert_eq!(streak, (0, 1));
    let (held2, burned2) = totals(&env, &t).await?;
    assert!(burned2 > burned, "starving trolls burned part of their hoards");
    assert_eq!(held2 + burned2, TOTAL + minted);
    Ok(())
}

async fn wrapped_balance(env: &Env, wrapper: &AccountId, who: &AccountId) -> testresult::TestResult<u128> {
    let v: String = view(env, wrapper, "ft_balance_of", json!({ "account_id": who })).await?;
    Ok(v.parse()?)
}

/// The NEP-141 wrapper lives on one troll. A holder on another troll wraps
/// with a cross-troll `ft_transfer_call` and unwraps back across trolls.
#[tokio::test]
async fn wrapper_cross_troll_wrap_and_unwrap() -> testresult::TestResult<()> {
    let env = common::start_mainnet_layout().await?;
    let t = deploy(&env, 1).await?;

    let wrapper = common::create_account(&env, "wtroll.sandbox").await?.0;
    let w_troll = home(&env, &t, &wrapper).await?;
    Contract::deploy(wrapper.clone())
        .use_code(common::wasm("wrapper")?)
        .with_init_call(
            "new",
            json!({
                "troll": w_troll,
                "metadata": {
                    "spec": "ft-1.0.0", "name": "Wrapped Sharded Trolls", "symbol": "wTROLL",
                    "icon": null, "reference": null, "reference_hash": null, "decimals": 24
                },
            }),
        )?
        .with_signer(env.signer.clone())
        .send_to(&env.network)
        .await?
        .assert_success();
    // The wrapper holds troll tokens at its home troll.
    let min = storage_min(&env, &w_troll).await?;
    call(&env, &wrapper, &w_troll, "storage_deposit", json!({}), min).await?.assert_success();

    // A holder whose home is a different troll than the wrapper's.
    let far = names_at(&env, &t, &w_troll, false, 2, "wrap").await?;
    let holder = user(&env, &t, &far[0]).await?;
    let stranger = user(&env, &t, &far[1]).await?;
    claim_launch(&env, &t, &holder).await?;
    claim_launch(&env, &t, &stranger).await?;
    let h_troll = home(&env, &t, &holder).await?;
    assert_ne!(h_troll, w_troll);
    call(&env, &holder, &wrapper, "storage_deposit", json!({}), NearToken::from_millinear(10))
        .await?
        .assert_success();

    // Wrap across trolls: receiver keeps amount − toll, minted 1:1 as wTROLL.
    let amount = 1_000 * ONE;
    let toll = amount * TOLL_BPS / 10_000;
    let r = call(
        &env, &holder, &h_troll, "ft_transfer_call",
        json!({ "receiver_id": wrapper, "amount": amount.to_string(), "msg": "" }),
        NearToken::from_yoctonear(1),
    )
    .await?;
    let gas_tgas = r.total_gas_burnt.as_gas() / 1_000_000_000_000;
    let used: String = r.json()?;
    assert_eq!(used.parse::<u128>()?, amount - toll);
    assert_eq!(wrapped_balance(&env, &wrapper, &holder).await?, amount - toll);
    assert_eq!(balance(&env, &t, &holder).await?, CLAIM - amount);
    assert_eq!(balance(&env, &t, &wrapper).await?, amount - toll);
    println!("cross-troll wrap: {gas_tgas} Tgas burnt in total");

    // Not registered at the wrapper: everything except the toll comes back.
    let used: String = call(
        &env, &stranger, &home(&env, &t, &stranger).await?, "ft_transfer_call",
        json!({ "receiver_id": wrapper, "amount": amount.to_string(), "msg": "" }),
        NearToken::from_yoctonear(1),
    )
    .await?
    .json()?;
    assert_eq!(used.parse::<u128>()?, 0);
    assert_eq!(balance(&env, &t, &stranger).await?, CLAIM - toll);
    assert_eq!(balance(&env, &t, &wrapper).await?, amount - toll);

    // Unwrap across trolls: burns wTROLL, the holder receives it minus the toll.
    let back = 400 * ONE;
    call(&env, &holder, &wrapper, "unwrap", json!({ "amount": back.to_string() }), NearToken::from_yoctonear(1))
        .await?
        .assert_success();
    assert_eq!(wrapped_balance(&env, &wrapper, &holder).await?, amount - toll - back);
    assert_eq!(balance(&env, &t, &wrapper).await?, amount - toll - back);
    assert_eq!(balance(&env, &t, &holder).await?, CLAIM - amount + back - back * TOLL_BPS / 10_000);
    let supply: String = view(&env, &wrapper, "ft_total_supply", json!({})).await?;
    assert_eq!(supply.parse::<u128>()?, balance(&env, &t, &wrapper).await?, "wTROLL fully backed");

    let (held, burned) = totals(&env, &t).await?;
    assert_eq!(held + burned, TOTAL);
    Ok(())
}

/// One cross-troll `ft_transfer_call` with exactly `tgas` attached and a `msg` of `len` bytes.
async fn transfer_call_with(
    env: &Env,
    from: &AccountId,
    troll: &AccountId,
    to: &AccountId,
    amount: u128,
    len: usize,
    tgas: u64,
) -> testresult::TestResult<near_api::types::transaction::result::ExecutionFinalResult> {
    Ok(Contract(troll.clone())
        .call_function(
            "ft_transfer_call",
            json!({ "receiver_id": to, "amount": amount.to_string(), "msg": "x".repeat(len) }),
        )
        .transaction()
        .gas(NearGas::from_tgas(tgas))
        .deposit(NearToken::from_yoctonear(1))
        .with_signer(from.clone(), env.signer.clone())
        .send_to(&env.network)
        .await?
        .into_full()
        .ok_or("transaction did not reach a final result")?)
}

/// At exactly the 100 Tgas floor: a cross-troll transfer-and-call with a small or limit-sized `msg`
/// completes and the books close; a longer `msg` is rejected before anything is debited. Without
/// the bound, a msg of about 220 KB made `credit_call` run out of gas after the source had
/// debited, so the sender lost the transfer and the books came up short.
#[tokio::test]
async fn transfer_call_at_minimum_gas_and_msg_bound() -> testresult::TestResult<()> {
    let env = common::start_mainnet_layout().await?;
    let t = deploy(&env, 1).await?;
    let alice = user(&env, &t, "alice").await?;
    let a_troll = home(&env, &t, &alice).await?;
    let far = names_at(&env, &t, &a_troll, false, 1, "far").await?;
    let bob = user(&env, &t, &far[0]).await?;
    let b_troll = home(&env, &t, &bob).await?;
    claim_launch(&env, &t, &alice).await?;
    let amount = 1_000 * ONE;
    let toll = amount * TOLL_BPS / 10_000;
    for (len, accepted) in [(0usize, true), (4096, true), (4097, false), (220 * 1024, false)] {
        let before = balance(&env, &t, &alice).await?;
        let r = transfer_call_with(&env, &alice, &a_troll, &bob, amount, len, 100).await?;
        let credit_call = r.receipt_outcomes().iter().find(|o| o.executor_id == b_troll && o.logs.iter().any(|l| l.contains("ft_mint")));
        println!(
            "msg {len} B at 100 Tgas: success {}, credit_call burnt {:?} Tgas",
            r.is_success(),
            credit_call.map(|o| o.gas_burnt.as_gas() as f64 / 1e12)
        );
        let after = balance(&env, &t, &alice).await?;
        let logs = r.logs().join("\n");
        assert!(!logs.contains("credit_unresolved"), "msg {len}: credit_call must not fail");
        if accepted {
            assert!(r.is_success() && credit_call.is_some_and(|o| o.is_success()), "msg {len}: accepted and credited");
            // bob is a plain account, so ft_on_transfer fails and everything but the toll comes back
            assert_eq!(after, before - toll, "msg {len}");
        } else {
            assert!(credit_call.is_none(), "msg {len}: nothing sent to the destination");
            r.assert_failure();
            assert_eq!(after, before, "msg {len}: nothing debited");
        }
        let (held, burned) = totals(&env, &t).await?;
        assert_eq!(held + burned, TOTAL, "msg {len}: books close");
    }
    Ok(())
}

/// A call with exactly `tgas` attached and no deposit.
async fn call_with_gas(
    env: &Env,
    signer: &AccountId,
    contract: &AccountId,
    method: &str,
    args: Value,
    tgas: u64,
) -> testresult::TestResult<near_api::types::transaction::result::ExecutionFinalResult> {
    Ok(Contract(contract.clone())
        .call_function(method, args)
        .transaction()
        .gas(NearGas::from_tgas(tgas))
        .with_signer(signer.clone(), env.signer.clone())
        .send_to(&env.network)
        .await?
        .into_full()
        .ok_or("transaction did not reach a final result")?)
}

/// `settle` needs 250 Tgas up front. At exactly that floor, `on_reports` completes (8 rewards
/// applied) and the settlement unlocks. Before the floor, the lowest gas `settle` accepted was
/// about 205 Tgas, which left `on_reports` its 110 Tgas reservation and nothing more.
#[tokio::test]
async fn settle_at_minimum_gas() -> testresult::TestResult<()> {
    let env = common::start_mainnet_layout().await?;
    let t = deploy(&env, 1).await?;
    let sink_name = names_at(&env, &t, &t.trolls[0], true, 1, "sink").await?;
    let sink = user(&env, &t, &sink_name[0]).await?;
    for (i, troll) in t.trolls.iter().enumerate() {
        let n = names_at(&env, &t, troll, true, 1, &format!("feed{i}x")).await?;
        let f = user(&env, &t, &n[0]).await?;
        claim_launch(&env, &t, &f).await?;
        assert!(transfer(&env, &t, &f, &sink, 2 * ONE).await?);
    }
    // One cross-troll transfer to measure `credit`, which now also feeds the toll to the troll.
    let far = names_at(&env, &t, &t.trolls[0], false, 1, "credit").await?;
    let far = user(&env, &t, &far[0]).await?;
    let r = call(&env, &sink, &t.trolls[0], "ft_transfer", json!({ "receiver_id": far, "amount": ONE.to_string() }), NearToken::from_yoctonear(1)).await?;
    let credit = r.receipt_outcomes().iter().find(|o| o.logs.iter().any(|l| l.contains("toll_eaten"))).ok_or("no credit receipt")?;
    let credit_tgas = credit.gas_burnt.as_gas() as f64 / 1e12;
    println!("credit burnt {credit_tgas:.2} Tgas of its 5 Tgas");
    assert!(credit.is_success() && credit_tgas * 2.0 <= 5.0, "credit keeps a 2x margin");

    wait_for_epoch_end(&env, &t, 0).await?;
    call_with_gas(&env, &sink, &t.root, "settle", json!({ "epoch": 0 }), 249).await?.assert_failure();
    let sink_before = near_api::Tokens::account(sink.clone()).near_balance().fetch_from(&env.network).await?.total;
    let r = call_with_gas(&env, &sink, &t.root, "settle", json!({ "epoch": 0 }), 250).await?;
    let on_reports = r.receipt_outcomes().iter().filter(|o| o.executor_id == t.root).nth(1).cloned();
    let on_reports = on_reports.ok_or("no on_reports receipt")?;
    println!("settle at 250 Tgas: on_reports burnt {:.2} Tgas (plus 8 x 10 Tgas attached to apply)", on_reports.gas_burnt.as_gas() as f64 / 1e12);
    assert!(on_reports.is_success());
    let bounty_logged = r.logs().iter().any(|l| l.contains("settle_bounty_paid"));
    let burnt: u128 = r.outcomes().iter().map(|o| o.tokens_burnt.as_yoctonear()).sum();
    assert!(r.json::<bool>()?);
    let info: Value = view(&env, &t.root, "info", json!({})).await?;
    assert_eq!((info["settling"].clone(), info["next_epoch"].as_u64()), (Value::Null, Some(1)));
    let streak: (u64, u64) = view(&env, &t.root, "streak", json!({})).await?;
    assert_eq!(streak, (1, 1));
    // The settler is paid the bounty: its balance moves by the bounty less the gas it paid.
    assert!(bounty_logged);
    let sink_after = near_api::Tokens::account(sink.clone()).near_balance().fetch_from(&env.network).await?.total;
    let delta = sink_after.as_yoctonear() as i128 - sink_before.as_yoctonear() as i128 + burnt as i128;
    println!("settler: balance change + gas burnt = {delta} yocto (bounty {BOUNTY})");
    assert!((delta - BOUNTY as i128).abs() < 10i128.pow(20), "settler gained the bounty (within 0.0001 NEAR)");
    Ok(())
}
