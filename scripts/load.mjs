#!/usr/bin/env node
// Load demo on localnet. Same load against the eight trolls or the single control token.
//   setup: stampede and probe accounts (one per troll, on that troll's shard and with that troll as
//          home), receivers registered with
//          storage_deposit, control token deployed, tokens claimed (trolls) or sent (control).
//          Run right after deploy.mjs, while the launch window is open. Without a deployment,
//          setup and run cover the control token only.
//   run:   stampede accounts send fire() transactions at --fires-per-sec; each fans out --n
//          ft_transfer receipts to receivers on the same troll (or the control token). Meanwhile
//          probe accounts send direct ft_transfer transactions to the target token and record the
//          exact error when the network rejects them.
// Usage: node --dns-result-order=ipv4first scripts/load.mjs setup
//        node --dns-result-order=ipv4first scripts/load.mjs run --target trolls|control
//          [--seconds 60] [--fires-per-sec 10] [--n 50] [--call-tgas 5] [--probe-per-sec 4] [--out file]
//          [--mix same|uniform] [--amount <yocto>]
//   --mix uniform: each stampede pays receivers on all eight trolls (mostly cross-troll transfers,
//   which need ~16 Tgas per call). The run snapshots receiver balances, burned tolls and in-flight
//   amounts before and after, looks up every fire to see whether it was included, and compares the
//   balances with what the included fires should produce.
// Run scripts/measure.mjs alongside to record per-shard gas and congestion.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchLayout, place } from '../packages/layout/index.js';
import { homeIndex } from '../packages/client/index.js';
import { Near, Account, KeyPair, action, NEAR, TGAS } from './lib/near.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const RPC = 'http://127.0.0.1:3040';
const STATE = resolve(ROOT, 'target/load-localnet.json');
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  target: { type: 'string', default: 'trolls' }, seconds: { type: 'string', default: '60' },
  'fires-per-sec': { type: 'string', default: '10' }, n: { type: 'string', default: '50' },
  'call-tgas': { type: 'string', default: '5' }, 'probe-per-sec': { type: 'string', default: '4' },
  receivers: { type: 'string', default: '16' }, out: { type: 'string' },
  mix: { type: 'string', default: 'same' }, amount: { type: 'string', default: '1' },
} });
const near = new Near(RPC);
// Without a troll deployment, only the control baseline runs; troll names still decide homes.
const DEPLOY = resolve(ROOT, 'target/deploy-localnet.json');
const deployed = existsSync(DEPLOY);
const deploy = deployed ? JSON.parse(readFileSync(DEPLOY)) : { root: 'sandbox', trolls: place('sandbox', await fetchLayout(RPC)) };
const parent = deploy.root;
const sandbox = new Account(near, parent, KeyPair.fromString(JSON.parse(readFileSync(resolve(ROOT, 'target/localnet/validator_key.json'))).secret_key));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const trollOnShard = (shard) => deploy.trolls.find((t) => t.shard === shard).account;
// Same formula as the contracts' home_index (sync, for steering name choice); every chosen
// account is then re-checked with the client's homeIndex.
const homeSync = (id) => Number(BigInt('0x' + createHash('sha256').update(id).digest('hex').slice(0, 32)) % BigInt(deploy.trolls.length));
const homedOnShard = (account, shard) => {
  const i = deploy.trolls.findIndex((t) => t.shard === shard);
  return i >= 0 && homeSync(account) === i;
};
const checkHome = async (h) => {
  const t = deploy.trolls[await homeIndex(h.account, deploy.trolls.length)].account;
  if (t !== h.troll) throw new Error(`${h.account}: home ${t}, expected ${h.troll}`);
  return h;
};

