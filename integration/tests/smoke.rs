mod common;

/// Every contract builds and deploys to the sandbox.
#[tokio::test]
async fn all_contracts_deploy() -> testresult::TestResult<()> {
    let env = common::start().await?;
    for name in ["troll", "root", "stampede", "control"] {
        let account = common::create_account(&env, &format!("{name}.sandbox")).await?;
        near_api::Contract::deploy(account.0.clone())
            .use_code(common::wasm(name)?)
            .without_init_call()
            .with_signer(env.signer.clone())
            .send_to(&env.network)
            .await?
            .assert_success();
    }
    Ok(())
}
