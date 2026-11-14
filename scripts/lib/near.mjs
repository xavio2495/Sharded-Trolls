// Zero-dependency NEAR client: base58, borsh transaction encoding, ed25519 signing (node:crypto),
// JSON-RPC calls, view calls and transaction sending.
import { createHash, createPrivateKey, createPublicKey, sign as edSign, randomBytes } from 'node:crypto';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function b58encode(bytes) {
  let n = BigInt('0x' + (Buffer.from(bytes).toString('hex') || '0'));
  let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = '1' + s; }
  return s;
}

export function b58decode(str) {
  let n = 0n;
  for (const c of str) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error(`bad base58 char ${c}`);
    n = n * 58n + BigInt(i);
  }
  let hex = n === 0n ? '' : n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const lead = str.match(/^1*/)[0].length;
  return Buffer.concat([Buffer.alloc(lead), Buffer.from(hex, 'hex')]);
}

// ---------- keys ----------

const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');

export class KeyPair {
  constructor(seed) {
    this.seed = Buffer.from(seed);
    this.key = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, this.seed]), format: 'der', type: 'pkcs8' });
    this.publicKey = createPublicKey(this.key).export({ format: 'der', type: 'spki' }).subarray(-32);
  }
  static fromString(secret) { return new KeyPair(b58decode(secret.replace(/^ed25519:/, '')).subarray(0, 32)); }
  static random() { return new KeyPair(randomBytes(32)); }
  get publicKeyString() { return `ed25519:${b58encode(this.publicKey)}`; }
  get secretKeyString() { return `ed25519:${b58encode(Buffer.concat([this.seed, this.publicKey]))}`; }
  sign(msg) { return edSign(null, msg, this.key); }
}

// ---------- borsh ----------

class Writer {
  constructor() { this.parts = []; }
  u8(v) { this.parts.push(Buffer.from([v])); return this; }
  u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v); this.parts.push(b); return this; }
  u64(v) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); this.parts.push(b); return this; }
  u128(v) { const x = BigInt(v); const b = Buffer.alloc(16); b.writeBigUInt64LE(x & 0xffffffffffffffffn); b.writeBigUInt64LE(x >> 64n, 8); this.parts.push(b); return this; }
  bytes(v) { this.parts.push(Buffer.from(v)); return this; }
  vec(v) { return this.u32(v.length).bytes(v); }
  str(s) { return this.vec(Buffer.from(s, 'utf8')); }
  pk(k) { return this.u8(0).bytes(k); }
  done() { return Buffer.concat(this.parts); }
}

// Actions, borsh enum order as in nearcore.
export const action = {
  createAccount: () => ({ write: (w) => w.u8(0) }),
  deployContract: (code) => ({ write: (w) => w.u8(1).vec(code) }),
  functionCall: (method, args, gas, deposit = 0n) => ({
    write: (w) => w.u8(2).str(method).vec(Buffer.isBuffer(args) ? args : Buffer.from(JSON.stringify(args))).u64(gas).u128(deposit),
  }),
  transfer: (deposit) => ({ write: (w) => w.u8(3).u128(deposit) }),
  addFullAccessKey: (publicKey) => ({ write: (w) => w.u8(5).pk(publicKey).u64(0).u8(1) }),
  deleteKey: (publicKey) => ({ write: (w) => w.u8(6).pk(publicKey) }),
  // mode 0: identified by code hash (immutable); 1: by deployer account id (upgradable).
  deployGlobalContract: (code, byAccount = false) => ({ write: (w) => w.u8(9).vec(code).u8(byAccount ? 1 : 0) }),
  useGlobalContractByHash: (hash) => ({ write: (w) => w.u8(10).u8(0).bytes(hash) }),
};

export function signTransaction({ signerId, keyPair, nonce, receiverId, blockHash, actions }) {
  const w = new Writer().str(signerId).pk(keyPair.publicKey).u64(nonce).str(receiverId).bytes(blockHash).u32(actions.length);
  for (const a of actions) a.write(w);
  const tx = w.done();
  const hash = createHash('sha256').update(tx).digest();
  const signed = Buffer.concat([tx, Buffer.from([0]), keyPair.sign(hash)]);
  return { hash: b58encode(hash), base64: signed.toString('base64') };
}

