#!/usr/bin/env node
// Per-block, per-shard load recorder. Read-only RPC. For every block: gas_used / gas_limit per
// chunk and the shard's congestion level (the larger of delayed-receipt gas, buffered outgoing gas
// and receipt memory against the protocol's congestion limits; transactions to a shard are rejected
// above reject_tx_congestion_threshold).
// Usage: node --dns-result-order=ipv4first scripts/measure.mjs [--rpc URL | --network localnet|testnet|mainnet]
//          [--blocks N | --seconds S] [--out file.json]
// Stops after N blocks / S seconds or on Ctrl-C, then writes the JSON.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Near } from './lib/near.mjs';

const NETWORKS = { localnet: 'http://127.0.0.1:3040', testnet: 'https://rpc.testnet.fastnear.com', mainnet: 'https://free.rpc.fastnear.com' };
const { values } = parseArgs({ options: {
  rpc: { type: 'string' }, network: { type: 'string', default: 'localnet' },
  blocks: { type: 'string' }, seconds: { type: 'string' }, out: { type: 'string' },
} });
const url = values.rpc ?? NETWORKS[values.network];
const near = new Near(url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cfg = await near.rpc('EXPERIMENTAL_protocol_config', { finality: 'final' });
const cc = cfg.runtime_config.congestion_control_config;
const layout = cfg.shard_layout[Object.keys(cfg.shard_layout)[0]];

export function shardSample(chunk) {
  const ci = chunk.congestion_info ?? {};
  const delayed = Number(ci.delayed_receipts_gas ?? 0);
  const buffered = Number(ci.buffered_receipts_gas ?? 0);
  const bytes = Number(ci.receipt_bytes ?? 0);
  const congestion = Math.min(1, Math.max(delayed / cc.max_congestion_incoming_gas, buffered / cc.max_congestion_outgoing_gas, bytes / cc.max_congestion_memory_consumption));
  return {
    gas_used: chunk.gas_used, gas_limit: chunk.gas_limit,
    fullness: chunk.gas_limit ? +(chunk.gas_used / chunk.gas_limit).toFixed(4) : 0,
    new_chunk: chunk.height_included === chunk.height_created,
    delayed_gas: delayed, buffered_gas: buffered, receipt_bytes: bytes,
    congestion: +congestion.toFixed(4),
  };
}

const out = {
  rpc: url, protocol: cfg.protocol_version, shard_ids: layout.shard_ids, boundary_accounts: layout.boundary_accounts,
  reject_tx_congestion_threshold: cc.reject_tx_congestion_threshold, started_at: new Date().toISOString(), blocks: [],
};
const file = values.out ?? `measure-${values.network}-${out.started_at.replace(/[:.]/g, '-')}.json`;
const save = () => { out.ended_at = new Date().toISOString(); writeFileSync(file, JSON.stringify(out)); console.error(`wrote ${out.blocks.length} blocks to ${file}`); };
let stop = false;
process.on('SIGINT', () => { stop = true; });

const deadline = values.seconds ? Date.now() + Number(values.seconds) * 1000 : Infinity;
const maxBlocks = values.blocks ? Number(values.blocks) : Infinity;
let next = (await near.rpc('block', { finality: 'optimistic' })).header.height;
while (!stop && Date.now() < deadline && out.blocks.length < maxBlocks) {
  const head = (await near.rpc('block', { finality: 'optimistic' })).header.height;
  if (next > head) { await sleep(150); continue; }
  for (; next <= head && !stop && out.blocks.length < maxBlocks; next++) {
    let b;
    try { b = await near.rpc('block', { block_id: next }); }
    catch (e) { if (/UNKNOWN_BLOCK|NOT_SYNCED|DB Not Found/i.test(e.message)) continue; throw e; } // skipped height
    const shards = Object.fromEntries(b.chunks.map((c) => [c.shard_id, shardSample(c)]));
    out.blocks.push({ height: b.header.height, timestamp_ms: Math.round(b.header.timestamp / 1e6), shards });
    const busiest = Object.entries(shards).sort((x, y) => y[1].fullness - x[1].fullness)[0];
    const congested = Object.entries(shards).filter(([, s]) => s.congestion >= cc.reject_tx_congestion_threshold).map(([id]) => id);
    console.log(`${b.header.height}  busiest shard ${busiest[0]} ${(busiest[1].fullness * 100).toFixed(1)}%  max congestion ${Math.max(...Object.values(shards).map((s) => s.congestion)).toFixed(3)}${congested.length ? `  REJECTING on ${congested.join(',')}` : ''}`);
  }
}
save();
