import test from 'node:test';
import assert from 'node:assert/strict';
import { Account, KeyPair, action, signTransaction } from './near.mjs';

// A Near stand-in: fixed nonce and block hash, and it keeps what would have been sent.
function fakeNear() {
  const sent = [];
  return {
    sent,
    accessKeyNonce: async () => 41n,
    latestBlockHash: async () => Buffer.alloc(32, 7),
    sendSigned: async (signed) => { sent.push(signed); return { status: { SuccessValue: '' }, receipts_outcome: [] }; },
  };
}

// Method names of the function-call actions in a signed transaction, in order (borsh layout).
function methods(base64) {
  const b = Buffer.from(base64, 'base64');
  let o = 0;
  const u32 = () => { const v = b.readUInt32LE(o); o += 4; return v; };
  const str = () => { const n = u32(); const s = b.subarray(o, o + n).toString(); o += n; return s; };
  str(); o += 33; o += 8; str(); o += 32; // signer, public key, nonce, receiver, block hash
  const out = [];
  for (let n = u32(), i = 0; i < n; i++) {
    assert.equal(b[o++], 2, 'function call action');
    out.push(str());
    const argsLen = u32();
    o += argsLen + 8 + 16; // args, gas, deposit
  }
  return out;
}

test('Account.batch signs one transaction whose actions are the calls, in order', async () => {
  const kp = new KeyPair(Buffer.alloc(32, 1)); // fixed test seed, signs deterministically
  const near = fakeNear();
  const calls = [
    { method: 'storage_deposit', args: { account_id: 'r.test', registration_only: true }, gas: 10n * 10n ** 12n, deposit: 1250n },
    { method: 'ft_transfer', args: { receiver_id: 'r.test', amount: '5' }, gas: 50n * 10n ** 12n, deposit: 1n },
  ];
  await new Account(near, 's.test', kp).batch('t.test', calls);
  assert.equal(near.sent.length, 1);
  const expected = signTransaction({ signerId: 's.test', keyPair: kp, nonce: 42n, receiverId: 't.test', blockHash: Buffer.alloc(32, 7),
    actions: calls.map((c) => action.functionCall(c.method, c.args, c.gas, c.deposit)) });
  assert.equal(near.sent[0].base64, expected.base64);
  assert.deepEqual(methods(near.sent[0].base64), ['storage_deposit', 'ft_transfer']);
});
