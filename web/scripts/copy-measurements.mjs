#!/usr/bin/env node
// Prebuild: copies the measurements the /evidence page reads from ../measurements into
// public/measurements/, so the app builds with web/ as its root. Load-test runs are slimmed to what
// the replay and compare views draw (per-block congestion and chunk fullness per shard, probe
// rejections, and which shard holds which contract); summaries and testnet records are copied as is.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { place, shardOf } from '../../packages/layout/index.js';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(WEB, '../measurements');
const OUT = resolve(WEB, 'public/measurements');
const LOCALNET = 'localnet-2026-11-14';

// Load-test runs shown on the page, newest build first.
const RUNS = [
  'control-run4', 'trolls-hash-same-2000', 'trolls-mixed-hash-2000', 'control-run5', 'trolls-mixed-hash-1000',
  'trolls-step6000', 'trolls-run4', 'trolls-mixed-run3', 'trolls-mixed-run2',
];
// Copied unchanged.
const FILES = [
  `${LOCALNET}/summary.json`, `${LOCALNET}/rehearsal-final-summary.json`,
  'testnet-2026-11-14-final/k-tests.json', 'testnet-2026-11-14-final/feeding.json',
  'testnet-2026-11-14-final/kit-k7.json', 'testnet-2026-11-14-final/kit-deploy.json',
  'testnet-2026-11-14-rerun/k-tests.json', 'testnet-2026-11-14/k-tests.json', 'testnet-2026-11-14-feeding/feeding.json',
];

if (!existsSync(SRC)) {
  // A build without the repository's measurements keeps whatever is already in public/.
  console.warn(`copy-measurements: ${SRC} not found; skipping`);
  process.exit(0);
}
rmSync(OUT, { recursive: true, force: true });
const write = (rel, data) => {
  const f = resolve(OUT, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data));
};
for (const rel of FILES) {
  const from = resolve(SRC, rel);
  if (!existsSync(from)) { console.warn(`copy-measurements: missing ${rel}`); continue; }
  mkdirSync(dirname(resolve(OUT, rel)), { recursive: true });
  copyFileSync(from, resolve(OUT, rel));
}

let bytes = 0;
for (const id of RUNS) {
  const m = JSON.parse(readFileSync(resolve(SRC, LOCALNET, `${id}-measure.json`)));
  const l = JSON.parse(readFileSync(resolve(SRC, LOCALNET, `${id}-load.json`)));
  const layout = { shard_ids: m.shard_ids, boundary_accounts: m.boundary_accounts };
  // Unreachable shards hold a single named account; the rest are labelled by the token they host.
  const reachable = new Set(place('x.near', layout).map((t) => t.shard));
  const roles = Object.fromEntries(m.shard_ids.map((s, i) => [s, reachable.has(s) ? '' : `${m.boundary_accounts[i - 1].split('.')[0]} only`]));
  const tokens = [...new Set(l.probes.map((p) => p.token))];
  if (l.target === 'control') roles[shardOf(tokens[0], layout)] = 'control token';
  else for (const t of tokens) roles[shardOf(t, layout)] = `troll ${t.split('.')[0]}`;
  const start = Date.parse(l.started_at);
  const run = {
    id, target: l.target, started_at: l.started_at, measured_at: m.started_at, threshold: m.reject_tx_congestion_threshold,
    shard_ids: m.shard_ids, roles, probes: l.probes.length,
    rejections: l.probes.filter((p) => !p.ok).map((p) => ({ t_ms: p.t, kind: p.kind })),
    // [t_ms since load start, [congestion, fullness] per shard in shard_ids order], rounded to 3 places
    blocks: m.blocks.map((b) => [b.timestamp_ms - start, m.shard_ids.map((s) => [+(b.shards[s]?.congestion ?? 0).toFixed(3), +(b.shards[s]?.fullness ?? 0).toFixed(3)])]),
    check: l.check ?? null, troll_wasm_sha256: l.troll_wasm_sha256 ?? null,
  };
  const json = JSON.stringify(run);
  bytes += json.length;
  write(`${LOCALNET}/runs/${id}.json`, json);
}
console.log(`copy-measurements: ${FILES.length} files and ${RUNS.length} runs (${(bytes / 1024).toFixed(0)} KB) -> public/measurements/`);
