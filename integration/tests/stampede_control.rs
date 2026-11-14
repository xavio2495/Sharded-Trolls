mod common;

use near_api::{Contract, NearGas, NearToken};
use serde_json::json;

/// One `fire` transaction issues 50 `ft_transfer` receipts
/// on the single-contract baseline token, and all of them land.
#[tokio::test]
async fn stampede_fans_out_50_transfers_on_control() -> testresult::TestResult<()> {
    let env = common::start().await?;
    let owner = common::create_account(&env, "owner.sandbox").await?;
    let control = common::create_account(&env, "control.sandbox").await?;
    let stampede = common::create_account(&env, "stampede.sandbox").await?;
    let alice = common::create_account(&env, "alice.sandbox").await?;
    let bob = common::create_account(&env, "bob.sandbox").await?;

    Contract::deploy(control.0.clone())
        .use_code(common::wasm("control")?)
        .with_init_call(
            "new",
            json!({ "owner_id": owner.0, "total_supply": "1000000", "symbol": "CTRL" }),
        )?
        .with_signer(env.signer.clone())
        .send_to(&env.network)
        .await?
        .assert_success();
    Contract::deploy(stampede.0.clone())
        .use_code(common::wasm("stampede")?)
        .with_init_call("new", json!({ "owner_id": owner.0 }))?
        .with_signer(env.signer.clone())
        .send_to(&env.network)
        .await?
        .assert_success();

    let control_c = Contract(control.0.clone());
    for who in [&stampede.0, &alice.0, &bob.0] {
        control_c
            .call_function("storage_deposit", json!({ "account_id": who }))
            .transaction()
            .deposit(NearToken::from_millinear(10))
            .with_signer(owner.0.clone(), env.signer.clone())
            .send_to(&env.network)
            .await?
            .assert_success();
    }
    control_c
        .call_function("ft_transfer", json!({ "receiver_id": stampede.0, "amount": "1000" }))
        .transaction()
        .deposit(NearToken::from_yoctonear(1))
        .with_signer(owner.0.clone(), env.signer.clone())
        .send_to(&env.network)
        .await?
        .assert_success();

    Contract(stampede.0.clone())
        .call_function(
            "fire",
            json!({
                "target": control.0,
                "receivers": [alice.0, bob.0],
                "amount": "3",
                "n": 50,
                "gas_per_call_tgas": 5,
            }),
        )
        .transaction()
        .gas(NearGas::from_tgas(400))
        .with_signer(owner.0.clone(), env.signer.clone())
        .send_to(&env.network)
        .await?
        .assert_success();

    let balance = |id: near_api::AccountId| {
        let c = control_c.clone();
        let net = env.network.clone();
        async move {
            let v: String = c
                .call_function("ft_balance_of", json!({ "account_id": id }))
                .read_only()
                .fetch_from(&net)
                .await?
                .data;
            testresult::TestResult::Ok(v.parse::<u128>()?)
        }
    };
    assert_eq!(balance(alice.0.clone()).await?, 75);
    assert_eq!(balance(bob.0.clone()).await?, 75);
    assert_eq!(balance(stampede.0.clone()).await?, 1000 - 150);
    Ok(())
}
