"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

type Slide = { kicker: string; title: string; body?: string; art?: { src: string; alt: string; w: number; h: number }; points?: string[] };

const SLIDES: Slide[] = [
  {
    kicker: "Sharded Trolls · NEAR HACKATHON 2026",
    title: "Pay the troll.",
    body: "A memecoin split across eight NEAR shards: eight streams flowing side by side, each kept by its own troll.",
    art: { src: "/art/hero-v5.webp", alt: "Eight streams flow out of one lake, each kept by a troll; a traveller pays one coin at the far end of a bridge.", w: 1536, h: 1024 },
  },
  {
    kicker: "The problem",
    title: "Claim rushes fill a shard.",
    points: [
      "Before the 2024-03-21 split at game.hot.tg, its shard ran 42.5% full against 10.2% elsewhere.",
      "Before the 2025-03-19 KaiChing split, three KaiChing accounts took 66% of sampled receipts.",
    ],
    body: "A launch claim and a daily claim are exactly that kind of load.",
  },
  {
    kicker: "The fact",
    title: "NEAR never splits a contract.",
    body: "Shards split only between accounts. A token that wants more than one shard has to be more than one contract. NEP-636's per-holder wallets would all sit on one shard under today's layout.",
  },
  {
    kicker: "The idea",
    title: "One token. Eight trolls. Eight shards.",
    body: "Your home troll comes from a hash of your account, so the crowd spreads evenly. Same-troll transfers never touch another shard.",
    art: { src: "/art/why-eight-v5.webp", alt: "Left: one river jammed with coin boats. Right: the same boats flowing down eight streams.", w: 1536, h: 768 },
  },
  {
    kicker: "The Troll Toll",
    title: "Cross a stream, feed its troll.",
    body: "One hop to the receiver's troll, which keeps 0.25% as food. Same stream: no toll. A failed credit refunds every coin.",
    art: { src: "/art/toll-v5.webp", alt: "A traveller hands one coin to the troll at the far end of a bridge.", w: 1100, h: 520 },
  },
  {
    kicker: "The Feeding",
    title: "Feed them all, or they starve.",
    points: [
      "Every troll reaches its feeders for the day: streak +1, rewards paid from food first, then the launch pool.",
      "A troll nobody fed burns 1% of its hoard, and the streak resets.",
      "Anyone can settle the day and earns a bounty funded by claim fees.",
    ],
  },
  {
    kicker: "Proof on chain",
    title: "Eight shards, one code, on NEAR testnet.",
    points: [
      "All eight trolls run one global contract by code hash, on eight distinct shards.",
      "Fan-out: 50 of 50 and 25 of 25 transfers from one transaction, zero failed receipts.",
      "Refunds, transfer-and-call and conservation checked before and after every transaction.",
      "Settlement at 249 Tgas refused up front; at 250 Tgas it settles.",
    ],
  },
  {
    kicker: "Proof under load (synthetic, single-node localnet)",
    title: "No congestion rejections.",
    points: [
      "Offered 2,000 transfers/s: one NEP-141 contract executed 703/s and rejected 280 of 728 direct transfers.",
      "Same-troll traffic: 1,980/s, nothing rejected. Ceiling about 6× the control (earlier build, same transfer path).",
      "Mixed traffic (87.5% crossing): 1.9–2.4× the control, nothing rejected.",
    ],
  },
  {
    kicker: "Hardened",
    title: "Audited, fuzzed and rehearsed.",
    points: [
      "Five audit passes; every critical and high finding fixed, and every medium fixed or disclosed.",
      "Property runs: 30-epoch lifecycles with restarts, expiry and sweeps, books checked at every step.",
      "Every deployment path rehearsed twice on mainnet's shard layout, with injected faults.",
    ],
  },
  {
    kicker: "A launch kit",
    title: "The next token costs only its accounts.",
    body: "The troll code is published once as a global contract. A new token reuses it by hash: a root and eight small troll accounts.",
  },
  {
    kicker: "Honest limits",
    title: "What it is not.",
    points: [
      "Not faster per transfer: one block same-troll, two across.",
      "Wallets list one entry per troll.",
      "The Feeding is a game, not Sybil-proof.",
      "DEX trading goes through a single-shard wrapper.",
    ],
  },
  {
    kicker: "Try it",
    title: "Feed a troll today.",
    body: "Open the app, connect a NEAR testnet wallet, claim your starter bag and cross a stream.",
    art: { src: "/art/trolls-v3/troll-8.webp", alt: "The mushroom-crowned troll, hands clasped, delighted.", w: 720, h: 720 },
  },
];

export default function Deck() {
  const [i, setI] = useState(0);
  const go = useCallback((d: number) => setI((v) => Math.min(SLIDES.length - 1, Math.max(0, v + d))), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " "].includes(e.key)) go(1);
      if (["ArrowLeft", "PageUp"].includes(e.key)) go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);
  const s = SLIDES[i];
  return (
    <div className="grain fixed inset-0 flex flex-col bg-paper" onClick={(e) => go(e.clientX > window.innerWidth / 3 ? 1 : -1)}>
      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-10 md:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent-deep">{s.kicker}</p>
          <h1 className="mt-3 font-display text-5xl leading-[1.02] text-ink-0 md:text-7xl">{s.title}</h1>
          {s.body && <p className="mt-6 max-w-xl text-xl leading-relaxed text-ink-1">{s.body}</p>}
          {s.points && (
            <ul className="mt-6 max-w-xl space-y-3 text-lg leading-relaxed text-ink-1">
              {s.points.map((p) => (
                <li key={p} className="border-l-4 border-accent pl-4">{p}</li>
              ))}
            </ul>
          )}
        </div>
        {s.art && (
          <Image src={s.art.src} alt={s.art.alt} width={s.art.w} height={s.art.h} priority className="max-h-[70vh] w-full rounded-[var(--radius-card)] border-2 border-ink-line object-cover shadow-[5px_5px_0_0_var(--ink-line)]" />
        )}
      </div>
      <div className="flex items-center justify-between px-10 pb-6 text-sm text-ink-1">
        <span className="font-display text-lg text-ink-0">Sharded Trolls</span>
        <span>{i + 1} / {SLIDES.length} · ← → or click</span>
      </div>
    </div>
  );
}
