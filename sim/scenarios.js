// Holder behaviour per scenario. `active` is the chance a funded holder sends at least once that day.

const weekly = (day) => 1 + 0.2 * Math.sin((2 * Math.PI * day) / 7);

export const SCENARIOS = {
  enthusiastic: {
    label: 'Enthusiastic',
    note: '4,000 holders spread evenly over the trolls, ~30% active every day',
    holders: 4000,
    localBias: 0,
    active: (day) => 0.3 * weekly(day),
  },
  decaying: {
    label: 'Decaying',
    note: '4,000 holders, activity falls from ~40% to a 2% floor (half-life ~8 days)',
    holders: 4000,
    localBias: 0,
    active: (day) => 0.02 + 0.38 * Math.exp(-day / 12),
  },
  'bot-farmed': {
    label: 'Bot-farmed',
    note: '1,500 decaying holders; a farmer tops every troll up to the target with bots',
    holders: 1500,
    localBias: 0,
    active: (day) => 0.02 + 0.38 * Math.exp(-day / 12),
    farm: true,
  },
  'one-troll-dominant': {
    label: 'One troll dominant',
    note: '4,000 holders, 85% homed on one troll, 85% of their transfers stay local, ~30% active',
    holders: 4000,
    homeWeights: [85 * 7, 15, 15, 15, 15, 15, 15, 15],
    localBias: 0.85,
    active: (day) => 0.3 * weekly(day),
  },
};
