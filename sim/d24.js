// Launch claim sizing with a claim fee, when the unclaimed launch pool funds the Feeding reward once
// the launch window has closed (pool first, then mint). For each claim size and fee: the token price above which bots claiming the pool
// pays, the cost of draining the whole pool, and (sim, 60 days) how long the pool keeps funding the
// reward. Writes sim/out/d24.csv and sim/out/d24.json.
// Run: node --max-old-space-size=2048 sim/d24.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_PARAMS as D, simulate } from './model.js';
import { SCENARIOS } from './scenarios.js';

const OUT = new URL('./out/', import.meta.url);
const DAYS = 60, SEEDS = 10;
// Gas for one claim_launch that also registers the account: ~5 Tgas at 1e8 yocto/gas. The
// registration deposit is refunded on unregister, so it is not counted as a bot cost.
const CLAIM_GAS_NEAR = 0.0005;
const CLAIMS = [100, 1000, 2500, 10000, 100000];
const FEES = [0, 0.001, 0.005, 0.01, 0.05];
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
mkdirSync(OUT, { recursive: true });

const rows = [];
for (const claim of CLAIMS) {
  const sims = {};
  for (const [k, s] of Object.entries(SCENARIOS)) {
    const runs = Array.from({ length: SEEDS }, (_, i) => simulate({ launch_claim_amount: claim, unclaimed_at_close: 'reward' }, s, { days: DAYS, seed: i + 1 }).summary);
    const left = mean(runs.map((r) => r.launch_unclaimed));
    const drawn = mean(runs.map((r) => r.reward_from_launch_pool)) / DAYS; // per day
    sims[k] = {
      claimed: D.launch_supply - left - mean(runs.map((r) => r.reward_from_launch_pool)),
      pool_day60: left,
      minted: mean(runs.map((r) => r.minted)),
      // days the pool keeps funding at the full reward rate (all fed); per-troll pools can run out earlier
      pool_days_at_full_reward: Math.round((D.launch_supply - (D.launch_supply - left - mean(runs.map((r) => r.reward_from_launch_pool)))) / D.reward_per_epoch),
      fed_share: mean(runs.map((r) => r.fed_epochs / DAYS)),
      drawn_per_day: drawn,
    };
  }
  for (const fee of FEES) {
    const perClaim = fee + CLAIM_GAS_NEAR;
    const price = perClaim / claim;
    rows.push({
      claim, fee_near: fee,
      bot_breakeven_price: +price.toPrecision(3),
      bot_breakeven_fdv_near: Math.round(price * D.total_supply),
      drain_pool_cost_near: Math.round((D.launch_supply / claim) * perClaim),
      claims_to_drain: D.launch_supply / claim,
      honest_cost_near: perClaim,
      ...Object.fromEntries(Object.entries(sims).flatMap(([k, v]) => [
        [`${k}_claimed_M`, +(v.claimed / 1e6).toFixed(1)],
        [`${k}_pool_days`, v.pool_days_at_full_reward],
        [`${k}_minted_M`, +(v.minted / 1e6).toFixed(2)],
        [`${k}_fed`, +v.fed_share.toFixed(2)],
      ])),
    });
  }
}
const cols = Object.keys(rows[0]);
writeFileSync(new URL('d24.csv', OUT), [cols.join(','), ...rows.map((r) => cols.map((c) => r[c]).join(','))].join('\n') + '\n');
writeFileSync(new URL('d24.json', OUT), JSON.stringify({ days: DAYS, seeds: SEEDS, claim_gas_near: CLAIM_GAS_NEAR, params: D, rows }, null, 1));
console.table(rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.endsWith('_fed')))));
