import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, DEFAULT_PARAMS as P } from './model.js';
import { SCENARIOS } from './scenarios.js';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const always = (p) => ({ holders: 2000, localBias: 0, active: () => p });

test('ledger: balances + hoards + launch pools equal supply in every scenario', () => {
  for (const s of Object.values(SCENARIOS)) {
    const { summary } = simulate({}, s, { seed: 7 });
    close(summary.ledger, summary.supply_end);
    close(summary.supply_end, P.total_supply - summary.toll_burned - summary.starve_burned + summary.minted);
  }
});

test('same seed, same result', () => {
  assert.deepEqual(simulate({}, SCENARIOS.decaying, { seed: 3 }).summary, simulate({}, SCENARIOS.decaying, { seed: 3 }).summary);
});

test('all fed every day: streak = days, mint = reward x days, no starve burn', () => {
  const { summary } = simulate({ feed_target: 1 }, always(0.5), { days: 30 });
  assert.equal(summary.best_streak, 30);
  assert.deepEqual(summary.streaks, [30]);
  close(summary.minted, P.reward_per_epoch * 30);
  assert.equal(summary.starve_burned, 0);
});

test('nobody sends: every troll burns starve_burn_bps of its hoard each day', () => {
  const { summary } = simulate({}, always(0), { days: 10 });
  const hoard = P.total_supply - P.launch_supply;
  close(summary.starve_burned, hoard * (1 - (1 - P.starve_burn_bps / 10_000) ** 10));
  assert.equal(summary.minted, 0);
  assert.equal(summary.best_streak, 0);
});

test('toll burns only on cross-troll transfers', () => {
  assert.equal(simulate({ toll_bps: 0 }, always(0.5), { days: 5 }).summary.toll_burned, 0);
  assert.equal(simulate({}, { ...always(0.5), homeWeights: [1, 0, 0, 0, 0, 0, 0, 0] }, { days: 5 }).summary.toll_burned, 0);
  assert.ok(simulate({}, always(0.5), { days: 5 }).summary.toll_burned > 0);
});

test('farmer keeps every troll at the target and pays for it', () => {
  const { rows, summary } = simulate({}, SCENARIOS['bot-farmed'], { seed: 1 });
  assert.equal(summary.fed_epochs, rows.length);
  for (const r of rows) assert.ok(r.min_senders >= P.feed_target);
  assert.ok(summary.farm_cost_near > 0 && summary.farm_reward > 0);
});

test('variants keep the ledger exact', () => {
  const variants = [
    { counted_burn: 500 }, { count_min_age: 2 }, { reward_cap_per_feeder: 1000 },
    { reward_source: 'toll' }, { unclaimed_at_close: 'hoard' }, { unclaimed_at_close: 'burn' },
    { unclaimed_at_close: 'reward' },
  ];
  const scen = [SCENARIOS.decaying, { ...SCENARIOS.decaying, holders: 1500, harvest: { price: 1e-5 } },
    { ...SCENARIOS.enthusiastic, launchFarm: 0.5 }];
  for (const v of variants) for (const s of scen) {
    const { summary: x } = simulate(v, s, { seed: 5, days: 20 });
    close(x.ledger, x.supply_end, 1e-2);
  }
});

test('toll-funded reward mints nothing; pool-funded reward drains the launch pool first', () => {
  assert.equal(simulate({ reward_source: 'toll', feed_target: 1 }, always(0.5), { days: 10 }).summary.minted, 0);
  const r = simulate({ unclaimed_at_close: 'reward', feed_target: 1 }, { ...always(0.5), holders: 500 }, { days: 10 }).summary;
  assert.ok(r.reward_from_launch_pool > 0);
  close(r.minted + r.reward_from_launch_pool, P.reward_per_epoch * 10, 1e-2);
});

test('harvesting farmer adds bots beyond the target when the token has a price', () => {
  const base = { ...SCENARIOS.enthusiastic, harvest: { price: 1e-4 } };
  const { summary: x } = simulate({}, base, { seed: 2, days: 10 });
  assert.ok(x.bots > 8 * P.feed_target && x.farm_reward > x.honest_reward);
});

test('stake split: bots holding the minimum earn almost nothing, the ledger stays exact', () => {
  const { summary: x } = simulate({ reward_split: 'stake' }, SCENARIOS['bot-farmed'], { seed: 3, days: 30 });
  close(x.ledger, x.supply_end, 1e-2);
  assert.ok(x.farm_reward < 1e-3 * x.honest_reward);
});
