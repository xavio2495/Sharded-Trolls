"use client";

import Image from "next/image";
import Link from "next/link";
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

// ---- right-hand visuals for every slide ----

function Stats({ items }: { items: { big: string; small: string; moss?: boolean }[] }) {
  return (
    <div className="grid gap-4">
      {items.map((it, k) => (
        <div key={it.small} className={`${it.moss ? "slab-moss" : "slab"} px-6 py-5 ${k % 2 ? "rotate-1" : "-rotate-1"}`}>
          <p className="font-display text-[clamp(2.6rem,5vw,4.5rem)] leading-none">{it.big}</p>
          <p className={`mt-2 text-base ${it.moss ? "text-white/85" : "text-ink-1"}`}>{it.small}</p>
        </div>
      ))}
    </div>
  );
}

function OneVsEight() {
  return (
    <svg viewBox="0 0 640 300" className="w-full" role="img" aria-label="Left: one token contract on one shard, all holders queue there. Right: eight troll contracts, one on each of eight shards.">
      <g fontFamily="ui-monospace, monospace" fontSize="13" fill={INK}>
        <text x="130" y="22" textAnchor="middle" fontWeight="700">one contract</text>
        <rect x="70" y="40" width="120" height="220" fill={MOSS} stroke={INK} strokeWidth="3" />
        <text x="130" y="155" textAnchor="middle" fill="#fff">shard</text>
        {Array.from({ length: 7 }, (_, k) => <rect key={k} x={40 + k * 4} y={270} width="3" height="18" fill={INK} />)}
        <text x="130" y="296" textAnchor="middle" fontSize="11">every holder queues here</text>
        <text x="450" y="22" textAnchor="middle" fontWeight="700">eight trolls</text>
        {SHARDS.map((sh, i) => (
          <g key={sh}>
            <rect x={290 + i * 40} y="40" width="32" height="220" fill={i % 2 ? "#fff" : MIST} stroke={INK} strokeWidth="3" />
            <text x={306 + i * 40} y="155" textAnchor="middle" fontSize="11">{sh}</text>
          </g>
        ))}
        <text x="450" y="296" textAnchor="middle" fontSize="11">holders spread over eight shards</text>
      </g>
    </svg>
  );
}

function HomesBars() {
  const ranges = [39.5, 29.3, 23.2, 8.1, 0, 0, 0, 0];
  const hash = Array(8).fill(12.5);
  const bar = (v: number, i: number, y0: number, fill: string) => (
    <rect key={`${y0}-${i}`} x={60 + i * 68} y={y0 - v * 2.2} width="48" height={v * 2.2} fill={fill} stroke={INK} strokeWidth="2" />
  );
  return (
    <svg viewBox="0 0 640 330" className="w-full" role="img" aria-label="Share of random implicit accounts per troll. Name ranges: 39.5, 29.3, 23.2 and 8.1 percent on trolls 0 to 3, none on 4 to 7. Hash: 12.5 percent on every troll.">
      <g fontFamily="ui-monospace, monospace" fontSize="12" fill={INK}>
        <text x="20" y="20" fontWeight="700">name ranges</text>
        {ranges.map((v, i) => bar(v, i, 120, "#fff"))}
        {ranges.map((v, i) => <text key={`r${i}`} x={84 + i * 68} y={135} textAnchor="middle">{v ? `${v}%` : "0"}</text>)}
        <text x="20" y="180" fontWeight="700">hash (expected)</text>
        {hash.map((v, i) => bar(v, i, 280, MOSS))}
        {hash.map((_, i) => <text key={`t${i}`} x={84 + i * 68} y={300} textAnchor="middle">troll {i}</text>)}
        <text x="320" y="322" textAnchor="middle" fontSize="11">random implicit accounts, share per troll</text>
      </g>
    </svg>
  );
}

