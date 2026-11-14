import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Litepaper · Sharded Trolls",
  description:
    "A token ledger split across eight NEAR shards: the design, the cross-shard transfer protocol, the token mechanics, security work, and the measured results.",
};

const NEP = (n: string) => `https://github.com/near/NEPs/blob/master/neps/nep-${n}.md`;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t-[3px] border-ink-0 pt-10">
      <h2 className="font-display text-3xl leading-tight text-ink-0 md:text-4xl">{title}</h2>
      <div className="mt-6 space-y-5 text-[1.05rem] leading-relaxed text-ink-1">{children}</div>
    </section>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <ul className="list-[square] space-y-2 pl-5 marker:text-ink-0">{children}</ul>;
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-ink-0">{children}</strong>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-surface-2 px-1 font-mono text-[0.9em] text-ink-0">{children}</code>;
}

function Figure({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="slab p-4 md:p-6">
      <div className="overflow-x-auto">{children}</div>
      <figcaption className="mt-4 text-sm text-ink-2">{caption}</figcaption>
    </figure>
  );
}

/** Two-column tables wrap on phones; `wide` ones (more columns) scroll sideways inside their figure. */
function Table({ head, rows, wide = false }: { head: string[]; rows: React.ReactNode[][]; wide?: boolean }) {
  return (
    <table className={`w-full border-collapse text-left text-sm ${wide ? "min-w-[640px]" : ""}`}>
      <thead>
        <tr className="border-b-[3px] border-ink-0">
          {head.map((h) => (
            <th key={h} className="py-2 pr-4 font-semibold text-ink-0">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-hairline align-top last:border-0">
            {r.map((c, j) => (
              <td key={j} className={`py-2 pr-4 ${j === 0 ? "font-medium text-ink-0" : "text-ink-1"}`}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The cross-troll transfer: debit at the source, credit at the receiver's troll, confirm back at the source. */
function ProtocolFigure() {
  const L = 150, R = 610, top = 70;
  const arrow = (y1: number, y2: number, toRight: boolean) => {
    const x1 = toRight ? L : R, x2 = toRight ? R : L;
    const head = toRight ? `${x2 - 12},${y2 - 6} ${x2},${y2} ${x2 - 12},${y2 + 6}` : `${x2 + 12},${y2 - 6} ${x2},${y2} ${x2 + 12},${y2 + 6}`;
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink-0)" strokeWidth="3" />
        <polygon points={head} fill="var(--ink-0)" />
      </g>
    );
  };
  return (
    <svg viewBox="0 0 760 420" className="h-auto w-full min-w-[520px]" role="img" aria-label="Cross-troll transfer: debit at the sender's troll, credit at the receiver's troll, then confirmation at the sender's troll">
      {[[L, "Sender's troll"], [R, "Receiver's troll"]].map(([x, t]) => (
        <g key={t as string}>
          <rect x={(x as number) - 110} y={14} width="220" height="40" fill="var(--paper)" stroke="var(--ink-0)" strokeWidth="3" />
          <text x={x as number} y={40} textAnchor="middle" fontSize="16" fontWeight="600" fill="var(--ink-0)">{t as string}</text>
          <line x1={x as number} y1={54} x2={x as number} y2={404} stroke="var(--ink-0)" strokeWidth="2" strokeDasharray="6 6" />
        </g>
      ))}
      <rect x={L - 100} y={top + 10} width="200" height="64" fill="var(--accent-tint)" stroke="var(--ink-0)" strokeWidth="2" />
      <text x={L} y={top + 36} textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--ink-0)">debit</text>
      <text x={L} y={top + 58} textAnchor="middle" fontSize="13" fill="var(--ink-1)">logged ft_burn; in flight</text>
      {arrow(top + 110, top + 110, true)}
      <text x={(L + R) / 2} y={top + 100} textAnchor="middle" fontSize="13" fill="var(--ink-1)">credit receipt: amount, toll</text>
      <rect x={R - 120} y={top + 130} width="240" height="84" fill="var(--accent-tint)" stroke="var(--ink-0)" strokeWidth="2" />
      <text x={R} y={top + 156} textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--ink-0)">credit</text>
      <text x={R} y={top + 178} textAnchor="middle" fontSize="13" fill="var(--ink-1)">ft_mint amount − toll to receiver</text>
      <text x={R} y={top + 198} textAnchor="middle" fontSize="13" fill="var(--ink-1)">ft_mint toll to the troll (food)</text>
      {arrow(top + 238, top + 238, false)}
      <text x={(L + R) / 2} y={top + 228} textAnchor="middle" fontSize="13" fill="var(--ink-1)">result: credited, or failed</text>
      <rect x={L - 135} y={top + 258} width="270" height="64" fill="var(--accent-tint)" stroke="var(--ink-0)" strokeWidth="2" />
      <text x={L} y={top + 284} textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--ink-0)">confirm</text>
      <text x={L} y={top + 306} textAnchor="middle" fontSize="13" fill="var(--ink-1)">closes it; failed credit → full refund</text>
    </svg>
  );
}

const TOC: [string, string][] = [
  ["abstract", "Abstract"],
  ["problem", "The problem"],
  ["design", "Design"],
  ["protocol", "The cross-shard transfer"],
  ["mechanics", "Token mechanics"],
  ["security", "Security"],
  ["results", "Results"],
  ["kit", "The kit"],
  ["limits", "Limitations and future work"],
  ["references", "References"],
];

export default function PaperPage() {
  return (
    <div className="min-h-full bg-paper">
      <header className="sticky top-0 z-40 border-b-[3px] border-ink-0 bg-paper">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Sharded Trolls, home" className="flex min-w-0 shrink items-center gap-2 font-display text-lg tracking-wide text-ink-0 sm:gap-3 sm:text-2xl">
            <Image src="/logo.svg" alt="" width={40} height={40} className="size-8 shrink-0 sm:size-10" />
            <span className="hidden truncate sm:inline">Sharded Trolls</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1 text-sm font-medium text-ink-1 sm:gap-3">
            <Link href="/evidence" className="inline-flex min-h-11 items-center whitespace-nowrap px-2 hover:text-ink-0">Evidence</Link>
            <Link href="/pitch" className="inline-flex min-h-11 items-center whitespace-nowrap px-2 hover:text-ink-0">Pitch</Link>
            <Link href="/app" className="inline-flex min-h-11 items-center whitespace-nowrap px-2 hover:text-ink-0">
              <span className="sm:hidden">Live</span>
              <span className="hidden sm:inline">The Feeding, live</span>
            </Link>
            <Link href="/" className="inline-flex min-h-11 items-center whitespace-nowrap px-2 hover:text-ink-0">
              <span className="sm:hidden">Story</span>
              <span className="hidden sm:inline">Back to the story</span>
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-28 pt-12 sm:px-6">
        <h1 className="font-display text-5xl leading-[1.02] text-ink-0 md:text-6xl">Sharded Trolls: a token ledger across eight shards</h1>
        <p className="lead mt-5">
          A launch kit for tokens that expect a claim rush. STRL is the first coin on it. This paper describes the design, the protocol and the evidence; every number links back to a
          measurement file or to the <Link className="underline underline-offset-2" href="/evidence">Evidence</Link> page.
        </p>

        <nav aria-label="Contents" className="mt-10 border-[3px] border-ink-0 p-5">
          <p className="font-display text-xl text-ink-0">Contents</p>
          <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {TOC.map(([id, t]) => (
              <li key={id}>
                <a href={`#${id}`} className="inline-flex min-h-11 items-center text-ink-0 underline underline-offset-4 hover:text-accent-deep sm:min-h-8">{t}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-14 space-y-16">
          <Section id="abstract" title="Abstract">
            <p>
              A NEAR contract lives on one shard, so a token is normally one shard&apos;s worth of capacity. Sharded Trolls splits a token&apos;s ledger into eight contracts, the{" "}
              <Strong>trolls</Strong>, one on each reachable shard of today&apos;s mainnet layout. Every holder lives at one troll, chosen by a hash of the account id. A transfer between
              holders of the same troll is a single receipt; a transfer across trolls is a three-step protocol that refunds in full on failure and can never mint. Crossing pays the{" "}
              <Strong>Troll Toll</Strong>, which feeds the troll you cross into. A daily game, <Strong>the Feeding</Strong>, pays rewards when all eight trolls are fed and burns part of a
              starving troll&apos;s hoard.
            </p>
            <p>
              The final contracts were checked transaction by transaction on NEAR testnet. Under synthetic load on a single-node local network with mainnet&apos;s shard layout, same-troll
              traffic reached about 6× the capacity of one ordinary token contract, and mixed traffic about 1.9–2.4×. Transfers are not faster; the gain is room.
            </p>
          </Section>

          <Section id="problem" title="The problem: one contract, one shard">
            <List>
              <li>
                <Strong>NEAR never splits a contract.</Strong> Shards split only at account boundaries, so one contract always lives on one shard. Mainnet runs 10 shards (protocol 88),
                and dynamic resharding is off. A token that wants room on more than one shard has to be more than one contract.
              </li>
              <li>
                <Strong>Claim rushes are what filled NEAR&apos;s shards.</Strong> Before the 2024-03-21 split at <Code>game.hot.tg</Code>, the shard holding it averaged 42.5% chunk
                fullness against 10.2% on the other shards; its top receivers were earn.kaiching, game.hot.tg, wallet.kaiching and relay.tg. Before the 2025-03-19 split at{" "}
                <Code>earn.kaiching</Code>, the parent shard averaged 12.3% against 7.5%, and three KaiChing accounts took 66% of sampled receipts. Launch claims and daily claims are that
                kind of load.
              </li>
              <li>
                <Strong>The sharded-token draft does not spread yet.</Strong> NEP-636 uses one wallet contract per holder, at NEP-616 ids that start with <Code>0s</Code>. Under
                today&apos;s mainnet layout all of those ids sort below the first shard boundary (<Code>650</Code>), so they would sit on one shard until a future split.
              </li>
              <li>
                <Strong>Headroom, not a rescue.</Strong> Mainnet is not congested today: over one hour on 2026-11-12 the shards averaged 0.04–2.5% of chunk gas, with single-chunk peaks
                up to 84% (shard 8). The design makes sure a coin&apos;s own launch rush can never pile onto one shard.
              </li>
            </List>
          </Section>

          <Section id="design" title="Design">
            <Figure caption="The pieces of one token on the kit.">
              <Table
                head={["Piece", "Role"]}
                rows={[
                  ["Root (the parent account)", "Metadata, total supply, immutable parameters, daily settlement. Never touched by transfers."],
                  ["8 trolls (<prefix>.<parent>)", "Balances of their holders, per-day sender counts, hoard, launch pool. One global contract code."],
                  ["Wrapper", "Standard NEP-141 backed 1:1 by troll tokens it holds; single-shard, for DEXes."],
                ]}
              />
            </Figure>
            <List>
              <li>
                <Strong>Eight ledgers, eight shards.</Strong> Each troll account is placed on a distinct shard, checked against the live mainnet and testnet layouts (
                <Code>npm run check</Code>).
              </li>
              <li>
                <Strong>Hash homes.</Strong> A holder&apos;s home troll is the first 16 bytes of sha256(account_id), read big-endian, mod 8. This is uniform and independent of the shard
                layout. Clients compute it, or ask the root&apos;s <Code>home_troll</Code> view. With hash homes, about 7 in 8 transfers between random holders cross trolls.
              </li>
              <li>
                <Strong>One global code.</Strong> The troll code is published once as a NEAR global contract and identified by its hash, so all eight trolls provably run the same code and
                the next token reuses it.
              </li>
              <li>
                <Strong>Root settlement.</Strong> Ordinary transfers never touch the root. Once a day the root gathers the eight trolls&apos; reports, decides fed or starved, and tells each
                troll to pay a reward or burn.
              </li>
              <li>
                <Strong>Consistency.</Strong> A balance lives at exactly one troll and is always exact. The root&apos;s <Code>ft_total_supply</Code> is as of the last daily settlement;
                each troll&apos;s <Code>ft_total_supply</Code> is live for that troll.
              </li>
              <li>
                <Strong>No admin.</Strong> Parameters are fixed at init and no method changes them. At the mainnet launch every full-access key on the root, trolls and wrapper is to be
                deleted; there is no mainnet deployment yet, and the testnet root keeps its key.
              </li>
            </List>
          </Section>

          <Section id="protocol" title="The cross-shard transfer">
            <p>
              A same-troll transfer is one receipt and takes 1 block. A cross-troll transfer takes 2 and has three steps: a debit at the source, a credit at the receiver&apos;s troll, and a
              confirmation back at the source that closes the transfer. Each troll logs its own side as standard NEP-297 events, in ERC-7802&apos;s burn-at-source, mint-at-destination
              pattern, so every troll&apos;s event log balances on its own.
            </p>
            <Figure caption="A cross-troll transfer. The toll is minted to the receiving troll as food; nothing is burned by tolls.">
              <ProtocolFigure />
            </Figure>
            <List>
              <li>
                <Strong>Refund rule.</Strong> A failed credit refunds the sender in full. For example, a receiver that is not registered at its home troll gets nothing, and the sender&apos;s
                balance change is 0.
              </li>
              <li>
                <Strong>Never-mint rule.</Strong> Once a credit has landed nothing is refunded, so a failure can never mint.
              </li>
              <li>
                <Strong>The result tells.</Strong> A cross-troll <Code>ft_transfer</Code> resolves to <Code>true</Code> when the receiver was credited and to <Code>false</Code> when the
                transfer was refunded. Contracts that send tokens must check that value, not only whether the call succeeded.
              </li>
              <li>
                <Strong>Transfer-and-call</Strong> works within and across trolls; attach at least 100 Tgas. Across trolls, the receiver&apos;s troll credits and calls{" "}
                <Code>ft_on_transfer</Code>, and the unused part comes back to the sender.
              </li>
              <li>
                <Strong>The 4 KB message bound.</Strong> A cross-troll <Code>ft_transfer_call</Code> with a very large <Code>msg</Code> (hundreds of KB) could run out of gas after the
                debit and lose the transfer. Messages over 4 KB are rejected before any debit, and the destination&apos;s credit step has more gas reserved. On testnet, at exactly 100 Tgas, a
                4,096-byte message works and 4,097 bytes is refused with nothing debited.
              </li>
              <li>
                <Strong>Not faster.</Strong> On mainnet, being on the same shard saves nothing: a follow-up receipt ran 1 block later on the same shard (14 of 14 samples) and across shards
                (64 of 65; one took 2).
              </li>
            </List>
          </Section>

          <Section id="mechanics" title="Token mechanics">
            <Figure caption="Launch parameters, fixed at init.">
              <Table
                head={["Parameter", "Value"]}
                rows={[
                  ["Total supply", "1,000,000,000 STRL, 24 decimals"],
                  ["Launch pool", "500,000,000 (62.5M per troll)"],
                  ["Hoards", "500,000,000 (62.5M per troll)"],
                  ["Launch claim", "1,000 per account; fee 0.01 NEAR; window 24 h"],
                  ["Day (epoch)", "24 h"],
                  ["feed_target", "10 distinct senders per troll per day"],
                  ["min_counted_transfer", "1 token"],
                  ["Reward", "250,000 per fed day across the trolls: from food first, then the launch pool, then minted"],
                  ["Starve burn", "1% (100 bps) of the starving troll's hoard"],
                  ["Troll Toll", "0.25% (25 bps) of each cross-troll transfer, paid to the destination troll as food"],
                  ["Settle bounty", "0.005 NEAR to whoever settles a day, from the bounty budget"],
                  ["Claim window", "30 days after a day's settlement; then the share returns to the troll's food"],
                ]}
              />
            </Figure>
            <List>
              <li>
                <Strong>Claim and fee.</Strong> Each account can claim a 1,000-token starter bag at its home troll during the first day, for a 0.01 NEAR fee. The troll keeps the part
                that pays for the claim&apos;s own storage record (~0.0006–0.0011 NEAR) and forwards the rest to the root&apos;s bounty budget.
              </li>
              <li>
                <Strong>The toll as food.</Strong> 0.25% of every cross-troll transfer is paid to the troll you cross into. It becomes that troll&apos;s food and funds its feeders&apos;
                rewards. The toll is a design choice, not cost recovery: senders already pay the extra receipt&apos;s gas in NEAR.
              </li>
              <li>
                <Strong>The Feeding.</Strong> Each day every troll counts its distinct senders (sends of at least 1 token). If all eight reach 10, the streak grows and each troll pays its
                feeders, first from its food, then from its unclaimed launch pool, and only then by minting. A troll that misses the target starves: it burns 1% of its hoard, and the
                streak resets.
              </li>
              <li>
                <Strong>Settling and the bounty.</Strong> Anyone can call <Code>settle</Code> on the root for the next finished day, attaching at least 250 Tgas. A settlement that never
                finishes can be restarted after 600 blocks. The root pays whoever settles a 0.005 NEAR bounty from its bounty budget if the budget holds enough; the bounty can never block
                settlement, and no other NEAR on the root is ever paid out.
              </li>
              <li>
                <Strong>Claim window and sweep.</Strong> Feeders claim within 30 days of a day&apos;s settlement, or are paid automatically on their next counted send. After the deadline
                anyone can <Code>sweep</Code> the day, and a troll also sweeps on its own as it settles: unclaimed shares return to its food, and old per-day records are deleted, so a
                troll&apos;s storage stays bounded.
              </li>
              <li>
                <Strong>Bounded apply.</Strong> A troll refuses any reward or burn the root asks for above the fixed parameters, so the root cannot over-mint or over-burn.
              </li>
              <li>
                <Strong>Supply over time.</Strong> In the launch simulation with these parameters, about 4M tokens are claimed with 4,000 holders; the rest of the pool pays the reward for
                about 1,984 days, so the Feeding mints nothing in that time.
              </li>
            </List>
            <p>
              <Strong>Sybil limits.</Strong> Keeping the streak alive with bots is cheap: about 0.02 NEAR a day plus 0.16 NEAR of setup for 80 bots. Because the reward is split equally
              among feeders, bots can take most of it once the token has value: about 65% at a fully diluted value of 10,000 NEAR, about 89% at 100,000 NEAR, while below about 1,000 NEAR
              farming does not pay. Draining the launch pool does not pay below about 10,500 NEAR of value; taking the whole pool would need 500,000 claims (about 5,250 NEAR). The
              Feeding is a game, not a Sybil-proof mechanism.
            </p>
          </Section>

          <Section id="security" title="Security">
            <List>
              <li>
                <Strong>Five audit passes</Strong> on 2026-11-14: a manual review, then the <Code>near-contract-audit</Code> checklist on the base contracts, on the toll-as-food and
                bounty changes, and on each hardening fix and its amendment. Every Critical and High finding is fixed. Every Medium is fixed except one that is inherent to asynchronous
                transfers and disclosed: a cross-troll <Code>ft_transfer</Code> resolves to <Code>false</Code> when refunded.
              </li>
              <li>
                <Strong>Property tests</Strong> (troll 101, root 24 unit and property tests): conservation runs of 3 × 10,000 steps and 30-day lifecycles with random transfers,
                transfer-and-calls, failed and refunded credits, restarted settlements, claims, expiry and sweeps. After every step they check supply, an indexer-style replay of each
                troll&apos;s events, and that the root agrees with all eight trolls.
              </li>
              <li>
                <Strong>Integration</Strong> on a sandbox, including a local network with mainnet&apos;s 10-shard layout and the full Feeding lifecycle: claim fees, tolls, a settlement
                with bounty, claims, a starving troll, and a stuck settlement restarted.
              </li>
              <li>
                <Strong>Rehearsals.</Strong> Every deployment path was scripted on that local network with fault injection: rate limits mid-deploy and resume, underfunded deploys, a
                code-hash mismatch, a settlement timeout, reward expiry and sweep. Two final passes on the hardened build each passed 30 of 30 checks.
              </li>
            </List>
            <p>
              <Strong>Known issues.</Strong> Integrators must register receivers at their <em>home</em> troll; a wallet that registers on the sender&apos;s troll fails for about 7 in 8
              receivers. If a troll ever received a day&apos;s report before the previous day&apos;s payout (not seen in practice), that payout could draw less food and mint a little more
              than the root booked; a troll never pays more food than it holds, and the root&apos;s total corrects itself at the next settlement. NEAR sent to the root other than through{" "}
              <Code>fund_bounty</Code> stays there for good. A malicious same-troll receiver can leave a sender&apos;s pending counter stuck, so that sender cannot unregister; no tokens are
              lost. Explorers attribute a troll&apos;s hoard, pools and food to the troll&apos;s own account, but <Code>ft_balance_of(troll)</Code> returns 0.
            </p>
          </Section>

          <Section id="results" title="Results">
            <p>
              <Strong>On NEAR testnet</Strong>, the final contracts were deployed under <Code>v2.strl.testnet</Code> (token STRL). To let the Feeding play out in minutes, that deployment
              runs on short testnet parameters: 10-minute days and 1 feeder per troll, where launch uses 24-hour days and 10 feeders. It is a few dozen real transactions, not a load
              test. Every check passed.
            </p>
            <Figure caption="Testnet, 2026-11-14. Records: measurements/testnet-2026-11-14-final/, shown transaction by transaction on the Evidence page.">
              <Table
                head={["Check", "Result"]}
                rows={[
                  ["One code for eight trolls", "All 8 trolls run global contract 8XXviK8P…FAEk, the sha256 of troll.wasm, on shards 10, 11, 12, 13, 9, 7, 4 and 5. Deploy cost: 24.21 testnet NEAR"],
                  ["Fan-out", "One transaction → 50 of 50 same-troll transfers; another → 25 of 25 mixed transfers (8 cross-troll); 0 failed receipts"],
                  ["Cross-troll transfer", "Sender −100; the receiver's troll keeps the 0.25 toll as food"],
                  ["Credit to an unregistered receiver", "The credit fails and the sender is fully refunded (change 0)"],
                  ["Transfer-and-call to an account with no contract", "The unused amount is returned; the sender pays only the toll"],
                  ["Transfer-and-call at exactly 100 Tgas", "A 4,096-byte message works; 4,097 bytes is refused before anything is debited"],
                  ["Settlement gas floor", "At 249 Tgas refused up front, leaving settlement unlocked; at 250 Tgas it settles"],
                  ["The Feeding, first day", "8 feeders, one per troll, each crossing a stream; every troll eats a 0.25 STRL toll. Settled: fed, streak 1, rewards from food first, then the launch pool; the settler earned the 0.005 NEAR bounty"],
                  ["The Feeding, second day", "Seven trolls fed, one not. That troll starved and burned 625,000 STRL (1% of its hoard); streak back to 0"],
                  ["A second token on the same code", "kit.strl.testnet (KIT), deployed by code hash with no code published: about 3.65 NEAR"],
                  ["Conservation", "Σ over the trolls of (supply + in flight + burned − minted) = total supply, and the root agrees with all eight trolls, after every step"],
                ]}
              />
            </Figure>
            <p>
              <Strong>Under synthetic load</Strong> on a single-node local network (near-sandbox 2.14.1, protocol 88) running mainnet&apos;s 10-shard layout, 1,000 Tgas chunks and
              mainnet&apos;s congestion thresholds. This is not mainnet or testnet: one node runs all ten shards, so absolute numbers are a lower bound and the comparison is the point. The
              control is one ordinary NEP-141 contract. Every transaction was looked up afterwards, and receivers&apos; balances matched what the included transactions should deliver, to
              the yocto.
            </p>
            <Figure caption="Synthetic load on a single-node local network with mainnet's shard layout. Source: measurements/localnet-2026-11-14/summary.json.">
              <Table
                wide
                head={["Offered load", "Control token", "Trolls, same-troll", "Trolls, mixed (87.5% cross)"]}
                rows={[
                  [
                    "2,000/s for 90 s",
                    "703/s executed; 63% included; congestion 0.85; 280 of 728 direct transfers rejected (ShardCongested)",
                    "1,980/s (all of it); 100% included; congestion 0; 0 rejected",
                    "1,358–1,663/s over three runs on three successive builds (1,358/s on the current one); 73–89% included; congestion ≤ 0.08; 0 rejected",
                  ],
                  ["1,000/s for 60 s", "672/s; a backlog built (congestion 0.30) and drained after the load stopped", "—", "969/s (all of it); 100% included; congestion 0"],
                ]}
              />
            </Figure>
            <p>
              The same-troll ceiling (offered 6,000/s on an earlier build, same transfer path) was 4,220/s executed, 75% included, congestion 0.04, none rejected. In round numbers,
              same-troll traffic gets about 6× the control&apos;s capacity and mixed traffic about 1.9–2.4×. No transaction to a troll was rejected for congestion; the control&apos;s were.
              Past about 70–85% chunk fullness this single-node network sometimes accepted a transaction and never included it, for the control and the trolls alike; a multi-node
              network has not been checked.
            </p>
          </Section>

          <Section id="kit" title="The kit">
            <p>
              The troll code is published once as a global contract and identified by its hash. A new token reuses it: the deploy script creates a root and eight troll accounts on eight
              distinct shards and publishes no code. It checks the balance first and stops before sending anything if it is short.
            </p>
            <pre className="slab overflow-x-auto p-4 font-mono text-xs leading-relaxed text-ink-0 md:text-sm">
{`node scripts/deploy.mjs --network testnet --parent <your-parent> \\
  --key-file <parent-key.json> --global-hash <troll code hash> \\
  --symbol <SYM> --name "<Name>" --troll-near 0.2`}
            </pre>
            <p>
              Measured on testnet: about 3.65 NEAR per token, that is 8 × 0.2 NEAR for the trolls plus gas, and 1.89 NEAR locked for the root&apos;s storage.
            </p>
          </Section>

          <Section id="limits" title="Limitations and future work">
            <List>
              <li>
                <Strong>Not faster per transfer, and not a fix for a hot app.</Strong> The gain is throughput and no congestion rejections for holder-to-holder traffic. If every holder
                calls one game or pool, that is one account on one shard.
              </li>
              <li>
                <Strong>Optimistic credit.</Strong> Dropping the confirmation step would make a cross-troll transfer two receipts instead of three, with per-troll totals reconciled at
                settlement. It is researched, not built or measured.
              </li>
              <li>
                <Strong>A stake-weighted reward split</Strong> would stop bots from taking the daily reward once the token has value. It is not built.
              </li>
              <li>
                <Strong>A wrapper on a DEX.</Strong> Trading is not sharded: DEXes use the standard NEP-141 wrapper, one contract on one shard. Listing it is still to do.
              </li>
              <li>
                <Strong>Mainnet.</Strong> There is no mainnet deployment yet. At launch every full-access key on the root, trolls and wrapper is to be deleted.
              </li>
              <li>
                <Strong>Wallets</Strong> see one token per troll touched, some with balance 0.
              </li>
            </List>
          </Section>

          <Section id="references" title="References">
            <List>
              <li>
                Standards: <a className="underline" href={NEP("0141")}>NEP-141</a> fungible token, <a className="underline" href={NEP("0145")}>NEP-145</a> storage management,{" "}
                <a className="underline" href={NEP("0148")}>NEP-148</a> token metadata, <a className="underline" href={NEP("0297")}>NEP-297</a> events,{" "}
                <a className="underline" href={NEP("0330")}>NEP-330</a> source metadata, and NEAR global contracts.
              </li>
              <li>
                NEP-636 &quot;Sharded Fungible Token&quot;, a draft opened 2026-01-29 and blocked on Universal Implicit Account Ids as of 2026-10-06, with a reference implementation in{" "}
                <a className="underline" href="https://github.com/near/near-sdk-rs/pull/1376">near-sdk-rs#1376</a>.
              </li>
              <li>
                <a className="underline" href="https://eips.ethereum.org/EIPS/eip-7802">ERC-7802</a>, whose burn-at-source, mint-at-destination events the cross-troll transfer follows.
              </li>
              <li>
                Measurements: <Code>measurements/mainnet/split-causes-2026-11-13.jsonl</Code>, <Code>shard-load-2026-11-12.json</Code> and{" "}
                <Code>receipt-latency-2026-11-13.json</Code> (mainnet shards); <a className="underline" href="/measurements/localnet-2026-11-14/summary.json">localnet summary.json</a>{" "}
                and <a className="underline" href="/measurements/localnet-2026-11-14/rehearsal-final-summary.json">rehearsal-final-summary.json</a> (local network);{" "}
                <a className="underline" href="/measurements/testnet-2026-11-14-final/k-tests.json">k-tests.json</a> and{" "}
                <a className="underline" href="/measurements/testnet-2026-11-14-final/feeding.json">feeding.json</a> (testnet).
              </li>
            </List>
            <p className="pt-4">
              <Link href="/evidence" className="btn btn-moss">See the evidence</Link>
            </p>
          </Section>
        </div>
      </main>
    </div>
  );
}
