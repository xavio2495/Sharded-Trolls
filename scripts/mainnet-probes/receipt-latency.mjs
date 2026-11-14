// when receipt X (executed by account A) emits receipt Y (executed by B),
// how many blocks pass between X's and Y's execution, split by same-shard vs cross-shard?
// Samples recent mainnet transactions with multi-receipt chains. Read-only.
// Run: node --dns-result-order=ipv4first scripts/mainnet-probes/receipt-latency.mjs [blocks=40] > measurements/mainnet/receipt-latency-<date>.json
const RPC = process.env.RPC || 'https://free.rpc.fastnear.com';
const call = async (m, p) => { for (let a = 0; a < 4; a++) { try { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) }); const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 160)); return j.result; } catch (e) { if (a === 3) throw e; await new Promise(r => setTimeout(r, 600 * (a + 1))); } } };
const pool = async (xs, n, f) => { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) { const k = i++; try { out[k] = await f(xs[k]); } catch { out[k] = null; } } })); return out; };
const N = +(process.argv[2] || 40);
const cfg = await call('EXPERIMENTAL_protocol_config', { finality: 'final' });
const L = cfg.shard_layout.V3 || cfg.shard_layout.V2; const b = L.boundary_accounts, ids = L.shard_ids;
const shardOf = a => { let i = 0; while (i < b.length && a >= b[i]) i++; return ids[i]; };
const head = (await call('block', { finality: 'final' })).header.height - 20;
const blocks = (await pool(Array.from({ length: N }, (_, i) => head - i * 3), 3, h => call('block', { block_id: h }))).filter(Boolean);
const refs = blocks.flatMap(bl => bl.chunks.filter(c => c.height_included === bl.header.height).map(c => c.chunk_hash));
const chunks = (await pool(refs, 4, h => call('chunk', { chunk_id: h }))).filter(Boolean);
const txs = chunks.flatMap(c => c.transactions.filter(t => t.actions?.some(a => a.FunctionCall)).map(t => [t.hash, t.signer_id])).slice(0, 220);
const hCache = new Map();
const hOf = async bh => { if (!hCache.has(bh)) hCache.set(bh, (await call('block', { block_id: bh })).header.height); return hCache.get(bh); };
const edges = [];
await pool(txs, 3, async ([hash, signer]) => {
  const o = await call('tx', { tx_hash: hash, sender_account_id: signer, wait_until: 'NONE' });
  const byId = new Map(o.receipts_outcome.map(r => [r.id, r]));
  for (const x of o.receipts_outcome) {
    if (x.outcome.executor_id === 'system') continue;
    for (const yid of x.outcome.receipt_ids) {
      const y = byId.get(yid); if (!y) continue;
      // skip gas refunds (sent by "system") and receipts to the same account
      if (y.outcome.executor_id === 'system' || y.outcome.executor_id === x.outcome.executor_id) continue;
      if (y.outcome.gas_burnt < 1e12 && y.outcome.logs.length === 0 && y.outcome.receipt_ids.length === 0) { /* likely a transfer/refund; keep but tag */ }
      const [hx, hy] = [await hOf(x.block_hash), await hOf(y.block_hash)];
      edges.push({ tx: hash, from: x.outcome.executor_id, to: y.outcome.executor_id, sFrom: shardOf(x.outcome.executor_id), sTo: shardOf(y.outcome.executor_id), dBlocks: hy - hx });
    }
  }
});
const stat = es => { const h = {}; es.forEach(e => h[e.dBlocks] = (h[e.dBlocks] || 0) + 1); return { n: es.length, hist: h }; };
const same = edges.filter(e => e.sFrom === e.sTo), cross = edges.filter(e => e.sFrom !== e.sTo);
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), protocol: cfg.protocol_version, txsSampled: txs.length, sameShard: stat(same), crossShard: stat(cross), sameShardExamples: same.slice(0, 15), crossShardExamples: cross.slice(0, 8) }, null, 1));
