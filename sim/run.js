// 60-day Feeding simulation: runs every scenario over many seeds with the proposed parameters,
// sweeps each parameter one at a time, and writes CSV, JSON and SVG plots to sim/out/.
// Run: node --max-old-space-size=2048 sim/run.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_PARAMS, COSTS, simulate } from './model.js';
import { SCENARIOS } from './scenarios.js';
import { doc, legend, panel, lines, bars } from './svg.js';

const OUT = new URL('./out/', import.meta.url);
const DAYS = 60, SEEDS = 30, SWEEP_SEEDS = 10;
export const PROPOSED = { ...DEFAULT_PARAMS };

const keys = Object.keys(SCENARIOS);
const CLS = Object.fromEntries(keys.map((k, i) => [k, `s${i + 1}`]));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const M = (v) => `${+(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
const pct = (v) => `${Math.round(v * 100)}%`;
mkdirSync(OUT, { recursive: true });
const write = (name, text) => writeFileSync(new URL(name, OUT), text);
const csv = (rows) => [Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).join(','))].join('\n') + '\n';

// Cost in NEAR for a Sybil to close every organic shortfall (bots only where organic < target).
function gapCost(rows, P) {
  const maxGap = Array(P.troll_count).fill(0);
  let sends = 0;
  for (const r of rows) r.senders.forEach((c, t) => {
    const g = Math.max(0, P.feed_target - c);
    sends += g;
    maxGap[t] = Math.max(maxGap[t], g);
  });
  return sends * COSTS.fee_per_transfer + maxGap.reduce((a, b) => a + b, 0) * COSTS.setup_per_bot;
}

function aggregate(P, scenario, seeds) {
  const runs = Array.from({ length: seeds }, (_, i) => simulate(P, scenario, { days: DAYS, seed: i + 1 }));
  const s = runs.map((r) => r.summary);
  return {
    runs,
    fed_share: mean(s.map((x) => x.fed_epochs / DAYS)),
    best_streak: mean(s.map((x) => x.best_streak)),
    supply_change: mean(s.map((x) => x.supply_end / P.total_supply - 1)),
    minted: mean(s.map((x) => x.minted)),
    toll_burned: mean(s.map((x) => x.toll_burned)),
    starve_burned: mean(s.map((x) => x.starve_burned)),
    launch_unclaimed: mean(s.map((x) => x.launch_unclaimed / P.launch_supply)),
    sybil_gap_near: scenario.farm ? mean(s.map((x) => x.farm_cost_near)) : mean(runs.map((r) => gapCost(r.rows, P))),
    farm_reward: mean(s.map((x) => x.farm_reward)),
    max_ledger_error: Math.max(...s.map((x) => Math.abs(x.ledger - x.supply_end))),
  };
}

// 1. Proposed parameters, all scenarios.
const results = Object.fromEntries(keys.map((k) => [k, aggregate(PROPOSED, SCENARIOS[k], SEEDS)]));
for (const k of keys) {
  write(`daily-${k}.csv`, csv(results[k].runs[0].rows.map(({ senders, ...r }) => ({ ...r, senders: senders.join(' ') }))));
}

// 2. One-at-a-time sweep around the proposal.
const SWEEP = {
  feed_target: [5, 10, 15, 20, 30, 40, 60, 80],
  reward_per_epoch: [1e5, 2.5e5, 5e5, 1e6],
  starve_burn_bps: [25, 50, 100, 200],
  toll_bps: [0, 10, 25, 50, 100],
  launch_claim_amount: [2.5e4, 5e4, 1e5, 2e5],
};
const sweep = [];
for (const [param, values] of Object.entries(SWEEP)) {
  for (const value of values) {
    for (const k of keys) {
      const a = aggregate({ ...PROPOSED, [param]: value }, SCENARIOS[k], SWEEP_SEEDS);
      const { runs, max_ledger_error, ...rest } = a;
      sweep.push({ param, value, scenario: k, ...Object.fromEntries(Object.entries(rest).map(([x, v]) => [x, +v.toPrecision(5)])) });
    }
  }
}
write('sweep.csv', csv(sweep));

// Launch size: how many holders a given feed_target needs.
const sizes = [];
for (const k of ['enthusiastic', 'decaying']) {
  for (const holders of [250, 500, 1000, 2000, 4000]) {
    for (const feed_target of [3, 5, 10, 20, 40]) {
      const a = aggregate({ ...PROPOSED, feed_target }, { ...SCENARIOS[k], holders }, SWEEP_SEEDS);
      sizes.push({ scenario: k, holders, feed_target, fed_share: +a.fed_share.toFixed(3), best_streak: +a.best_streak.toFixed(1) });
    }
  }
}
write('launch-size.csv', csv(sizes));

// 3. Plots.
const W = 760;
const seriesLabel = (k) => SCENARIOS[k].label;
{
  const all = keys.flatMap((k) => results[k].runs[0].rows.map((r) => r.supply));
  const lo = Math.floor(Math.min(...all) / 5e7) * 5e7;
  const p = panel({ x: 70, y: 90, w: 520, h: 280, xMax: DAYS - 1, yMin: lo, yMax: Math.max(...all), xTicks: [0, 10, 20, 30, 40, 50, 59], yFmt: M, xLabel: 'day', yLabel: 'total supply (tokens)' });
  const body = p.svg + lines(p, keys.map((k) => ({ cls: CLS[k], label: seriesLabel(k), points: results[k].runs[0].rows.map((r) => [r.day, r.supply]) })), { fmt: M, xName: 'day' })
    + legend(70, 420, keys.map((k) => ({ label: seriesLabel(k), cls: CLS[k] })));
  write('supply.svg', doc(W, 440, 'Total supply over 60 days', 'One run (seed 1) per scenario with the proposed parameters; starts at 1,000M', body));
}
{
  let body = '';
  const yMax = Math.max(PROPOSED.feed_target * 2, ...keys.flatMap((k) => results[k].runs[0].rows.map((r) => r.min_senders)));
  keys.forEach((k, i) => {
    const p = panel({ x: 70 + (i % 2) * 360, y: 100 + Math.floor(i / 2) * 230, w: 280, h: 150, xMax: DAYS - 1, yMax, xTicks: [0, 20, 40, 59], title: seriesLabel(k), xLabel: i >= 2 ? 'day' : '' });
    body += p.svg + `<line class="ref" x1="${p.sx(0)}" x2="${p.sx(DAYS - 1)}" y1="${p.sy(PROPOSED.feed_target)}" y2="${p.sy(PROPOSED.feed_target)}"/>`
      + `<text class="t2" x="${p.sx(DAYS - 1)}" y="${p.sy(PROPOSED.feed_target) - 5}" text-anchor="end">feed target ${PROPOSED.feed_target}</text>`
      + lines(p, [{ cls: CLS[k], label: 'least-fed troll', points: results[k].runs[0].rows.map((r) => [r.day, r.min_senders]) }], { endLabels: false, xName: 'day' });
  });
  write('senders.svg', doc(W, 580, 'Distinct senders at the least-fed troll, per day', 'Below the dashed line that troll starves and the streak resets. Bot-farmed includes bot senders. Seed 1.', body));
}
{
  const BINS = [[1, 1, '1'], [2, 3, '2-3'], [4, 7, '4-7'], [8, 15, '8-15'], [16, 31, '16-31'], [32, 59, '32-59'], [60, 60, '60']];
  let body = '';
  const counts = Object.fromEntries(keys.map((k) => {
    const all = results[k].runs.flatMap((r) => r.summary.streaks);
    return [k, BINS.map(([a, b]) => all.filter((x) => x >= a && x <= b).length / SEEDS)];
  }));
  const yMax = Math.max(1, ...Object.values(counts).flat());
  keys.forEach((k, i) => {
    const p = panel({ x: 70 + (i % 2) * 360, y: 100 + Math.floor(i / 2) * 230, w: 280, h: 150, xMax: BINS.length, yMax, xTicks: [], title: seriesLabel(k), yFmt: (v) => v.toFixed(1) });
    body += p.svg + bars(p, BINS.map(([, , name], b) => ({ name, bars: [{ cls: CLS[k], value: counts[k][b], label: 'streaks per run', showValue: counts[k][b] > 0 }] })), { fmt: (v) => (v < 0.1 ? '<0.1' : v.toFixed(1)) });
  });
  write('streaks.svg', doc(W, 580, 'Streak lengths (days all eight trolls stayed fed in a row)', `Average number of streaks per 60-day run, by length; ${SEEDS} runs per scenario. 60 = never starved.`, body));
}
{
  const groups = keys.map((k) => ({ name: seriesLabel(k), bars: [
    { cls: 'mint', value: results[k].minted, label: 'minted (rewards)', showValue: true },
    { cls: 'burn', value: results[k].toll_burned + results[k].starve_burned, label: `burned (toll ${M(results[k].toll_burned)} + starve ${M(results[k].starve_burned)})`, showValue: true },
  ] }));
  const yMax = Math.max(...groups.flatMap((g) => g.bars.map((b) => b.value)));
  const p = panel({ x: 70, y: 90, w: 620, h: 260, xMax: keys.length, yMax, xTicks: [], yFmt: M, yLabel: 'tokens over 60 days' });
  const body = p.svg + bars(p, groups, { fmt: M }) + legend(70, 410, [{ label: 'Minted (feeder rewards)', cls: 'mint' }, { label: 'Burned (toll + starving hoards)', cls: 'burn' }]);
  write('flows.svg', doc(W, 430, 'Mints vs burns over 60 days', `Mean of ${SEEDS} runs per scenario with the proposed parameters`, body));
}
{
  const vals = SWEEP.feed_target;
  const p = panel({ x: 70, y: 90, w: 520, h: 260, xMax: vals[vals.length - 1], yMax: 1, xTicks: vals, yFmt: pct, xLabel: 'feed_target (distinct senders per troll per day)', yLabel: 'share of days all eight trolls were fed' });
  const body = p.svg
    + `<line class="ref" x1="${p.sx(PROPOSED.feed_target)}" x2="${p.sx(PROPOSED.feed_target)}" y1="${p.sy(0)}" y2="${p.sy(1)}"/><text class="t2" x="${p.sx(PROPOSED.feed_target) + 4}" y="${p.sy(1) + 12}">proposed</text>`
    + lines(p, keys.map((k) => ({ cls: CLS[k], label: seriesLabel(k), points: vals.map((v) => [v, sweep.find((r) => r.param === 'feed_target' && r.value === v && r.scenario === k).fed_share]) })), { fmt: pct, xName: 'feed_target' })
    + legend(70, 410, keys.map((k) => ({ label: seriesLabel(k), cls: CLS[k] })));
  write('fed-vs-target.svg', doc(W, 430, 'How often every troll is fed, by feed_target', `Mean of ${SWEEP_SEEDS} runs per point; Enthusiastic and Bot-farmed overlap at 100% (the farmer tops up)`, body));
}

// 4. Summary.
const P = PROPOSED;
const sybilFull = {
  near_per_day: P.troll_count * P.feed_target * COSTS.fee_per_transfer,
  setup_near: P.troll_count * P.feed_target * COSTS.setup_per_bot,
  tokens_per_day: P.reward_per_epoch,
};
const summary = {
  generated: new Date().toISOString().slice(0, 10), days: DAYS, seeds: SEEDS, params: P, costs: COSTS, sybil_full: sybilFull,
  scenarios: Object.fromEntries(keys.map((k) => { const { runs, ...rest } = results[k]; return [k, { note: SCENARIOS[k].note, ...rest }]; })),
};
write('summary.json', JSON.stringify(summary, null, 2) + '\n');

console.log(`params: ${JSON.stringify(P)}`);
console.log('scenario'.padEnd(20) + 'fed days  best streak  supply Δ   minted   toll burn  starve burn  launch left  Sybil NEAR');
for (const k of keys) {
  const r = results[k];
  console.log(k.padEnd(20) + pct(r.fed_share).padStart(8) + r.best_streak.toFixed(1).padStart(13) + `${(r.supply_change * 100).toFixed(1)}%`.padStart(10)
    + M(r.minted).padStart(9) + M(r.toll_burned).padStart(11) + M(r.starve_burned).padStart(13) + pct(r.launch_unclaimed).padStart(13) + r.sybil_gap_near.toFixed(2).padStart(12));
}
const farm = results['bot-farmed'];
console.log(`Sybil, all 8 fed from zero: ${sybilFull.near_per_day.toFixed(3)} NEAR/day + ${sybilFull.setup_near.toFixed(2)} NEAR setup, for ${M(sybilFull.tokens_per_day)} tokens/day`);
console.log(`Bot farmer: ${farm.sybil_gap_near.toFixed(2)} NEAR for ${M(farm.farm_reward)} tokens (break-even ${(farm.sybil_gap_near / farm.farm_reward).toExponential(2)} NEAR/token)`);
console.log(`max ledger error: ${Math.max(...keys.map((k) => results[k].max_ledger_error)).toExponential(1)} tokens`);
console.log(`wrote ${OUT.pathname}`);
