// Day-by-day model of the Feeding: launch claims, transfers with a cross-troll toll, distinct-sender
// counting, settlement (reward mint when all trolls are fed, hoard burn for each starved troll),
// optional bot farmer that tops up starving trolls. Amounts are whole tokens as floats; the
// contract works in integer yocto units, so its integer-division remainders are ignored here.

export const DEFAULT_PARAMS = {
  troll_count: 8,
  total_supply: 1e9,
  launch_supply: 5e8,
  toll_bps: 25,
  feed_target: 10,
  reward_per_epoch: 2.5e5,
  starve_burn_bps: 100,
  launch_claim_amount: 1e5,
  min_counted_transfer: 1,
  launch_window_epochs: 1,
  // Variants studied for Sybil resistance; the defaults reproduce the contract as built.
  counted_burn: 0, // tokens burned from the sender on each counted send (0 = off)
  count_min_age: 0, // a holder counts only after holding tokens this many epochs
  reward_split: 'equal', // 'equal' per feeder | 'stake': by the feeder's balance at settlement (bots hold min_counted_transfer)
  reward_cap_per_feeder: Infinity, // tokens; the part of a troll's pool above the cap is not paid
  reward_source: 'mint', // 'mint' | 'toll' (the epoch's tolls fund the reward instead of burning) | 'launch_pool'
  unclaimed_at_close: 'locked', // launch pool at window close: 'locked' | 'hoard' | 'burn' | 'reward'
  claim_fee_near: 0, // NEAR paid (not refunded) per launch claim
};

// Values for a real launch: the parameters above with the sized launch claim and its fee
// (a small starter bag; bots claiming the pool pay only above a token price of ~1e-5 NEAR).
// settle_bounty_near: NEAR the root pays whoever settles an epoch (read by builds that support it).
export const LAUNCH_PARAMS = { ...DEFAULT_PARAMS, launch_claim_amount: 1000, claim_fee_near: 0.01, settle_bounty_near: 0.005 };

