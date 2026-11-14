# Sharded Trolls

**Sharded Trolls is a launch kit for tokens that expect a claim rush. STRL is the first coin on it.**

A token on the kit is eight contracts, the **trolls**, one on each reachable NEAR shard. Every holder
lives at one troll. Crossing from one troll to another pays the **Troll Toll**, and the troll you cross
into eats it. A daily game, **the Feeding**, pays rewards when all eight trolls are fed, and burns part
of a troll's hoard when it starves. The troll code is published once on chain, so the next token on the
kit costs only its accounts.


## Why eight contracts

- **NEAR never splits a contract.** Shards split only at account boundaries, so one contract always
  lives on one shard. Mainnet runs 10 shards (protocol 88), and dynamic resharding is off. A token that
  wants room on more than one shard has to be more than one contract.
- **The trolls span 8 shards today.** Each troll account is placed on a distinct shard, checked against
  the live layout (`npm run check`). NEAR's draft sharded-token proposal (NEP-636) uses one wallet
  contract per holder, at NEP-616 ids that start with `0s`. Under today's mainnet layout all of those
  ids sort below the first shard boundary (`650`), so they would sit on one shard until a future split.
- **What filled NEAR's shards was claim-heavy consumer apps.** Before the 2024-03-21 split at
  `game.hot.tg`, the shard holding it averaged 42.5% chunk fullness against 10.2% on the other shards;
  its top receivers were earn.kaiching, game.hot.tg, wallet.kaiching and relay.tg. Before the
  2025-03-19 split at `earn.kaiching`, the parent shard averaged 12.3% against 7.5%, and three KaiChing
  accounts took 66% of sampled receipts. Launch claims and daily claims are that kind of load.
  [`measurements/mainnet/split-causes-2026-11-13.jsonl`]
- **The meme is the mechanic.** Eight trolls, a toll at every bridge, and a daily Feeding that needs all
  eight.
- **Headroom, not a rescue.** Mainnet is not congested today: over one hour on 2026-11-12 the shards
  averaged 0.04–2.5% of chunk gas, with single-chunk peaks up to 84% (shard 8). The trolls make sure
  the coin's own launch rush can never pile onto one shard.
  [`measurements/mainnet/shard-load-2026-11-12.json`]

## What it is, and what it is not

- **It spreads holder-to-holder traffic** (claims, tips, transfers) over eight shards. Trading is not
  sharded: DEXes use a standard NEP-141 wrapper, which is one contract on one shard.
- **It does not make a single transfer faster.** A same-troll transfer takes 1 block, a cross-troll one 2.
  On mainnet, being on the same shard saves nothing: a follow-up receipt ran 1 block later on the same
  shard (14 of 14 samples) and across shards (64 of 65; one took 2).
  [`measurements/mainnet/receipt-latency-2026-11-13.json`]
- **It does not fix a hot app.** If every holder calls one game or pool, that is one account on one
  shard. Example: before NEAR split at `game.hot.tg` (2024-03-21), the shard holding it averaged 42.5%
  chunk fullness against 10.2% on the other shards, and a few apps received most of its traffic.
  [`measurements/mainnet/split-causes-2026-11-13.jsonl`]
- **Wallets see one token per troll.** Each troll is a self-describing NEP-141 (`ft_balance_of`,
  `ft_metadata`, `ft_total_supply`, NEP-297 events). On testnet, NearBlocks showed a holder's balance and
  metadata correctly. A holder who has received from other trolls sees one entry per troll touched,
  some with balance 0.

## Verified on NEAR testnet (2026-11-14)

The final contracts, deployed under `v2.strl.testnet` (token STRL). This deployment uses **short testnet
parameters** so the Feeding plays out in minutes: 1 feeder per troll and 10-minute epochs (launch values:
10 feeders and 1-day epochs). It is a few dozen real transactions, not a load test; the testnet root keeps
its deploy key. Every check below passed. Records: [`measurements/testnet-2026-11-14-final/`](measurements/testnet-2026-11-14-final/),
also shown on the site's Evidence page.