// ---------- RPC ----------

export class RpcError extends Error {
  constructor(method, error) {
    super(`${method}: ${JSON.stringify(error).slice(0, 500)}`);
    this.error = error;
    // The most specific error name nearcore gives, e.g. ShardCongested, InvalidNonce.
    this.kind = innermostName(error?.data ?? error?.cause) ?? error?.cause?.name ?? error?.name;
  }
}

function innermostName(v) {
  if (!v || typeof v !== 'object') return typeof v === 'string' ? v : undefined;
  if (v.name && v.info) return innermostName(v.info) ?? v.name;
  const keys = Object.keys(v);
  if (keys.length === 1 && /^[A-Z]/.test(keys[0])) return innermostName(v[keys[0]]) ?? keys[0];
  return undefined;
}

export class Near {
  constructor(url) { this.url = url; this.id = 0; }

  async rpc(method, params) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }),
    });
    const j = await res.json();
    if (j.error) throw new RpcError(method, j.error);
    return j.result;
  }

  async view(contractId, method, args = {}) {
    const r = await this.rpc('query', {
      request_type: 'call_function', finality: 'optimistic', account_id: contractId, method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
    });
    return JSON.parse(Buffer.from(r.result).toString());
  }

  async accessKeyNonce(accountId, publicKey) {
    const r = await this.rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKey });
    return BigInt(r.nonce);
  }

  async accountExists(accountId) {
    try { await this.rpc('query', { request_type: 'view_account', finality: 'final', account_id: accountId }); return true; }
    catch (e) { if (e.kind === 'UNKNOWN_ACCOUNT' || /UNKNOWN_ACCOUNT|does not exist/.test(e.message)) return false; throw e; }
  }

  async latestBlockHash() { return b58decode((await this.rpc('block', { finality: 'final' })).header.hash); }

  // waitUntil: NONE (fire and forget), INCLUDED, EXECUTED_OPTIMISTIC, FINAL.
  async sendSigned(signed, waitUntil = 'EXECUTED_OPTIMISTIC') {
    return this.rpc('send_tx', { signed_tx_base64: signed.base64, wait_until: waitUntil });
  }
}

// A signer that tracks its own nonce, so many transactions can be built without a round trip each.
export class Account {
  constructor(near, accountId, keyPair) { this.near = near; this.accountId = accountId; this.keyPair = keyPair; this.nonce = null; }

  async sign(receiverId, actions, blockHash) {
    if (this.nonce === null) this.nonce = await this.near.accessKeyNonce(this.accountId, this.keyPair.publicKeyString);
    this.nonce += 1n;
    return signTransaction({ signerId: this.accountId, keyPair: this.keyPair, nonce: this.nonce, receiverId, blockHash: blockHash ?? await this.near.latestBlockHash(), actions });
  }

  // Sends and waits for execution; throws if the transaction or any receipt failed.
  async send(receiverId, actions, waitUntil = 'EXECUTED_OPTIMISTIC') {
    const signed = await this.sign(receiverId, actions);
    const r = await this.near.sendSigned(signed, waitUntil);
    const failure = r.status?.Failure ?? r.receipts_outcome?.map((o) => o.outcome.status.Failure).find(Boolean);
    if (failure) throw new Error(`${receiverId} tx ${signed.hash} failed: ${JSON.stringify(failure).slice(0, 500)}`);
    return r;
  }

  call(contractId, method, args, { gas = 100n * 10n ** 12n, deposit = 0n } = {}) {
    return this.send(contractId, [action.functionCall(method, args, gas, deposit)]);
  }
}

export const TGAS = 10n ** 12n;
export const NEAR = 10n ** 24n;

// Return value of the first function call in a finished transaction, parsed as JSON.
export function successValue(result) {
  const v = result.status?.SuccessValue;
  return v ? JSON.parse(Buffer.from(v, 'base64').toString()) : null;
}
