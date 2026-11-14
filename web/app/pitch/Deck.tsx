"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

// The judges' deck: how it is built and what is proven. The landing page is the experience; this is the engineering.

const INK = "#18211b";
const MOSS = "#3d6a24";
const MIST = "#c9d6cc";
const SHARDS = [10, 11, 12, 13, 9, 7, 4, 5];

function Architecture() {
  return (
    <svg viewBox="0 0 640 380" className="w-full" role="img" aria-label="The root contract settles daily; eight troll contracts, one per shard, share one global contract code; a wrapper gives DEXes a standard token.">
      <g fontFamily="ui-monospace, monospace" fontSize="13" fill={INK}>
        <rect x="230" y="10" width="180" height="56" fill="#fff" stroke={INK} strokeWidth="3" />
        <text x="320" y="34" textAnchor="middle" fontWeight="700">root</text>
        <text x="320" y="54" textAnchor="middle">settles the day</text>
        {SHARDS.map((s, i) => {
          const x = 14 + i * 78;
          const on = i === 2;
          return (
            <g key={s}>
              <line x1="320" y1="66" x2={x + 34} y2="150" stroke={INK} strokeWidth="1.5" strokeDasharray="4 4" />
              <rect x={x} y="150" width="68" height="120" fill={on ? MOSS : "#fff"} stroke={INK} strokeWidth="3" />
              <text x={x + 34} y="176" textAnchor="middle" fill={on ? "#fff" : INK} fontWeight="700">troll {i}</text>
              <text x={x + 34} y="196" textAnchor="middle" fill={on ? "#fff" : INK}>shard</text>
              <text x={x + 34} y="214" textAnchor="middle" fill={on ? "#fff" : INK} fontWeight="700">{s}</text>
              <text x={x + 34} y="250" textAnchor="middle" fill={on ? "#fff" : INK} fontSize="11">ledger</text>
            </g>
          );
        })}
        <rect x="14" y="300" width="612" height="34" fill={MIST} stroke={INK} strokeWidth="3" />
        <text x="320" y="322" textAnchor="middle">one global contract code, published once, used by all eight by hash</text>
        <text x="320" y="364" textAnchor="middle" fontSize="12">+ a single-shard NEP-141 wrapper for DEXes</text>
      </g>
    </svg>
  );
}

function Sequence() {
  const cols = [
    { x: 90, label: "you · shard A" },
    { x: 330, label: "them · shard B" },
    { x: 560, label: "receiver" },
  ];
  const arrow = (x1: number, x2: number, y: number, t: string, bold = false) => (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={INK} strokeWidth={bold ? 3 : 2} markerEnd="url(#a)" />
      <text x={(x1 + x2) / 2} y={y - 8} textAnchor="middle">{t}</text>
    </g>
  );
  return (
    <svg viewBox="0 0 640 360" className="w-full" role="img" aria-label="A cross-shard transfer: debit at your troll, credit at their troll which keeps the toll as food, confirmation back at your troll; a failed credit refunds everything.">
      <defs>
        <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 10 5 0 10z" fill={INK} />
        </marker>
      </defs>
      <g fontFamily="ui-monospace, monospace" fontSize="13" fill={INK}>
        {cols.map((c) => (
          <g key={c.label}>
            <rect x={c.x - 80} y="8" width="160" height="34" fill="#fff" stroke={INK} strokeWidth="3" />
            <text x={c.x} y="30" textAnchor="middle">{c.label}</text>
            <line x1={c.x} y1="42" x2={c.x} y2="236" stroke={INK} strokeWidth="1.5" strokeDasharray="4 4" />
          </g>
        ))}
        <rect x="60" y="62" width="60" height="22" fill={MOSS} />
        <text x="90" y="78" textAnchor="middle" fill="#fff">debit</text>
        {arrow(120, 320, 120, "credit(amount − toll, toll)", true)}
        <rect x="300" y="134" width="60" height="44" fill={MOSS} />
        <text x="330" y="152" textAnchor="middle" fill="#fff">+food</text>
        <text x="330" y="170" textAnchor="middle" fill="#fff">+paid</text>
        {arrow(360, 552, 156, "balance += net")}
        {arrow(320, 100, 220, "ok → confirm, close")}
        <text x="320" y="270" textAnchor="middle" fontWeight="700">credit fails (not registered)?  → full refund, toll included</text>
        <text x="320" y="296" textAnchor="middle" fontWeight="700">credit landed?  → never refunded, so a failure can never mint</text>
        <text x="320" y="326" textAnchor="middle">Σ (supply + in flight + burned − minted) = total, checked after every step</text>
      </g>
    </svg>
  );
}

type Slide = { title: string; body?: string; points?: string[]; visual?: React.ReactNode };