| Check | Result |
|---|---|
| One code for eight trolls | All 8 trolls run global contract `8XXviK8PceCwicgzFtKi2VoBNWR7MXFMBkZSDKNuFAEk`, the sha256 of `troll.wasm`, on shards 10, 11, 12, 13, 9, 7, 4 and 5. Deploy cost: 24.21 testnet NEAR |
| Fan-out | One stampede transaction → 50 of 50 same-troll transfers; another → 25 of 25 mixed transfers (8 cross-troll); 0 failed receipts |
| Cross-troll transfer | Sender −100; the receiver's troll keeps the 0.25 toll as food |
| Credit to an unregistered receiver | The credit fails and the sender is fully refunded (change 0) |
| Cross-troll `ft_transfer_call` to an account with no contract | The unused amount is returned; the sender pays only the toll |
| `ft_transfer_call` at exactly 100 Tgas | A 4,096-byte message works; 4,097 bytes is refused before anything is debited |
| Settlement gas floor | `settle` at 249 Tgas is refused up front and leaves settlement unlocked; at 250 Tgas it settles |
| The Feeding, day 0 | 8 feeders, one per troll, each crossing a stream; every troll eats a 0.25 STRL toll. Settled: fed, streak 1, rewards paid from food first, then the launch pool. The settler earned the 0.005 NEAR bounty |
| The Feeding, day 1 | Seven trolls fed, one not. Settled: that troll starved and burned 625,000 STRL (1% of its hoard); streak back to 0 |
| A second token on the same code | `kit.strl.testnet` (KIT) deployed by code hash, no code published: about 3.65 NEAR |
| Conservation | Σ over the trolls of (supply + in flight + burned − minted) = total supply, and the root agrees with all eight trolls, after every step |

Earlier runs on earlier builds (`st.xavio.testnet`, `st2.xavio.testnet`) are kept in `measurements/`.

## How it works

| Piece | Role |
|---|---|
| Root (the parent account; on testnet `v2.strl.testnet`) | Metadata, total supply, immutable parameters, daily settlement. Never touched by transfers |
| 8 trolls (`<prefix>.<parent>`) | Balances of their holders, per-epoch sender counts, hoard, launch pool. One global contract code |
| Wrapper | Standard NEP-141 backed 1:1 by troll tokens it holds; single-shard, for DEXes |

- **Home troll:** the first 16 bytes of sha256(account_id), big-endian, mod 8. This is uniform and
  independent of the shard layout. Clients compute it (`packages/client`) or ask the root's `home_troll`
  view.
- **Transfers:** a same-troll transfer is one receipt. A cross-troll transfer has three steps:
  1. a debit at the source (logged `ft_burn`);
  2. a credit at the receiver's troll (logged `ft_mint` of amount − toll to the receiver, and of the toll to
     the troll itself as food);
  3. a confirmation back at the source, which closes the transfer.

  A failed credit refunds in full. Once a credit has landed nothing is refunded, so a failure can
  never mint. `ft_transfer_call` works within and across trolls; attach at least 100 Tgas.
- **Registration:** a standard NEP-145 storage deposit at your home troll. Holders pay their own storage.
  Unregistering first pays any claimable rewards into your balance; it is refused while that balance is
  not zero, unless forced (which burns it).
- **Launch claim:** each account can claim a 1,000-token starter bag at its home troll during the first
  day, for a 0.01 NEAR fee. The troll keeps the part that pays for the claim's own storage record
  (~0.0006–0.0011 NEAR) and forwards the rest to the root's bounty budget. Only that budget pays settle
  bounties; no other NEAR on the root is ever paid out.
