// The litepaper as markdown, for agents. Mirrors app/paper/page.tsx; update both together.
export const PAPER_MD = `# Sharded Trolls: a token ledger across eight shards

A launch kit for tokens that expect a claim rush. STRL is the first coin on it. This paper describes the design, the protocol and the evidence; every number links back to a measurement file or to the [Evidence](/evidence) page.

## Contents

- [Abstract](#abstract)
- [The problem](#problem)
- [Design](#design)
- [The cross-shard transfer](#protocol)
- [Token mechanics](#mechanics)
- [Security](#security)
- [Results](#results)
- [The kit](#kit)
- [Limitations and future work](#limits)
- [References](#references)

## Abstract

A NEAR contract lives on one shard, so a token is normally one shard's worth of capacity. Sharded Trolls splits a token's ledger into eight contracts, the **trolls**, one on each reachable shard of today's mainnet layout. Every holder lives at one troll, chosen by a hash of the account id. A transfer between holders of the same troll is a single receipt; a transfer across trolls is a three-step protocol that refunds in full on failure and can never mint. Crossing pays the **Troll Toll**, which feeds the troll you cross into. A daily game, **the Feeding**, pays rewards when all eight trolls are fed and burns part of a starving troll's hoard.

The final contracts were checked transaction by transaction on NEAR testnet. Under synthetic load on a single-node local network with mainnet's shard layout, same-troll traffic reached about 6× the capacity of one ordinary token contract, and mixed traffic about 1.9–2.4×. Transfers are not faster; the gain is room.

## The problem: one contract, one shard

- **NEAR never splits a contract.** Shards split only at account boundaries, so one contract always lives on one shard. Mainnet runs 10 shards (protocol 88), and dynamic resharding is off. A token that wants room on more than one shard has to be more than one contract.
- **Claim rushes are what filled NEAR's shards.** Before the 2024-03-21 split at \`game.hot.tg\`, the shard holding it averaged 42.5% chunk fullness against 10.2% on the other shards; its top receivers were earn.kaiching, game.hot.tg, wallet.kaiching and relay.tg. Before the 2025-03-19 split at \`earn.kaiching\`, the parent shard averaged 12.3% against 7.5%, and three KaiChing accounts took 66% of sampled receipts. Launch claims and daily claims are that kind of load.
- **The sharded-token draft does not spread yet.** NEP-636 uses one wallet contract per holder, at NEP-616 ids that start with \`0s\`. Under today's mainnet layout all of those ids sort below the first shard boundary (\`650\`), so they would sit on one shard until a future split.
- **Headroom, not a rescue.** Mainnet is not congested today: over one hour on 2026-11-12 the shards averaged 0.04–2.5% of chunk gas, with single-chunk peaks up to 84% (shard 8). The design makes sure a coin's own launch rush can never pile onto one shard.

## Design

| Piece | Role |
| --- | --- |
| Root (the parent account) | Metadata, total supply, immutable parameters, daily settlement. Never touched by transfers. |
| 8 trolls (<prefix>.<parent>) | Balances of their holders, per-day sender counts, hoard, launch pool. One global contract code. |
| Wrapper | Standard NEP-141 backed 1:1 by troll tokens it holds; single-shard, for DEXes. |

*The pieces of one token on the kit.*
- **Eight ledgers, eight shards.** Each troll account is placed on a distinct shard, checked against the live mainnet and testnet layouts (\`npm run check\`).
- **Hash homes.** A holder's home troll is the first 16 bytes of sha256(account_id), read big-endian, mod 8. This is uniform and independent of the shard layout. Clients compute it, or ask the root's \`home_troll\` view. With hash homes, about 7 in 8 transfers between random holders cross trolls.
- **One global code.** The troll code is published once as a NEAR global contract and identified by its hash, so all eight trolls provably run the same code and the next token reuses it.
- **Root settlement.** Ordinary transfers never touch the root. Once a day the root gathers the eight trolls' reports, decides fed or starved, and tells each troll to pay a reward or burn.
- **Consistency.** A balance lives at exactly one troll and is always exact. The root's \`ft_total_supply\` is as of the last daily settlement; each troll's \`ft_total_supply\` is live for that troll.
- **No admin.** Parameters are fixed at init and no method changes them. At the mainnet launch every full-access key on the root, trolls and wrapper is to be deleted; there is no mainnet deployment yet, and the testnet root keeps its key.

## The cross-shard transfer

A same-troll transfer is one receipt and takes 1 block. A cross-troll transfer takes 2 and has three steps: a debit at the source, a credit at the receiver's troll, and a confirmation back at the source that closes the transfer. Each troll logs its own side as standard NEP-297 events, in ERC-7802's burn-at-source, mint-at-destination pattern, so every troll's event log balances on its own.

A cross-troll transfer. The toll is minted to the receiving troll as food; nothing is burned by tolls.
- **Refund rule.** A failed credit refunds the sender in full. For example, a receiver that is not registered at its home troll gets nothing, and the sender's balance change is 0.
- **Never-mint rule.** Once a credit has landed nothing is refunded, so a failure can never mint.
- **The result tells.** A cross-troll \`ft_transfer\` resolves to \`true\` when the receiver was credited and to \`false\` when the transfer was refunded. Contracts that send tokens must check that value, not only whether the call succeeded.
- **Transfer-and-call** works within and across trolls; attach at least 100 Tgas. Across trolls, the receiver's troll credits and calls \`ft_on_transfer\`, and the unused part comes back to the sender.
- **The 4 KB message bound.** A cross-troll \`ft_transfer_call\` with a very large \`msg\` (hundreds of KB) could run out of gas after the debit and lose the transfer. Messages over 4 KB are rejected before any debit, and the destination's credit step has more gas reserved. On testnet, at exactly 100 Tgas, a 4,096-byte message works and 4,097 bytes is refused with nothing debited.
- **Not faster.** On mainnet, being on the same shard saves nothing: a follow-up receipt ran 1 block later on the same shard (14 of 14 samples) and across shards (64 of 65; one took 2).

## Token mechanics

| Parameter | Value |
| --- | --- |
| Total supply | 1,000,000,000 STRL, 24 decimals |
| Launch pool | 500,000,000 (62.5M per troll) |
| Hoards | 500,000,000 (62.5M per troll) |
| Launch claim | 1,000 per account; fee 0.01 NEAR; window 24 h |
| Day (epoch) | 24 h |
| feed_target | 10 distinct senders per troll per day |
| min_counted_transfer | 1 token |
| Reward | 250,000 per fed day across the trolls: from food first, then the launch pool, then minted |
| Starve burn | 1% (100 bps) of the starving troll's hoard |
| Troll Toll | 0.25% (25 bps) of each cross-troll transfer, paid to the destination troll as food |
| Settle bounty | 0.005 NEAR to whoever settles a day, from the bounty budget |
| Claim window | 30 days after a day's settlement; then the share returns to the troll's food |

*Launch parameters, fixed at init.*
- **Claim and fee.** Each account can claim a 1,000-token starter bag at its home troll during the first day, for a 0.01 NEAR fee. The troll keeps the part that pays for the claim's own storage record (~0.0006–0.0011 NEAR) and forwards the rest to the root's bounty budget.
- **The toll as food.** 0.25% of every cross-troll transfer is paid to the troll you cross into. It becomes that troll's food and funds its feeders' rewards. The toll is a design choice, not cost recovery: senders already pay the extra receipt's gas in NEAR.
- **The Feeding.** Each day every troll counts its distinct senders (sends of at least 1 token). If all eight reach 10, the streak grows and each troll pays its feeders, first from its food, then from its unclaimed launch pool, and only then by minting. A troll that misses the target starves: it burns 1% of its hoard, and the streak resets.
- **Settling and the bounty.** Anyone can call \`settle\` on the root for the next finished day, attaching at least 250 Tgas. A settlement that never finishes can be restarted after 600 blocks. The root pays whoever settles a 0.005 NEAR bounty from its bounty budget if the budget holds enough; the bounty can never block settlement, and no other NEAR on the root is ever paid out.
- **Claim window and sweep.** Feeders claim within 30 days of a day's settlement, or are paid automatically on their next counted send. After the deadline anyone can \`sweep\` the day, and a troll also sweeps on its own as it settles: unclaimed shares return to its food, and old per-day records are deleted, so a troll's storage stays bounded.
- **Bounded apply.** A troll refuses any reward or burn the root asks for above the fixed parameters, so the root cannot over-mint or over-burn.
- **Supply over time.** In the launch simulation with these parameters, about 4M tokens are claimed with 4,000 holders; the rest of the pool pays the reward for about 1,984 days, so the Feeding mints nothing in that time.

**Sybil limits.** Keeping the streak alive with bots is cheap: about 0.02 NEAR a day plus 0.16 NEAR of setup for 80 bots. Because the reward is split equally among feeders, bots can take most of it once the token has value: about 65% at a fully diluted value of 10,000 NEAR, about 89% at 100,000 NEAR, while below about 1,000 NEAR farming does not pay. Draining the launch pool does not pay below about 10,500 NEAR of value; taking the whole pool would need 500,000 claims (about 5,250 NEAR). The Feeding is a game, not a Sybil-proof mechanism.

## Security

- **Five audit passes** on 2026-11-14: a manual review, then the \`near-contract-audit\` checklist on the base contracts, on the toll-as-food and bounty changes, and on each hardening fix and its amendment. Every Critical and High finding is fixed. Every Medium is fixed except one that is inherent to asynchronous transfers and disclosed: a cross-troll \`ft_transfer\` resolves to \`false\` when refunded.
- **Property tests** (troll 101, root 24 unit and property tests): conservation runs of 3 × 10,000 steps and 30-day lifecycles with random transfers, transfer-and-calls, failed and refunded credits, restarted settlements, claims, expiry and sweeps. After every step they check supply, an indexer-style replay of each troll's events, and that the root agrees with all eight trolls.
- **Integration** on a sandbox, including a local network with mainnet's 10-shard layout and the full Feeding lifecycle: claim fees, tolls, a settlement with bounty, claims, a starving troll, and a stuck settlement restarted.
- **Rehearsals.** Every deployment path was scripted on that local network with fault injection: rate limits mid-deploy and resume, underfunded deploys, a code-hash mismatch, a settlement timeout, reward expiry and sweep. Two final passes on the hardened build each passed 30 of 30 checks.

**Known issues.** Integrators must register receivers at their home troll; a wallet that registers on the sender's troll fails for about 7 in 8 receivers. If a troll ever received a day's report before the previous day's payout (not seen in practice), that payout could draw less food and mint a little more than the root booked; a troll never pays more food than it holds, and the root's total corrects itself at the next settlement. NEAR sent to the root other than through \`fund_bounty\` stays there for good. A malicious same-troll receiver can leave a sender's pending counter stuck, so that sender cannot unregister; no tokens are lost. Explorers attribute a troll's hoard, pools and food to the troll's own account, but \`ft_balance_of(troll)\` returns 0.

## Results

**On NEAR testnet**, the final contracts were deployed under \`v2.strl.testnet\` (token STRL). To let the Feeding play out in minutes, that deployment runs on short testnet parameters: 10-minute days and 1 feeder per troll, where launch uses 24-hour days and 10 feeders. It is a few dozen real transactions, not a load test. Every check passed.

| Check | Result |
| --- | --- |
| One code for eight trolls | All 8 trolls run global contract 8XXviK8P…FAEk, the sha256 of troll.wasm, on shards 10, 11, 12, 13, 9, 7, 4 and 5. Deploy cost: 24.21 testnet NEAR |
| Fan-out | One transaction → 50 of 50 same-troll transfers; another → 25 of 25 mixed transfers (8 cross-troll); 0 failed receipts |
| Cross-troll transfer | Sender −100; the receiver's troll keeps the 0.25 toll as food |
| Credit to an unregistered receiver | The credit fails and the sender is fully refunded (change 0) |
| Transfer-and-call to an account with no contract | The unused amount is returned; the sender pays only the toll |
| Transfer-and-call at exactly 100 Tgas | A 4,096-byte message works; 4,097 bytes is refused before anything is debited |
| Settlement gas floor | At 249 Tgas refused up front, leaving settlement unlocked; at 250 Tgas it settles |
| The Feeding, first day | 8 feeders, one per troll, each crossing a stream; every troll eats a 0.25 STRL toll. Settled: fed, streak 1, rewards from food first, then the launch pool; the settler earned the 0.005 NEAR bounty |
| The Feeding, second day | Seven trolls fed, one not. That troll starved and burned 625,000 STRL (1% of its hoard); streak back to 0 |
| A second token on the same code | kit.strl.testnet (KIT), deployed by code hash with no code published: about 3.65 NEAR |
| Conservation | Σ over the trolls of (supply + in flight + burned − minted) = total supply, and the root agrees with all eight trolls, after every step |

*Testnet, 2026-11-14. Records: measurements/testnet-2026-11-14-final/, shown transaction by transaction on the Evidence page.*

**Under synthetic load** on a single-node local network (near-sandbox 2.14.1, protocol 88) running mainnet's 10-shard layout, 1,000 Tgas chunks and mainnet's congestion thresholds. This is not mainnet or testnet: one node runs all ten shards, so absolute numbers are a lower bound and the comparison is the point. The control is one ordinary NEP-141 contract. Every transaction was looked up afterwards, and receivers' balances matched what the included transactions should deliver, to the yocto.

| Offered load | Control token | Trolls, same-troll | Trolls, mixed (87.5% cross) |
| --- | --- | --- | --- |
| 2,000/s for 90 s | 703/s executed; 63% included; congestion 0.85; 280 of 728 direct transfers rejected (ShardCongested) | 1,980/s (all of it); 100% included; congestion 0; 0 rejected | 1,358–1,663/s over three runs on three successive builds (1,358/s on the current one); 73–89% included; congestion ≤ 0.08; 0 rejected |
| 1,000/s for 60 s | 672/s; a backlog built (congestion 0.30) and drained after the load stopped | — | 969/s (all of it); 100% included; congestion 0 |

*Synthetic load on a single-node local network with mainnet's shard layout. Source: measurements/localnet-2026-11-14/summary.json.*

The same-troll ceiling (offered 6,000/s on an earlier build, same transfer path) was 4,220/s executed, 75% included, congestion 0.04, none rejected. In round numbers, same-troll traffic gets about 6× the control's capacity and mixed traffic about 1.9–2.4×. No transaction to a troll was rejected for congestion; the control's were. Past about 70–85% chunk fullness this single-node network sometimes accepted a transaction and never included it, for the control and the trolls alike; a multi-node network has not been checked.

## The kit

The troll code is published once as a global contract and identified by its hash. A new token reuses it: the deploy script creates a root and eight troll accounts on eight distinct shards and publishes no code. It checks the balance first and stops before sending anything if it is short.

\`\`\`sh
node scripts/deploy.mjs --network testnet --parent <your-parent> \\
  --key-file <parent-key.json> --global-hash <troll code hash> \\
  --symbol <SYM> --name "<Name>" --troll-near 0.2
\`\`\`

Measured on testnet: about 3.65 NEAR per token, that is 8 × 0.2 NEAR for the trolls plus gas, and 1.89 NEAR locked for the root's storage.

## Limitations and future work

- **Not faster per transfer, and not a fix for a hot app.** The gain is throughput and no congestion rejections for holder-to-holder traffic. If every holder calls one game or pool, that is one account on one shard.
- **Optimistic credit.** Dropping the confirmation step would make a cross-troll transfer two receipts instead of three, with per-troll totals reconciled at settlement. It is researched, not built or measured.
- **A stake-weighted reward split** would stop bots from taking the daily reward once the token has value. It is not built.
- **A wrapper on a DEX.** Trading is not sharded: DEXes use the standard NEP-141 wrapper, one contract on one shard. Listing it is still to do.
- **Mainnet.** There is no mainnet deployment yet. At launch every full-access key on the root, trolls and wrapper is to be deleted.
- **Wallets** see one token per troll touched, some with balance 0.

## References

- Standards: [NEP-141](https://github.com/near/NEPs/blob/master/neps/nep-0141.md) fungible token, [NEP-145](https://github.com/near/NEPs/blob/master/neps/nep-0145.md) storage management, [NEP-148](https://github.com/near/NEPs/blob/master/neps/nep-0148.md) token metadata, [NEP-297](https://github.com/near/NEPs/blob/master/neps/nep-0297.md) events, [NEP-330](https://github.com/near/NEPs/blob/master/neps/nep-0330.md) source metadata, and NEAR global contracts.
- NEP-636 "Sharded Fungible Token", a draft opened 2026-01-29 and blocked on Universal Implicit Account Ids as of 2026-10-06, with a reference implementation in [near-sdk-rs#1376](https://github.com/near/near-sdk-rs/pull/1376).
- [ERC-7802](https://eips.ethereum.org/EIPS/eip-7802), whose burn-at-source, mint-at-destination events the cross-troll transfer follows.
- Measurements: \`measurements/mainnet/split-causes-2026-11-13.jsonl\`, \`shard-load-2026-11-12.json\` and \`receipt-latency-2026-11-13.json\` (mainnet shards); [localnet summary.json](/measurements/localnet-2026-11-14/summary.json) and [rehearsal-final-summary.json](/measurements/localnet-2026-11-14/rehearsal-final-summary.json) (local network); [k-tests.json](/measurements/testnet-2026-11-14-final/k-tests.json) and [feeding.json](/measurements/testnet-2026-11-14-final/feeding.json) (testnet).

[See the evidence](/evidence.md)
`;