function SettleFlow() {
  const box = (x: number, y: number, w: number, t: string[], fill = "#fff") => (
    <g>
      <rect x={x} y={y} width={w} height={22 + t.length * 18} fill={fill} stroke={INK} strokeWidth="3" />
      {t.map((l, k) => <text key={l} x={x + w / 2} y={y + 26 + k * 18} textAnchor="middle" fill={fill === MOSS ? "#fff" : INK}>{l}</text>)}
    </g>
  );
  return (
    <svg viewBox="0 0 640 330" className="w-full" role="img" aria-label="Anyone calls settle. The root asks eight trolls for reports, decides fed or starved, then each troll applies its outcome. The settler is paid a bounty.">
      <defs>
        <marker id="b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill={INK} /></marker>
      </defs>
      <g fontFamily="ui-monospace, monospace" fontSize="13" fill={INK}>
        {box(20, 20, 150, ["anyone", "settle(day)"])}
        {box(245, 20, 150, ["root", "asks 8 reports"], MOSS)}
        {box(470, 20, 150, ["8 trolls", "report"])}
        {box(245, 150, 150, ["root", "fed or starved?"], MOSS)}
        {box(20, 260, 270, ["fed: rewards from food,", "then pool, then mint"])}
        {box(350, 260, 270, ["starved: burn 1%", "of that troll's hoard"])}
        <line x1="170" y1="40" x2="243" y2="40" stroke={INK} strokeWidth="2" markerEnd="url(#b)" />
        <line x1="395" y1="40" x2="468" y2="40" stroke={INK} strokeWidth="2" markerEnd="url(#b)" />
        <line x1="545" y1="80" x2="397" y2="160" stroke={INK} strokeWidth="2" markerEnd="url(#b)" />
        <line x1="290" y1="210" x2="190" y2="258" stroke={INK} strokeWidth="2" markerEnd="url(#b)" />
        <line x1="350" y1="210" x2="450" y2="258" stroke={INK} strokeWidth="2" markerEnd="url(#b)" />
        <text x="95" y="110" textAnchor="middle" fontSize="12">bounty 0.005 NEAR</text>
        <line x1="245" y1="185" x2="110" y2="80" stroke={INK} strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#b)" />
      </g>
    </svg>
  );
}

function LoadBars() {
  const rows = [
    { name: "one ordinary token", v: 703, rej: "280 of 728 rejected", fill: "#fff" },
    { name: "trolls, same troll", v: 1980, rej: "0 rejected", fill: MOSS },
    { name: "trolls, mixed (low run)", v: 1358, rej: "0 rejected", fill: MIST },
  ];
  return (
    <svg viewBox="0 0 640 300" className="w-full" role="img" aria-label="Transfers per second executed at 2,000 offered: one ordinary token 703 with 280 of 728 rejected; trolls same-troll 1,980 with none rejected; trolls mixed 1,358 on the lowest run, none rejected.">
      <g fontFamily="ui-monospace, monospace" fontSize="13" fill={INK}>
        {rows.map((r, i) => (
          <g key={r.name}>
            <text x="20" y={48 + i * 90}>{r.name}</text>
            <rect x="20" y={58 + i * 90} width={(r.v / 2000) * 560} height="34" fill={r.fill} stroke={INK} strokeWidth="3" />
            <text x={30 + (r.v / 2000) * 560} y={81 + i * 90} fontWeight="700">{r.v.toLocaleString("en-US")}/s</text>
            <text x="20" y={110 + i * 90} fontSize="11">{r.rej}</text>
          </g>
        ))}
        <text x="20" y="292" fontSize="11">offered 2,000 transfers/s for 90 s, single-node local network with mainnet&apos;s layout</text>
      </g>
    </svg>
  );
}

function KitCommand() {
  return (
    <pre className="overflow-x-auto p-2 font-mono text-sm leading-relaxed whitespace-pre" style={{ background: "#18211b", color: "#cfe3bd" }}>
      {`node scripts/deploy.mjs --network testnet \\
  --parent your.testnet --key-file key.json \\
  --global-hash 8XXviK8PceCwicgzFtKi2VoBNWR7MXFMBkZSDKNuFAEk \\
  --symbol YOURS --name "Your Trolls"

# publishes no code: a root + 8 troll accounts
# measured on testnet: ~3.65 NEAR`}
    </pre>
  );
}

type Slide = { title: string; body?: string; points?: string[]; visual?: React.ReactNode };