- **The Feeding:** each day every troll counts its distinct senders (sends of at least 1 token).
  - If all eight trolls reach 10, the streak grows. Each troll then pays its feeders a reward, **first from
    the tolls it has eaten (its food), then from its unclaimed launch pool**, and only then by minting.
  - A troll that misses the target starves: it burns 1% of its hoard, and the streak resets.
  - **Settling:** anyone can call `settle({"epoch": N})` on the root for the next finished epoch,
    attaching at least 250 Tgas. A settlement that never finishes can be restarted after a timeout.
    The root pays whoever settles a 0.005 NEAR bounty from its bounty budget, if the budget holds
    enough; the bounty can never block settlement. Feeders then call
    `claim({"epoch": N})` at their home troll within 30 days of that day's settlement (or are paid
    automatically on their next counted send). After the deadline anyone can `sweep` the day, and the
    troll also sweeps on its own as it settles: unclaimed shares go back to its food, and old per-day
    records are deleted, so a troll's storage stays bounded.
- **The Troll Toll:** 0.25% of every cross-troll transfer is paid to the troll you cross into. It becomes
  that troll's food and funds its feeders' rewards, so nothing is burned by tolls. With hash homes,
  about 7 in 8 transfers between random holders cross trolls. The toll is a design choice, not cost
  recovery: senders already pay the extra receipt's gas in NEAR.
- **Bounded by its parameters:** a troll refuses any reward or burn the root asks for above the fixed
  parameters, so the root can't over-mint or over-burn.
- **No admin:** parameters are fixed at init and no method changes them. The troll code is one global
  contract, identified by its hash. At the mainnet launch every full-access key on the root, trolls and
  wrapper is to be deleted (not done yet: there is no mainnet deployment, and the testnet root keeps
  its key).
- **Consistency:** a balance lives at exactly one troll and is always exact. The root's
  `ft_total_supply` is as of the last daily settlement; each troll's `ft_total_supply` is live for that
  troll.

## Parameters

| Parameter | Value |
|---|---|
| Total supply | 1,000,000,000 STRL, 24 decimals |
| Launch pool | 500,000,000 (62.5M per troll) |
| Hoards | 500,000,000 (62.5M per troll) |
| Launch claim | 1,000 per account; fee 0.01 NEAR; window 24 h |
| Epoch | 24 h |
| `feed_target` | 10 distinct senders per troll per day |
| `min_counted_transfer` | 1 token |
| Reward | 250,000 per fed day across the trolls: from food (eaten tolls) first, then the launch pool, then minted |
| Starve burn | 1% (100 bps) of the starving troll's hoard |
| Troll Toll | 0.25% (25 bps) of each cross-troll transfer, paid to the destination troll as food |
| Settle bounty | 0.005 NEAR to whoever settles a day, from the bounty budget (forwarded claim fees) |
| Claim window | 30 days after a day's settlement; then the share returns to the troll's food |

Launch simulation with the shipped parameters (`node sim/d24.js`): with 4,000 holders about 4M tokens
are claimed. (`npm run sim` runs the earlier 60-day model, whose defaults predate the claim fee and
pool-funded rewards.)
The rest of the pool pays the reward for about 1,984 days, so the Feeding mints nothing in that time.

## Sybil limits, plainly

- **Keeping the streak alive with bots is cheap:** about 0.02 NEAR/day plus 0.16 NEAR of setup for 80
  bots.
- **Bots can take most of the daily reward once the token has value.** The reward is split equally
  among feeders:
  - at a fully diluted value of 10,000 NEAR, a farmer takes about 65% of it;
  - at 100,000 NEAR, about 89%;
  - below about 1,000 NEAR, farming does not pay.

  Food from tolls funds the same equal split, so these shares apply to it too. A stake-weighted split
  would close this hole; it is not built.
- **Draining the launch pool does not pay.** Each claim costs 0.01 NEAR for 1,000 tokens, so bots profit
  only above about 10,500 NEAR FDV. Taking the whole pool would need 500,000 claims (about 5,250 NEAR).
- Sub-accounts count as separate accounts. The Feeding is a game, not a Sybil-proof mechanism.

## Known issues

