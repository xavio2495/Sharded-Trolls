#!/usr/bin/env node
// Headline numbers for every <run>-{load,measure}.json pair in a measurements folder, written to
// <folder>/summary.json (read by the web compare view).
//   executed_per_s: transfers executed / seconds from load start until the busiest shard's chunks
//                   fall back under 5% full (the backlog has drained).
//   inclusion: included fires / accepted fires; null for runs that did not log fire hashes
//              (method "pre-inclusion-logging": kept for the record, not used for comparisons).
// Usage: node scripts/summarize-runs.mjs [measurements/localnet-2026-11-14]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'measurements/localnet-2026-11-14');
const runs = readdirSync(dir).filter((f) => f.endsWith('-load.json')).map((f) => f.slice(0, -'-load.json'.length)).sort();
const out = {};
for (const run of runs) {
  const L = JSON.parse(readFileSync(`${dir}/${run}-load.json`));
  const M = JSON.parse(readFileSync(`${dir}/${run}-measure.json`));
  const t0 = Date.parse(L.started_at);
  const B = M.blocks.filter((b) => b.timestamp_ms >= t0);
  const busiest = (b) => Math.max(...Object.values(b.shards).map((s) => s.fullness));
  const drained = B.findLast((b) => busiest(b) > 0.05);
  const seconds = (drained.timestamp_ms - t0) / 1000;
  const accepted = L.fires.filter((f) => f.ok).length;
  const logged = L.fires.some((f) => 'included' in f);
  const included = logged ? L.fires.filter((f) => f.included).length : null;
  // +1 for the preflight fire every run sends before the timed load.
  const executed = included === null ? null : (included + 1) * L.n + L.probes.filter((p) => p.ok).length;
  const peak = Math.max(...B.flatMap((b) => Object.values(b.shards).map((s) => s.congestion)));
  const rejected = L.probes.filter((p) => !p.ok);
  out[run] = {
    method: logged ? 'inclusion-logged' : 'pre-inclusion-logging', started_at: L.started_at,
    target: L.target, mix: L.check?.mix ?? 'same', offered_per_s: L.fires_per_sec * L.n, seconds: L.seconds,
    fires_accepted: accepted, fires_included: included, inclusion: included === null ? null : +(included / accepted).toFixed(3),
    transfers_executed: executed, executed_per_s: executed === null ? null : Math.round(executed / seconds), drain_seconds: +seconds.toFixed(1),
    peak_congestion: +peak.toFixed(3), probes: L.probes.length, probes_rejected: rejected.length,
    rejection_kinds: [...new Set(rejected.map((p) => p.kind))],
    block_time_s: +((B.at(-1).timestamp_ms - B[0].timestamp_ms) / 1000 / (B.length - 1)).toFixed(3),
    landed_matches_included: L.check ? L.check.landed === (L.check.landed_expected_from_included ?? L.check.landed_expected) : null,
    troll_wasm_sha256: L.troll_wasm_sha256 ?? null,
  };
}
writeFileSync(`${dir}/summary.json`, JSON.stringify(out, null, 1) + '\n');
for (const [k, v] of Object.entries(out)) {
  console.log(`${k.padEnd(20)} offered ${String(v.offered_per_s).padStart(5)}/s  executed ${String(v.executed_per_s ?? 'n/a').padStart(5)}/s  inclusion ${v.inclusion ?? 'n/a'}  congestion ${v.peak_congestion}  rejected ${v.probes_rejected}/${v.probes}`);
}
