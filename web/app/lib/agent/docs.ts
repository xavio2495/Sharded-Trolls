// Plain-markdown versions of every page, for agents and LLM tools (served at /llms.txt and /<page>.md).
// The deck reads the same words as /pitch; the landing, app and evidence texts mirror their pages.
import fs from "node:fs";
import path from "node:path";
import { SLIDE_TEXT } from "@/app/pitch/slides";
import { PAPER_MD } from "./paper";

export const SITE = "https://strl.xavio.dev";
const REPO = "https://github.com/xavio2495/Sharded-Trolls";
const ROOT = "play.strl.testnet";
const TIP = "tips.play.strl.testnet";

export const PAGES = [
  { path: "/index.md", html: "/", title: "Sharded Trolls", about: "What it is, in one page: the problem, the eight trolls, the cross-shard transfer, the proof, the kit, the Feeding." },
  { path: "/pitch.md", html: "/pitch", title: "Pitch deck", about: "The 12-slide technical deck, every slide with its figure described in words." },
  { path: "/paper.md", html: "/paper", title: "Litepaper", about: "Design, protocol, token mechanics, security, results, limits and references." },
  { path: "/evidence.md", html: "/evidence", title: "Evidence", about: "Every measured number with its source file: synthetic load tests and the testnet checks." },
  { path: "/app.md", html: "/app", title: "The Feeding (app)", about: "How to claim, feed, send, settle and collect, as contract calls an agent can make on NEAR testnet." },
] as const;

const header = (title: string, html: string) =>
  `<!-- ${SITE}${html} as markdown. Index of all pages: ${SITE}/llms.txt -->\n\n`;

export function landingMd(): string {
  return `${header("Sharded Trolls", "/")}# Sharded Trolls: pay the troll.

One token, split across eight NEAR shards. A launch rush can't jam one shard, because there are eight.

Links: [Feed a troll](${SITE}/app) · [How it's built](${SITE}/pitch.md) · [Paper](${SITE}/paper.md) · [Evidence](${SITE}/evidence.md) · [Code](${REPO})

## NEAR never splits a contract.

Shards split only between accounts. So when a claim rush hits one token, it all queues on one shard. It has happened before.

- **42.5%**: HOT, split on 2024-03-21. Full on the shard holding game.hot.tg, against 10.2% on every other shard.
- **66%**: KaiChing, split on 2025-03-19. Of sampled receipts went to three KaiChing accounts before NEAR split the shard.

## So we split the token.

One ordinary token is one contract: one river. Every holder queues on its shard.

- Eight ledgers, the trolls, one on each shard.
- Your home troll is a hash of your account, so the crowd spreads evenly.
- One contract code, published once, shared by all eight.

## Crossing a shard is the hard part.

Same troll: one step, no toll. Another troll: the transfer crosses shards and comes back. We call the 0.25% the Troll Toll.

1. **Debit.** Your troll takes the coins out of your balance and marks them in flight.
2. **Credit.** One hop to the receiver's troll on its own shard. It pays your friend and keeps 0.25% as food.
3. **Confirm.** Back home, your troll closes the transfer. Nothing is ever left in flight.

Credit fails? Every coin comes back. Credit landed? Never refunded, so a failure can never mint. Supply is checked after every step.

## Run on real NEAR, audited, and rehearsed.

- **8** shards, one troll each, running one global contract by hash on NEAR testnet.
- **50/50** transfers fanned out from one transaction, zero failed receipts.
- **0** transfers to a troll rejected for congestion; one ordinary token rejected 280 (synthetic localnet).
- **5** audit passes; every critical and high finding fixed, every medium fixed or disclosed.

Honest limits: not faster per transfer, wallets list one entry per troll, the Feeding is a game and not Sybil-proof, and DEX trading goes through a single-shard wrapper. [See every measurement](${SITE}/evidence.md).

## It's a kit.

The troll code is published once as a global contract. The next token reuses it by hash: a root and eight small troll accounts, placed on eight shards. On testnet that cost about 3.65 NEAR.

\`\`\`sh
node scripts/deploy.mjs --network testnet \\
  --parent your.testnet --key-file key.json \\
  --global-hash 8XXviK8PceCwicgzFtKi2VoBNWR7MXFMBkZSDKNuFAEk \\
  --symbol YOURS --name "Your Trolls"
\`\`\`

## Feed them all, or they starve.

- **Fed.** Every troll gets its feeders for the day: the streak grows, and each troll pays its feeders from the tolls it ate, then from its launch pool.
- **Starving.** A troll nobody fed burns 1% of its hoard, and the streak starts over.
- **Settled by anyone.** Whoever closes the day earns a small NEAR bounty, paid from the claim fees.

The eight trolls: Beanie (shard 10), Lantern (11), Fisher (12), Straw Hat (13), Scholar (9), Kettle (7), Oar (4), Mushroom (5).

## Feed a troll today.

Claim a starter bag, cross a stream, and watch a troll eat your toll. Testnet, free. [Open the app](${SITE}/app) ([as calls](${SITE}/app.md)) · [Watch the pitch](${SITE}/pitch) · [Read the code](${REPO})

MIT · live on NEAR testnet
`;
}