- **Fixed before launch:** a cross-troll `ft_transfer_call` with a very large `msg` (hundreds of KB) could
  run out of gas after the debit and lose the transfer. Messages over 4 KB are now rejected before any
  debit, and the destination's credit step has more gas reserved (tested at exactly 100 Tgas).
- **For integrators, registration:** register receivers at their **home** troll (the root's `home_troll`
  view, or `packages/client`, which does it before sending). A wallet that registers receivers on the
  sender's troll fails for about 7 in 8 receivers.
- **For integrators:** a cross-troll `ft_transfer` can succeed as a transaction yet deliver nothing.
  It resolves to `true` when the receiver was credited, and to `false` when the transfer was refunded
  (for example, the receiver is not registered at its home troll). Contracts that send tokens must
  check that value, not just whether the call succeeded.
- **Settlement:** anyone can call `settle(epoch)` on the root once a day ends; attach at least 250 Tgas
  (300 recommended). If a settlement never finishes, it can be restarted after 600 blocks, so the
  Feeding can't lock up.
- **Out-of-order delivery (not seen in practice):** if a troll ever received a day's report before the
  previous day's payout, that payout could draw less food and mint a little more than the root booked.
  A troll never pays more food than it holds, and the root's total corrects itself at the next
  settlement.
- **Root NEAR:** only NEAR sent through `fund_bounty` (the trolls forward claim fees there) can be paid
  out as settle bounties. Any other NEAR on the root account, such as deployment leftovers, stays there
  for good: there is no withdraw method.
- A malicious same-troll receiver can return an oversized result from `ft_on_transfer`. That leaves
  the sender's pending counter stuck, so the sender can't unregister; no tokens are lost.
- Explorers attribute each troll's hoard, pools and food to the troll's own account, but
  `ft_balance_of(troll)` returns 0.

## Audits and hardening

Five audit passes on 2026-11-14: a manual review, then the `near-contract-audit` checklist on the base
contracts, on the Tier B changes, and on each hardening fix and its amendment. Every Critical and High
finding is fixed. Every Medium is fixed except one that is inherent to async transfers and disclosed
above (a cross-troll `ft_transfer` resolves to `false` when refunded). Open Low and Info items are listed
above. The tests include:
- unit and property tests (troll 101, root 24): conservation runs of 3 × 10,000 steps and 30-epoch
  lifecycles with random transfers, transfer-and-calls, failed and refunded credits, restarted
  settlements, claims, expiry and sweeps, checking supply, the per-troll event replay and root = trolls
  after every step;
- sandbox integration, including a local network with mainnet's 10-shard layout and the full Feeding
  lifecycle (claim fees → tolls → settle with bounty → claims → starve → stuck settlement restarted);
- a scripted rehearsal of every deployment path on that local network, with fault injection (rate
  limits mid-deploy and resume, underfunded deploys, code-hash mismatch, settlement timeout, reward
  expiry and sweep). Two final passes on the hardened build each passed 30 of 30 checks
  ([`measurements/localnet-2026-11-14/rehearsal-final-summary.json`]).

## Launch your own token on the kit

The troll code is published once as a global contract and identified by its hash. A new token reuses it:

```
node --dns-result-order=ipv4first scripts/deploy.mjs --network testnet --parent <your-parent> \
  --key-file <parent-key.json> --global-hash <troll code hash> --symbol <SYM> --name "<Name>" --troll-near 0.2
```

