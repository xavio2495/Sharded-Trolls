"use client";

import { useEffect, useState } from "react";
import { LOCALNET, type Run, type RunSummary, getJSON } from "./data";
import { Note } from "./ui";

const SETS = {
  2000: { control: "control-run4", same: "trolls-hash-same-2000", mixed: "trolls-mixed-hash-2000" },
  1000: { control: "control-run5", same: null, mixed: "trolls-mixed-hash-1000" },
} as const;
// Every mixed run at 2,000/s (current and earlier builds): shown as a range, since past saturation
// the share of transactions the node silently drops varies from run to run.
const MIXED_2000 = ["trolls-mixed-hash-2000", "trolls-mixed-run3", "trolls-mixed-run2"];

const COLS = [
  { key: "control", title: "Control token", sub: "one ordinary NEP-141 contract on one shard", color: "var(--teal-deep)", dash: "" },
  { key: "same", title: "Eight trolls, same-troll", sub: "holders pay others on their own troll", color: "var(--accent)", dash: "" },
  { key: "mixed", title: "Eight trolls, mixed", sub: "~88% of transfers cross to another troll", color: "var(--ink-0)", dash: "6 4" },
] as const;
type Key = (typeof COLS)[number]["key"];

function Card({ col, r, control }: { col: (typeof COLS)[number]; r: RunSummary | null; control: RunSummary | null }) {
  if (!r)
    return (
      <div className="rounded-[var(--radius-card)] border-2 border-dashed border-mist p-5">
        <h3 className="font-display text-2xl text-ink-0">{col.title}</h3>
        <p className="mt-1 text-sm text-ink-2">{col.sub}</p>
        <p className="mt-6 text-sm text-ink-2">Not run at this rate.</p>
      </div>
    );
  const rejecting = r.peak_congestion >= 0.8;
  const kept = r.inclusion === 1 && r.executed_per_s >= 0.95 * r.offered_per_s;
  const mult = control && col.key !== "control" ? `${(r.executed_per_s / control.executed_per_s).toFixed(1)}× the control` : null;
  const verdict = kept
    ? "kept up with the full offered load, so this is not its ceiling"
    : r.inclusion < 1
      ? "at capacity: the excess was rejected or silently dropped"
      : "could not keep up: a backlog built up and drained after the load stopped";
  return (
    <div className="rounded-[var(--radius-card)] border-2 border-ink-line bg-paper p-5 shadow-[4px_4px_0_0_var(--ink-line)]">
      <h3 className="flex items-center gap-2 font-display text-2xl text-ink-0">
        <span aria-hidden className="inline-block size-3 rounded-sm" style={{ background: col.color }} />
        {col.title}
      </h3>
      <p className="mt-1 text-sm text-ink-2">{col.sub}</p>
      <p className="mt-5 font-display text-5xl leading-none text-ink-0 tabular-nums">
        {r.executed_per_s.toLocaleString("en-US")}
        <span className="ml-2 font-sans text-sm text-ink-1">transfers/s executed</span>
      </p>
      <p className="mt-2 min-h-10 text-sm text-ink-1">
        {mult && <strong className="font-semibold text-ink-0">{mult} · </strong>}
        {verdict}
      </p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-hairline pt-3 text-sm">
        <dt className="text-ink-2">Transactions included</dt>
        <dd className="tabular-nums text-ink-0">
          {Math.round(r.inclusion * 100)}%{" "}
          <span className="text-ink-2">
            ({r.fires_included.toLocaleString("en-US")} of {r.fires_accepted.toLocaleString("en-US")})
          </span>
        </dd>
        <dt className="text-ink-2">Peak congestion</dt>
        <dd className="tabular-nums text-ink-0">
          {r.peak_congestion.toFixed(2)}
          {rejecting && <strong className="ml-2 text-starve">✕ rejecting</strong>}
        </dd>
        <dt className="text-ink-2">Direct transfers rejected</dt>
        <dd className="tabular-nums text-ink-0">
          {r.probes_rejected} of {r.probes}
          {r.rejection_kinds.length > 0 && <span className="text-ink-2"> ({r.rejection_kinds.join(", ")})</span>}
        </dd>
        <dt className="text-ink-2">Block time</dt>
        <dd className="tabular-nums text-ink-0">{r.block_time_s.toFixed(2)} s</dd>
      </dl>
    </div>
  );
}

