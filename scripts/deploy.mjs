#!/usr/bin/env node
// Deploy Sharded Trolls: troll code once as a global contract (by code hash, so it can't change),
// then one transaction per troll: create account, use the global code, init. The root is
// deployed on the parent account. Writes target/deploy-<network>.json for the other scripts.
// Usage: node --dns-result-order=ipv4first scripts/deploy.mjs [--network localnet|testnet]
//          [--parent sandbox] [--signer <parent>] [--key-file target/localnet/validator_key.json]
//          [--epoch-ms 300000] [--symbol TROLL] [--troll-near 5] [--start-ms <unix ms, default now>]
//          [--wrapper <prefix>]
// --start-ms sets epoch 0 and the launch window start (a chosen launch time; default: now).
// --wrapper deploys the single-contract NEP-141 wrapper at <prefix>.<parent>, bound to its home
// troll, and registers it there. Mainnet is refused here: humans approve every mainnet transaction.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchLayout, place } from '../packages/layout/index.js';
import { DEFAULT_PARAMS } from '../sim/model.js';
import { Near, Account, KeyPair, action, NEAR, TGAS } from './lib/near.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const RPC = { localnet: 'http://127.0.0.1:3040', testnet: 'https://rpc.testnet.fastnear.com' };
const { values } = parseArgs({ options: {
  network: { type: 'string', default: 'localnet' }, parent: { type: 'string' }, signer: { type: 'string' },
  'key-file': { type: 'string' }, 'epoch-ms': { type: 'string', default: '300000' }, symbol: { type: 'string', default: 'TROLL' },
  'troll-near': { type: 'string', default: '5' }, 'start-ms': { type: 'string' }, wrapper: { type: 'string' },
} });
const net = values.network;
if (!RPC[net]) throw new Error(`unsupported network ${net}`);
const parent = values.parent ?? (net === 'localnet' ? 'sandbox' : undefined);
if (!parent) throw new Error('--parent is required');
const signerId = values.signer ?? parent;
const keyFile = values['key-file'] ?? (net === 'localnet' ? 'target/localnet/validator_key.json' : undefined);
if (!keyFile) throw new Error('--key-file is required');
const near = new Near(RPC[net]);
const signer = new Account(near, signerId, KeyPair.fromString(JSON.parse(readFileSync(resolve(ROOT, keyFile))).secret_key));

const DECIMALS = 10n ** 24n;
const tokens = (v) => (BigInt(Math.round(v)) * DECIMALS).toString();
const P = DEFAULT_PARAMS;
const epochMs = Number(values['epoch-ms']);
const params = {
  troll_count: P.troll_count, toll_bps: P.toll_bps, feed_target: P.feed_target,
  reward_per_epoch: tokens(P.reward_per_epoch), starve_burn_bps: P.starve_burn_bps,
  epoch_ms: epochMs, launch_window_ms: epochMs * P.launch_window_epochs,
  launch_claim_amount: tokens(P.launch_claim_amount), min_counted_transfer: tokens(P.min_counted_transfer),
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
const codeHash = createHash('sha256').update(trollCode).digest();

console.log(`${net}: global troll code ${trollCode.length} bytes`);
await signer.send(signerId, [action.deployGlobalContract(trollCode)]);

console.log(`root ${parent}`);
const metadata = { spec: 'ft-1.0.0', name: 'Sharded Trolls', symbol: values.symbol, icon: null, reference: null, reference_hash: null, decimals: 24 };
const rootActions = [action.deployContract(rootCode), action.functionCall('new', { params, trolls: trollIds, start_ms: startMs, total_supply: totalSupply, metadata }, 100n * TGAS)];
if (parent !== signerId) rootActions.unshift(action.createAccount(), action.transfer(10n * NEAR));
await signer.send(parent, rootActions);

// Global code becomes usable a block or two after the deploy executes.
await new Promise((r) => setTimeout(r, 2000));
for (const t of trolls) {
  await signer.send(t.account, [
    action.createAccount(), action.transfer(BigInt(values['troll-near']) * NEAR), action.useGlobalContractByHash(codeHash),
    action.functionCall('new', { root: parent, trolls: trollIds, params, metadata, start_ms: startMs, total_supply: totalSupply, launch_supply: launchSupply }, 100n * TGAS),
  ]);
  console.log(`  ${t.account.padEnd(28)} shard ${t.shard}`);
}

let wrapper = null;
if (values.wrapper) {
  const id = `${values.wrapper}.${parent}`;
  const code = readFileSync(resolve(ROOT, 'target/near/wrapper/wrapper.wasm'));
  const home = await near.view(parent, 'home_troll', { account_id: id });
  const wmeta = { ...metadata, name: 'Wrapped Sharded Trolls', symbol: `w${values.symbol}` };
  await signer.send(id, [action.createAccount(), action.transfer(3n * NEAR), action.deployContract(code), action.functionCall('new', { troll: home, metadata: wmeta }, 100n * TGAS)]);
  const { min } = await near.view(home, 'storage_balance_bounds');
  await signer.call(home, 'storage_deposit', { account_id: id, registration_only: true }, { gas: 10n * TGAS, deposit: BigInt(min) });
  wrapper = { account: id, home_troll: home, code_hash: createHash('sha256').update(code).digest('hex') };
  console.log(`wrapper ${id} -> home troll ${home}`);
}

const out = {
  wrapper,
  network: net, rpc: RPC[net], root: parent, trolls, params, start_ms: startMs,
  total_supply: totalSupply, launch_supply: launchSupply, troll_code_hash: codeHash.toString('hex'),
  root_code_hash: createHash('sha256').update(rootCode).digest('hex'),
  protocol: layout.protocol, deployed_at: new Date().toISOString(),
};
const file = resolve(ROOT, `target/deploy-${net}.json`);
writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${file}`);
