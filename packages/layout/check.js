#!/usr/bin/env node
// Check troll placement against the live shard layout. Read-only RPC.
// Usage: node --dns-result-order=ipv4first packages/layout/check.js [mainnet] [testnet]
//          [--parent <account>] [--trolls <prefix,prefix,...>] [--count 8]
// Without --trolls it prints the placement `place` would choose. Exits 1 unless every network
// has `count` trolls on `count` distinct shards.
import { parseArgs } from 'node:util';
import { RPCS, fetchLayout, place, shardOf } from './index.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { parent: { type: 'string' }, trolls: { type: 'string' }, count: { type: 'string', default: '8' } },
});
const networks = positionals.length ? positionals : ['mainnet', 'testnet'];
const count = Number(values.count);

let ok = true;
for (const net of networks) {
  if (!RPCS[net]) throw new Error(`unknown network ${net}`);
  const parent = values.parent ?? `shardedtrolls.${net === 'mainnet' ? 'near' : 'testnet'}`;
  const layout = await fetchLayout(RPCS[net]);
  const trolls = values.trolls
    ? values.trolls.split(',').map((prefix) => {
        const account = `${prefix}.${parent}`;
        return { prefix, account, shard: shardOf(account, layout) };
      })
    : place(parent, layout);
  const shards = new Set(trolls.map((t) => t.shard));
  const pass = trolls.length === count && shards.size === count;
  ok &&= pass;
  console.log(`${net}: protocol ${layout.protocol}, layout ${layout.version}, ${layout.shard_ids.length} shards`);
  console.log(`  parent ${parent} -> shard ${shardOf(parent, layout)}`);
  for (const t of trolls) console.log(`  ${t.account.padEnd(32)} shard ${t.shard}`);
  console.log(`  ${pass ? 'OK' : 'FAIL'}: ${trolls.length} trolls on ${shards.size} distinct shards (want ${count})`);
}
process.exit(ok ? 0 : 1);