export function pitchMd(): string {
  const slides = SLIDE_TEXT.map((s, k) => {
    const lines = [`## ${k + 1}. ${s.title}`, ""];
    if (s.body) lines.push(s.body, "");
    if (s.points) lines.push(...s.points.map((p) => `- ${p}`), "");
    lines.push(`*Figure:* ${s.figure}`, "");
    return lines.join("\n");
  });
  return `${header("Pitch", "/pitch")}# Sharded Trolls: the pitch deck

${SLIDE_TEXT.length} slides. Open slide N in a browser at ${SITE}/pitch?s=N.

${slides.join("\n")}`;
}

export function paperMd(): string {
  return header("Paper", "/paper") + PAPER_MD.replaceAll("](/evidence)", `](${SITE}/evidence.md)`).replaceAll("](/measurements/", `](${SITE}/measurements/`);
}

/** Every measurement file shipped with the site, listed at build time. */
function measurementFiles(): string[] {
  const base = path.join(process.cwd(), "public", "measurements");
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) out.push(path.relative(base, p).split(path.sep).join("/"));
    }
  };
  walk(base);
  return out;
}

export function evidenceMd(): string {
  const results = PAPER_MD.slice(PAPER_MD.indexOf("## Results"), PAPER_MD.indexOf("## The kit")).replace("## Results", "## Results");
  const files = measurementFiles();
  const groups = new Map<string, string[]>();
  for (const f of files) {
    const g = f.split("/")[0];
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(f);
  }
  const fileList = [...groups]
    .map(([g, fs_]) => `### ${g}\n\n${fs_.filter((f) => !f.includes("/runs/")).map((f) => `- ${SITE}/measurements/${f}`).join("\n")}${fs_.some((f) => f.includes("/runs/")) ? `\n- ${fs_.filter((f) => f.includes("/runs/")).length} per-block run files under ${SITE}/measurements/${g}/runs/ (see summary.json for their ids)` : ""}`)
    .join("\n\n");
  return `${header("Evidence", "/evidence")}# Measured, not simulated

Load tests against one ordinary token and against the eight trolls, run on a local NEAR network with mainnet's shard layout, and the final contracts checked transaction by transaction on testnet. Every number here comes from a file in the repository.

The web page has three views: **Compare** (one shard against eight, at 2,000 and 1,000 transfers/s offered), **Replay** (every block of a run, shard by shard) and **Testnet** (each check with its transaction). The numbers behind all three are below.

Localnet: synthetic load, single node, running mainnet's 10-shard layout (measured 2026-11-14). Not mainnet or testnet numbers. Same-shard transfers are not faster; the gain is throughput and no congestion rejections.

${results.trim()}

## Raw records

Machine-readable JSON, served with the site. Transactions can be looked up at https://testnet.nearblocks.io/txns/<hash>.

${fileList || "(measurement files are copied in at build time)"}
`;
}

