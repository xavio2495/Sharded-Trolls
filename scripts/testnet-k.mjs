#!/usr/bin/env node
// Testnet checks K2 (fan-out), K3 (conservation and failed-credit refund) and K7 (global contract
// cost) on a dedicated parent account. Every step is a dry run that prints what it would send
// unless --send is given. Short bursts only: K2 sends two fire() transactions in total.
// Usage: node --dns-result-order=ipv4first scripts/testnet-k.mjs <step> [--send]
//   plan      read-only: funder balance, placement under the parent, wasm sizes, storage price, budget
//   parent    funder creates the parent account with a fresh full-access key (target/testnet/parent-key.json)
//   deploy    runs deploy.mjs on testnet with the parent key, then records K7 (costs, code hashes)
//   setup     test accounts: one stampede and two holders homed on distinct trolls, receivers, registrations,
//             launch claims (inside the launch window)
//   k2        one fire of 50 same-troll transfers, one fire of 25 mixed transfers; counts executed transfers
//   k3        cross-troll transfer (toll burned), transfer to an unregistered receiver (credit fails,
//             full refund), cross-troll ft_transfer_call to an account without ft_on_transfer (refund);
//             conservation checked over all eight trolls before and after
//   report    writes measurements/testnet-<date>/k-tests.json from target/testnet/*.json
// Env: SECRET_PHRASE (funder seed phrase) from .env; never printed.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchLayout, place } from '../packages/layout/index.js';
import { homeIndex } from '../packages/client/index.js';
import { Near, Account, KeyPair, action, NEAR, TGAS } from './lib/near.mjs';
import { keyPairFromSeedPhrase } from './lib/seed.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const RPC = 'https://rpc.testnet.fastnear.com';
const EXPLORER = 'https://testnet.nearblocks.io/txns/';
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  send: { type: 'boolean', default: false }, funder: { type: 'string', default: 'xavio.testnet' },
  parent: { type: 'string', default: 'st.xavio.testnet' }, 'parent-near': { type: 'string', default: '38' },
  'troll-near': { type: 'string', default: '1' }, 'epoch-ms': { type: 'string', default: '3600000' },
} });
const step = positionals[0] ?? 'plan';
const SEND = values.send;
const near = new Near(RPC);
const DIR = resolve(ROOT, 'target/testnet');
mkdirSync(DIR, { recursive: true });
const file = (n) => resolve(DIR, n);
const load = (n) => JSON.parse(readFileSync(file(n)));
const save = (n, v) => writeFileSync(file(n), JSON.stringify(v, null, 2) + '\n');
const log = (...a) => console.log(SEND ? '' : '[dry run]', ...a);
const yocto = (v) => BigInt(v);
const fmt = (y) => (Number(BigInt(y) / 10n ** 18n) / 1e6).toFixed(4);
const sha = (b) => createHash('sha256').update(b).digest();
const wasm = (n) => readFileSync(resolve(ROOT, `target/near/${n}/${n}.wasm`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function funderKey() {
  if (existsSync(resolve(ROOT, '.env'))) {
    for (const l of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = l.match(/^\s*SECRET_PHRASE\s*=\s*(.*)$/);
      if (m && !process.env.SECRET_PHRASE) process.env.SECRET_PHRASE = m[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  if (!process.env.SECRET_PHRASE) throw new Error('SECRET_PHRASE missing');
  return keyPairFromSeedPhrase(process.env.SECRET_PHRASE);
}
const parentAccount = () => new Account(near, values.parent, KeyPair.fromString(load('parent-key.json').secret_key));
const balance = async (id) => (await near.rpc('query', { request_type: 'view_account', finality: 'final', account_id: id }));

// Sends unless dry run; returns the full outcome (never throws on receipt failures, the caller checks).
async function submit(signer, receiver, actions, what) {
  log(`${signer.accountId} -> ${receiver}: ${what}`);
  if (!SEND) return null;
  const signed = await signer.sign(receiver, actions);
  const r = await near.sendSigned(signed, 'FINAL');
  console.log(`  tx ${signed.hash}  ${EXPLORER}${signed.hash}`);
  return { ...r, hash: signed.hash };
}
const failures = (r) => [r.status?.Failure, ...r.receipts_outcome.map((o) => o.outcome.status.Failure)].filter(Boolean);
const mustSucceed = (r) => { if (r && failures(r).length) throw new Error(`tx ${r.hash} failed: ${JSON.stringify(failures(r)[0]).slice(0, 400)}`); return r; };
const events = (r) => r.receipts_outcome.flatMap((o) => o.outcome.logs.filter((l) => l.startsWith('EVENT_JSON:'))
  .map((l) => ({ executor: o.outcome.executor_id, ...JSON.parse(l.slice(11)) })));

async function conservation(dep) {
  const infos = await Promise.all(dep.trolls.map((t) => near.view(t.account, 'info')));
  const sum = (k) => infos.reduce((a, i) => a + BigInt(i[k]), 0n);
  const supply = sum('supply'), inFlight = sum('in_flight'), burned = sum('burned'), minted = sum('minted');
  const lhs = supply + inFlight + burned - minted;
  return { supply: String(supply), in_flight: String(inFlight), burned: String(burned), minted: String(minted),
    total_supply: dep.total_supply, conserved: lhs === BigInt(dep.total_supply) };
}

if (step === 'plan') {
  const layout = await fetchLayout(RPC);
  const trolls = place(values.parent, layout);
  const cfg = await near.rpc('EXPERIMENTAL_protocol_config', { finality: 'final' });
  const perByte = BigInt(cfg.runtime_config.storage_amount_per_byte);
  const f = await balance(values.funder);
  const troll = wasm('troll'), root = wasm('root'), stampede = wasm('stampede');
  const items = [
    ['global troll code (10x storage, burned)', 10n * perByte * BigInt(troll.length)],
    ['root code + state (locked on the parent)', perByte * BigInt(root.length + 4000)],
    [`8 troll accounts x ${values['troll-near']} NEAR`, 8n * BigInt(values['troll-near']) * NEAR],
    ['stampede account (code + 0.5 NEAR)', perByte * BigInt(stampede.length) + NEAR / 2n],
    ['2 holders + 3 receivers x 0.2 NEAR', NEAR],
    ['registrations, claims, fires, gas (upper bound)', NEAR / 2n],
  ];
  const total = items.reduce((a, [, v]) => a + v, 0n);
  console.log(`funder ${values.funder}: ${fmt(f.amount)} NEAR; parent ${values.parent} exists: ${await near.accountExists(values.parent)}`);
  console.log(`placement under ${values.parent} (protocol ${layout.protocol}):`);
  for (const t of trolls) console.log(`  ${t.account.padEnd(24)} shard ${t.shard}`);
  console.log(`distinct shards: ${new Set(trolls.map((t) => t.shard)).size} of ${trolls.length}`);
  console.log(`storage ${perByte} yocto/byte; wasm troll ${troll.length} B, root ${root.length} B, stampede ${stampede.length} B`);
  for (const [k, v] of items) console.log(`  ${fmt(v).padStart(9)}  ${k}`);
  console.log(`  ${fmt(total).padStart(9)}  total estimate; parent funded with ${values['parent-near']} NEAR`);
  if (BigInt(values['parent-near']) * NEAR < total) console.log('WARNING: --parent-near below the estimate');
  const key = funderKey();
  const keys = await near.rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: values.funder });
  console.log(`funder key from SECRET_PHRASE is a full-access key on ${values.funder}: ${keys.keys.some((k) => k.public_key === key.publicKeyString && k.access_key.permission === 'FullAccess')}`);
} else if (step === 'parent') {
  if (await near.accountExists(values.parent)) throw new Error(`${values.parent} already exists`);
  const key = existsSync(file('parent-key.json')) ? KeyPair.fromString(load('parent-key.json').secret_key) : KeyPair.random();
  if (SEND && !existsSync(file('parent-key.json'))) save('parent-key.json', { account_id: values.parent, public_key: key.publicKeyString, secret_key: key.secretKeyString });
  const funder = new Account(near, values.funder, funderKey());
  mustSucceed(await submit(funder, values.parent, [action.createAccount(), action.transfer(BigInt(values['parent-near']) * NEAR), action.addFullAccessKey(key.publicKey)],
    `create account, ${values['parent-near']} NEAR, full-access key ${key.publicKeyString}`));
} else if (step === 'deploy') {
  const args = ['--dns-result-order=ipv4first', 'scripts/deploy.mjs', '--network', 'testnet', '--parent', values.parent,
    '--key-file', 'target/testnet/parent-key.json', '--troll-near', values['troll-near'], '--epoch-ms', values['epoch-ms']];
  log(`node ${args.join(' ')}`);
  if (!SEND) process.exit(0);
  const before = await balance(values.parent);
  execFileSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  const dep = JSON.parse(readFileSync(resolve(ROOT, 'target/deploy-testnet.json')));
  const after = await balance(values.parent);
  const trolls = await Promise.all(dep.trolls.map(async (t) => {
    const a = await balance(t.account);
    return { account: t.account, shard: t.shard, storage_usage: a.storage_usage, code_hash: a.code_hash, global_contract_hash: a.global_contract_hash ?? null };
  }));
  const k7 = {
    parent_spent_near: fmt(yocto(before.amount) - yocto(after.amount)),
    troll_near_each: values['troll-near'], troll_code_bytes: wasm('troll').length, troll_code_hash: dep.troll_code_hash,
    trolls, conservation_at_start: await conservation(dep), at: new Date().toISOString(),
  };
  save('k7.json', k7);
  console.log(JSON.stringify(k7, null, 1));
} else if (step === 'setup') {
  const dep = JSON.parse(readFileSync(resolve(ROOT, 'target/deploy-testnet.json')));
  const layout = await fetchLayout(RPC);
  const p = parentAccount();
  const homeOf = async (id) => homeIndex(id, dep.trolls.length);
  const taken = [...dep.trolls.map((t) => t.account), values.parent];
  // Names under the parent, each on troll i's shard and homed at troll i (as in the localnet load).
  const pick = async (i) => {
    const want = dep.trolls[i];
    const set = place(values.parent, layout, { taken, accept: (a, s) => s === want.shard && homeSync(a) === i });
    const t = set[0];
    if (!t || (await homeOf(t.account)) !== i) throw new Error(`no name for troll ${i}`);
    taken.push(t.account);
    return t.account;
  };
  const homeSync = (id) => Number(BigInt('0x' + createHash('sha256').update(id).digest('hex').slice(0, 32)) % BigInt(dep.trolls.length));
  const A = 0, B = 1; // two trolls on distinct shards
  const acc = {
    stampede: await pick(A), holderA: await pick(A), holderB: await pick(B),
    recvA: [await pick(A), await pick(A)], recvB: await pick(B),
  };
  // Unregistered receiver homed at troll B: never created or registered (credit must fail).
  acc.unregisteredB = await pick(B);
  const keys = existsSync(file('accounts.json')) ? load('accounts.json').keys : {};
  const mk = async (id, nearAmt, code) => {
    keys[id] ??= KeyPair.random().secretKeyString;
    const kp = KeyPair.fromString(keys[id]);
    const acts = [action.createAccount(), action.transfer(nearAmt), action.addFullAccessKey(kp.publicKey)];
    if (code) acts.push(action.deployContract(code), action.functionCall('new', { owner_id: id }, 30n * TGAS));
    mustSucceed(await submit(p, id, acts, `create ${id}${code ? ' + stampede code' : ''}`));
  };
  await mk(acc.stampede, NEAR / 2n + 2n * NEAR, wasm('stampede'));
  for (const id of [acc.holderA, acc.holderB, ...acc.recvA, acc.recvB]) await mk(id, NEAR / 5n);
  if (SEND) save('accounts.json', { ...acc, keys });
  // Register at home trolls (the parent pays), then launch claims for the stampede and holders.
  for (const [i, ids] of [[A, [acc.stampede, acc.holderA, ...acc.recvA]], [B, [acc.holderB, acc.recvB]]]) {
    const t = dep.trolls[i].account;
    const { min } = SEND ? await near.view(t, 'storage_balance_bounds') : { min: '0' };
    mustSucceed(await submit(p, t, ids.map((id) => action.functionCall('storage_deposit', { account_id: id, registration_only: true }, 10n * TGAS, BigInt(min))), `register ${ids.length} at ${t}`));
  }
  for (const [id, i] of [[acc.stampede, A], [acc.holderA, A], [acc.holderB, B]]) {
    const signer = SEND ? new Account(near, id, KeyPair.fromString(keys[id])) : { accountId: id };
    // claim_fee exists once D24 is merged; attach it if the deployed params have one
    const fee = BigInt(dep.params.claim_fee ?? 0);
    mustSucceed(await submit(signer, dep.trolls[i].account, [action.functionCall('claim_launch', {}, 30n * TGAS, fee)], `claim_launch (fee ${fee} yocto)`));
  }
  console.log(JSON.stringify(acc, null, 1));
} else if (step === 'k2') {
  const dep = JSON.parse(readFileSync(resolve(ROOT, 'target/deploy-testnet.json')));
  const acc = load('accounts.json');
  const s = new Account(near, acc.stampede, KeyPair.fromString(acc.keys[acc.stampede]));
  const trollA = dep.trolls[0].account;
  const out = { at: new Date().toISOString(), fires: [] };
  for (const [label, receivers, n, callTgas] of [
    ['same-troll', acc.recvA, 50, 5n],
    ['mixed', [...acc.recvA, acc.recvB], 25, 16n],
  ]) {
    const gas = (BigInt(n) * (callTgas * 10n + 15n) * TGAS) / 10n + 20n * TGAS;
    const before = SEND ? await conservation(dep) : null;
    const r = await submit(s, acc.stampede, [action.functionCall('fire', { target: trollA, receivers, amount: String(NEAR), n, gas_per_call_tgas: Number(callTgas) }, gas)],
      `fire ${label}: n=${n}, ${callTgas} Tgas/call, ${gas / TGAS} Tgas`);
    if (!r) continue;
    await sleep(5000);
    const ev = events(r);
    const transfers = ev.filter((e) => e.standard === 'nep141' && e.event === 'ft_transfer').length;
    const toll = ev.filter((e) => e.event === 'ft_burn').length;
    const fires = { label, n, hash: r.hash, url: EXPLORER + r.hash, ft_transfer_events: transfers, toll_burns: toll,
      failed_receipts: failures(r).length, shards: [...new Set(r.receipts_outcome.map((o) => o.outcome.executor_id))],
      conservation_before: before, conservation_after: await conservation(dep), pass: transfers >= n && failures(r).length === 0 };
    out.fires.push(fires);
    console.log(JSON.stringify(fires, null, 1));
  }
  if (SEND) save('k2.json', out);
} else if (step === 'k3') {
  const dep = JSON.parse(readFileSync(resolve(ROOT, 'target/deploy-testnet.json')));
  const acc = load('accounts.json');
  const h = new Account(near, acc.holderA, KeyPair.fromString(acc.keys[acc.holderA]));
  const trollA = dep.trolls[0].account, trollB = dep.trolls[1].account;
  const amt = (10n ** 3n * NEAR).toString(); // 1,000 tokens
  const bal = async (t, id) => BigInt(await near.view(t, 'ft_balance_of', { account_id: id }));
  const out = { at: new Date().toISOString(), cases: [] };
  for (const [label, method, args, gas, expect] of [
    ['cross-troll transfer, receiver registered', 'ft_transfer', { receiver_id: acc.recvB, amount: amt }, 50n, 'credited, toll burned'],
    ['cross-troll transfer, receiver not registered', 'ft_transfer', { receiver_id: acc.unregisteredB, amount: amt }, 50n, 'credit fails, full refund'],
    ['cross-troll ft_transfer_call, receiver has no ft_on_transfer', 'ft_transfer_call', { receiver_id: acc.holderB, amount: amt, msg: '' }, 150n, 'credited, returned unused; sender refunded minus the toll'],
  ]) {
    const before = SEND ? { a: await bal(trollA, acc.holderA), c: await conservation(dep) } : null;
    const r = await submit(h, trollA, [action.functionCall(method, args, gas * TGAS, 1n)], `${label}: ${method}`);
    if (!r) continue;
    await sleep(5000);
    const after = { a: await bal(trollA, acc.holderA), c: await conservation(dep) };
    const c = { label, expect, hash: r.hash, url: EXPLORER + r.hash,
      sender_delta: String(after.a - before.a), events: events(r).map((e) => `${e.executor}:${e.event}`),
      failed_receipts: failures(r).length, conserved_before: before.c.conserved, conserved_after: after.c.conserved,
      in_flight_after: after.c.in_flight };
    out.cases.push(c);
    console.log(JSON.stringify(c, null, 1));
  }
  if (SEND) save('k3.json', out);
} else if (step === 'report') {
  const day = new Date().toISOString().slice(0, 10);
  const dir = resolve(ROOT, `measurements/testnet-${day}`);
  mkdirSync(dir, { recursive: true });
  const dep = JSON.parse(readFileSync(resolve(ROOT, 'target/deploy-testnet.json')));
  const pick = (n) => (existsSync(file(n)) ? load(n) : null);
  const report = { network: 'testnet', root: dep.root, trolls: dep.trolls, params: dep.params, troll_code_hash: dep.troll_code_hash,
    root_code_hash: dep.root_code_hash, k7: pick('k7.json'), k2: pick('k2.json'), k3: pick('k3.json') };
  writeFileSync(resolve(dir, 'k-tests.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`wrote ${dir}/k-tests.json`);
} else {
  throw new Error(`unknown step ${step}`);
}
