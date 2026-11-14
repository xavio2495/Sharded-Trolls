use near_api::{Account, AccountId, NearToken, NetworkConfig, Signer};
use near_sandbox::Sandbox;
use std::sync::Arc;

pub struct Env {
    pub sandbox: Sandbox,
    pub network: NetworkConfig,
    pub signer: Arc<Signer>,
}

pub async fn start() -> testresult::TestResult<Env> {
    let sandbox = Sandbox::start_sandbox().await?;
    let network = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let signer = Signer::from_secret_key(
        near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?,
    )?;
    Ok(Env { sandbox, network, signer })
}

/// Builds `contracts/<name>` with cargo-near and returns the wasm bytes.
pub fn wasm(name: &str) -> testresult::TestResult<Vec<u8>> {
    let manifest = format!("{}/../contracts/{name}/Cargo.toml", env!("CARGO_MANIFEST_DIR"));
    let opts = cargo_near_build::BuildOpts::builder()
        .manifest_path(manifest)
        .build();
    let path = cargo_near_build::build_with_cli(opts)?;
    Ok(std::fs::read(path)?)
}

pub async fn create_account(env: &Env, id: &str) -> testresult::TestResult<Account> {
    let account_id: AccountId = id.parse()?;
    env.sandbox
        .create_account(account_id.as_str().parse()?)
        .initial_balance(NearToken::from_near(10))
        .send()
        .await?;
    Ok(Account(account_id))
}
