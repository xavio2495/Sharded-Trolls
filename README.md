<div align="center">
<img width="120" alt="Sharded Trolls" src="./web/public/logo.svg" />

# Sharded Trolls

### **One token, eight ledgers on eight NEAR shards: a launch kit for coins that expect a claim rush**

<br>

[![License: MIT](https://img.shields.io/badge/License-MIT-6e9a3c?style=flat-square)](./LICENSE)
[![Network: NEAR testnet](https://img.shields.io/badge/Network-NEAR_testnet-222222?style=flat-square&logo=near&logoColor=white)](https://testnet.nearblocks.io/address/play.strl.testnet)
[![8 shards](https://img.shields.io/badge/Ledgers-8_trolls_on_8_shards-222222?style=flat-square)](#how-it-works)
[![NEP-141](https://img.shields.io/badge/Token-NEP--141-222222?style=flat-square)](#what-is-checked)
[![near-sdk 5.30](https://img.shields.io/badge/near--sdk-5.30-222222?style=flat-square&logo=rust&logoColor=white)](./Cargo.toml)
[![Node 24](https://img.shields.io/badge/Node-24-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)](#development)
[![Site: strl.xavio.dev](https://img.shields.io/badge/Site-strl.xavio.dev-6e9a3c?style=flat-square)](https://strl.xavio.dev)
[![NEAR HACKATHON 2026 · Memecoins](https://img.shields.io/badge/NEAR_HACKATHON_2026-Memecoins-6e9a3c?style=flat-square)](#track-near-hackathon-2026--memecoins)

<br>

**[Track](#track-near-hackathon-2026--memecoins)** · **[Background](#the-background)** · **[What it does](#what-it-does)** · **[Use it](#use-it)** · **[How it works](#how-it-works)** · **[Transfer flow](#cross-troll-transfer-flow)** · **[Results](#results)** · **[What is checked](#what-is-checked)** · **[Limits](#limits-and-known-issues)** · **[Where it lives](#where-it-lives)** · **[Develop](#development)** · **[License](#license)**

<br><br><br>
</div>

**Sharded Trolls** is a launch kit for tokens that expect a claim rush. **STRL** is the first coin on it. A token on the kit is eight contracts, the **trolls**, one on each reachable NEAR shard. Every holder lives at one troll. Crossing from one troll to another pays the **Troll Toll**, and the troll you cross into eats it. A daily game, **the Feeding**, pays rewards when all eight trolls are fed, and burns part of a troll's hoard when it starves. The troll code is published once on chain, so the next token on the kit costs only its accounts.

Try it at **[strl.xavio.dev](https://strl.xavio.dev)**: the story, the [app](https://strl.xavio.dev/app), the [pitch deck](https://strl.xavio.dev/pitch), the [litepaper](https://strl.xavio.dev/paper) and the [evidence](https://strl.xavio.dev/evidence). Agents can read all of it at [`/llms.txt`](https://strl.xavio.dev/llms.txt).

> ### ⚠️ NEAR testnet · no mainnet deployment yet
> STRL runs on **NEAR testnet only**; testnet tokens have no value. The contracts went through five internal audit passes but have **not been independently audited**. Load numbers come from a **synthetic single-node local network** with mainnet's shard layout, not from mainnet. Transfers are **not faster** per transfer; the gain is throughput and no congestion rejections.

---

## Track: NEAR HACKATHON 2026 · Memecoins

| Track | What Sharded Trolls builds on |
|---|---|
| **Memecoins** | NEAR **global contracts** (one troll code by hash for all eight trolls and every future token), NEP-141, NEP-145, NEP-148, NEP-297 and NEP-330 |

The meme is the mechanic: eight trolls, a toll at every bridge, and a daily Feeding that needs all eight. Underneath it is a sharded fungible-token ledger that is deployable today.

### Where NEAR is used

| NEAR feature | Used for | In Sharded Trolls |
|---|---|---|
| **Global contracts** (deploy by code hash) | All 8 trolls run one published code, `8XXviK8PceCwicgzFtKi2VoBNWR7MXFMBkZSDKNuFAEk`; a new token publishes no code | [`scripts/deploy.mjs`](./scripts/deploy.mjs) (`--global-hash`) |
| **Shard layout** (protocol 88, 10 shards) | Each troll account name is chosen so it lands on a distinct shard | [`packages/layout/`](./packages/layout) (`shardOf`, `place`) · `npm run check` |
| **Asynchronous receipts** | The three-step cross-troll transfer with refund on failed credit | [`contracts/troll/src/lib.rs`](./contracts/troll/src/lib.rs) (`ft_transfer`, `credit`, `on_credit`) |
| **Joined promises** | The root gathers all eight troll reports before deciding fed or starved | [`contracts/root/src/lib.rs`](./contracts/root/src/lib.rs) (`settle`, `on_reports`) |
| **NEP-141 / NEP-145 / NEP-148** | Each troll is a self-describing token with storage registration and metadata | [`contracts/troll/src/lib.rs`](./contracts/troll/src/lib.rs) |
| **NEP-297 events** | Each troll logs its own side of a transfer (ERC-7802's burn-at-source, mint-at-destination), so every troll's log balances on its own | [`contracts/troll/src/lib.rs`](./contracts/troll/src/lib.rs) |
| **NEP-330** | Source metadata on the published code, from a cargo-near reproducible build | [`contracts/troll/Cargo.toml`](./contracts/troll/Cargo.toml) |

### Prior art

Sharded fungible tokens on NEAR are not new. NEP-636 "Sharded Fungible Token" is a draft, opened 2026-01-29 and blocked on Universal Implicit Account Ids as of 2026-10-06, with a reference implementation in near-sdk-rs#1376. Sharded Trolls takes a different approach: a fixed set of eight ledgers, one per shard, deployable today.

As of 2026-11-14 18:20 UTC, a scan of all 1,674 projects in the NEAR HACKATHON 2026 field (posts, READMEs and linked sites) found no other fungible-token ledger split across shards or contracts. The nearest prior art there is the House of Stake "Sharded NFT Items" draft (one account per NFT).

---

## The Background

A NEAR contract lives on one shard, so a token is normally one shard's worth of capacity:

- **NEAR never splits a contract.** Shards split only at account boundaries, so one contract always lives on one shard. Mainnet runs 10 shards (protocol 88), and dynamic resharding is off. A token that wants room on more than one shard has to be more than one contract.
- **What filled NEAR's shards was claim-heavy consumer apps.** Before the 2024-03-21 split at `game.hot.tg`, the shard holding it averaged 42.5% chunk fullness against 10.2% on the other shards; its top receivers were earn.kaiching, game.hot.tg, wallet.kaiching and relay.tg. Before the 2025-03-19 split at `earn.kaiching`, the parent shard averaged 12.3% against 7.5%, and three KaiChing accounts took 66% of sampled receipts. Launch claims and daily claims are that kind of load. [`measurements/mainnet/split-causes-2026-11-13.jsonl`](./measurements/mainnet)
- **The sharded-token draft does not spread yet.** NEP-636 uses one wallet contract per holder, at NEP-616 ids that start with `0s`. Under today's mainnet layout all of those ids sort below the first shard boundary (`650`), so they would sit on one shard until a future split.
- **Headroom, not a rescue.** Mainnet is not congested today: over one hour on 2026-11-12 the shards averaged 0.04–2.5% of chunk gas, with single-chunk peaks up to 84% (shard 8). [`measurements/mainnet/shard-load-2026-11-12.json`](./measurements/mainnet)

**Sharded Trolls splits the token instead.**

1. **Eight ledgers, eight shards.** Each troll account sits on a distinct shard, checked against the live mainnet and testnet layouts.
2. **Hash homes.** A holder's home troll is a hash of the account id, so the crowd spreads evenly whatever the account names look like.
3. **One code.** The troll code is a global contract, so all eight provably run the same code and the next token reuses it.

---

## What it does

- **Spreads holder-to-holder traffic** (claims, tips, transfers) over eight shards. A same-troll transfer is one receipt and touches no other shard.
- **Crosses shards safely:** debit, credit, confirm. A failed credit refunds in full; a landed credit is never refunded, so a failure can never mint.
- **Feeds the trolls:** the 0.25% Troll Toll on a cross-troll transfer becomes the destination troll's food, and pays its feeders.
- **Runs the Feeding:** each day every troll needs enough distinct senders. All fed: the streak grows and feeders are paid. A troll that misses starves and burns 1% of its hoard.
- **Settles without an operator:** anyone can close the day and earn a small NEAR bounty paid from claim fees; a stuck settlement restarts on its own.
- **Ships as a kit:** a new token deploys a root and eight troll accounts by code hash for about 3.65 testnet NEAR.
- **Trades through a wrapper:** a standard single-shard NEP-141 backed 1:1 by troll tokens, for DEXes (built, not deployed).

It is not:
- **Faster per transfer.** A same-troll transfer takes 1 block, a cross-troll one 2. On mainnet, being on the same shard saves nothing: a follow-up receipt ran 1 block later on the same shard (14 of 14 samples) and across shards (64 of 65; one took 2). [`measurements/mainnet/receipt-latency-2026-11-13.json`](./measurements/mainnet)
- **A fix for a hot app.** If every holder calls one game or pool, that is one account on one shard.
- **Sharded trading.** DEXes use the wrapper, which is one contract on one shard.

---

## Use it

### In the browser

[**strl.xavio.dev/app**](https://strl.xavio.dev/app): connect a testnet wallet (Meteor or any NEAR Connect wallet), get 1,000 STRL in one tap, feed a troll, collect your share. It runs on the play deployment `play.strl.testnet` with **short testnet parameters**: 10-minute rounds and 1 feeder per troll (launch values: 24-hour rounds and 10 feeders). Starter-bag claims stay open until 2026-11-28.

### As contract calls

Every app action is a plain contract call; [`/app.md`](https://strl.xavio.dev/app.md) lists them with gas and deposits.

| Step | Call | On |
|---|---|---|
| Find your home troll | view `home_troll` {"account_id"} | root |
| Claim a starter bag (once) | `claim_launch` {}, 30 Tgas, claim fee + storage deposit if unregistered | your home troll |
| Feed (once a round) | `ft_transfer` {"receiver_id", "amount"} ≥ 1 STRL, 50 Tgas, 1 yocto | your home troll |
| Collect | `claim` {"epoch"}, 30 Tgas | your home troll |
| Close the round | `settle` {"epoch"}, ≥ 250 Tgas | root |

```js
// home troll = first 16 bytes of sha256(account_id), big-endian, mod 8
import { homeIndex } from "./packages/client/index.js";
const i = await homeIndex("alice.testnet", 8);   // index into the root's `trolls` view
```

### Launch your own token on the kit

```sh
node --dns-result-order=ipv4first scripts/deploy.mjs --network testnet --parent <your-parent> \
  --key-file <parent-key.json> --global-hash <troll code hash> --symbol <SYM> --name "<Name>" --troll-near 0.2
```

It publishes no code: a root plus eight troll accounts, placed on eight distinct shards. Measured on testnet: about 3.65 NEAR per token (8 × 0.2 NEAR for the trolls plus gas, and 1.89 NEAR locked for the root's storage). The script checks the balance first and stops before sending anything if it is short.

### For agents

| URL | Content |
|---|---|
| [`/llms.txt`](https://strl.xavio.dev/llms.txt) | Index of every page, with the facts to keep straight |
| [`/llms-full.txt`](https://strl.xavio.dev/llms-full.txt) | Every page in one file |
| `/index.md` · `/pitch.md` · `/paper.md` · `/evidence.md` · `/app.md` | Each page as markdown; the deck's figures are described in words |

---

## How it works

```mermaid
flowchart TB
    subgraph Holders["Holders"]
        A["alice<br/>(e.g. home: troll 2)"]
        B["bob<br/>(e.g. home: troll 6)"]
    end

    subgraph Root["Root · the parent account (play.strl.testnet)"]
        R["metadata · total supply · fixed params<br/>settle(epoch) · bounty budget"]
    end

    subgraph Trolls["8 trolls · one global code by hash"]
        T0["troll 0<br/>shard 10"]
        T1["troll 1<br/>shard 11"]
        T2["troll 2<br/>shard 12"]
        T3["troll 3<br/>shard 13"]
        T4["troll 4<br/>shard 9"]
        T5["troll 5<br/>shard 7"]
        T6["troll 6<br/>shard 4"]
        T7["troll 7<br/>shard 5"]
    end

    W["Wrapper<br/>single-shard NEP-141, for DEXes"]

    A -->|"ft_transfer"| T2
    T2 -->|"credit (cross-troll)"| T6
    T6 -->|"balance"| B
    R -.->|"report / apply, once a day"| Trolls
    W -.->|"holds troll tokens 1:1"| T0
```

| Piece | Role |
|---|---|
| Root (the parent account) | Metadata, total supply, immutable parameters, daily settlement. Never touched by transfers |
| 8 trolls (`<prefix>.<parent>`) | Balances of their holders, per-day sender counts, hoard, launch pool. One global contract code |
| Wrapper | Standard NEP-141 backed 1:1 by troll tokens it holds; single-shard, for DEXes |

- **Home troll:** the first 16 bytes of sha256(account_id), big-endian, mod 8. Uniform and independent of the shard layout. Clients compute it ([`packages/client`](./packages/client)) or ask the root's `home_troll` view. With hash homes, about 7 in 8 transfers between random holders cross trolls.
- **Registration:** a standard NEP-145 storage deposit at your home troll. Holders pay their own storage. Unregistering first pays any claimable rewards into your balance; it is refused while that balance is not zero, unless forced (which burns it).
- **Launch claim:** each account can claim a 1,000-token starter bag at its home troll during the launch window, for a 0.01 NEAR fee. The troll keeps the part that pays for the claim's own storage record (~0.0006–0.0011 NEAR) and forwards the rest to the root's bounty budget. Only that budget pays settle bounties; no other NEAR on the root is ever paid out.
- **The Troll Toll:** 0.25% of every cross-troll transfer is paid to the troll you cross into. It becomes that troll's food and funds its feeders' rewards, so nothing is burned by tolls. The toll is a design choice, not cost recovery: senders already pay the extra receipt's gas in NEAR.
- **The Feeding:** each day every troll counts its distinct senders (sends of at least 1 token).
  - If all eight trolls reach the target, the streak grows. Each troll pays its feeders a reward, **first from its food, then from its unclaimed launch pool**, and only then by minting.
  - A troll that misses the target starves: it burns 1% of its hoard, and the streak resets.
- **Settling:** anyone can call `settle({"epoch": N})` on the root for the next finished day, attaching at least 250 Tgas (300 recommended). A settlement that never finishes can be restarted after 600 blocks. The root pays whoever settles a 0.005 NEAR bounty if the budget holds enough; the bounty can never block settlement.
- **Claims and sweeps:** feeders call `claim({"epoch": N})` at their home troll within 30 days of that day's settlement, or are paid automatically on their next counted send. After the deadline anyone can `sweep` the day, and a troll also sweeps on its own as it settles: unclaimed shares go back to its food, and old per-day records are deleted, so a troll's storage stays bounded.
- **Bounded by its parameters:** a troll refuses any reward or burn the root asks for above the fixed parameters, so the root can't over-mint or over-burn.
- **No admin:** parameters are fixed at init and no method changes them. At the mainnet launch every full-access key on the root, trolls and wrapper is to be deleted (not done yet: there is no mainnet deployment, and the testnet root keeps its key).
- **Consistency:** a balance lives at exactly one troll and is always exact. The root's `ft_total_supply` is as of the last daily settlement; each troll's `ft_total_supply` is live for that troll.

### Parameters

| Parameter | Value |
|---|---|
| Total supply | 1,000,000,000 STRL, 24 decimals |
| Launch pool | 500,000,000 (62.5M per troll) |
| Hoards | 500,000,000 (62.5M per troll) |
| Launch claim | 1,000 per account; fee 0.01 NEAR; window 24 h |
| Day (epoch) | 24 h |
| `feed_target` | 10 distinct senders per troll per day |
| `min_counted_transfer` | 1 token |
| Reward | 250,000 per fed day across the trolls: from food first, then the launch pool, then minted |
| Starve burn | 1% (100 bps) of the starving troll's hoard |
| Troll Toll | 0.25% (25 bps) of each cross-troll transfer, paid to the destination troll as food |
| Settle bounty | 0.005 NEAR to whoever settles a day, from the bounty budget (forwarded claim fees) |
| Claim window | 30 days after a day's settlement; then the share returns to the troll's food |

Launch simulation with these parameters (`node sim/d24.js`): with 4,000 holders about 4M tokens are claimed, and the rest of the pool pays the reward for about 1,984 days, so the Feeding mints nothing in that time. (`npm run sim` runs the earlier 60-day model, whose defaults predate the claim fee and pool-funded rewards.)

---

## Cross-troll transfer flow

```mermaid
sequenceDiagram
    actor S as Sender
    participant A as Sender's troll (shard A)
    participant B as Receiver's troll (shard B)
    actor Rc as Receiver

    S->>A: ft_transfer(receiver, amount)
    A-->>A: Debit, mark in flight (log ft_burn)
    A->>B: credit(amount − toll, toll)
    alt receiver registered at its home troll
        B-->>B: Keep the toll as food (log ft_mint)
        B-->>Rc: Balance += amount − toll (log ft_mint)
        B-->>A: Credit succeeded → on_credit
        A-->>A: Close the transfer; resolves true
    else credit fails (e.g. receiver not registered)
        B-->>A: Credit failed → on_credit
        A-->>S: Full refund, toll included; resolves false
    end
    Note over A,B: Once a credit lands nothing is refunded, so a failure can never mint.<br/>Σ(supply + in flight + burned − minted) = total supply after every step.
```

`ft_transfer_call` works within and across trolls; attach at least 100 Tgas. Across trolls, the receiver's troll credits and calls `ft_on_transfer`, and the unused part comes back to the sender. Messages over 4 KB are rejected before any debit.

---

## Results

### On NEAR testnet (2026-11-14)

The final contracts, deployed under `v2.strl.testnet` (token STRL), on **short testnet parameters** so the Feeding plays out in minutes: 1 feeder per troll and 10-minute days. A few dozen real transactions, not a load test. Every check passed. Records: [`measurements/testnet-2026-11-14-final/`](./measurements/testnet-2026-11-14-final), shown transaction by transaction on the [Evidence](https://strl.xavio.dev/evidence) page.

| Check | Result |
|---|---|
| One code for eight trolls | All 8 trolls run global contract `8XXviK8PceCwicgzFtKi2VoBNWR7MXFMBkZSDKNuFAEk`, the sha256 of `troll.wasm`, on shards 10, 11, 12, 13, 9, 7, 4 and 5. Deploy cost: 24.21 testnet NEAR |
| Fan-out | One stampede transaction → 50 of 50 same-troll transfers; another → 25 of 25 mixed transfers (8 cross-troll); 0 failed receipts |
| Cross-troll transfer | Sender −100; the receiver's troll keeps the 0.25 toll as food |
| Credit to an unregistered receiver | The credit fails and the sender is fully refunded (change 0) |
| Cross-troll `ft_transfer_call` to an account with no contract | The unused amount is returned; the sender pays only the toll |
| `ft_transfer_call` at exactly 100 Tgas | A 4,096-byte message works; 4,097 bytes is refused before anything is debited |
| Settlement gas floor | `settle` at 249 Tgas is refused up front and leaves settlement unlocked; at 250 Tgas it settles |
| The Feeding, day 0 | 8 feeders, one per troll, each crossing a stream; every troll eats a 0.25 STRL toll. Settled: fed, streak 1, rewards from food first, then the launch pool; the settler earned the 0.005 NEAR bounty |
| The Feeding, day 1 | Seven trolls fed, one not. That troll starved and burned 625,000 STRL (1% of its hoard); streak back to 0 |
| A second token on the same code | `kit.strl.testnet` (KIT) deployed by code hash, no code published: about 3.65 NEAR |
| Conservation | Σ over the trolls of (supply + in flight + burned − minted) = total supply, and the root agrees with all eight trolls, after every step |

Earlier runs on earlier builds (`st.xavio.testnet`, `st2.xavio.testnet`) are kept in [`measurements/`](./measurements).

### Under synthetic load (local network)

A single-node localnet (near-sandbox 2.14.1, protocol 88) running mainnet's 10-shard layout, 1,000 Tgas chunks and mainnet's congestion thresholds. **Not mainnet or testnet:** one node runs all ten shards, so absolute numbers are a lower bound and the comparison is the point. The control is one ordinary NEP-141 contract. Every transaction was looked up afterwards, and receivers' balances matched what the included transactions should deliver, to the yocto. [`measurements/localnet-2026-11-14/summary.json`](./measurements/localnet-2026-11-14)

| Offered load | Control token | Trolls, same-troll | Trolls, mixed (87.5% cross) |
|---|---|---|---|
| 2,000/s for 90 s | 703/s executed; 63% included; congestion 0.85; 280 of 728 direct transfers rejected (`ShardCongested`) | **1,980/s** (all of it); 100% included; congestion 0; 0 rejected | **1,358–1,663/s** over three runs on three successive builds (1,358/s on the current one); 73–89% included; congestion ≤ 0.08; 0 rejected |
| 1,000/s for 60 s | 672/s; a backlog built (congestion 0.30) and drained after the load stopped | — | **969/s** (all of it); 100% included; congestion 0 |

- **Ceiling:** offered 6,000/s of same-troll traffic (earlier build, same transfer path), the trolls executed 4,220/s, 75% included, congestion 0.04, none rejected.
- **In round numbers:** same-troll traffic gets about 6× the control's capacity, mixed traffic about 1.9–2.4×. No transaction to a troll was rejected for congestion; the control's were.
- **Silent drops** (this single-node localnet, control and trolls alike): past about 70–85% chunk fullness the node sometimes accepted a transaction and never included it, with congestion far below 0.8. A multi-node network has not been checked.

---

## What is checked

| Layer | How |
|---|---|
| **Audits** | Five passes on 2026-11-14: a manual review, then the `near-contract-audit` checklist on the base contracts, on the toll-as-food and bounty changes, and on each hardening fix and its amendment. Every Critical and High finding fixed; every Medium fixed except one inherent to async transfers and disclosed below |
| **Unit and property tests** | troll 101, root 24: conservation runs of 3 × 10,000 steps and 30-day lifecycles with random transfers, transfer-and-calls, failed and refunded credits, restarted settlements, claims, expiry and sweeps. After every step: supply, an indexer-style replay of each troll's events, and root = trolls |
| **Sandbox integration** | Including a local network with mainnet's 10-shard layout and the full Feeding lifecycle: claim fees → tolls → settle with bounty → claims → starve → stuck settlement restarted |
| **Deployment rehearsals** | Every deployment path scripted on that local network with fault injection: rate limits mid-deploy and resume, underfunded deploys, code-hash mismatch, settlement timeout, reward expiry and sweep. Two final passes on the hardened build: 30 of 30 checks each ([`rehearsal-final-summary.json`](./measurements/localnet-2026-11-14)) |
| **Testnet** | The eleven checks above, transaction by transaction |
| **Layout** | `npm run check`: the 8 trolls sit on 8 distinct shards under today's live mainnet and testnet layouts |

---

## Limits and known issues

### Sybil limits, plainly

- **Keeping the streak alive with bots is cheap:** about 0.02 NEAR a day plus 0.16 NEAR of setup for 80 bots.
- **Bots can take most of the daily reward once the token has value.** The reward is split equally among feeders: at a fully diluted value of 10,000 NEAR a farmer takes about 65% of it; at 100,000 NEAR, about 89%; below about 1,000 NEAR farming does not pay. Food from tolls funds the same equal split. A stake-weighted split would close this hole; it is not built.
- **Draining the launch pool does not pay** below about 10,500 NEAR of value. Taking the whole pool would need 500,000 claims (about 5,250 NEAR).
- Sub-accounts count as separate accounts. **The Feeding is a game, not a Sybil-proof mechanism.**

### Known issues

- **Integrators, registration:** register receivers at their **home** troll (the root's `home_troll` view, or `packages/client`, which does it before sending). A wallet that registers receivers on the sender's troll fails for about 7 in 8 receivers.
- **Integrators, results:** a cross-troll `ft_transfer` can succeed as a transaction yet deliver nothing. It resolves to `true` when the receiver was credited and `false` when the transfer was refunded. Contracts that send tokens must check that value. (The disclosed Medium.)
- **Fixed before launch:** a cross-troll `ft_transfer_call` with a very large `msg` (hundreds of KB) could run out of gas after the debit and lose the transfer. Messages over 4 KB are now rejected before any debit, and the credit step has more gas reserved (tested at exactly 100 Tgas).
- **Out-of-order delivery (not seen in practice):** if a troll ever received a day's report before the previous day's payout, that payout could draw less food and mint a little more than the root booked. A troll never pays more food than it holds, and the root's total corrects itself at the next settlement.
- **Root NEAR:** only NEAR sent through `fund_bounty` can be paid out as bounties. Any other NEAR on the root stays there for good: there is no withdraw method.
- A malicious same-troll receiver can return an oversized result from `ft_on_transfer`, leaving the sender's pending counter stuck so the sender can't unregister; no tokens are lost.
- **Wallets and explorers** see one token per troll touched, some with balance 0. Explorers attribute a troll's hoard, pools and food to the troll's own account, but `ft_balance_of(troll)` returns 0.

### Next

Optimistic credit (two receipts instead of three, researched, not built), a stake-weighted reward split, the wrapper on a DEX, and mainnet.

---

## Where it lives

### Contracts

| Capability | Code |
|---|---|
| **Troll ledger:** NEP-141/145/148, home check, claims, sweeps | [`contracts/troll/src/lib.rs`](./contracts/troll/src/lib.rs) (`ft_transfer`, `claim_launch`, `claim`, `sweep`, `storage_*`) |
| **Cross-troll transfer:** debit, credit, confirm, refund | [`contracts/troll/src/lib.rs`](./contracts/troll/src/lib.rs) (`credit`, `on_credit`, `credit_call`, `on_credit_call`) |
| **The Feeding, troll side:** reports and bounded apply | [`contracts/troll/src/lib.rs`](./contracts/troll/src/lib.rs) (`report`, `apply`) |
| **Root:** settlement, bounty, home lookup | [`contracts/root/src/lib.rs`](./contracts/root/src/lib.rs) (`settle`, `on_reports`, `fund_bounty`, `home_troll`) |
| **Shared params and types** | [`contracts/types/`](./contracts/types) |
| **DEX wrapper** (single-shard NEP-141, 1:1) | [`contracts/wrapper/`](./contracts/wrapper) |
| **Stampede** (one transaction fans out to many transfers) and the **control** token | [`contracts/stampede/`](./contracts/stampede) · [`contracts/control/`](./contracts/control) |

### Tooling and site

| Capability | Code |
|---|---|
| **Shard placement** and live layout check | [`packages/layout/`](./packages/layout) (`shardOf`, `place`, `check.js`) |
| **Client:** home troll, routing, registration before sending | [`packages/client/`](./packages/client) (`homeIndex`) |
| **Deploy by code hash**, with balance and hash checks | [`scripts/deploy.mjs`](./scripts/deploy.mjs) |
| **Testnet checks** (K2, K3, K7, the Feeding) | [`scripts/testnet-k.mjs`](./scripts/testnet-k.mjs) |
| **Local network, load and measurement** | [`scripts/localnet.mjs`](./scripts/localnet.mjs) · [`scripts/load.mjs`](./scripts/load.mjs) · [`scripts/measure.mjs`](./scripts/measure.mjs) |
| **Deployment rehearsals with fault injection** | [`scripts/rehearse-localnet.sh`](./scripts/rehearse-localnet.sh) · [`scripts/lib/`](./scripts/lib) |
| **Supply and Sybil simulations** | [`sim/`](./sim) |
| **Website**, app and agent-readable pages | [`web/`](./web) (Next.js) · [`web/app/lib/agent/`](./web/app/lib/agent) |

---

## Repository layout

```
contracts/     troll, root, wrapper, types, stampede (load generator), control (one ordinary NEP-141)
integration/   sandbox tests, including a local network with mainnet's 10-shard layout
packages/      layout (shard placement, live check) and client (home troll, routing)
scripts/       deploy, testnet checks, localnet, load, measurement, rehearsals, faucet helpers
sim/           supply and Sybil simulations
measurements/  every number in this README, as JSON: mainnet probes, localnet runs, testnet checks
web/           the website, app, deck, litepaper and evidence (Next.js, deployed on Vercel)
web-html/      the static evidence pages kept from the first site
```

---

## Development

**Prerequisites:** Rust stable with `wasm32-unknown-unknown` (pinned in `rust-toolchain.toml`), `cargo-near`, and Node 24. The JS tools have no dependencies.

```sh
# Contracts: unit tests, conservation property runs, event replay
cargo test -p troll -p root -p troll-types -p wrapper

# Sandbox integration, including a 10-shard local network
cargo test -p integration

# JS tools: layout, client, scripts and simulation tests
npm run test:js
npm run check     # 8 trolls on 8 distinct shards, against the live mainnet and testnet layouts
npm run sim       # supply simulation -> sim/out/ (CSV + SVG)

# Website
cd web && npm install && npm run dev    # http://localhost:3000
```

All code was written during the NEAR HACKATHON 2026 build window (2026-11-12 to 2026-11-14). Libraries: near-sdk, near-contract-standards, near-api, near-sandbox and cargo-near. Built with AI assistance (Claude Code).

---

## License

MIT ([`LICENSE`](./LICENSE)), xavio2495.

> **Testnet software:** provided "as is", without warranty of any kind. Sharded Trolls has not been independently audited.

---

<br><br>

<div align="center">

<h3>Built By

[Immanuel](https://github.com/xavio2495)

</h3>
</div>
