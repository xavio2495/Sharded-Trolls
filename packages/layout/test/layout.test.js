import test from 'node:test';
import assert from 'node:assert/strict';
import { shardOf, place } from '../index.js';

// Layouts read from EXPERIMENTAL_protocol_config at protocol 88.
const MAINNET = {
  boundary_accounts: ['650', 'aurora', 'aurora-0', 'earn.kaiching', 'game.hot.tg', 'game.hot.tg-0',
    'kkuuue2akv_1630967379.near', 'tge-lockup.sweat', 'wallet.ka'],
  shard_ids: [10, 11, 1, 8, 9, 6, 7, 4, 12, 13],
};
const TESTNET = {
  boundary_accounts: ['650', 'aurora', 'aurora-0', 'dev-1662050149030-28642112951491-0', 'earn.kaiching',
    'game.hot.tg', 'game.hot.tg-0', 'kkuuue2akv_1630967379.near', 'tge-lockup.sweat'],
  shard_ids: [10, 11, 1, 12, 13, 9, 6, 7, 4, 5],
};
const table = (trolls) => Object.fromEntries(trolls.map((t) => [t.prefix, t.shard]));

test('shardOf: boundaries belong to the shard on their right', () => {
  assert.equal(shardOf('0', MAINNET), 10);
  assert.equal(shardOf('650', MAINNET), 11);
  assert.equal(shardOf('aurora', MAINNET), 1);
  assert.equal(shardOf('aurora-0', MAINNET), 8);
  assert.equal(shardOf('game.hot.tg', MAINNET), 6);
  assert.equal(shardOf('zzz.near', MAINNET), 13);
  assert.equal(shardOf('wallet.ka', MAINNET), 13);
  assert.equal(shardOf('wallet.k', MAINNET), 12);
});

test('shardOf: sub-accounts are placed by the full id', () => {
  assert.equal(shardOf('shardedtrolls.near', MAINNET), 4);
  assert.equal(shardOf('h.shardedtrolls.near', MAINNET), 7);
  assert.equal(shardOf('aurora.near', MAINNET), 8); // '.' sorts after '-', so past aurora-0
  assert.equal(shardOf('6.shardedtrolls.near', MAINNET), 10); // '.' sorts before '5'
});

test('place: mainnet placement for shardedtrolls.near', () => {
  const trolls = place('shardedtrolls.near', MAINNET);
  assert.deepEqual(table(trolls), { 0: 10, 7: 11, ax: 8, f: 9, h: 7, kz: 4, u: 12, wz: 13 });
  assert.equal(trolls[0].account, '0.shardedtrolls.near');
});

test('place: testnet placement for shardedtrolls.testnet', () => {
  const trolls = place('shardedtrolls.testnet', TESTNET);
  assert.deepEqual(table(trolls), { 0: 10, 7: 11, ax: 12, f: 9, h: 7, kz: 4, u: 5, e: 13 });
});

test('place: the aurora-only and hot-only shards are unreachable', () => {
  for (const [parent, layout] of [['shardedtrolls.near', MAINNET], ['shardedtrolls.testnet', TESTNET]]) {
    const shards = place(parent, layout).map((t) => t.shard);
    assert.equal(new Set(shards).size, 8);
    assert.ok(!shards.includes(1) && !shards.includes(6));
  }
});

test('place: skips taken accounts and stays on the same shard', () => {
  const trolls = place('shardedtrolls.near', MAINNET, { taken: ['h.shardedtrolls.near'] });
  const t = trolls.find((x) => x.shard === 7);
  assert.notEqual(t.prefix, 'h');
  assert.equal(shardOf(t.account, MAINNET), 7);
});

test('place: works for any parent', () => {
  const trolls = place('x.near', MAINNET);
  assert.equal(new Set(trolls.map((t) => t.shard)).size, 8);
  for (const t of trolls) assert.equal(shardOf(t.account, MAINNET), t.shard);
});
