#!/usr/bin/env node
// Summarise a measure.mjs JSON: block time (overall and slowest 10 s window, to tell a slow node
// from protocol limits), and per shard peak/mean chunk fullness and peak congestion.
// Usage: node scripts/summarize.mjs <measure.json> [--json]
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const j = JSON.parse(readFileSync(file));
const B = j.blocks;
const t0 = B[0].timestamp_ms;
const dt = (B.at(-1).timestamp_ms - t0) / 1000;

const windows = [];
for (let s = 0; s + 10 <= dt; s += 10) {
  const w = B.filter((b) => b.timestamp_ms >= t0 + s * 1000 && b.timestamp_ms < t0 + (s + 10) * 1000);
  if (w.length > 1) windows.push((w.at(-1).timestamp_ms - w[0].timestamp_ms) / 1000 / (w.length - 1));
}
const shards = Object.fromEntries(j.shard_ids.map((id) => {
  const f = B.map((b) => b.shards[id]?.fullness ?? 0), c = B.map((b) => b.shards[id]?.congestion ?? 0);
  return [id, {
    peak_fullness: Math.max(...f), mean_fullness: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(4),
    peak_congestion: Math.max(...c), blocks_rejecting: c.filter((x) => x >= j.reject_tx_congestion_threshold).length,
  }];
}));
const out = {
  file, blocks: B.length, seconds: +dt.toFixed(1),
  block_time_s: +(dt / (B.length - 1)).toFixed(3), slowest_10s_block_time_s: +Math.max(...windows).toFixed(3),
  shards,
};
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  console.log(`${out.blocks} blocks over ${out.seconds} s: ${out.block_time_s} s/block (slowest 10 s window ${out.slowest_10s_block_time_s} s/block)`);
  for (const [id, s] of Object.entries(shards)) {
    if (s.peak_fullness < 0.01 && s.peak_congestion === 0) continue;
    console.log(`shard ${id.padStart(2)}: fullness peak ${(s.peak_fullness * 100).toFixed(1)}% mean ${(s.mean_fullness * 100).toFixed(1)}%, congestion peak ${s.peak_congestion.toFixed(3)}${s.blocks_rejecting ? `, ${s.blocks_rejecting} blocks rejecting` : ''}`);
  }
}
