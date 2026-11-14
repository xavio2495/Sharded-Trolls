// Reconstructs NEAR mainnet shard-layout history: binary-searches the first block where each new
// boundary account appears, using archival EXPERIMENTAL_protocol_config. Read-only.
// Run: node --dns-result-order=ipv4first scripts/mainnet-probes/shard-history.mjs > measurements/mainnet/shard-history-<date>.json
const RPC = 'https://archival-rpc.mainnet.fastnear.com';
const call = async (m, p) => { for (let a = 0; a < 4; a++) { try { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) }); const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 160)); return j.result; } catch (e) { if (a === 3) throw e; await new Promise(r => setTimeout(r, 800 * (a + 1))); } } };
const layoutAt = async h => { const c = await call('EXPERIMENTAL_protocol_config', { block_id: h }); const L = c.shard_layout; const v = Object.keys(L)[0]; return { v, proto: c.protocol_version, b: L[v].boundary_accounts }; };
const head = (await call('block', { finality: 'final' })).header.height;
const LO = 60000000;
const final = (await layoutAt(head)).b;
const start = (await layoutAt(LO)).b;
const out = [];
for (const acct of final.filter(x => !start.includes(x))) {
  let lo = LO, hi = head; // invariant: absent at lo, present at hi
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); let L; try { L = await layoutAt(mid); } catch { lo = mid; continue; } if (L.b.includes(acct)) hi = mid; else lo = mid; }
  const L = await layoutAt(hi); const blk = await call('block', { block_id: hi });
  out.push({ boundary: acct, firstHeight: hi, date: new Date(blk.header.timestamp / 1e6).toISOString(), protocol: L.proto, layoutVersion: L.v, shardsAfter: L.b.length + 1 });
}
out.sort((a, b) => a.firstHeight - b.firstHeight);
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), rpc: RPC, startHeight: LO, startBoundaries: start, finalBoundaries: final, splits: out }, null, 1));