function Timeline({ series }: { series: { col: (typeof COLS)[number]; pts: [number, number][] }[] }) {
  const W = 1000, H = 250, x0 = 44, top = 14, base = 200, maxT = 180, right = W - 16;
  const x = (t: number) => x0 + (t / maxT) * (right - x0);
  const y = (v: number) => base - Math.min(1, v) * (base - top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Highest shard congestion over time for each setup">
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={x0} x2={right} y1={y(v)} y2={y(v)} stroke="var(--hairline)" />
          <text x={x0 - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--ink-2)">{v}</text>
        </g>
      ))}
      <line x1={x0} x2={right} y1={y(0.8)} y2={y(0.8)} stroke="var(--starve)" strokeWidth="1.5" strokeDasharray="5 4" />
      <text x={right} y={y(0.8) - 6} textAnchor="end" fontSize="12" fill="var(--ink-1)">rejects new transactions above 0.8</text>
      {series.map(({ col, pts }) => (
        <path key={col.key} d={pts.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join("")} fill="none" stroke={col.color} strokeWidth="2" strokeDasharray={col.dash} />
      ))}
      <line x1={x0} x2={right} y1={base} y2={base} stroke="var(--ink-2)" />
      {[0, 30, 60, 90, 120, 150, 180].map((t) => (
        <text key={t} x={x(t)} y={base + 18} textAnchor="middle" fontSize="12" fill="var(--ink-2)">{t} s</text>
      ))}
      {series.map(({ col }, i) => (
        <g key={col.key} transform={`translate(${x0 + i * 230},${H - 14})`}>
          <line x1="0" x2="18" y1="-4" y2="-4" stroke={col.color} strokeWidth="3" strokeDasharray={col.dash} />
          <text x="24" y="0" fontSize="12" fill="var(--ink-1)">{col.title}</text>
        </g>
      ))}
    </svg>
  );
}

export function Compare() {
  const [rate, setRate] = useState<1000 | 2000>(2000);
  const [summary, setSummary] = useState<Record<string, RunSummary> | null>(null);
  const [series, setSeries] = useState<{ col: (typeof COLS)[number]; pts: [number, number][] }[]>([]);
  const set = SETS[rate];

  useEffect(() => {
    getJSON<Record<string, RunSummary>>(`${LOCALNET}/summary.json`).then(setSummary);
  }, []);
  useEffect(() => {
    let live = true;
    Promise.all(
      COLS.map(async (col) => {
        const id = set[col.key as Key];
        if (!id) return null;
        const run = await getJSON<Run>(`${LOCALNET}/runs/${id}.json`);
        if (!run) return null;
        const pts = run.blocks.filter(([t]) => t >= 0 && t <= 180_000).map(([t, s]) => [t / 1000, Math.max(...s.map(([c]) => c))] as [number, number]);
        return { col, pts };
      }),
    ).then((s) => live && setSeries(s.filter((v) => v !== null)));
    return () => {
      live = false;
    };
  }, [set]);

  const control = summary?.[set.control] ?? null;
  const mixed = rate === 2000 ? MIXED_2000.map((id) => summary?.[id]).filter((r): r is RunSummary => Boolean(r)) : [];
  const step = summary?.["trolls-step6000"];
  const lo = mixed.length ? Math.min(...mixed.map((r) => r.executed_per_s)) : 0;
  const hi = mixed.length ? Math.max(...mixed.map((r) => r.executed_per_s)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-1">Offered load</span>
        {([2000, 1000] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRate(r)}
            aria-pressed={rate === r}
            className={`rounded-[var(--radius-ui)] border-2 px-4 py-1.5 text-sm font-semibold transition-colors ${
              rate === r ? "border-ink-line bg-ink-0 text-paper" : "border-ink-line bg-paper text-ink-0 hover:bg-surface-2"
            }`}
          >
            {r.toLocaleString("en-US")} transfers/s
          </button>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {COLS.map((col) => (
          <Card key={col.key} col={col} r={set[col.key as Key] && summary ? (summary[set[col.key as Key]!] ?? null) : null} control={control} />
        ))}
      </div>
      {control && (
        <div className="space-y-2 text-sm text-ink-1">
          {mixed.length > 1 && (
            <p>
              <strong className="text-ink-0">Mixed traffic over {mixed.length} runs at this load:</strong> {lo.toLocaleString("en-US")}–{hi.toLocaleString("en-US")} transfers/s executed (
              {(lo / control.executed_per_s).toFixed(1)}–{(hi / control.executed_per_s).toFixed(1)}× the control),{" "}
              {Math.round(Math.min(...mixed.map((r) => r.inclusion)) * 100)}–{Math.round(Math.max(...mixed.map((r) => r.inclusion)) * 100)}% of transactions included.
            </p>
          )}
          {step && (
            <p>
              <strong className="text-ink-0">Ceiling</strong> (earlier build {(step.troll_wasm_sha256 ?? "").slice(0, 8)}, same transfer path): offered 6,000 transfers/s of same-troll traffic, the eight trolls executed{" "}
              {step.executed_per_s.toLocaleString("en-US")}/s ({Math.round(step.inclusion * 100)}% included, peak congestion {step.peak_congestion.toFixed(2)}, none rejected), about{" "}
              {(step.executed_per_s / control.executed_per_s).toFixed(1)}× this control.
            </p>
          )}
        </div>
      )}
      <div className="rounded-[var(--radius-card)] border-2 border-ink-line bg-paper p-4 md:p-6">
        <h3 className="font-display text-2xl text-ink-0">Highest shard congestion over time</h3>
        <div className="mt-3">{series.length ? <Timeline series={series} /> : <p className="py-16 text-center text-sm text-ink-2">Loading the runs…</p>}</div>
      </div>
      <Note>
        Executed = transfers carried out, divided by the time until the busiest shard drained. Included = transactions the network actually put on chain; the rest were accepted by the RPC and
        silently dropped. Runs: {Object.values(set).filter(Boolean).join(", ")}.
      </Note>
    </div>
  );
}
