// Which transactions have their first receipt executed in the inclusion block?
// Splits by: signer == receiver, signer on receiver's shard (different account), and cross-shard.
// Settles whether "co-location" (same shard) or only "self-call" (signer == receiver) saves a block.
// Run: node --dns-result-order=ipv4first scripts/mainnet-probes/tx-first-receipt.mjs [blocks=60] > measurements/mainnet/tx-first-receipt-<date>.json
const RPC = process.env.RPC || 'https://free.rpc.fastnear.com';
const call = async (m, p) => { for (let a = 0; a < 4; a++) { try { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) }); const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 160)); return j.result; } catch (e) { if (a === 3) throw e; await new Promise(r => setTimeout(r, 600 * (a + 1))); } } };
const pool = async (xs, n, f) => { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) { const k = i++; try { out[k] = await f(xs[k]); } catch { out[k] = null; } } })); return out; };
const N = +(process.argv[2] || 60);
const cfg = await call('EXPERIMENTAL_protocol_config', { finality: 'final' });
const L = cfg.shard_layout.V3 || cfg.shard_layout.V2; const b = L.boundary_accounts, ids = L.shard_ids;
const shardOf = a => { let i = 0; while (i < b.length && a >= b[i]) i++; return ids[i]; };
const head = (await call('block', { finality: 'final' })).header.height - 20;
const blocks = (await pool(Array.from({ length: N }, (_, i) => head - i * 2), 2, h => call('block', { block_id: h }))).filter(Boolean);
const refs = blocks.flatMap(bl => bl.chunks.filter(c => c.height_included === bl.header.height).map(c => ({ h: c.chunk_hash, height: bl.header.height })));
const chunks = (await pool(refs, 2, async r => ({ height: r.height, c: await call('chunk', { chunk_id: r.h }) }))).filter(Boolean);
const all = chunks.flatMap(({ height, c }) => c.transactions.map(t => ({ hash: t.hash, signer: t.signer_id, receiver: t.receiver_id, height })));
const cls = t => t.signer === t.receiver ? 'self' : shardOf(t.signer) === shardOf(t.receiver) ? 'sameShardOther' : 'crossShard';
const groups = { self: [], sameShardOther: [], crossShard: [] };
for (const t of all) groups[cls(t)].push(t);
const sample = [...groups.self.slice(0, 40), ...groups.sameShardOther.slice(0, 80), ...groups.crossShard.slice(0, 40)];
const hCache = new Map(); const hOf = async bh => { if (!hCache.has(bh)) hCache.set(bh, (await call('block', { block_id: bh })).header.height); return hCache.get(bh); };
const res = (await pool(sample, 2, async t => {
  const o = await call('tx', { tx_hash: t.hash, sender_account_id: t.signer, wait_until: 'NONE' });
  const first = o.receipts_outcome.find(r => r.outcome.executor_id === t.receiver); if (!first) return null;
  return { ...t, cls: cls(t), sSigner: shardOf(t.signer), sRecv: shardOf(t.receiver), d: (await hOf(first.block_hash)) - t.height };
})).filter(Boolean);
const stat = k => { const es = res.filter(r => r.cls === k); const h = {}; es.forEach(e => h[e.d] = (h[e.d] || 0) + 1); return { n: es.length, hist: h }; };
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), protocol: cfg.protocol_version, txsSeen: all.length, available: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])), self: stat('self'), sameShardOther: stat('sameShardOther'), crossShard: stat('crossShard'), sameShardOtherExamples: res.filter(r => r.cls === 'sameShardOther').slice(0, 12) }, null, 1));
