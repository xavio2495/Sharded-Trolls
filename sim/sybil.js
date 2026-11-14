// Sybil and unclaimed-launch-pool study: runs the Feeding model with a profit-seeking bot farmer
// and with a streak-keeping farmer against each mitigation variant, and the four ways to handle
// the unclaimed launch pool. Writes sim/out/sybil.json and sim/out/sybil.csv.
// Run: node --max-old-space-size=2048 sim/sybil.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_PARAMS as D, COSTS, simulate } from './model.js';
import { SCENARIOS } from './scenarios.js';

const OUT = new URL('./out/', import.meta.url);
const DAYS = 60, SEEDS = 10;
const PRICES = [1e-7, 1e-6, 1e-5, 1e-4]; // NEAR per token; x 1e9 supply = FDV 100 .. 100,000 NEAR
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
mkdirSync(OUT, { recursive: true });

function run(params, scenario) {
  const s = Array.from({ length: SEEDS }, (_, i) => simulate(params, scenario, { days: DAYS, seed: i + 1 }).summary);
  const avg = {};
  for (const k of Object.keys(s[0])) if (typeof s[0][k] === 'number') avg[k] = mean(s.map((x) => x[k]));
  return avg;
}

const VARIANTS = {
  'as built': {},
  'counted burn 1000': { counted_burn: 1000 },
  'counted burn 3125 (pool per troll / target)': { counted_burn: D.reward_per_epoch / D.troll_count / D.feed_target },
  'cap 500 per feeder': { reward_cap_per_feeder: 500 },
  'stake-weighted split': { reward_split: 'stake' },
  'count after 1 epoch held': { count_min_age: 1 },
  'reward from tolls': { reward_source: 'toll' },
  'reward from unclaimed pool': { unclaimed_at_close: 'reward' },
};

const rows = [];
// A. profit-seeking farmer: adds bots while the marginal bot earns more than it costs
for (const scen of ['enthusiastic', 'decaying']) {
  for (const price of PRICES) {
    for (const [name, v] of Object.entries(VARIANTS)) {
      const r = run(v, { ...SCENARIOS[scen], harvest: { price } });
      const honestPerDay = r.honest_feeder_days ? r.honest_reward / r.honest_feeder_days : 0;
      rows.push({
        study: 'harvest', scenario: scen, price, variant: name,
        bots: Math.round(r.bots),
        farm_cost_near: +r.farm_cost_near.toFixed(3),
        farm_profit_near: +(price * (r.farm_reward - r.farm_burned) - r.farm_cost_near).toFixed(3),
        farm_share_of_reward: +(r.farm_reward / Math.max(1, r.farm_reward + r.honest_reward)).toFixed(3),
        honest_reward_per_feeder_day: Math.round(honestPerDay),
        honest_burned: Math.round(r.honest_burned),
        honest_top_decile_share: +r.honest_top_decile_share.toFixed(3),
        fed_share: +(r.fed_epochs / DAYS).toFixed(3),
        supply_end: Math.round(r.supply_end),
      });
    }
  }
}

// B. streak keeper: no price, tops every troll up to the target (zero-organic and decaying cases)
const nobody = { label: 'No users', holders: 0, localBias: 0, active: () => 0, farm: true };
for (const [scenName, scen] of [['bot-farmed', SCENARIOS['bot-farmed']], ['no users', nobody]]) {
  for (const [name, v] of Object.entries(VARIANTS)) {
    const r = run(v, scen);
    rows.push({
      study: 'streak', scenario: scenName, price: '', variant: name,
      bots: Math.round(r.bots), farm_cost_near: +r.farm_cost_near.toFixed(3),
      farm_tokens_burned: Math.round(r.farm_burned), farm_reward: Math.round(r.farm_reward),
      fed_share: +(r.fed_epochs / DAYS).toFixed(3), supply_end: Math.round(r.supply_end),
    });
  }
}

// C. D16: what happens to the launch pool left unclaimed when the window closes
const D16 = { '1 locked': 'locked', '2 sweep to hoard': 'hoard', '3 burn': 'burn', '4 funds the reward': 'reward' };
for (const scen of Object.keys(SCENARIOS)) {
  for (const [name, mode] of Object.entries(D16)) {
    const r = run({ unclaimed_at_close: mode }, SCENARIOS[scen]);
    rows.push({
      study: 'd16', scenario: scen, price: '', variant: name,
      unclaimed_at_close: Math.round(r.launch_unclaimed + r.close_burned + r.close_to_hoard + r.reward_from_launch_pool),
      still_locked_day60: Math.round(r.launch_unclaimed),
      burned_at_close: Math.round(r.close_burned), to_hoard: Math.round(r.close_to_hoard),
      reward_from_pool: Math.round(r.reward_from_launch_pool), minted: Math.round(r.minted),
      starve_burned: Math.round(r.starve_burned), supply_end: Math.round(r.supply_end),
      fed_share: +(r.fed_epochs / DAYS).toFixed(3),
    });
  }
}

// D. launch-claim Sybil: bots take a share of every troll's claims before holders arrive
for (const share of [0, 0.25, 0.5, 1]) {
  const r = run({}, { ...SCENARIOS.enthusiastic, launchFarm: share });
  const honestClaimed = D.launch_supply - r.launch_unclaimed - r.farm_launch;
  rows.push({
    study: 'launch', scenario: 'enthusiastic', price: '', variant: `bots claim ${share * 100}% first`,
    farm_launch_tokens: Math.round(r.farm_launch), farm_cost_near: +r.farm_cost_near.toFixed(2),
    honest_claimed: Math.round(honestClaimed), unclaimed: Math.round(r.launch_unclaimed),
    fed_share: +(r.fed_epochs / DAYS).toFixed(3),
  });
}

const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
writeFileSync(new URL('sybil.csv', OUT), [cols.join(','), ...rows.map((r) => cols.map((c) => r[c] ?? '').join(','))].join('\n') + '\n');
writeFileSync(new URL('sybil.json', OUT), JSON.stringify({ days: DAYS, seeds: SEEDS, costs: COSTS, params: D, rows }, null, 1));
for (const study of ['harvest', 'streak', 'd16', 'launch']) {
  console.log(`\n== ${study}`);
  console.table(rows.filter((r) => r.study === study).map(({ study: _, ...r }) => r));
}
