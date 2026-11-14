// The deck's words, kept apart from its drawings so the slides and their plain-text version share one source.
export type SlideText = {
  title: string;
  body?: string;
  points?: string[];
  /** what the right-hand visual shows, in words */
  figure: string;
};

export const SLIDE_TEXT: SlideText[] = [
  {
    title: "Sharded Trolls",
    body: "A token ledger split across eight NEAR shards, live on testnet, with a memecoin on top.",
    figure: "Illustration: eight streams flowing out of one lake, each kept by a troll.",
  },
  {
    title: "Claim rushes fill a shard.",
    points: [
      "HOT, before its 2024-03-21 split: the shard holding game.hot.tg ran 42.5% full against 10.2% elsewhere.",
      "KaiChing, before its 2025-03-19 split: three accounts took 66% of sampled receipts.",
      "A token launch is that kind of load: thousands of accounts calling one contract at once.",
    ],
    figure: "42.5%: full on the HOT shard before its split, vs 10.2% elsewhere. 66%: of receipts went to three KaiChing accounts before its split.",
  },
  {
    title: "NEAR never splits a contract.",
    points: [
      "Shards split only between accounts, so one contract always sits on one shard. Dynamic resharding is off.",
      "To use more than one shard, a token has to be more than one contract.",
      "NEP-636 (draft) uses one wallet per holder at 0s… ids, all of which sort onto one shard under today's layout.",
    ],
    figure: "Left: one contract on one shard, where every holder queues. Right: eight trolls on shards 10, 11, 12, 13, 9, 7, 4 and 5, with holders spread over eight shards.",
  },
  {
    title: "Eight ledgers on eight shards.",
    body: "Each troll holds the balances of the accounts that live there. The root only settles the day; transfers never touch it.",
    figure: "The root (settles the day) above trolls 0–7, each a ledger on its own shard (10, 11, 12, 13, 9, 7, 4, 5). All eight run one global contract code, published once and used by hash. A single-shard NEP-141 wrapper serves DEXes.",
  },
  {
    title: "Homes by hash.",
    points: [
      "home = first 16 bytes of sha256(account id), big-endian, mod 8. Uniform, and independent of the shard layout.",
      "Our first version used account-name ranges. Random implicit accounts then landed 39.5 / 29.3 / 23.2 / 8.1% on trolls 0–3 and 0% on 4–7.",
      "Same troll: one receipt, no other shard involved.",
    ],
    figure: "Share of random implicit accounts per troll. Name ranges: 39.5, 29.3, 23.2, 8.1, 0, 0, 0, 0%. Hash (expected): 12.5% on each of the eight trolls.",
  },
  {
    title: "Crossing a shard, safely.",
    body: "Asynchronous by nature, so the protocol is built around what can fail.",
    figure: "Sequence: your troll (shard A) debits and sends credit(amount − toll, toll) to their troll (shard B); their troll keeps the toll as food and pays the receiver (balance += net); then ok → your troll confirms and closes. Credit fails (receiver not registered) → full refund, toll included. Credit landed → never refunded, so a failure can never mint. Σ(supply + in flight + burned − minted) = total, checked after every step.",
  },
  {
    title: "Settling the day.",
    points: [
      "Anyone calls settle: the root asks all eight trolls for reports, decides fed or starved, then applies the outcome.",
      "Rewards come from tolls eaten first, then the launch pool, and are minted only when both are empty.",
      "The settler earns 0.005 NEAR, paid only from forwarded claim fees.",
      "250 Tgas minimum; a stuck settlement restarts after 600 blocks; a troll refuses any outcome above the fixed parameters.",
    ],
    figure: "Anyone calls settle(day) and earns 0.005 NEAR → the root asks the 8 trolls for reports → fed or starved? Fed: rewards from food, then the pool, then mint. Starved: burn 1% of that troll's hoard.",
  },
  {
    title: "Proven on testnet.",
    points: [
      "One global code by hash on 8 distinct shards; deploy 24.21 NEAR.",
      "Fan-out: 50 of 50 and 25 of 25 transfers from one transaction, 0 failed.",
      "Refund, transfer-and-call and the 4 KB message bound behave as specified; supply conserved after every step.",
      "A full Feeding cycle on chain: fed, bounty paid, claims, then a starve that burned 625,000 STRL.",
    ],
    figure: "8 shards: one global code by hash, deploy 24.21 NEAR. 50 / 50: transfers from one transaction, 0 failed. 625,000: STRL burned by a starving troll, on chain.",
  },
  {
    title: "Under synthetic load.",
    points: [
      "Local network with mainnet's 10-shard layout, offered 2,000 transfers/s.",
      "One ordinary token: 703/s, and 280 of 728 direct transfers rejected for congestion.",
      "The trolls: 1,980/s same-troll and 1,358–1,663/s mixed, none rejected. Ceiling about 6× the control.",
    ],
    figure: "Transfers per second executed at 2,000/s offered for 90 s: one ordinary token 703/s (280 of 728 rejected); trolls, same-troll 1,980/s (0 rejected); trolls, mixed (low run) 1,358/s (0 rejected). Single-node local network with mainnet's layout.",
  },
  {
    title: "Hardened before deploying.",
    points: [
      "Five audit passes; every critical and high finding fixed, every medium fixed or disclosed.",
      "Property runs of 30-epoch lifecycles with restarts, expiry and sweeps; books checked at every step.",
      "Every deployment path rehearsed twice on mainnet's layout, with injected faults: 30 of 30 checks, twice.",
    ],
    figure: "5: audit passes; critical and high all fixed. 30 / 30: rehearsal checks, twice, with injected faults.",
  },
  {
    title: "A kit, not a one-off.",
    body: "The troll code is published once. A second token reuses it by hash and costs about 3.65 NEAR on testnet: a root and eight small accounts.",
    figure: 'node scripts/deploy.mjs --network testnet --parent your.testnet --key-file key.json --global-hash 8XXviK8PceCwicgzFtKi2VoBNWR7MXFMBkZSDKNuFAEk --symbol YOURS --name "Your Trolls" (publishes no code: a root + 8 troll accounts; measured on testnet: ~3.65 NEAR).',
  },
  {
    title: "Limits, and next.",
    points: [
      "Not faster per transfer: one block same-troll, two across. Mixed traffic gains ~1.9–2.4×.",
      "Wallets list one entry per troll. The Feeding is a game, not Sybil-proof.",
      "Next: optimistic credit (two receipts instead of three), a stake-weighted reward, the wrapper on a DEX, and mainnet.",
    ],
    figure: "Illustration: the spectacled troll reading a book.",
  },
];
