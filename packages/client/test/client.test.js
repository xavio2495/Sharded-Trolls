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

// ---------- receiver registration (mocked RPC) ----------
const TROLLS = Array.from({ length: 8 }, (_, i) => `t${i}.root.test`);
async function idHomedAt(i, tag) {
  for (let k = 0; ; k++) { const id = `${tag}${k}.test`; if ((await homeIndex(id, 8)) === i) return id; }
}
function mockRpc(registered) {
  const seen = [];
  globalThis.fetch = async (_url, { body }) => {
    const { params } = JSON.parse(body);
    const args = JSON.parse(atob(params.args_base64));
    seen.push(params.method_name);
    const result = params.method_name === 'trolls' ? TROLLS
      : params.method_name === 'storage_balance_of' ? (registered.has(args.account_id) ? { total: '1', available: '0' } : null)
      : params.method_name === 'storage_balance_bounds' ? { min: '1250000000000000000000', max: '1250000000000000000000' }
      : null;
    return { json: async () => ({ jsonrpc: '2.0', id: 1, result: { result: [...new TextEncoder().encode(JSON.stringify(result))] } }) };
  };
  return seen;
}
const recorder = (withBatch) => {
  const log = [];
  const s = { call: async (c, m, a, o) => { log.push(['call', c, m, a, o]); return 'ok'; } };
  if (withBatch) s.batch = async (c, calls) => { log.push(['batch', c, calls.map((x) => x.method), calls]); return 'ok'; };
  return { s, log };
};

test('transfer registers an unregistered receiver first: one batch when it shares the sender\'s troll', async () => {
  const realFetch = globalThis.fetch;
  try {
    const sender = await idHomedAt(2, 's'), receiver = await idHomedAt(2, 'r');
    mockRpc(new Set([sender]));
    const { s, log } = recorder(true);
    await new TrollClient('http://mock', 'root.test').transfer(s, sender, receiver, 5n);
    assert.equal(log.length, 1);
    assert.deepEqual(log[0].slice(0, 3), ['batch', TROLLS[2], ['storage_deposit', 'ft_transfer']]);
    assert.equal(log[0][3][0].args.account_id, receiver);
    assert.equal(log[0][3][0].deposit, 1250000000000000000000n);
  } finally { globalThis.fetch = realFetch; }
});

test('transfer to an unregistered receiver on another troll: deposit at its home, then transfer at the sender\'s', async () => {
  const realFetch = globalThis.fetch;
  try {
    const sender = await idHomedAt(2, 's'), receiver = await idHomedAt(5, 'r');
    mockRpc(new Set([sender]));
    const { s, log } = recorder(true);
    await new TrollClient('http://mock', 'root.test').transferCall(s, sender, receiver, 5n, 'hi');
    assert.deepEqual(log.map((l) => [l[0], l[1], l[2]]), [['call', TROLLS[5], 'storage_deposit'], ['call', TROLLS[2], 'ft_transfer_call']]);
    assert.equal(log[1][3].msg, 'hi');
  } finally { globalThis.fetch = realFetch; }
});

test('registered receivers, opt-out and signers without batch()', async () => {
  const realFetch = globalThis.fetch;
  try {
    const sender = await idHomedAt(1, 's'), receiver = await idHomedAt(1, 'r');
    // already registered: transfer only
    mockRpc(new Set([sender, receiver]));
    let { s, log } = recorder(true);
    await new TrollClient('http://mock', 'root.test').transfer(s, sender, receiver, 5n);
    assert.deepEqual(log.map((l) => l[2]), ['ft_transfer']);
    // opt-out: no registration lookup at all
    const seen = mockRpc(new Set([sender]));
    ({ s, log } = recorder(true));
    await new TrollClient('http://mock', 'root.test').transfer(s, sender, receiver, 5n, undefined, { registerReceiver: false });
    assert.deepEqual(log.map((l) => l[2]), ['ft_transfer']);
    assert.ok(!seen.includes('storage_balance_of'));
    // same troll but the signer can't batch: two separate calls, registration first
    mockRpc(new Set([sender]));
    ({ s, log } = recorder(false));
    await new TrollClient('http://mock', 'root.test').transfer(s, sender, receiver, 5n);
    assert.deepEqual(log.map((l) => l[2]), ['storage_deposit', 'ft_transfer']);
  } finally { globalThis.fetch = realFetch; }
});