const SLIDES: Slide[] = [
  {
    title: "Sharded Trolls",
    body: "A token ledger split across eight NEAR shards, live on testnet, with a memecoin on top.",
    visual: <Image src="/art/hero-v5.webp" alt="Eight streams flowing out of one lake, each kept by a troll." width={1536} height={1024} priority />,
  },
  {
    title: "Claim rushes fill a shard.",
    visual: <Stats items={[{ big: "42.5%", small: "full on the HOT shard before its split, vs 10.2% elsewhere" }, { big: "66%", small: "of receipts went to three KaiChing accounts before its split", moss: true }]} />,
    points: [
      "HOT, before its 2024-03-21 split: the shard holding game.hot.tg ran 42.5% full against 10.2% elsewhere.",
      "KaiChing, before its 2025-03-19 split: three accounts took 66% of sampled receipts.",
      "A token launch is that kind of load: thousands of accounts calling one contract at once.",
    ],
  },
  {
    title: "NEAR never splits a contract.",
    visual: <OneVsEight />,
    points: [
      "Shards split only between accounts, so one contract always sits on one shard. Dynamic resharding is off.",
      "To use more than one shard, a token has to be more than one contract.",
      "NEP-636 (draft) uses one wallet per holder at 0s… ids, all of which sort onto one shard under today's layout.",
    ],
  },
  { title: "Eight ledgers on eight shards.", body: "Each troll holds the balances of the accounts that live there. The root only settles the day; transfers never touch it.", visual: <Architecture /> },
  {
    title: "Homes by hash.",
    visual: <HomesBars />,
    points: [
      "home = first 16 bytes of sha256(account id), big-endian, mod 8. Uniform, and independent of the shard layout.",
      "Our first version used account-name ranges. Random implicit accounts then landed 39.5 / 29.3 / 23.2 / 8.1% on trolls 0–3 and 0% on 4–7.",
      "Same troll: one receipt, no other shard involved.",
    ],
  },
  { title: "Crossing a shard, safely.", body: "Asynchronous by nature, so the protocol is built around what can fail.", visual: <Sequence /> },
  {
    title: "Settling the day.",
    visual: <SettleFlow />,
    points: [
      "Anyone calls settle: the root asks all eight trolls for reports, decides fed or starved, then applies the outcome.",
      "Rewards come from tolls eaten first, then the launch pool, and are minted only when both are empty.",
      "The settler earns 0.005 NEAR, paid only from forwarded claim fees.",
      "250 Tgas minimum; a stuck settlement restarts after 600 blocks; a troll refuses any outcome above the fixed parameters.",
    ],
  },
  {
    title: "Proven on testnet.",
    visual: <Stats items={[{ big: "8 shards", small: "one global code by hash, deploy 24.21 NEAR" }, { big: "50 / 50", small: "transfers from one transaction, 0 failed", moss: true }, { big: "625,000", small: "STRL burned by a starving troll, on chain" }]} />,
    points: [
      "One global code by hash on 8 distinct shards; deploy 24.21 NEAR.",
      "Fan-out: 50 of 50 and 25 of 25 transfers from one transaction, 0 failed.",
      "Refund, transfer-and-call and the 4 KB message bound behave as specified; supply conserved after every step.",
      "A full Feeding cycle on chain: fed, bounty paid, claims, then a starve that burned 625,000 STRL.",
    ],
  },
  {
    title: "Under load (synthetic).",
    visual: <LoadBars />,
    points: [
      "Local network with mainnet's 10-shard layout, offered 2,000 transfers/s.",
      "One ordinary token: 703/s, and 280 of 728 direct transfers rejected for congestion.",
      "The trolls: 1,980/s same-troll and 1,358–1,663/s mixed, none rejected. Ceiling about 6× the control.",
    ],
  },
  {
    title: "Hardened before deploying.",
    visual: <Stats items={[{ big: "5", small: "audit passes; critical and high all fixed" }, { big: "30 / 30", small: "rehearsal checks, twice, with injected faults", moss: true }]} />,
    points: [
      "Five audit passes; every critical and high finding fixed, every medium fixed or disclosed.",
      "Property runs of 30-epoch lifecycles with restarts, expiry and sweeps; books checked at every step.",
      "Every deployment path rehearsed twice on mainnet's layout, with injected faults: 30 of 30 checks, twice.",
    ],
  },
  {
    title: "A kit, not a one-off.",
    visual: <KitCommand />,
    body: "The troll code is published once. A second token reuses it by hash and costs about 3.65 NEAR on testnet: a root and eight small accounts.",
  },
  {
    title: "Limits, and next.",
    visual: <Image src="/art/trolls-v3/troll-5.webp" alt="The spectacled troll reading a book" width={720} height={720} />,
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
            <ul className="mt-8 max-w-xl space-y-5">
              {s.points.map((p) => (
                <li key={p} className="text-lg leading-relaxed text-ink-0">
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
        {s.visual && (
          <div className="slab p-5">
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">{s.visual}</div>
            </div>
            <p className="tag mt-3 text-ink-1 sm:hidden">scroll →</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 border-t-[3px] border-ink-0 px-6 py-4 md:px-10">
        <nav className="flex items-center gap-5" onClick={(e) => e.stopPropagation()}>
          <Link href="/" className="nav inline-flex min-h-11 items-center text-ink-0">
            ← Site
          </Link>
          <Link href="/app" className="nav hidden min-h-11 items-center text-ink-0 sm:inline-flex">
            Open the app
          </Link>
          <Link href="/evidence" className="nav hidden min-h-11 items-center text-ink-0 md:inline-flex">
            Evidence
          </Link>
        </nav>
        <span className="tag text-ink-1">
          {i + 1} / {SLIDES.length}
          <span className="hidden sm:inline"> · ← → or tap</span>
        </span>
      </div>
    </div>
  );
}
