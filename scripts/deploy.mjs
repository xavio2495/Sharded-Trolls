#!/usr/bin/env node
// Deploy Sharded Trolls: troll code once as a global contract (by code hash, so it can't change),
// then one transaction per troll: create account, use the global code, init. The root is
// deployed on the parent account. Writes target/deploy-<network>.json for the other scripts.
// Usage: node --dns-result-order=ipv4first scripts/deploy.mjs [--network localnet|testnet]
//          [--parent sandbox] [--signer <parent>] [--key-file target/localnet/validator_key.json]
//          [--epoch-ms <localnet 300000, testnet 3600000>] [--window-ms <default: launch_window_epochs epochs>]
//          [--params launch|sim] [--symbol STRL] [--troll-near 5] [--start-ms <unix ms, default now>]
//          [--wrapper <prefix>] [--global-hash <base58>] [--name "Sharded Trolls"] [--feed-target N] [--label demo]
// --params launch (default) uses LAUNCH_PARAMS (launch claim 1,000 tokens, claim fee 0.01 NEAR);
// --params sim uses the simulation's DEFAULT_PARAMS (claim 100,000 tokens, no fee).
// --start-ms sets epoch 0 and the launch window start (a chosen launch time; default: now).
// --wrapper deploys the single-contract NEP-141 wrapper at <prefix>.<parent>, bound to its home
// troll, and registers it there. Mainnet is refused here: humans approve every mainnet transaction.
// --global-hash reuses troll code already published as a global contract (a second token on the same
// code): no code is published and the hash goes straight to UseGlobalContract. A local troll.wasm with
// a different sha256 stops the deploy unless --allow-hash-mismatch is given.
// --feed-target and --label override and tag parameters for demo deployments.
// Before anything is sent, the signer's balance is checked against the whole deployment; before each
// transaction the script waits until earlier gas refunds have landed and the up-front gas charge fits.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchLayout, place } from '../packages/layout/index.js';
import { DEFAULT_PARAMS, LAUNCH_PARAMS } from '../sim/model.js';
import { Near, Account, KeyPair, action, NEAR, TGAS, b58decode, b58encode } from './lib/near.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const RPC = { localnet: 'http://127.0.0.1:3040', testnet: 'https://rpc.testnet.fastnear.com' };
const { values } = parseArgs({ options: {
  network: { type: 'string', default: 'localnet' }, parent: { type: 'string' }, signer: { type: 'string' },
  'key-file': { type: 'string' }, 'epoch-ms': { type: 'string' }, 'window-ms': { type: 'string' }, params: { type: 'string', default: 'launch' }, symbol: { type: 'string', default: 'STRL' },
  'troll-near': { type: 'string', default: '5' }, 'start-ms': { type: 'string' }, wrapper: { type: 'string' },
  'global-hash': { type: 'string' }, 'feed-target': { type: 'string' }, label: { type: 'string' },
  name: { type: 'string', default: 'Sharded Trolls' }, rpc: { type: 'string' }, 'allow-hash-mismatch': { type: 'boolean', default: false },
} });
const net = values.network;
if (!RPC[net]) throw new Error(`unsupported network ${net}`);
if (values.rpc) RPC[net] = values.rpc; // another endpoint for the same network, e.g. when one rate-limits
const parent = values.parent ?? (net === 'localnet' ? 'sandbox' : undefined);
if (!parent) throw new Error('--parent is required');
const signerId = values.signer ?? parent;
// The trolls are sub-accounts of the parent, and only an account can create its own sub-accounts.
if (signerId !== parent) throw new Error(`sign with the parent's own key: ${signerId} cannot create accounts under ${parent}`);
const keyFile = values['key-file'] ?? (net === 'localnet' ? 'target/localnet/validator_key.json' : undefined);
if (!keyFile) throw new Error('--key-file is required');
const near = new Near(RPC[net]);
const signer = new Account(near, signerId, KeyPair.fromString(JSON.parse(readFileSync(resolve(ROOT, keyFile))).secret_key));

