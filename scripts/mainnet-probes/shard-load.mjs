// Shard load probe. Usage: node --dns-result-order=ipv4first shard-load.mjs out.json [sampleBlocks=300] [stride=20] [chunkBlocks=150]
// 1) gas price + protocol layout; 2) per-shard gas_used from sampled block headers; 3) receiver breakdown of recent chunks on intents.near's shard.
import { writeFileSync } from 'node:fs';
const [out, N = 300, STRIDE = 20, CB = 150] = process.argv.slice(2).map((x, i) => i ? Number(x) : x);
const RPC = 'https://free.rpc.fastnear.com';
let rid = 0;
const rpc = async (method, params) => {
  for (let t = 0; t < 4; t++) {
    try { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method, params }) }); const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200)); return j.result; }
    catch (e) { if (t === 3) throw e; await new Promise(r => setTimeout(r, 500 * (t + 1))); }
  }
};
const pool = async (items, k, fn) => { const res = []; let i = 0; await Promise.all(Array.from({ length: k }, async () => { while (i < items.length) { const n = i++; res[n] = await fn(items[n]); } })); return res; };
const cfg = await rpc('EXPERIMENTAL_protocol_config', { finality: 'final' });
const layout = cfg.shard_layout.V3 || cfg.shard_layout.V2 || cfg.shard_layout.V1 || cfg.shard_layout;
const bounds = layout.boundary_accounts, ids = layout.shard_ids || bounds.map((_, i) => i).concat(bounds.length);
const shardOf = a => { let i = 0; while (i < bounds.length && a >= bounds[i]) i++; return ids[i]; };
const gp = await rpc('gas_price', [null]);
const head = await rpc('block', { finality: 'final' });
const H = head.header.height;
const heights = Array.from({ length: N }, (_, i) => H - i * STRIDE);
const blocks = (await pool(heights, 6, h => rpc('block', { block_id: h }).catch(() => null))).filter(Boolean);
const per = {};
for (const b of blocks) for (const c of b.chunks) { const s = per[c.shard_id] ||= { n: 0, used: 0, max: 0, limit: c.gas_limit, newChunks: 0 }; s.n++; s.used += c.gas_used; s.max = Math.max(s.max, c.gas_used); if (c.height_included === b.header.height) s.newChunks++; }
const shardLoad = Object.fromEntries(Object.entries(per).map(([k, s]) => [k, { avgTgas: +(s.used / s.n / 1e12).toFixed(2), maxTgas: +(s.max / 1e12).toFixed(1), limitTgas: s.limit / 1e12, avgUtilPct: +(100 * s.used / s.n / s.limit).toFixed(3), samples: s.n }]));
const span = { fromHeight: heights.at(-1), toHeight: H, fromTime: new Date(blocks.at(-1).header.timestamp / 1e6).toISOString(), toTime: new Date(head.header.timestamp / 1e6).toISOString() };
// receiver breakdown on the intents shard
const IS = shardOf('intents.near');
const recent = (await pool(Array.from({ length: CB }, (_, i) => H - i), 6, h => rpc('block', { block_id: h }).catch(() => null))).filter(Boolean);
const chunkHashes = recent.map(b => b.chunks.find(c => c.shard_id === IS && c.height_included === b.header.height)).filter(Boolean);
const chunks = await pool(chunkHashes, 6, c => rpc('chunk', { chunk_id: c.chunk_hash }).then(r => ({ r, gas: c.gas_used })).catch(() => null));
const recv = {}, signers = {}; let txN = 0, rcN = 0, gasSum = 0, intentsTx = [];
for (const x of chunks.filter(Boolean)) {
  gasSum += x.gas;
  for (const t of x.r.transactions) { txN++; recv[t.receiver_id] = (recv[t.receiver_id] || 0) + 1; signers[t.signer_id] = (signers[t.signer_id] || 0) + 1; if (t.receiver_id === 'intents.near' && intentsTx.length < 25) intentsTx.push([t.hash, t.signer_id]); }
  for (const r of x.r.receipts) { rcN++; recv[r.receiver_id] = (recv[r.receiver_id] || 0) + 1; }
}
// gas burnt by sampled intents.near txs (tx + all receipts)
const outcomes = await pool(intentsTx, 4, async ([h, s]) => { try { const o = await rpc('tx', { tx_hash: h, sender_account_id: s, wait_until: 'NONE' }); const all = [o.transaction_outcome, ...o.receipts_outcome]; return { gasTgas: all.reduce((a, x) => a + x.outcome.gas_burnt, 0) / 1e12, intentsTgas: o.receipts_outcome.filter(x => x.outcome.executor_id === 'intents.near').reduce((a, x) => a + x.outcome.gas_burnt, 0) / 1e12, receipts: o.receipts_outcome.length, shards: [...new Set(o.receipts_outcome.map(x => shardOf(x.outcome.executor_id)))].length, method: (o.transaction.actions[0]?.FunctionCall?.method_name) || Object.keys(o.transaction.actions[0] || {})[0] }; } catch { return null; } });
const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 15);
const res = { measuredAt: new Date().toISOString(), protocol: cfg.protocol_version, numShards: ids.length, bounds, gasPriceYocto: gp.gas_price, minGasPrice: cfg.min_gas_price, span, shardLoad, intentsShard: IS, intentsShardChunks: chunks.filter(Boolean).length, intentsShardAvgTgas: +(gasSum / Math.max(1, chunks.filter(Boolean).length) / 1e12).toFixed(2), txN, rcN, topReceivers: top(recv), topSigners: top(signers), intentsSamples: outcomes.filter(Boolean) };
writeFileSync(out, JSON.stringify(res, null, 1));
console.log(JSON.stringify({ ...res, bounds: undefined }, null, 1));