async function setup() {
  const layout = await fetchLayout(RPC);
  const code = readFileSync(resolve(ROOT, 'target/near/stampede/stampede.wasm'));
  const hash = createHash('sha256').update(code).digest();
  await sandbox.send(parent, [action.deployGlobalContract(code)]);
  await sleep(2000);

  const mk = async (t, withStampede) => {
    const key = KeyPair.random();
    const acts = [action.createAccount(), action.transfer(50n * NEAR), action.addFullAccessKey(key.publicKey)];
    if (withStampede) acts.push(action.useGlobalContractByHash(hash), action.functionCall('new', { owner_id: t.account }, 30n * TGAS));
    await sandbox.send(t.account, acts);
    return { account: t.account, shard: t.shard, troll: trollOnShard(t.shard), secret: key.secretKeyString };
  };
  // Fresh direct sub-accounts of the parent, one per troll: on that troll's shard and homed there.
  const taken = deploy.trolls.map((t) => t.account);
  const nextSet = () => { const set = place(parent, layout, { taken, accept: homedOnShard }); taken.push(...set.map((t) => t.account)); return set; };
  const stampedes = [], probes = [];
  for (const t of nextSet()) stampedes.push(await mk(t, true));
  for (const t of nextSet()) probes.push(await mk(t, false));
  const receivers = Array.from({ length: Number(values.receivers) }, nextSet).flat()
    .map((t) => ({ account: t.account, shard: t.shard, troll: trollOnShard(t.shard) }));
  for (const h of [...stampedes, ...probes, ...receivers]) await checkHome(h);

  // Control token, one NEP-141 on one shard.
  const control = place(parent, layout, { taken }).find((t) => t.shard === deploy.trolls[0].shard).account;
  taken.push(control);
  const ctlCode = readFileSync(resolve(ROOT, 'target/near/control/control.wasm'));
  const supply = (10n ** 9n * 10n ** 24n).toString();
  await sandbox.send(control, [action.createAccount(), action.transfer(50n * NEAR), action.deployContract(ctlCode),
    action.functionCall('new', { owner_id: parent, total_supply: supply, symbol: 'CTRL' }, 100n * TGAS)]);

  // Register everyone with storage_deposit: on the control, and on each account's home troll.
  const register = async (contract, ids) => {
    const { min } = await near.view(contract, 'storage_balance_bounds');
    for (let i = 0; i < ids.length; i += 20) {
      await sandbox.send(contract, ids.slice(i, i + 20).map((id) => action.functionCall('storage_deposit', { account_id: id, registration_only: true }, 10n * TGAS, BigInt(min))));
    }
  };
  const holders = [...stampedes, ...probes, ...receivers];
  await register(control, holders.map((h) => h.account));
  if (deployed) for (const t of deploy.trolls) await register(t.account, holders.filter((h) => h.troll === t.account).map((h) => h.account));

  // Funding: control tokens from the owner; troll tokens through the launch claim.
  const each = (10n ** 6n * 10n ** 24n).toString();
  const funded = [...stampedes, ...probes];
  for (let i = 0; i < funded.length; i += 8) {
    await sandbox.send(control, funded.slice(i, i + 8).map((h) => action.functionCall('ft_transfer', { receiver_id: h.account, amount: each }, 10n * TGAS, 1n)));
  }
  for (const h of deployed ? funded : []) {
    // already registered above, so only the claim fee is due
    await new Account(near, h.account, KeyPair.fromString(h.secret)).call(h.troll, 'claim_launch', {}, { gas: 30n * TGAS, deposit: BigInt(deploy.params.claim_fee ?? 0) });
  }
  writeFileSync(STATE, JSON.stringify({ control, stampedes, probes, receivers }, null, 2) + '\n');
  console.log(`setup done${deployed ? '' : ' (control only: no troll deployment)'}: ${stampedes.length} stampedes, ${probes.length} probes, ${receivers.length} receivers, control ${control}; state in ${STATE}`);
}