const SLIDES: Slide[] = [
  {
    title: "Sharded Trolls",
    body: "A token ledger split across eight NEAR shards, live on testnet, with a memecoin on top. Built for NEAR HACKATHON 2026.",
    visual: <Image src="/art/hero-v5.webp" alt="Eight streams flowing out of one lake, each kept by a troll." width={1536} height={1024} priority />,
  },
  {
    title: "Claim rushes fill a shard.",
    points: [
      "HOT, before its 2024-03-21 split: the shard holding game.hot.tg ran 42.5% full against 10.2% elsewhere.",
      "KaiChing, before its 2025-03-19 split: three accounts took 66% of sampled receipts.",
      "A token launch is that kind of load: thousands of accounts calling one contract at once.",
    ],
  },
  {
    title: "NEAR never splits a contract.",
    points: [
      "Shards split only between accounts, so one contract always sits on one shard. Dynamic resharding is off.",
      "To use more than one shard, a token has to be more than one contract.",
      "NEP-636 (draft) uses one wallet per holder at 0s… ids, all of which sort onto one shard under today's layout.",
    ],
  },
  { title: "Eight ledgers on eight shards.", body: "Each troll holds the balances of the accounts that live there. The root only settles the day; transfers never touch it.", visual: <Architecture /> },
  {
    title: "Homes by hash.",
    points: [
      "home = first 16 bytes of sha256(account id), big-endian, mod 8. Uniform, and independent of the shard layout.",
      "Our first version used account-name ranges. Random implicit accounts then landed 39.5 / 29.3 / 23.2 / 8.1% on trolls 0–3 and 0% on 4–7.",
      "Same troll: one receipt, no other shard involved.",
    ],
  },
  { title: "Crossing a shard, safely.", body: "Asynchronous by nature, so the protocol is built around what can fail.", visual: <Sequence /> },
  {
    title: "Settling the day.",
    points: [
      "Anyone calls settle: the root asks all eight trolls for reports, decides fed or starved, then applies the outcome.",
      "Rewards come from tolls eaten first, then the launch pool, and are minted only when both are empty.",
      "The settler earns 0.005 NEAR, paid only from forwarded claim fees.",
      "250 Tgas minimum; a stuck settlement restarts after 600 blocks; a troll refuses any outcome above the fixed parameters.",
    ],
  },
  {
    title: "Proven on testnet.",
    points: [
      "One global code by hash on 8 distinct shards; deploy 24.21 NEAR.",
      "Fan-out: 50 of 50 and 25 of 25 transfers from one transaction, 0 failed.",
      "Refund, transfer-and-call and the 4 KB message bound behave as specified; supply conserved after every step.",
      "A full Feeding cycle on chain: fed, bounty paid, claims, then a starve that burned 625,000 STRL.",
    ],
  },
  {
    title: "Under load (synthetic).",
    points: [
      "Local network with mainnet's 10-shard layout, offered 2,000 transfers/s.",
      "One ordinary token: 703/s, and 280 of 728 direct transfers rejected for congestion.",
      "The trolls: 1,980/s same-troll and 1,358–1,663/s mixed, none rejected. Ceiling about 6× the control.",
    ],
  },
  {
    title: "Hardened before deploying.",
    points: [
      "Five audit passes; every critical and high finding fixed, every medium fixed or disclosed.",
      "Property runs of 30-epoch lifecycles with restarts, expiry and sweeps; books checked at every step.",
      "Every deployment path rehearsed twice on mainnet's layout, with injected faults: 30 of 30 checks, twice.",
    ],
  },
  {
    title: "A kit, not a one-off.",
    body: "The troll code is published once. A second token reuses it by hash and costs about 3.65 NEAR on testnet: a root and eight small accounts.",
  },
  {
    title: "Limits, and next.",
    points: [
      "Not faster per transfer: one block same-troll, two across. Mixed traffic gains ~1.9–2.4×.",
      "Wallets list one entry per troll. The Feeding is a game, not Sybil-proof.",
      "Next: optimistic credit (two receipts instead of three), a stake-weighted reward, the wrapper on a DEX, and mainnet.",
    ],
  },
];

export default function Deck() {
  const [i, setI] = useState(0);
  // ?s=N opens on slide N (1-based), for links and recording; read after mount so it never fights hydration
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("s"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of the URL after mount, by design
    if (Number.isInteger(n) && n >= 1 && n <= SLIDES.length) setI(n - 1);
  }, []);
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
    <div className="fixed inset-0 flex flex-col bg-paper" onClick={(e) => go(e.clientX > window.innerWidth / 3 ? 1 : -1)}>
      <div className="h-2 bg-surface-2">
        <div className="h-full bg-accent-deep transition-[width] duration-300" style={{ width: `${((i + 1) / SLIDES.length) * 100}%` }} />
      </div>
      <div className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 overflow-y-auto px-6 py-6 md:px-10 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <h1 className="h1 leading-[0.95] text-ink-0">{s.title}</h1>
          {s.body && <p className="lead mt-8 max-w-xl text-2xl">{s.body}</p>}
          {s.points && (
            <ul className="mt-8 max-w-xl divide-y-[3px] divide-ink-0 border-y-[3px] border-ink-0">
              {s.points.map((p) => (
                <li key={p} className="py-4 text-lg leading-relaxed text-ink-0">
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
        {s.visual && (
          <div className="slab overflow-x-auto p-5">
            <div className="min-w-[560px]">{s.visual}</div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between border-t-[3px] border-ink-0 px-6 py-4 md:px-10">
        <span className="font-display text-lg whitespace-nowrap text-ink-0 sm:text-xl">Sharded Trolls</span>
        <span className="tag text-ink-1">
          {i + 1} / {SLIDES.length} · ← → or tap
        </span>
      </div>
    </div>
  );
}
