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
};

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

  const holders = Array.from({ length: scenario.holders }, () => ({ home: pickHome(), bal: 0, counted: -1 }));
  const byTroll = Array.from({ length: n }, () => []);
  holders.forEach((h, i) => byTroll[h.home].push(i));

  const launchPool = Array(n).fill(P.launch_supply / n);
  const hoard = Array(n).fill((P.total_supply - P.launch_supply) / n);
  const bots = Array(n).fill(0); // bot accounts created per troll
  const farm = { cost: 0, reward: 0, sends: 0 };
  let tollBurned = 0, starveBurned = 0, minted = 0, streak = 0, best = 0, fedEpochs = 0;
  const streaks = []; // completed streak lengths
  const rows = [];

  for (let day = 0; day < days; day++) {
    if (day < P.launch_window_epochs) {
      for (const h of holders) {
        if (h.bal === 0 && launchPool[h.home] >= P.launch_claim_amount) {
          launchPool[h.home] -= P.launch_claim_amount;
          h.bal += P.launch_claim_amount;
        }
      }
    }

    const feeders = Array.from({ length: n }, () => []);
    let volume = 0, crossVolume = 0, dayToll = 0;
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
          crossVolume += amount;
        }
        if (amount >= P.min_counted_transfer && h.counted !== day) {
          h.counted = day;
          feeders[h.home].push(i);
        }
      }
    });
    tollBurned += dayToll;

    const organic = feeders.map((f) => f.length);
    const botSends = Array(n).fill(0);
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
        const share = P.reward_per_epoch / n / counted[t];
        for (const i of feeders[t]) holders[i].bal += share;
        farm.reward += share * botSends[t];
        dayMint += share * counted[t];
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
    minted += dayMint;
    starveBurned += dayStarve;

    rows.push({
      day,
      supply: P.total_supply - tollBurned - starveBurned + minted,
      circulating: holders.reduce((a, h) => a + h.bal, 0) + farm.reward,
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
      // ledger check: everything held anywhere equals supply
      ledger: last.circulating + last.hoard + launchPool.reduce((a, b) => a + b, 0),
    },
  };
}