export function appMd(): string {
  return `${header("App", "/app")}# The Feeding: playing with contract calls

The app at ${SITE}/app is a wallet front end for the STRL deployment on **NEAR testnet**. Everything it does is a plain contract call, so an agent with a testnet account can do the same. Testnet tokens have no value.

This deployment runs short testnet parameters: **10-minute rounds** (a "day" in the contracts, called an epoch) and **1 feeder per troll**. A launch would use 24-hour rounds and 10 feeders.

## Accounts

- Root: \`${ROOT}\`. Metadata, parameters, settlement. Transfers never touch it.
- Trolls: eight accounts, one per shard. List them with the root's \`trolls\` view.
- Tip jar: \`${TIP}\`. The app's "Feed a troll" sends 1 STRL here.
- RPC: https://test.rpc.fastnear.com · Explorer: https://testnet.nearblocks.io

## Find your home troll

Your home troll is \`trolls[i]\` with i = first 16 bytes of sha256(account_id), read big-endian, mod 8. Or ask the root: view \`home_troll\`. All your balance lives there; always call your home troll.

## Read state (view calls)

| Contract | Method | Args | Returns |
| --- | --- | --- | --- |
| root | \`params\` | {} | fixed parameters: toll_bps, feed_target, epoch_ms, launch_window_ms, launch_claim_amount, min_counted_transfer, claim_fee, settle_bounty, claim_epochs, … |
| root | \`trolls\` | {} | the eight troll account ids, in home order |
| root | \`home_troll\` | {"account_id"} | that account's home troll |
| root | \`info\` | {} | current_epoch, next_epoch (the next round to settle), settling, streak, best_streak, total_supply, bounty_budget |
| root | \`ft_metadata\` | {} | name, symbol (STRL), 24 decimals |
| troll | \`info\` | {} | index, epoch, senders_this_epoch, supply, in_flight, hoard, launch_pool, food, minted, burned, last_applied |
| troll | \`ft_balance_of\` | {"account_id"} | balance (yocto-STRL string) |
| troll | \`storage_balance_of\` | {"account_id"} | null if not registered |
| troll | \`storage_balance_bounds\` | {} | registration deposit (min) |
| troll | \`has_claimed_launch\` | {"account_id"} | bool |
| troll | \`is_feeder\` | {"epoch", "account_id"} | whether the account fed that round |

## The three steps

1. **Claim a starter bag** (once per account, within \`params.launch_window_ms\` of launch; 14 days on this deployment): call \`claim_launch\` {} on your home troll, 30 Tgas, attaching the claim fee (\`params.claim_fee\`) plus the storage deposit (\`storage_balance_bounds.min\`) if you are not registered yet.
2. **Feed a troll** (once a round): send at least 1 STRL with \`ft_transfer\` {"receiver_id", "amount"} on your home troll, 50 Tgas, 1 yoctoNEAR attached. Sending to an account on another troll crosses a shard and pays the 0.25% toll to that troll as food. The receiver must be registered at **its own** home troll (\`storage_deposit\` {"account_id", "registration_only": true} on that troll) or the credit fails and you are refunded in full. The app's feed sends 1 STRL to \`${TIP}\`.
3. **Collect** after the round is settled: call \`claim\` {"epoch"} on your home troll, 30 Tgas. Shares not claimed within the claim window are paid on your next counted send, or return to the troll's food after the deadline.

Anyone can **settle** a finished round: \`settle\` {"epoch"} on the root with at least 250 Tgas (the app uses 300). Rounds settle oldest first. The settler earns the bounty when the bounty budget holds enough.

Transfer-and-call: \`ft_transfer_call\` {"receiver_id", "amount", "msg"} on your home troll, at least 100 Tgas, 1 yoctoNEAR, msg at most 4,096 bytes. A cross-troll \`ft_transfer\` resolves to \`true\` when credited and \`false\` when refunded; check the value.

## Not for sale

There is no market: STRL is earned by claiming and feeding. Trading would go through a single-shard NEP-141 wrapper, built but not deployed.
`;
}

export function llmsTxt(): string {
  return `# Sharded Trolls

> A launch kit for tokens that expect a claim rush: one token's ledger split across eight contracts ("trolls"), one on each reachable NEAR shard, so a launch rush can't congest one shard. STRL is the first coin on it, live on NEAR testnet.

Facts an agent should keep: transfers are not faster per transfer (one block same-troll, two across); the gain is throughput and no congestion rejections. Load numbers come from a synthetic single-node local network with mainnet's shard layout, not from mainnet. There is no mainnet deployment yet. The Feeding is a game, not Sybil-proof.

## Pages

${PAGES.map((p) => `- [${p.title}](${SITE}${p.path}): ${p.about} (HTML: ${SITE}${p.html})`).join("\n")}

## Optional

- [Everything in one file](${SITE}/llms-full.txt): all pages above, concatenated.
- [Source code](${REPO}): contracts, deploy scripts, tests, site.
- [Testnet checks (JSON)](${SITE}/measurements/testnet-2026-11-14-final/k-tests.json)
- [Load test summary (JSON)](${SITE}/measurements/localnet-2026-11-14/summary.json)
`;
}

export function llmsFullTxt(): string {
  return [llmsTxt(), landingMd(), pitchMd(), paperMd(), evidenceMd(), appMd()].join("\n\n---\n\n");
}

export const markdown = (body: string) =>
  new Response(body, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" } });
export const plain = (body: string) =>
  new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
