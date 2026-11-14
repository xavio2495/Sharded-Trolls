"use client";

import Image from "next/image";
import Link from "next/link";
import { SLIDE_TEXT, type SlideText } from "./slides";
import { isValidElement, useCallback, useEffect, useState } from "react";

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
              <text x={x + 34} y="250" textAnchor="middle" fill={on ? "#fff" : INK} fontSize="13">ledger</text>
            </g>
          );
        })}
        <rect x="14" y="300" width="612" height="34" fill={MIST} stroke={INK} strokeWidth="3" />
        <text x="320" y="322" textAnchor="middle">one global contract code, published once, used by all eight by hash</text>
        <text x="320" y="364" textAnchor="middle" fontSize="13">+ a single-shard NEP-141 wrapper for DEXes</text>
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
        <text x="130" y="296" textAnchor="middle" fontSize="13">every holder queues here</text>
        <text x="450" y="22" textAnchor="middle" fontWeight="700">eight trolls</text>
        {SHARDS.map((sh, i) => (
          <g key={sh}>
            <rect x={290 + i * 40} y="40" width="32" height="220" fill={i % 2 ? "#fff" : MIST} stroke={INK} strokeWidth="3" />
            <text x={306 + i * 40} y="155" textAnchor="middle" fontSize="13">{sh}</text>
          </g>
        ))}
        <text x="450" y="296" textAnchor="middle" fontSize="13">holders spread over eight shards</text>
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
    <svg viewBox="0 0 640 300" className="w-full" role="img" aria-label="Share of random implicit accounts per troll. Name ranges: 39.5, 29.3, 23.2 and 8.1 percent on trolls 0 to 3, none on 4 to 7. Hash: 12.5 percent on every troll.">
      <g fontFamily="ui-monospace, monospace" fontSize="13" fill={INK}>
        <text x="20" y="20" fontWeight="700">name ranges</text>
        {ranges.map((v, i) => bar(v, i, 120, "#fff"))}
        {ranges.map((v, i) => <text key={`r${i}`} x={84 + i * 68} y={135} textAnchor="middle">{v ? `${v}%` : "0"}</text>)}
        <text x="20" y="170" fontWeight="700">hash (expected)</text>
        {hash.map((v, i) => bar(v, i, 240, MOSS))}
        {hash.map((v, i) => <text key={`h${i}`} x={84 + i * 68} y={206} textAnchor="middle">{v}%</text>)}
        {hash.map((_, i) => <text key={`t${i}`} x={84 + i * 68} y={260} textAnchor="middle">troll {i}</text>)}
        <text x="320" y="290" textAnchor="middle" fontSize="13">random implicit accounts, share per troll</text>
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
        <text x="95" y="102" textAnchor="middle" fontSize="13">earns 0.005 NEAR</text>
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
    <svg viewBox="0 0 640 330" className="w-full" role="img" aria-label="Transfers per second executed at 2,000 offered: one ordinary token 703 with 280 of 728 rejected; trolls same-troll 1,980 with none rejected; trolls mixed 1,358 on the lowest run, none rejected.">
      <g fontFamily="ui-monospace, monospace" fontSize="13" fill={INK}>
        {rows.map((r, i) => (
          <g key={r.name}>
            <text x="20" y={48 + i * 90}>{r.name}</text>
            <rect x="20" y={58 + i * 90} width={(r.v / 2000) * 560} height="34" fill={r.fill} stroke={INK} strokeWidth="3" />
            <text x={30 + (r.v / 2000) * 560} y={81 + i * 90} fontWeight="700">{r.v.toLocaleString("en-US")}/s</text>
            <text x="20" y={110 + i * 90} fontSize="13">{r.rej}</text>
          </g>
        ))}
        <text x="20" y="322" fontSize="13">offered 2,000/s for 90 s · local network, mainnet&apos;s layout</text>
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

type Slide = SlideText & { visual: React.ReactNode };

// one visual per slide, in order; the words live in slides.ts
const VISUALS: React.ReactNode[] = [
  <Image key="v1" src="/art/hero-v5.webp" alt="Eight streams flowing out of one lake, each kept by a troll." width={1536} height={1024} priority />,
  <Stats key="v2" items={[{ big: "42.5%", small: "full on the HOT shard before its split, vs 10.2% elsewhere" }, { big: "66%", small: "of receipts went to three KaiChing accounts before its split", moss: true }]} />,
  <OneVsEight key="v3" />,
  <Architecture key="v4" />,
  <HomesBars key="v5" />,
  <Sequence key="v6" />,
  <SettleFlow key="v7" />,
  <Stats key="v8" items={[{ big: "8 shards", small: "one global code by hash, deploy 24.21 NEAR" }, { big: "50 / 50", small: "transfers from one transaction, 0 failed", moss: true }, { big: "625,000", small: "STRL burned by a starving troll, on chain" }]} />,
  <LoadBars key="v9" />,
  <Stats key="v10" items={[{ big: "5", small: "audit passes; critical and high all fixed" }, { big: "30 / 30", small: "rehearsal checks, twice, with injected faults", moss: true }]} />,
  <KitCommand key="v11" />,
  <Image key="v12" src="/art/trolls-v3/troll-5.webp" alt="The spectacled troll reading a book" width={720} height={720} />,
];

const SLIDES: Slide[] = SLIDE_TEXT.map((t, k) => ({ ...t, visual: VISUALS[k] }));

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
      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-[minmax(0,1fr)] items-center gap-12 overflow-y-auto px-6 py-6 md:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
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
          isValidElement(s.visual) && s.visual.type === Stats ? (
            // stat slabs carry their own frames; a second frame around them only doubles the borders
            s.visual
          ) : isValidElement(s.visual) && s.visual.type === Image ? (
            <div className="slab mx-auto w-full max-w-[min(100%,62svh)] p-5 [&_img]:h-auto [&_img]:w-full">{s.visual}</div>
          ) : (
            <div className="slab p-5">
              <div className="no-scrollbar overflow-x-auto">
                <div className="min-w-[560px]">{s.visual}</div>
              </div>
              <p className="tag mt-3 text-ink-1 sm:hidden">swipe the diagram →</p>
            </div>
          )
        )}
      </div>
      <div className="flex items-center justify-between gap-4 border-t-[3px] border-ink-0 px-6 py-4 md:px-10">
        <nav className="flex items-center gap-5" onClick={(e) => e.stopPropagation()}>
          <Link href="/" className="nav inline-flex min-h-11 items-center text-ink-0" style={{ fontSize: "0.95rem" }}>
            ← Site
          </Link>
          <Link href="/app" className="nav hidden min-h-11 items-center text-ink-0 sm:inline-flex" style={{ fontSize: "0.95rem" }}>
            Open the app
          </Link>
          <Link href="/evidence" className="nav hidden min-h-11 items-center text-ink-0 md:inline-flex" style={{ fontSize: "0.95rem" }}>
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