// Cost assumptions for a bot farmer, in NEAR. Gas: ~2.5 Tgas per counted transfer at the 1e8
// yocto/gas floor price. Setup: account creation plus storage for one balance entry.
export const COSTS = { fee_per_transfer: 0.00025, setup_per_bot: 0.002 };

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// scenario: { holders, homeWeights?, localBias, active(day, rand) -> probability, farm? }
export function simulate(params, scenario, { days = 60, seed = 1 } = {}) {
  const P = { ...DEFAULT_PARAMS, ...params };
  const n = P.troll_count;
  const rand = rng(seed);
  const weights = scenario.homeWeights ?? Array(n).fill(1);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const pickHome = () => {
    let x = rand() * wsum;
    for (let t = 0; t < n; t++) if ((x -= weights[t]) < 0) return t;
    return n - 1;
  };

  const holders = Array.from({ length: scenario.holders }, () => ({ home: pickHome(), bal: 0, counted: -1, since: Infinity }));
  const byTroll = Array.from({ length: n }, () => []);
  holders.forEach((h, i) => byTroll[h.home].push(i));

  const launchPool = Array(n).fill(P.launch_supply / n);
  const hoard = Array(n).fill((P.total_supply - P.launch_supply) / n);
  const bots = Array(n).fill(0); // bot accounts created per troll
  const farm = { cost: 0, reward: 0, sends: 0, burned: 0, launch: 0 };
  const honest = { reward: 0, feederDays: 0, burned: 0, topDecile: 0 };
  const fromPool = P.reward_source === 'launch_pool' || P.unclaimed_at_close === 'reward';
  let countedBurned = 0, closeBurned = 0, closeToHoard = 0, poolPaid = 0;
  let tollBurned = 0, starveBurned = 0, minted = 0, streak = 0, best = 0, fedEpochs = 0;
  const streaks = []; // completed streak lengths
  const rows = [];

  for (let day = 0; day < days; day++) {
    if (day < P.launch_window_epochs && scenario.launchFarm) {
      // a farmer's bots claim first: share of each troll's claims taken before holders arrive
      for (let t = 0; t < n; t++) {
        const k = Math.floor((launchPool[t] / P.launch_claim_amount) * scenario.launchFarm);
        launchPool[t] -= k * P.launch_claim_amount;
        farm.launch += k * P.launch_claim_amount;
        farm.cost += k * (COSTS.setup_per_bot + P.claim_fee_near);
      }
    }
    if (day === P.launch_window_epochs) {
      for (let t = 0; t < n; t++) {
        if (P.unclaimed_at_close === 'hoard') { hoard[t] += launchPool[t]; closeToHoard += launchPool[t]; launchPool[t] = 0; }
        if (P.unclaimed_at_close === 'burn') { closeBurned += launchPool[t]; launchPool[t] = 0; }
      }
    }
    if (day < P.launch_window_epochs) {
      for (const h of holders) {
        if (h.bal === 0 && launchPool[h.home] >= P.launch_claim_amount) {
          launchPool[h.home] -= P.launch_claim_amount;
          h.bal += P.launch_claim_amount;
          h.since = day;
        }
      }
    }

    const feeders = Array.from({ length: n }, () => []);
    let volume = 0, crossVolume = 0, dayToll = 0;
    const tollBy = Array(n).fill(0);
    const p = scenario.active(day, rand);
    holders.forEach((h, i) => {
      if (h.bal <= 0 || rand() >= p) return;
      const k = 1 + Math.floor(-Math.log(1 - rand()) * 1.5); // 1 + geometric-ish, mean ~2
      for (let j = 0; j < k && h.bal > 0; j++) {
        const amount = h.bal * (0.01 + 0.19 * rand());
        let r;
        do {
          r = rand() < scenario.localBias
            ? byTroll[h.home][Math.floor(rand() * byTroll[h.home].length)]
            : Math.floor(rand() * holders.length);
        } while (r === i);
        const to = holders[r];
        h.bal -= amount;
        volume += amount;
        if (to.home === h.home) to.bal += amount;
        else {
          const toll = (amount * P.toll_bps) / 10_000;
          to.bal += amount - toll;
          dayToll += toll;
          tollBy[h.home] += toll;
          crossVolume += amount;
        }
        if (to.since === Infinity) to.since = day;
        if (amount >= P.min_counted_transfer && h.counted !== day && day - h.since >= P.count_min_age
          && h.bal >= P.counted_burn) {
          h.counted = day;
          h.bal -= P.counted_burn;
          honest.burned += P.counted_burn;
          feeders[h.home].push(i);
        }
      }
    });
    const organic = feeders.map((f) => f.length);
    const botSends = Array(n).fill(0);
    // reward pool each troll would pay if every troll is fed
    const poolFor = (t) => P.reward_source === 'toll' ? tollBy[t]
      : P.reward_per_epoch / n;
    if (scenario.harvest) {
      // profit-seeking farmer: per troll, the bot count that maximises
      // price * pool * B / (O + B) - (price * counted_burn + fee) * B, at least the gap to the target
      const { price } = scenario.harvest;
      const unit = price * P.counted_burn + COSTS.fee_per_transfer;
      const plan = organic.map((O, t) => {
        const R = Math.min(poolFor(t), P.reward_cap_per_feeder * 1e12);
        const gap = Math.max(0, P.feed_target - O);
        const best = O > 0 ? Math.floor(Math.sqrt((price * R * O) / unit) - O) : 0;
        // stake split: extra bots holding the minimum add no weight, so the farmer gains nothing
        if (P.reward_split === 'stake') return { B: gap, value: -1 };
        const B = Math.max(gap, best, 0);
        const share = Math.min(R / Math.max(1, O + B), P.reward_cap_per_feeder);
        return { B, value: price * share * B - unit * B };
      });
      if (plan.reduce((a, x) => a + x.value, 0) > 0) plan.forEach((x, t) => { botSends[t] = x.B; });
      for (let t = 0; t < n; t++) {
        if (botSends[t] > bots[t]) { farm.cost += (botSends[t] - bots[t]) * COSTS.setup_per_bot; bots[t] = botSends[t]; }
        farm.sends += botSends[t];
        farm.cost += botSends[t] * COSTS.fee_per_transfer;
        farm.burned += botSends[t] * P.counted_burn;
      }
    }
    if (scenario.farm) {
      for (let t = 0; t < n; t++) {
        const gap = Math.max(0, P.feed_target - organic[t]);
        if (gap > bots[t]) {
          farm.cost += (gap - bots[t]) * COSTS.setup_per_bot;
          bots[t] = gap;
        }
        botSends[t] = gap;
        farm.sends += gap;
        farm.cost += gap * COSTS.fee_per_transfer;
        farm.burned += gap * P.counted_burn;
      }
    }
    const counted = organic.map((c, t) => c + botSends[t]);
    const fed = counted.map((c) => c >= P.feed_target);
    const allFed = fed.every(Boolean);

    let dayMint = 0, dayStarve = 0;
    if (allFed) {
      streak++;
      fedEpochs++;
      best = Math.max(best, streak);
      for (let t = 0; t < n; t++) {
        if (counted[t] === 0) continue;
        let share = Math.min(poolFor(t) / counted[t], P.reward_cap_per_feeder);
        let total = share * counted[t];
        if (P.reward_split === 'stake') {
          const bals = feeders[t].map((i) => holders[i].bal);
          const botW = botSends[t] * P.min_counted_transfer;
          const W = bals.reduce((a, b) => a + b, 0) + botW;
          total = poolFor(t);
          const pays = bals.map((b) => (total * b) / W);
          feeders[t].forEach((i, k) => { holders[i].bal += pays[k]; });
          farm.reward += (total * botW) / W;
          honest.reward += total - (total * botW) / W;
          const sorted = [...pays].sort((a, b) => b - a);
          honest.topDecile += sorted.slice(0, Math.ceil(sorted.length / 10)).reduce((a, b) => a + b, 0);
        } else {
          for (const i of feeders[t]) holders[i].bal += share;
          farm.reward += share * botSends[t];
          honest.reward += share * organic[t];
          honest.topDecile += share * Math.ceil(organic[t] / 10);
        }
        if (P.reward_source === 'toll') { tollBy[t] -= total; continue; } // paid out of the tolls, not minted
        let fromLaunch = 0;
        // 'launch_pool' pays from the pool from launch day; 'reward' only after the window closes
        if (fromPool && (P.reward_source === 'launch_pool' || day >= P.launch_window_epochs)) {
          fromLaunch = Math.min(launchPool[t], total);
          launchPool[t] -= fromLaunch;
          poolPaid += fromLaunch;
        }
        dayMint += total - fromLaunch;
      }
    } else {
      if (streak > 0) streaks.push(streak);
      streak = 0;
      for (let t = 0; t < n; t++) {
        if (fed[t]) continue;
        const burn = (hoard[t] * P.starve_burn_bps) / 10_000;
        hoard[t] -= burn;
        dayStarve += burn;
      }
    }
    // tolls not paid out as reward are burned
    dayToll = tollBy.reduce((a, b) => a + b, 0);
    tollBurned += dayToll;
    honest.feederDays += organic.reduce((a, b) => a + b, 0);
    minted += dayMint;
    starveBurned += dayStarve;

    rows.push({
      day,
      supply: P.total_supply - tollBurned - starveBurned - (honest.burned + farm.burned) - closeBurned + minted,
      circulating: holders.reduce((a, h) => a + h.bal, 0) + farm.reward + farm.launch - farm.burned,
      hoard: hoard.reduce((a, b) => a + b, 0),
      minted: dayMint,
      toll_burned: dayToll,
      starve_burned: dayStarve,
      volume,
      cross_share: volume ? crossVolume / volume : 0,
      fed_trolls: fed.filter(Boolean).length,
      streak,
      min_senders: Math.min(...counted),
      organic_senders: organic.reduce((a, b) => a + b, 0),
      bot_senders: botSends.reduce((a, b) => a + b, 0),
      senders: counted,
    });
  }
  if (streak > 0) streaks.push(streak);

  const last = rows[rows.length - 1];
  return {
    rows,
    summary: {
      supply_end: last.supply,
      minted, toll_burned: tollBurned, starve_burned: starveBurned,
      fed_epochs: fedEpochs, best_streak: best, streaks,
      launch_unclaimed: launchPool.reduce((a, b) => a + b, 0),
      bots: bots.reduce((a, b) => a + b, 0),
      farm_cost_near: farm.cost, farm_reward: farm.reward, farm_sends: farm.sends,
      farm_launch: farm.launch, farm_burned: farm.burned,
      honest_reward: honest.reward, honest_top_decile_share: honest.reward ? honest.topDecile / honest.reward : 0, honest_feeder_days: honest.feederDays, honest_burned: honest.burned,
      counted_burned: honest.burned + farm.burned, close_burned: closeBurned, close_to_hoard: closeToHoard,
      reward_from_launch_pool: poolPaid,
      // ledger check: everything held anywhere equals supply
      ledger: last.circulating + last.hoard + launchPool.reduce((a, b) => a + b, 0),
    },
  };
}
