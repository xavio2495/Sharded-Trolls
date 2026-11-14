#![allow(dead_code)] // each test binary uses a different subset of these helpers

use near_api::{Account, AccountId, NearToken, NetworkConfig, Signer};
use near_sandbox::Sandbox;
use std::sync::Arc;

pub struct Env {
    pub sandbox: Sandbox,
    pub network: NetworkConfig,
    pub signer: Arc<Signer>,
}

pub async fn start() -> testresult::TestResult<Env> {
    connect(Sandbox::start_sandbox().await?)
}

/// Mainnet's shard layout (protocol 88): 10 shards, boundaries and ids as
/// returned by `EXPERIMENTAL_protocol_config` on mainnet.
pub const MAINNET_BOUNDARIES: [&str; 9] = [
    "650", "aurora", "aurora-0", "earn.kaiching", "game.hot.tg", "game.hot.tg-0",
    "kkuuue2akv_1630967379.near", "tge-lockup.sweat", "wallet.ka",
];
pub const MAINNET_SHARD_IDS: [u64; 10] = [10, 11, 1, 8, 9, 6, 7, 4, 12, 13];

/// A single-node sandbox running mainnet's multi-shard layout, so accounts
/// such as `0.sandbox` and `ax.sandbox` live on different shards.
pub async fn start_mainnet_layout() -> testresult::TestResult<Env> {
    let index: serde_json::Map<String, serde_json::Value> = MAINNET_SHARD_IDS
        .iter()
        .enumerate()
        .map(|(i, id)| (id.to_string(), serde_json::json!(i)))
        .collect();
    let to_id: serde_json::Map<String, serde_json::Value> = MAINNET_SHARD_IDS
        .iter()
        .enumerate()
        .map(|(i, id)| (i.to_string(), serde_json::json!(id)))
        .collect();
    let config = near_sandbox::SandboxConfig {
        additional_genesis: Some(serde_json::json!({
            "shard_layout": { "V2": {
                "boundary_accounts": MAINNET_BOUNDARIES,
                "shard_ids": MAINNET_SHARD_IDS,
                "id_to_index_map": index,
                "index_to_id_map": to_id,
                "shards_split_map": null,
                "shards_parent_map": null,
                "version": 3
            }}
        })),
        ..Default::default()
    };
    connect(Sandbox::start_sandbox_with_config(config).await?)
}

fn connect(sandbox: Sandbox) -> testresult::TestResult<Env> {
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

/// Creates `id` (a sub-account of the genesis account `sandbox`) with a real
/// transaction, so it also works when the new account lives on another shard.
pub async fn create_account(env: &Env, id: &str) -> testresult::TestResult<Account> {
    let account_id: AccountId = id.parse()?;
    let key: near_api::types::PublicKey =
        near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PUBLIC_KEY.parse()?;
    Account::create_account(account_id.clone())
        .fund_myself("sandbox".parse()?, NearToken::from_near(10))
        .with_public_key(key)
        .with_signer(env.signer.clone())
        .send_to(&env.network)
        .await?
        .assert_success();
    let mut last = String::new();
    for _ in 0..50 {
        match Account(account_id.clone()).view().fetch_from(&env.network).await {
            Ok(_) => return Ok(Account(account_id)),
            Err(e) => last = e.to_string(),
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    Err(format!("account {account_id} did not appear: {last}").into())
}
