// for each shard split, sample the parent shard over the 7 days before the split.
// Reports the parent shard's gas fullness vs the other shards, and the top receivers (transactions +
// incoming receipts) on the parent shard. Read-only, archival RPC.
// Run: RPC=https://archival-rpc.mainnet.fastnear.com node --dns-result-order=ipv4first scripts/mainnet-probes/split-causes.mjs measurements/mainnet/shard-history-2026-11-13.json > measurements/mainnet/split-causes-<date>.json
import { readFileSync } from 'node:fs';
import fs from 'node:fs';
const RPC = process.env.RPC || 'https://archival-rpc.mainnet.fastnear.com';
const call = async (m, p) => { for (let a = 0; a < 5; a++) { try { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) }); const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 160)); return j.result; } catch (e) { if (a === 4) throw e; await new Promise(r => setTimeout(r, 1000 * (a + 1))); } } };
const pool = async (xs, n, f) => { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) { const k = i++; try { out[k] = await f(xs[k]); } catch { out[k] = null; } } })); return out; };
const hist = JSON.parse(readFileSync(process.argv[2]));
const SAMPLES = +(process.env.SAMPLES || 30), SPAN = 600000; // ~7 days at ~1 s blocks
const results = [];
for (const s of hist.splits) {
  let H = s.firstHeight - 1, cfg = null;
  for (let k = 0; k < 40 && !cfg; k++, H--) { try { cfg = await call('EXPERIMENTAL_protocol_config', { block_id: H }); } catch { cfg = null; } }
  H++;
  const L = cfg.shard_layout; const v = Object.keys(L)[0]; const b = L[v].boundary_accounts;
  const ids = L[v].shard_ids || b.map((_, i) => i).concat(b.length);
  const shardOf = a => { let i = 0; while (i < b.length && a >= b[i]) i++; return ids[i]; };
  const parent = shardOf(s.boundary);
  const heights = Array.from({ length: SAMPLES }, (_, i) => H - Math.floor(i * SPAN / SAMPLES));
  const recv = {}; const util = {}; let ok = 0;
  await pool(heights, 2, async h => {
    const bl = await call('block', { block_id: h });
    for (const c of bl.chunks) { (util[c.shard_id] ||= []).push(c.gas_used / c.gas_limit); }
    const ch = await call('chunk', { block_id: h, shard_id: parent });
    for (const t of ch.transactions) recv[t.receiver_id] = (recv[t.receiver_id] || 0) + 1;
    for (const r of ch.receipts) recv[r.receiver_id] = (recv[r.receiver_id] || 0) + 1;
    ok++;
  });
  const avg = xs => xs.length ? +(100 * xs.reduce((a, x) => a + x, 0) / xs.length).toFixed(2) : null;
  const total = Object.values(recv).reduce((a, x) => a + x, 0);
  const top = Object.entries(recv).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([a, n]) => [a, n, +(100 * n / total).toFixed(1)]);
  // share of traffic within +/- the boundary name's "family" (accounts sharing its prefix up to the first dot/dash)
  const fam = s.boundary.split(/[.\-]/)[0];
  const famShare = +(100 * Object.entries(recv).filter(([a]) => a.includes(fam)).reduce((x, [, n]) => x + n, 0) / Math.max(1, total)).toFixed(1);
  results.push({ boundary: s.boundary, splitDate: s.date.slice(0, 10), parentShard: parent, layoutVersion: v, samplesOk: ok, parentAvgFullnessPct: avg(util[parent] || []), otherShardsAvgFullnessPct: avg(Object.entries(util).filter(([k]) => +k !== parent).flatMap(([, v]) => v)), perShardAvgFullnessPct: Object.fromEntries(Object.entries(util).map(([k, v]) => [k, avg(v)])), receiverCount: total, topReceivers: top, familyToken: fam, familySharePct: famShare });
  console.error(s.boundary, 'done', ok);
  if (process.env.JSONL) fs.appendFileSync(process.env.JSONL, JSON.stringify(results.at(-1)) + '\n');
}
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), rpc: RPC, samplesPerSplit: SAMPLES, spanBlocks: SPAN, results }, null, 1));
