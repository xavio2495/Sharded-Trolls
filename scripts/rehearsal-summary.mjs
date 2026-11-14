#!/usr/bin/env node
// Summary of one localnet rehearsal pass (scripts/rehearse-localnet.sh): every check as pass/fail,
// with the numbers behind it. Copies the raw step records next to it.
// Usage: node scripts/rehearsal-summary.mjs <pass> <logs dir> <out dir>   (the local node must still run)
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Near } from './lib/near.mjs';

const [pass, logs, outDir] = process.argv.slice(2);
const ROOT = resolve(import.meta.dirname, '..');
const R = (p) => resolve(ROOT, 'target/rehearsal', p);
const J = (p) => (existsSync(R(p)) ? JSON.parse(readFileSync(R(p))) : null);
const near = new Near('http://127.0.0.1:3040');
const NEAR = 10n ** 24n;
const tok = (y) => Number(BigInt(y) * 1000n / NEAR) / 1000;
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + JSON.stringify(detail) : ''}`); };
const oneHash = (k7) => new Set(k7.trolls.map((t) => t.global_contract_hash)).size === 1 && k7.trolls.length === 8;

// ---------- K checks ----------
const kdep = J('ka.sandbox/deploy.json'), k7 = J('ka.sandbox/k7.json'), k2 = J('ka.sandbox/k2.json'), k3 = J('ka.sandbox/k3.json'), ks = J('ka.sandbox/settle.json');
const toll = BigInt(kdep.params.toll_bps) * 100n * NEAR / 10_000n; // on 100 tokens
check('K7 one global code, 8 trolls, 8 shards', oneHash(k7) && new Set(k7.trolls.map((t) => t.shard)).size === 8, { hash: k7.trolls[0].global_contract_hash, spent_near: k7.parent_spent_near });
for (const f of k2.fires) check(`K2 fire ${f.label}`, f.pass && f.conservation_after.conserved, { transfers: f.ft_transfer_events, of: f.n, tolls: f.tolls, failed: f.failed_receipts });
const kc = Object.fromEntries(k3.cases.map((c, i) => ['abcde'[i], c]));
const conserved = (c) => c.conserved_before && c.conserved_after && c.in_flight_after === '0';
check('K3a cross transfer: −100, toll paid, conserved', kc.a.sender_delta === String(-100n * NEAR) && kc.a.failed_receipts === 0 && conserved(kc.a), { events: kc.a.events });
check('K3b unregistered receiver: credit fails, full refund', kc.b.sender_delta === '0' && kc.b.events.some((e) => e.endsWith('credit_refunded')) && conserved(kc.b), { errors: kc.b.errors });
check('K3c transfer_call, no ft_on_transfer: sender −toll', kc.c.sender_delta === String(-toll) && conserved(kc.c), { delta: tok(kc.c.sender_delta) });
check('K3d1 100 Tgas, msg 4,096 B: credited, sender −toll', kc.d.sender_delta === String(-toll) && conserved(kc.d), { delta: tok(kc.d.sender_delta) });
check('K3d2 100 Tgas, msg 4,097 B: rejected, nothing debited', kc.e.sender_delta === '0' && kc.e.errors.some((e) => e.includes('msg longer than 4096')) && conserved(kc.e), { errors: kc.e.errors.slice(0, 1) });
check('settle 249 Tgas refused up front, unlocked', ks.attempts[0]?.pass && ks.attempts[0].outcome === 'refused up front, unlocked', { errors: ks.attempts[0]?.errors?.slice(0, 1) });
check('settle 250 Tgas settles', ks.attempts[1]?.pass && ks.attempts[1].outcome === 'settled', { next_epoch: ks.attempts[1]?.next_epoch_after });

// ---------- KIT ----------
const kit7 = J('kit.sandbox/k7.json'), kitDep = J('kit.sandbox/deploy.json');
check('KIT reuses the global code (no code published)', oneHash(kit7) && kit7.trolls[0].global_contract_hash === k7.trolls[0].global_contract_hash && kitDep.global_hash_reused, { hash: kit7.trolls[0].global_contract_hash });
const kitMeta = await near.view('0.kit.sandbox', 'ft_metadata');
check('KIT metadata', kitMeta.symbol === 'KIT', { name: kitMeta.name, symbol: kitMeta.symbol });
const kitCost = { parent_spent_near: Number(kit7.parent_spent_near), locked_for_root_storage_near: kit7.parent_storage_bytes * 1e-5 };
kitCost.per_token_near = +(kitCost.parent_spent_near + kitCost.locked_for_root_storage_near).toFixed(4);

// ---------- Feeding ----------
const fd = (n) => J(`fd.sandbox/feeding-${n}.json`);
const [setup, E0, S0, C0, E1, S1] = ['setup', 'E0', 'S0', 'C0', 'E1', 'S1'].map(fd);
for (const [n, s] of Object.entries({ setup, E0, S0, C0, E1, S1 })) check(`Feeding ${n}: conserved, nothing in flight, per-troll event replay${['S0', 'S1'].includes(n) ? ', root = trolls' : ''}`, s?.assertions?.ok, s?.assertions && { ...s.assertions, replay: undefined });
check('E0: every troll fed by one cross-troll sender; food = toll on each', E0.after.trolls.every((t) => t.senders_this_epoch === 1 && BigInt(t.food) === toll)
  && E0.txs.every((t) => t.events.some((e) => e.endsWith('toll_eaten'))), { food: E0.after.trolls.map((t) => tok(t.food)) });
const ev = (s, name) => s.events.filter((e) => e.event === name);
const settled0 = ev(S0, 'feeding_settled')[0]?.data?.[0];
check('S0: all fed, streak 1', settled0?.fed === true && settled0.senders.every((x) => x >= 1) && S0.after.root.streak === 1, { fed: settled0?.fed, senders: settled0?.senders, streak: S0.after.root.streak });
check('S0: rewards draw on food first, then the launch pool', ev(S0, 'reward_from_food').length === 8 && ev(S0, 'reward_from_launch_pool').length === 8,
  { from_food: ev(S0, 'reward_from_food').map((e) => tok(e.data?.[0]?.amount ?? 0)), from_pool: ev(S0, 'reward_from_launch_pool').map((e) => tok(e.data?.[0]?.amount ?? 0)), food_after: S0.after.trolls.map((t) => tok(t.food)) });
const bounty = BigInt(S0.bounty_yocto ?? 0), burnt = BigInt(S0.gas_burnt_yocto), delta = BigInt(S0.settler_delta_yocto);
const skipped0 = ev(S0, 'settle_bounty_skipped')[0]?.data?.[0];
if (skipped0) console.log(`note: S0 settle_bounty_skipped, reason ${skipped0.reason}`);
check('S0: settle bounty paid to the settler', ev(S0, 'settle_bounty_paid').length === 1 && bounty === BigInt(kdep.params.settle_bounty ?? 0) && delta === bounty - burnt,
  { bounty_near: Number(bounty) / 1e24, gas_burnt_near: Number(burnt) / 1e24, settler_change_near: Number(delta) / 1e24 });
check('C0: each feeder paid its share', C0.txs.length === 8 && C0.txs.every((t) => BigInt(t.share) > 0n), { shares: C0.txs.map((t) => tok(t.share)),
  leftover_to_food: (C0.events ?? []).filter((e) => e.event === 'reward_leftover_to_food').map((e) => tok(e.data?.[0]?.amount ?? 0)) });
check('E1: 7 trolls fed, troll 7 hungry', E1.after.trolls.filter((t) => t.senders_this_epoch === 1).length === 7 && E1.after.trolls[7].senders_this_epoch === 0);
const settled1 = ev(S1, 'feeding_settled')[0]?.data?.[0];
const starved = ev(S1, 'troll_starved');
const burn7 = BigInt(S1.after.trolls[7].burned) - BigInt(S1.before.trolls[7].burned);
check('S1: troll 7 starves, burns 1% of its hoard, streak 0', settled1?.fed === false && settled1.senders.filter((x) => x === 0).length === 1 && settled1.senders[7] === 0
  && starved.length === 1 && starved[0].data?.[0]?.troll === S1.after.trolls[7].account
  && burn7 === BigInt(S1.before.trolls[7].hoard) * BigInt(kdep.params.starve_burn_bps) / 10_000n && S1.after.root.streak === 0,
  { fed: settled1?.fed, senders: settled1?.senders, burned: tok(burn7), streak: S1.after.root.streak });

// ---------- Drills ----------
const dst = J('0st.sandbox/drill-settle-timeout.json');
check('drill: stuck settlement refused, then expired after 600 blocks and settled', dst?.pass, dst && { steps: dst.steps });
const dr7 = J('dr.sandbox/k7.json'), drLog = readFileSync(resolve(logs, 'dr-deploy.log'), 'utf8'), drResume = readFileSync(resolve(logs, 'dr-resume.log'), 'utf8');
const created = (drResume.match(/create /g) ?? []).length;
check('drill: injected 429 at send #7 stops the deploy; resume creates the rest; one code hash', drLog.includes('Rate limits exceeded (injected') && created > 0 && oneHash(dr7),
  { trolls_before_resume: 8 - created, created_by_resume: created, hash: dr7.trolls[0].global_contract_hash });
const unLog = readFileSync(resolve(logs, 'un-deploy.log'), 'utf8');
check('drill: underfunded parent refused before sending anything', unLog.includes('nothing was sent') && !(await near.accountExists('0.un.sandbox')), { message: unLog.match(/needs [0-9.]+ more NEAR/)?.[0] });

const sw = J('sw.sandbox/feeding-drill-sweep.json');
check('drill: unregister with an unclaimed reward refused; late claim refused; sweep moves the remainder to food', sw?.pass,
  sw && { claim_epochs: sw.claim_epochs, deadline_epoch: sw.deadline, unregister_after_events: sw.steps[4]?.events, unregister: sw.steps[0].errors?.[0]?.match(/Smart contract panicked: [^"\\]*/)?.[0], late_claim: sw.steps[1].errors?.[0]?.match(/Smart contract panicked: [^"\\]*/)?.[0],
    swept: sw.steps.slice(2, 4).map((x) => tok(x.reward_expired?.[0]?.amount ?? 0)), food_change: sw.food_change.map(tok), unregister_after_sweep_failed_receipts: sw.steps[4]?.failed_receipts });
const mmLog = readFileSync(resolve(logs, 'mismatch-deploy.log'), 'utf8');
check('drill: --global-hash differing from the local troll.wasm is refused', mmLog.includes('differs from --global-hash') && mmLog.includes('nothing was sent'));

// ---------- write ----------
const summary = { pass: Number(pass), at: new Date().toISOString(), network: 'localnet (near-sandbox, mainnet 10-shard layout)', troll_code_hash: kdep.troll_code_hash,
  all_pass: checks.every((c) => c.ok), checks, kit_cost: kitCost, feeding_params: J('fd.sandbox/deploy.json').params };
writeFileSync(resolve(ROOT, outDir, `rehearsal-${pass}-summary.json`), JSON.stringify(summary, null, 2) + '\n');
for (const [src, name] of [['out/k-tests.json', 'k-tests'], ['out/feeding.json', 'feeding'], ['0st.sandbox/drill-settle-timeout.json', 'drill-settle-timeout'],
  ['kit.sandbox/k7.json', 'kit-k7'], ['dr.sandbox/k7.json', 'drill-resume-k7']]) {
  if (existsSync(R(src))) copyFileSync(R(src), resolve(ROOT, outDir, `rehearsal-${pass}-${name}.json`));
}
console.log(`${summary.all_pass ? 'ALL PASS' : 'SOME CHECKS FAILED'}: ${checks.filter((c) => c.ok).length}/${checks.length}; wrote ${outDir}/rehearsal-${pass}-*.json`);
if (!summary.all_pass) process.exit(2);