const DECIMALS = 10n ** 24n;
const tokens = (v) => (BigInt(Math.round(v)) * DECIMALS).toString();
if (!['launch', 'sim'].includes(values.params)) throw new Error('--params launch|sim');
const P = values.params === 'sim' ? DEFAULT_PARAMS : LAUNCH_PARAMS;
const epochMs = Number(values['epoch-ms'] ?? (net === 'testnet' ? 3_600_000 : 300_000));
const windowMs = Number(values['window-ms'] ?? epochMs * P.launch_window_epochs);
if (!(epochMs > 0) || !(windowMs > 0)) throw new Error('--epoch-ms and --window-ms must be positive');
const params = {
  troll_count: P.troll_count, toll_bps: P.toll_bps, feed_target: values['feed-target'] ? Number(values['feed-target']) : P.feed_target,
  reward_per_epoch: tokens(P.reward_per_epoch), starve_burn_bps: P.starve_burn_bps,
  epoch_ms: epochMs, launch_window_ms: windowMs,
  launch_claim_amount: tokens(P.launch_claim_amount), min_counted_transfer: tokens(P.min_counted_transfer),
  // NEAR per launch claim, kept by the troll; micro-NEAR precision
  claim_fee: (BigInt(Math.round((P.claim_fee_near ?? 0) * 1e6)) * 10n ** 18n).toString(),
  // NEAR the root pays whoever settles an epoch, from the forwarded claim fees; micro-NEAR precision
  settle_bounty: (BigInt(Math.round((P.settle_bounty_near ?? 0) * 1e6)) * 10n ** 18n).toString(),
};
const totalSupply = tokens(P.total_supply), launchSupply = tokens(P.launch_supply);

const layout = await fetchLayout(RPC[net]);
const trolls = place(parent, layout);
if (trolls.length !== P.troll_count) throw new Error(`only ${trolls.length} reachable shards`);
for (const t of trolls) if (await near.accountExists(t.account)) throw new Error(`${t.account} already exists`);
const trollIds = trolls.map((t) => t.account);
const startMs = values['start-ms'] ? Number(values['start-ms']) : Date.now();
if (!Number.isSafeInteger(startMs) || startMs <= 0) throw new Error('--start-ms must be unix milliseconds');

const trollCode = readFileSync(resolve(ROOT, 'target/near/troll/troll.wasm'));
const rootCode = readFileSync(resolve(ROOT, 'target/near/root/root.wasm'));
const localHash = createHash('sha256').update(trollCode).digest();
let codeHash = localHash;
if (values['global-hash']) {
  codeHash = Buffer.from(b58decode(values['global-hash']));
  if (codeHash.length !== 32) throw new Error('--global-hash must be a base58 sha256 (32 bytes)');
  // Different troll code under a new root would break settlement, so a mismatch stops the deploy
  // unless explicitly allowed.
  if (!codeHash.equals(localHash)) {
    const msg = `local troll.wasm sha256 ${b58encode(localHash)} differs from --global-hash ${values['global-hash']}`;
    if (!values['allow-hash-mismatch']) throw new Error(`${msg}; nothing was sent (pass --allow-hash-mismatch to deploy anyway)`);
    console.warn(`WARNING: ${msg}; using the global hash (--allow-hash-mismatch)`);
  }
}

// Signs, prints the hash, then sends: if the RPC fails mid-send, the hash tells whether it landed.
async function send(receiver, actions) {
  const signed = await signer.sign(receiver, actions);
  console.log(`  tx ${signed.hash} -> ${receiver}`);
  const r = await near.sendSigned(signed, 'EXECUTED_OPTIMISTIC');
  const failure = r.status?.Failure ?? r.receipts_outcome?.map((o) => o.outcome.status.Failure).find(Boolean);
  if (failure) throw new Error(`${receiver} tx ${signed.hash} failed: ${JSON.stringify(failure).slice(0, 500)}`);
  return r;
}