async function run() {
  if (!existsSync(STATE)) throw new Error('run setup first');
  const S = JSON.parse(readFileSync(STATE));
  const target = values.target;
  if (target === 'trolls' && !deployed) throw new Error('no troll deployment: run deploy.mjs, then setup again');
  if (!['trolls', 'control'].includes(target)) throw new Error('--target trolls|control');
  const seconds = Number(values.seconds), firesPerSec = Number(values['fires-per-sec']), n = Number(values.n);
  const callTgas = BigInt(values['call-tgas']), probePerSec = Number(values['probe-per-sec']);
  const tokenFor = (h) => (target === 'control' ? S.control : h.troll);
  const mix = values.mix, amount = BigInt(values.amount);
  if (!['same', 'uniform'].includes(mix)) throw new Error('--mix same|uniform');
  const recvObjs = (h) => S.receivers.filter((r) => target === 'control' || mix === 'uniform' || r.troll === h.troll);
  const recvFor = (h) => recvObjs(h).map((r) => r.account);
  const toll = target === 'trolls' ? (amount * BigInt(deploy.params.toll_bps)) / 10_000n : 0n;
  // Per fire from stampede h: receivers[j % len] for j < n; count the cross-troll ones.
  const crossPerFire = (h) => { const R = recvObjs(h); let c = 0; for (let j = 0; j < n; j++) if (target === 'trolls' && R[j % R.length].troll !== h.troll) c++; return c; };
  // Each child call also prepays ~1.2 Tgas of send and execution fees on top of its own gas.
  const fireGas = (BigInt(n) * (callTgas * 10n + 15n) * TGAS) / 10n + 20n * TGAS;

  const stampedes = S.stampedes.map((h) => ({ ...h, acct: new Account(near, h.account, KeyPair.fromString(h.secret)) }));
  const probes = S.probes.map((h) => ({ ...h, acct: new Account(near, h.account, KeyPair.fromString(h.secret)) }));
  const fireArgs = (s) => ({ target: tokenFor(s), receivers: recvFor(s), amount: amount.toString(), n, gas_per_call_tgas: Number(callTgas) });
  const before = await snapshot(S, target);
  // Preflight: fires are sent without waiting below, so check one fire fully succeeds first.
  await stampedes[0].acct.send(stampedes[0].account, [action.functionCall('fire', fireArgs(stampedes[0]), fireGas)], 'FINAL');
  let blockHash = await near.latestBlockHash();
  const t0 = Date.now(), end = t0 + seconds * 1000;
  const log = { fires: [], probes: [] };

  const refresher = (async () => { while (Date.now() < end) { await sleep(1000); blockHash = await near.latestBlockHash().catch(() => blockHash); } })();

  const firing = Promise.all(stampedes.map(async (s) => {
    const interval = (1000 * stampedes.length) / firesPerSec;
    for (let next = Date.now(); Date.now() < end; next += interval) {
      await sleep(Math.max(0, next - Date.now()));
      const signed = await s.acct.sign(s.account, [action.functionCall('fire', fireArgs(s), fireGas)], blockHash);
      const t = Date.now() - t0;
      try { await near.sendSigned(signed, 'NONE'); log.fires.push({ t, shard: s.shard, ok: true, hash: signed.hash }); }
      catch (e) { log.fires.push({ t, shard: s.shard, ok: false, kind: e.kind ?? 'error', msg: e.message.slice(0, 300) }); }
    }
  }));

  const probing = Promise.all(probes.map(async (p) => {
    const interval = (1000 * probes.length) / probePerSec;
    for (let next = Date.now(); Date.now() < end; next += interval) {
      await sleep(Math.max(0, next - Date.now()));
      const token = tokenFor(p);
      const signed = await p.acct.sign(token, [action.functionCall('ft_transfer', { receiver_id: recvFor(p)[0], amount: '1' }, 30n * TGAS, 1n)], blockHash);
      const t = Date.now() - t0;
      try {
        await near.sendSigned(signed, 'INCLUDED');
        log.probes.push({ t, token, from_shard: p.shard, ok: true, ms: Date.now() - t0 - t });
      } catch (e) {
        log.probes.push({ t, token, from_shard: p.shard, ok: false, kind: e.kind ?? 'error', msg: e.message.slice(0, 300), ms: Date.now() - t0 - t });
        if (e.kind === 'InvalidNonce') p.acct.nonce = null; // resync
      }
    }
  }));
  await Promise.all([firing, probing, refresher]);

  // Settle: wait for in-flight credits to resolve, then compare with what the accepted fires imply.
  // Wait until nothing is in flight and receiver balances stop changing (a congested shard can take
  // minutes to drain its delayed receipts after the load stops).
  let after, prev = null, stable = 0;
  for (let i = 0; i < 150 && stable < 3; i++) {
    await sleep(2000);
    after = await snapshot(S, target);
    stable = after.in_flight === 0n && prev && after.landed === prev.landed ? stable + 1 : 0;
    prev = after;
  }
  // Inclusion: send_tx with wait NONE accepts a transaction that may never be included, so look
  // every fire up afterwards. Dropped fires explain any landed shortfall.
  const fireOk = log.fires.filter((f) => f.ok);
  for (let i = 0; i < fireOk.length; i += 25) {
    await Promise.all(fireOk.slice(i, i + 25).map(async (f) => {
      const sender = stampedes.find((s) => s.shard === f.shard).account;
      try { await near.rpc('EXPERIMENTAL_tx_status', { tx_hash: f.hash, sender_account_id: sender, wait_until: 'NONE' }); f.included = true; }
      catch { f.included = false; }
    }));
  }
  let expLanded = 0n, expBurned = 0n, crossSent = 0;
  stampedes.forEach((s, idx) => {
    const fires = log.fires.filter((f) => f.included && f.shard === s.shard).length + (idx === 0 ? 1 : 0);
    const cross = crossPerFire(s);
    crossSent += fires * cross;
    expLanded += BigInt(fires) * (BigInt(n) * amount - BigInt(cross) * toll);
    expBurned += BigInt(fires * cross) * toll;
  });
  expLanded += BigInt(log.probes.filter((p) => p.ok).length); // probes send 1 (toll rounds to 0)
  const check = {
    mix, amount: amount.toString(), fires_accepted: fireOk.length, fires_included: fireOk.filter((f) => f.included).length, cross_transfers_sent: crossSent,
    landed: (after.landed - before.landed).toString(), landed_expected: expLanded.toString(),
    burned: (after.burned - before.burned).toString(), burned_expected: expBurned.toString(),
    in_flight_after: after.in_flight.toString(),
  };
  const count = (xs) => xs.reduce((m, x) => ((m[x.ok ? 'ok' : x.kind] = (m[x.ok ? 'ok' : x.kind] ?? 0) + 1), m), {});
  const summary = { target, seconds, fires_per_sec: firesPerSec, n, call_tgas: Number(callTgas), probe_per_sec: probePerSec, fires: count(log.fires), probes: count(log.probes), check };
  const file = values.out ?? resolve(ROOT, `target/load-${target}-${new Date(t0).toISOString().replace(/[:.]/g, '-')}.json`);
  const code = target === 'trolls' ? { troll_wasm_sha256: deploy.troll_code_hash, root_wasm_sha256: deploy.root_code_hash } : {};
  writeFileSync(file, JSON.stringify({ ...summary, ...code, started_at: new Date(t0).toISOString(), ...log }));
  console.log(JSON.stringify(summary));
  console.log(`wrote ${file}`);
}

// Σ receiver balances (at each receiver's home troll, or on the control), Σ troll burned, Σ in-flight.
async function snapshot(S, target) {
  const bal = async (r) => BigInt(await near.view(target === 'control' ? S.control : r.troll, 'ft_balance_of', { account_id: r.account }));
  let landed = 0n;
  for (let i = 0; i < S.receivers.length; i += 16) for (const b of await Promise.all(S.receivers.slice(i, i + 16).map(bal))) landed += b;
  let burned = 0n, in_flight = 0n;
  if (target === 'trolls') {
    for (const ti of await Promise.all(deploy.trolls.map((t) => near.view(t.account, 'info')))) { burned += BigInt(ti.burned); in_flight += BigInt(ti.in_flight); }
  }
  return { landed, burned, in_flight };
}

if (positionals[0] === 'setup') await setup();
else if (positionals[0] === 'run') await run();
else throw new Error('usage: load.mjs setup|run');
