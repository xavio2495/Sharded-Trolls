import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homeIndex, TrollClient } from '../index.js';

const MAINNET = {
  boundary_accounts: ['650', 'aurora', 'aurora-0', 'earn.kaiching', 'game.hot.tg', 'game.hot.tg-0',
    'kkuuue2akv_1630967379.near', 'tge-lockup.sweat', 'wallet.ka'],
  shard_ids: [10, 11, 1, 8, 9, 6, 7, 4, 12, 13],
};

// Deterministic random account ids: named, implicit (64 hex) and 0x (40 hex).
function randomIds(count, seed = 42) {
  let a = seed;
  const r = () => ((a = (a * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const pick = (chars, n) => Array.from({ length: n }, () => chars[Math.floor(r() * chars.length)]).join('');
  const hex = '0123456789abcdef', name = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: count }, (_, i) => [
    () => `${pick(name, 2 + Math.floor(r() * 10))}.${['near', 'tg', 'sweat', 'testnet'][i % 4]}`,
    () => pick(hex, 64),
    () => `0x${pick(hex, 40)}`,
  ][i % 3]());
}

// The same vectors are checked by the Rust unit test of home_index; expected values were computed
// independently (Python hashlib), so the contracts and this client agree byte for byte.
const VECTORS = JSON.parse(readFileSync(new URL('../../../contracts/types/home_vectors.json', import.meta.url)));

test('homeIndex: shared test vectors (same as the contracts)', async () => {
  assert.ok(VECTORS.cases.length >= 20);
  for (const { account_id, home } of VECTORS.cases) assert.equal(await homeIndex(account_id, VECTORS.troll_count), home, account_id);
});

test('homeIndex: spreads named, implicit and 0x ids evenly over 8 trolls', async () => {
  const counts = new Array(8).fill(0);
  // Distinct ids (the seeded generator above repeats ids, which would skew counts).
  const ids = Array.from({ length: 800 }, (_, i) => [`holder${i}.near`, i.toString(16).padStart(64, '0'), `0x${i.toString(16).padStart(40, '0')}`]).flat();
  for (const id of ids) counts[await homeIndex(id, 8)]++;
  for (const c of counts) assert.ok(c > 220 && c < 380, counts.join(','));
  assert.equal(await homeIndex('anyone.near', 1), 0);
});

// Live check against the deployed contract: catches any change to the on-chain mapping.
const DEPLOY = new URL('../../../target/deploy-localnet.json', import.meta.url);
const live = existsSync(DEPLOY) ? JSON.parse(readFileSync(DEPLOY)) : null;
const reachable = live && (await fetch(live.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"status","params":[]}' }).then(() => true, () => false));

test('homeTroll matches the troll contract\'s home_troll view for 300 random ids', { skip: !reachable && 'no localnet deployment running' }, async () => {
  const client = await new TrollClient(live.rpc, live.root).load();
  const ids = randomIds(300, 7);
  const asker = live.trolls[0].account;
  for (let i = 0; i < ids.length; i += 25) {
    await Promise.all(ids.slice(i, i + 25).map(async (id) => {
      assert.equal(await client.homeTroll(id), await client.view(asker, 'home_troll', { account_id: id }), id);
    }));
  }
});