// ---------- NEAR budget ----------
const nearAmount = (v) => BigInt(Math.round(Number(v) * 1e6)) * 10n ** 18n;
const trollNear = nearAmount(values['troll-near']);
const cfg = await near.rpc('EXPERIMENTAL_protocol_config', { finality: 'final' });
const perByte = BigInt(cfg.runtime_config.storage_amount_per_byte);
// Prepaid gas is charged up front at a higher price than the gas price and the unused part is refunded
// a few blocks later (measured on testnet 2026-11-14: ~0.11 NEAR held for a 100 Tgas call at gas price 1e8).
const gasPrice = BigInt((await near.rpc('gas_price', [null])).gas_price);
const upfront = (tgas) => (BigInt(tgas) + 5n) * TGAS * gasPrice * 11n;
const ROOT_STATE = 2000n; // root state and parent account beyond the code, bytes (testnet: ~1.6 KB)
const budget = [
  ['global troll code (10x storage)', values['global-hash'] ? 0n : 10n * perByte * BigInt(trollCode.length)],
  ['root code + state on the parent', perByte * (BigInt(rootCode.length) + ROOT_STATE)],
  [`${trolls.length} trolls x ${values['troll-near']} NEAR`, BigInt(trolls.length) * trollNear],
  ['wrapper (3 NEAR + registration)', values.wrapper ? 3n * NEAR + 10n ** 22n : 0n],
  ['up-front gas held for one transaction', upfront(100)],
];
const need = budget.reduce((a, [, v]) => a + v, 0n);
const spendable = async () => {
  const a = await near.rpc('query', { request_type: 'view_account', finality: 'optimistic', account_id: signerId });
  return { amount: BigInt(a.amount), free: BigInt(a.amount) - perByte * BigInt(a.storage_usage) };
};
const fmt = (y) => (Number(y / 10n ** 18n) / 1e6).toFixed(4);
for (const [k, v] of budget) if (v) console.log(`  ${fmt(v).padStart(9)} NEAR  ${k}`);
const have = (await spendable()).free;
console.log(`  ${fmt(need).padStart(9)} NEAR  total; ${signerId} has ${fmt(have)} spendable`);
if (have < need) throw new Error(`${signerId} needs ${fmt(need - have)} more NEAR; nothing was sent`);
// Before each transaction: wait (up to 30 s) until the balance stops moving, i.e. refunds of earlier
// transactions have landed, and the transfer plus the up-front gas fits.
async function ready(deposit, tgas, what) {
  let last = null;
  for (let i = 0; i < 30; i++) {
    const b = await spendable();
    if (last !== null && b.amount === last && b.free >= deposit + upfront(tgas)) return;
    last = b.amount;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const b = await spendable();
  throw new Error(`${what}: ${signerId} has ${fmt(b.free)} spendable, needs ${fmt(deposit + upfront(tgas))}; stopped before sending`);
}

if (!values['global-hash']) {
  console.log(`${net}: global troll code ${trollCode.length} bytes`);
  await ready(0n, 0, 'global deploy');
  await send(signerId, [action.deployGlobalContract(trollCode)]);
} else {
  console.log(`${net}: using global troll code ${values['global-hash']}`);
}

console.log(`root ${parent}`);
const metadata = { spec: 'ft-1.0.0', name: values.name, symbol: values.symbol, icon: null, reference: null, reference_hash: null, decimals: 24 };
const rootActions = [action.deployContract(rootCode), action.functionCall('new', { params, trolls: trollIds, start_ms: startMs, total_supply: totalSupply, metadata }, 100n * TGAS)];
await ready(0n, 100, 'root');
await send(parent, rootActions);

// Global code becomes usable a block or two after the deploy executes.
await new Promise((r) => setTimeout(r, 2000));
for (const t of trolls) {
  await ready(trollNear, 100, t.account);
  await send(t.account, [
    action.createAccount(), action.transfer(trollNear), action.useGlobalContractByHash(codeHash),
    action.functionCall('new', { root: parent, trolls: trollIds, params, metadata, start_ms: startMs, total_supply: totalSupply, launch_supply: launchSupply }, 100n * TGAS),
  ]);
  console.log(`  ${t.account.padEnd(28)} shard ${t.shard}`);
}

let wrapper = null;
if (values.wrapper) {
  const id = `${values.wrapper}.${parent}`;
  const code = readFileSync(resolve(ROOT, 'target/near/wrapper/wrapper.wasm'));
  const home = await near.view(parent, 'home_troll', { account_id: id });
  const wmeta = { ...metadata, name: `Wrapped ${values.name}`, symbol: `w${values.symbol}` };
  await ready(3n * NEAR, 100, id);
  await send(id, [action.createAccount(), action.transfer(3n * NEAR), action.deployContract(code), action.functionCall('new', { troll: home, metadata: wmeta }, 100n * TGAS)]);
  const { min } = await near.view(home, 'storage_balance_bounds');
  await send(home, [action.functionCall('storage_deposit', { account_id: id, registration_only: true }, 10n * TGAS, BigInt(min))]);
  wrapper = { account: id, home_troll: home, code_hash: createHash('sha256').update(code).digest('hex') };
  console.log(`wrapper ${id} -> home troll ${home}`);
}

const out = {
  wrapper,
  network: net, rpc: RPC[net], root: parent, trolls, params, start_ms: startMs,
  total_supply: totalSupply, launch_supply: launchSupply, troll_code_hash: codeHash.toString('hex'),
  root_code_hash: createHash('sha256').update(rootCode).digest('hex'),
  protocol: layout.protocol, deployed_at: new Date().toISOString(),
  global_hash_reused: values['global-hash'] ?? null, label: values.label ?? null,
};
const file = resolve(ROOT, `target/deploy-${net}.json`);
writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${file}`);
