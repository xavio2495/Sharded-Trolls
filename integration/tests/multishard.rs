mod common;

/// The local sandbox runs mainnet's 10-shard layout: every block carries a
/// chunk for each of mainnet's shard ids.
#[tokio::test]
async fn sandbox_runs_mainnet_shard_layout() -> testresult::TestResult<()> {
    let env = common::start_mainnet_layout().await?;
    let block = near_api::Chain::block().fetch_from(&env.network).await?;
    let mut shards: Vec<u64> = block.chunks.iter().map(|c| c.shard_id.clone().into()).collect();
    let mut want = common::MAINNET_SHARD_IDS.to_vec();
    shards.sort();
    want.sort();
    assert_eq!(shards, want);
    Ok(())
}