It publishes no code: a root plus eight troll accounts, placed on eight distinct shards. Measured on
testnet: about 3.65 NEAR per token (8 × 0.2 NEAR for the trolls plus gas, and 1.89 NEAR locked for the
root's storage). The script checks the balance first and stops before sending anything if it is short.

## Try it (no keys needed)

The site: https://strl.xavio.dev.
- `/` the story;
- `/app` play on testnet: connect a testnet wallet, get 1,000 STRL in one tap, feed a troll, collect your
  share. It runs on the play deployment `play.strl.testnet` (short testnet parameters: 10-minute days, 1 feeder
  per troll), whose starter-bag claims stay open until 2026-11-28;
- `/pitch` the technical deck: architecture, the cross-shard transfer protocol, proof and limits;
- `/paper` the litepaper: design, protocol, mechanics, security, results and limits in long form;
- `/evidence` every measurement and testnet transaction behind the numbers.

Locally, with Node 24+. The tools need no `npm install` (zero dependencies):

```
npm run sim       # supply simulation -> sim/out/ (CSV + SVG)
npm run check     # the 8 trolls sit on 8 distinct shards under today's live mainnet and testnet layouts
npm run test:js   # layout, client, scripts and sim tests
```

The site is a Next.js app in `web/`:

```
cd web && npm install && npm run dev    # http://localhost:3000
```

Developers:
- `cargo test -p troll -p root -p troll-types -p wrapper`: unit tests, conservation property runs and an
  indexer-style event replay;
- `cargo test -p integration`: sandbox tests, including a local network running mainnet's 10-shard
  layout.

## Appendix: synthetic load on a local network

- **Setup:** a single-node localnet (near-sandbox 2.14.1, protocol 88) running mainnet's 10-shard layout,
  1,000 Tgas chunks and mainnet's congestion thresholds.
- **Not mainnet or testnet:** the load is synthetic. One node runs all ten shards, so absolute numbers
  are a lower bound; the comparison is the point.
- **Control:** one ordinary NEP-141 contract.
- **Checks:** every transaction was looked up afterwards. In every run, receivers' balances matched what
  the included transactions should deliver, to the yocto.

[`measurements/localnet-2026-11-14/summary.json`]

| Offered load | Control token | Trolls, same-troll | Trolls, mixed (87.5% cross) |
|---|---|---|---|
| 2,000/s for 90 s | 703/s executed; 63% included; congestion 0.85; 280 of 728 direct transfers rejected (`ShardCongested`) | 1,980/s (all of it); 100% included; congestion 0; 0 rejected | 1,358–1,663/s over three runs on three successive builds (1,358/s on the current one); 73–89% included; congestion ≤ 0.08; 0 rejected |
| 1,000/s for 60 s | 672/s; a backlog built (congestion 0.30) and drained after the load stopped | — | 969/s (all of it); 100% included; congestion 0 |

Same-troll ceiling (offered 6,000/s, earlier build, same transfer path): 4,220/s executed, 75%
included, congestion 0.04, none rejected.

In round numbers, same-troll traffic gets about 6× the control's capacity, and mixed traffic about
1.9–2.4×. No transaction to a troll was rejected for congestion; the control's were.

**Silent drops (seen on this single-node localnet, for the control and the trolls alike):** past about
70–85% chunk fullness, the node sometimes accepted a transaction (`send_tx` returned no error) and then
never included it, with congestion far below 0.8. We have not checked whether a multi-node network does
the same.

## Prior art

Sharded fungible tokens on NEAR are not new. NEP-636 "Sharded Fungible Token" is a draft, opened
2026-01-29 and blocked on Universal Implicit Account Ids as of 2026-10-06, with a reference
implementation in near-sdk-rs#1376. Sharded Trolls takes a different approach: a fixed set of eight
ledgers, one per shard, deployable today. Cross-troll events follow ERC-7802's burn-at-source,
mint-at-destination pattern.

Standards used: NEP-141, NEP-145, NEP-148, NEP-297 and NEP-330, plus NEAR global contracts.
As of 2026-11-14 18:20 UTC, a scan of all 1,674 projects in the NEAR HACKATHON 2026 field (posts, READMEs and linked sites) found no other fungible-token ledger split across shards or contracts. The nearest prior art there is the House of Stake "Sharded NFT Items" draft (one account per NFT).

## Built during NEAR HACKATHON 2026

All code was written during the build window (2026-11-12 to 2026-11-14). Libraries: near-sdk, near-contract-standards, near-api,
near-sandbox and cargo-near. Built with AI assistance (Claude Code).

## License

MIT, xavio2495.
