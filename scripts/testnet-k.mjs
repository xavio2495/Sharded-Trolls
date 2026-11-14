#!/usr/bin/env node
// Testnet checks K2 (fan-out), K3 (conservation and failed-credit refund) and K7 (global contract
// cost) on a dedicated parent account. Every step is a dry run that prints what it would send
// unless --send is given. Short bursts only: K2 sends two fire() transactions in total.
// Usage: node --dns-result-order=ipv4first scripts/testnet-k.mjs <step> [--send] [--parent st.xavio.testnet]
//          [--parent-near 38] [--troll-near 1] [--reuse <earlier parent>] [--report-dir measurements/testnet-<date>]
// State per parent in target/testnet/<parent>/ (parent key, deploy.json, accounts, results; gitignored).
// --reuse <earlier parent>: setup reuses that run's test accounts and stampede instead of creating new ones.
// Homes depend only on the account name, so they keep their troll index in the new deployment.
//   plan      read-only: funder balance, placement under the parent, wasm sizes, storage price, budget
//   parent    funder creates the parent account with a fresh full-access key (target/testnet/parent-key.json)
//   spare     moves the earlier parent's (--reuse) spare NEAR to this parent; its deployment stays intact
//   deploy    runs deploy.mjs on testnet with the parent key (LAUNCH_PARAMS; 1 h epochs, launch window
//             one epoch unless --window-ms), then records K7 (costs, code hashes)
//   setup     test accounts: one stampede and two holders homed on distinct trolls, receivers, registrations,
//             launch claims (inside the launch window)
//   k2        one fire of 50 same-troll transfers, one fire of 25 mixed transfers; counts executed transfers
//   k3        100 tokens per case: cross-troll transfer (toll burned), transfer to an unregistered receiver (credit fails,
//             full refund), cross-troll ft_transfer_call to an account without ft_on_transfer (refund);
//             conservation checked over all eight trolls before and after
//   k7        read-only: records K7 (parent spend, each troll's global code hash and storage)
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
  'window-ms': { type: 'string' }, params: { type: 'string', default: 'launch' },
  reuse: { type: 'string' }, 'report-dir': { type: 'string' }, 'spare-near': { type: 'string' },
} });
const step = positionals[0] ?? 'plan';
const SEND = values.send;
const near = new Near(RPC);
const DIR = resolve(ROOT, 'target/testnet', values.parent);
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
// Decimal NEAR ("0.2") to yocto, micro-NEAR precision.
const nearToYocto = (v) => BigInt(Math.round(Number(v) * 1e6)) * 10n ** 18n;
const dep = () => load('deploy.json');
const reused = () => JSON.parse(readFileSync(resolve(ROOT, 'target/testnet', values.reuse, 'accounts.json')));

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
// Final state; right after a transaction executes, 'final' can still report a new account as missing
// for a few blocks, so wait up to ~10 s for it.
async function balance(id) {
  for (let i = 0; ; i++) {
    try { return await near.rpc('query', { request_type: 'view_account', finality: 'final', account_id: id }); }
    catch (e) { if (i >= 9 || !/UNKNOWN_ACCOUNT|does not exist/.test(e.message + e.kind)) throw e; await new Promise((r) => setTimeout(r, 1000)); }
  }
}

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
  // Root state + parent account + key measured on the first run: 183,030 B total storage minus 182,124 B code.
  const rootExtra = 1000n;
  // Registration deposit per holder (fixed by the troll's account record size), read from the earlier deployment.
  const regMin = values.reuse ? BigInt((await near.view(JSON.parse(readFileSync(resolve(ROOT, 'target/testnet', values.reuse, 'deploy.json'))).trolls[0].account, 'storage_balance_bounds')).min) : 2n * 10n ** 21n;
  const items = [
    ['global troll code (10x storage, burned)', 10n * perByte * BigInt(troll.length)],
    ['root code + state + parent account (locked on the parent)', perByte * (BigInt(root.length) + rootExtra)],
    [`8 troll accounts x ${values['troll-near']} NEAR`, 8n * nearToYocto(values['troll-near'])],
    ...(values.reuse ? [] : [
      ['stampede account (funded with 2.5 NEAR; code locks part of it)', NEAR / 2n + 2n * NEAR],
      ['2 holders + 3 receivers x 0.2 NEAR', NEAR]]),
    ['6 registrations at the new trolls (paid by the parent)', 6n * regMin],
    ['gas: deploy (10 tx) + registrations (2 tx), upper bound', 10n ** 23n / 2n],
  ];
  const total = items.reduce((a, [, v]) => a + v, 0n);
  console.log(`funder ${values.funder}: ${fmt(f.amount)} NEAR; parent ${values.parent} exists: ${await near.accountExists(values.parent)}`);
  console.log(`placement under ${values.parent} (protocol ${layout.protocol}):`);
  for (const t of trolls) console.log(`  ${t.account.padEnd(24)} shard ${t.shard}`);
  console.log(`distinct shards: ${new Set(trolls.map((t) => t.shard)).size} of ${trolls.length}`);
  console.log(`storage ${perByte} yocto/byte; wasm troll ${troll.length} B, root ${root.length} B, stampede ${stampede.length} B`);
  for (const [k, v] of items) console.log(`  ${fmt(v).padStart(9)}  ${k}`);
  console.log(`  ${fmt(total).padStart(9)}  total the parent needs; parent funded with ${values['parent-near']} NEAR`);
  if (nearToYocto(values['parent-near']) < total) console.log('WARNING: --parent-near below the estimate');
  console.log(`funder needs ${values['parent-near']} NEAR + ~0.001 gas; spendable now ${fmt(BigInt(f.amount) - perByte * BigInt(f.storage_usage))}`);
  if (values.reuse) {
    // Reused accounts pay their own claim fee and gas: check they can.
    const acc = reused();
    for (const id of [acc.stampede, acc.holderA, acc.holderB]) {
      const a = await balance(id);
      console.log(`  reuse ${id.padEnd(24)} spendable ${fmt(BigInt(a.amount) - perByte * BigInt(a.storage_usage))} NEAR (needs claim fee 0.01 + gas${id === acc.stampede ? ' + 2 fires ~0.09' : ''})`);
    }
  }
  const key = funderKey();
  const keys = await near.rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: values.funder });
  console.log(`funder key from SECRET_PHRASE is a full-access key on ${values.funder}: ${keys.keys.some((k) => k.public_key === key.publicKeyString && k.access_key.permission === 'FullAccess')}`);
} else if (step === 'parent') {
  if (await near.accountExists(values.parent)) throw new Error(`${values.parent} already exists`);
  const key = existsSync(file('parent-key.json')) ? KeyPair.fromString(load('parent-key.json').secret_key) : KeyPair.random();
  if (SEND && !existsSync(file('parent-key.json'))) save('parent-key.json', { account_id: values.parent, public_key: key.publicKeyString, secret_key: key.secretKeyString });
  const funder = new Account(near, values.funder, funderKey());
  mustSucceed(await submit(funder, values.parent, [action.createAccount(), action.transfer(nearToYocto(values['parent-near'])), action.addFullAccessKey(key.publicKey)],
    `create account, ${values['parent-near']} NEAR, full-access key ${key.publicKeyString}`));
} else if (step === 'spare') {
  // Moves spare NEAR from the earlier parent (--reuse) to this parent; the earlier deployment stays
  // intact (its root keeps its storage reserve).
  if (!values.reuse) throw new Error('--reuse <earlier parent> is required');
  const from = new Account(near, values.reuse, KeyPair.fromString(JSON.parse(readFileSync(resolve(ROOT, 'target/testnet', values.reuse, 'parent-key.json'))).secret_key));
  const cfg = await near.rpc('EXPERIMENTAL_protocol_config', { finality: 'final' });
  const a = await balance(values.reuse);
  const spare = BigInt(a.amount) - BigInt(cfg.runtime_config.storage_amount_per_byte) * BigInt(a.storage_usage) - 5n * 10n ** 22n; // keep 0.05 NEAR
  if (spare <= 0n) throw new Error(`${values.reuse} has no spare NEAR`);
  const amt = values['spare-near'] ? nearToYocto(values['spare-near']) : spare;
  if (amt > spare) throw new Error(`only ${fmt(spare)} NEAR spare on ${values.reuse}`);
  mustSucceed(await submit(from, values.parent, [action.transfer(amt)], `transfer ${fmt(amt)} NEAR (spare after storage + 0.05)`));
} else if (step === 'deploy') {
  const args = ['--dns-result-order=ipv4first', 'scripts/deploy.mjs', '--network', 'testnet', '--parent', values.parent,
    '--key-file', `target/testnet/${values.parent}/parent-key.json`, '--troll-near', values['troll-near'], '--epoch-ms', values['epoch-ms'], '--params', values.params,
    ...(values['window-ms'] ? ['--window-ms', values['window-ms']] : [])];
  log(`node ${args.join(' ')}`);
  if (!SEND) process.exit(0);
  execFileSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  save('deploy.json', JSON.parse(readFileSync(resolve(ROOT, 'target/deploy-testnet.json'))));
  console.log('deployed; record K7 with: testnet-k.mjs k7');
} else if (step === 'k7') {
  // Read-only. The parent was created with --parent-near and pays only for the deploy before setup.
  const D = dep();
  const after = await balance(values.parent);
  const trolls = await Promise.all(D.trolls.map(async (t) => {
    const a = await balance(t.account);
    return { account: t.account, shard: t.shard, storage_usage: a.storage_usage, code_hash: a.code_hash, global_contract_hash: a.global_contract_hash ?? null };
  }));
  const k7 = {
    parent_funded_near: values['parent-near'], parent_left_near: fmt(after.amount), parent_storage_bytes: after.storage_usage,
    parent_spent_near: fmt(nearToYocto(values['parent-near']) - yocto(after.amount)),
    troll_near_each: values['troll-near'], troll_code_bytes: wasm('troll').length, troll_code_hash: D.troll_code_hash,
    trolls, conservation_at_start: await conservation(D), at: new Date().toISOString(),
  };
  save('k7.json', k7);
  console.log(JSON.stringify(k7, null, 1));
} else if (step === 'setup') {
  const dep = load('deploy.json');
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
  let acc, keys;
  if (values.reuse) {
    // Earlier run's accounts: same names, so the same home indexes (checked below).
    ({ keys, ...acc } = reused());
    for (const [id, i] of [[acc.stampede, A], [acc.holderA, A], [acc.recvA[0], A], [acc.recvA[1], A], [acc.holderB, B], [acc.recvB, B], [acc.unregisteredB, B]]) {
      if ((await homeOf(id)) !== i) throw new Error(`${id} is not homed at troll ${i}`);
    }
  } else {
    acc = {
      stampede: await pick(A), holderA: await pick(A), holderB: await pick(B),
      recvA: [await pick(A), await pick(A)], recvB: await pick(B),
    };
    // Unregistered receiver homed at troll B: never created or registered (credit must fail).
    acc.unregisteredB = await pick(B);
    keys = existsSync(file('accounts.json')) ? load('accounts.json').keys : {};
  }
  const mk = async (id, nearAmt, code) => {
    keys[id] ??= KeyPair.random().secretKeyString;
    const kp = KeyPair.fromString(keys[id]);
    const acts = [action.createAccount(), action.transfer(nearAmt), action.addFullAccessKey(kp.publicKey)];
    if (code) acts.push(action.deployContract(code), action.functionCall('new', { owner_id: id }, 30n * TGAS));
    mustSucceed(await submit(p, id, acts, `create ${id}${code ? ' + stampede code' : ''}`));
  };
  if (!values.reuse) {
    await mk(acc.stampede, NEAR / 2n + 2n * NEAR, wasm('stampede'));
    for (const id of [acc.holderA, acc.holderB, ...acc.recvA, acc.recvB]) await mk(id, NEAR / 5n);
  }
  if (SEND) save('accounts.json', { ...acc, keys, reused_from: values.reuse ?? null });
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
  const dep = load('deploy.json');
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
    // A same-troll transfer logs ft_transfer; a cross-troll one logs ft_burn at the source and
    // ft_mint at the destination, plus a toll event.
    const transfers = ev.filter((e) => e.standard === 'nep141' && (e.event === 'ft_transfer' || e.event === 'ft_mint')).length;
    const toll = ev.filter((e) => e.standard === 'shardedtrolls' && e.event === 'toll').length;
    const fires = { label, n, hash: r.hash, url: EXPLORER + r.hash, ft_transfer_events: transfers, toll_burns: toll,
      failed_receipts: failures(r).length, shards: [...new Set(r.receipts_outcome.map((o) => o.outcome.executor_id))],
      conservation_before: before, conservation_after: await conservation(dep), pass: transfers >= n && failures(r).length === 0 };
    out.fires.push(fires);
    console.log(JSON.stringify(fires, null, 1));
  }
  if (SEND) save('k2.json', out);
} else if (step === 'k3') {
  const dep = load('deploy.json');
  const acc = load('accounts.json');
  const h = new Account(near, acc.holderA, KeyPair.fromString(acc.keys[acc.holderA]));
  const trollA = dep.trolls[0].account, trollB = dep.trolls[1].account;
  const amt = (100n * NEAR).toString(); // 100 tokens per case; a launch claim is 1,000
  const bal = async (t, id) => BigInt(await near.view(t, 'ft_balance_of', { account_id: id }));
  const out = { at: new Date().toISOString(), cases: [] };
  for (const [label, method, args, gas, expect] of [
    ['cross-troll transfer, receiver registered', 'ft_transfer', { receiver_id: acc.recvB, amount: amt }, 50n, 'credited, toll burned'],
    ['cross-troll transfer, receiver not registered', 'ft_transfer', { receiver_id: acc.unregisteredB, amount: amt }, 50n, 'credit fails, full refund'],
    ['cross-troll ft_transfer_call, receiver has no ft_on_transfer', 'ft_transfer_call', { receiver_id: acc.holderB, amount: amt, msg: '' }, 150n, 'credited, returned unused; sender refunded minus the toll'],
    // At exactly the 100 Tgas floor: the longest allowed msg must still credit and close the books;
    // one byte more is rejected at the source before anything is debited.
    ['cross-troll ft_transfer_call at 100 Tgas, msg 4,096 B', 'ft_transfer_call', { receiver_id: acc.holderB, amount: amt, msg: 'x'.repeat(4096) }, 100n, 'credited, returned unused; sender refunded minus the toll'],
    ['cross-troll ft_transfer_call at 100 Tgas, msg 4,097 B', 'ft_transfer_call', { receiver_id: acc.holderB, amount: amt, msg: 'x'.repeat(4097) }, 100n, 'rejected at the source (msg longer than 4096 bytes); nothing debited'],
  ]) {
    const before = SEND ? { a: await bal(trollA, acc.holderA), c: await conservation(dep) } : null;
    const r = await submit(h, trollA, [action.functionCall(method, args, gas * TGAS, 1n)], `${label}: ${method}`);
    if (!r) continue;
    await sleep(5000);
    const after = { a: await bal(trollA, acc.holderA), c: await conservation(dep) };
    const errors = failures(r).map((f) => JSON.stringify(f).match(/"(?:ExecutionError|panic_msg)":"([^"]{0,160})/)?.[1] ?? JSON.stringify(f).slice(0, 160));
    const c = { label, expect, hash: r.hash, url: EXPLORER + r.hash, gas_attached_tgas: Number(gas), msg_bytes: args.msg?.length ?? null,
      sender_delta: String(after.a - before.a), events: events(r).map((e) => `${e.executor}:${e.event}`), errors,
      failed_receipts: failures(r).length, conserved_before: before.c.conserved, conserved_after: after.c.conserved,
      in_flight_after: after.c.in_flight };
    out.cases.push(c);
    console.log(JSON.stringify(c, null, 1));
  }
  if (SEND) save('k3.json', out);
} else if (step === 'report') {
  const day = new Date().toISOString().slice(0, 10);
  const dir = resolve(ROOT, values['report-dir'] ?? `measurements/testnet-${day}`);
  mkdirSync(dir, { recursive: true });
  const dep = load('deploy.json');
  const pick = (n) => (existsSync(file(n)) ? load(n) : null);
  const report = { network: 'testnet', root: dep.root, trolls: dep.trolls, params: dep.params, troll_code_hash: dep.troll_code_hash,
    root_code_hash: dep.root_code_hash, reused_accounts_from: pick('accounts.json')?.reused_from ?? null,
    k7: pick('k7.json'), k2: pick('k2.json'), k3: pick('k3.json') };
  writeFileSync(resolve(dir, 'k-tests.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`wrote ${dir}/k-tests.json`);
} else {
  throw new Error(`unknown step ${step}`);
}
