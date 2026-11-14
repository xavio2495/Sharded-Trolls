"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALNET, RUNS, type Run, getJSON } from "./data";

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-[3px] border-ink-0 bg-paper p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-2">{label}</p>
      <p className="mt-1 font-display text-4xl leading-none tabular-nums text-ink-0">{value}</p>
      <p className="mt-1 text-xs text-ink-2">{note}</p>
    </div>
  );
}

function Shards({ run, i }: { run: Run; i: number }) {
  const [, frame] = run.blocks[i];
  const W = 1000, H = 290, x0 = 40, top = 30, base = 220, n = run.shard_ids.length, cw = (W - x0) / n;
  const y = (v: number) => base - Math.min(1, v) * (base - top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Congestion per shard at this moment">
      <defs>
        <pattern id="unused-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-2)" strokeWidth="2" />
        </pattern>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={x0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--hairline)" />
          <text x={x0 - 6} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--ink-2)">{v}</text>
        </g>
      ))}
      <line x1={x0} x2={W} y1={y(run.threshold)} y2={y(run.threshold)} stroke="var(--starve)" strokeWidth="1.5" strokeDasharray="5 4" />
      <text x={W} y={y(run.threshold) - 6} textAnchor="end" fontSize="12" fill="var(--ink-1)">rejects new transactions above {run.threshold}</text>
      {run.shard_ids.map((id, k) => {
        const [cong, full] = frame[k];
        const cx = x0 + k * cw + cw / 2, bw = cw * 0.42, role = run.roles[id] ?? "";
        const unreachable = role.endsWith(" only"), rejecting = cong >= run.threshold, h = base - y(cong);
        return (
          <g key={id}>
            {/* A shard no troll can live on: a short hatched stub, not a column that reads as a bar. */}
            {unreachable && (
              <>
                <rect x={cx - bw / 2} y={base - 8} width={bw} height="8" fill="url(#unused-hatch)" />
                <text x={cx} y={base - 16} textAnchor="middle" fontSize="12" fill="var(--ink-2)">not in use</text>
              </>
            )}
            {h > 0.5 && (
              <path
                d={`M${cx - bw / 2},${base}V${base - h + Math.min(4, h)}q0,-4 4,-4h${bw - 8}q4,0 4,4V${base}Z`}
                fill={rejecting ? "var(--starve)" : role === "control token" ? "var(--teal-deep)" : "var(--accent)"}
              >
                <title>{`shard ${id}: congestion ${cong}`}</title>
              </path>
            )}
            <rect x={cx + bw / 2 + 3} y={base - (base - y(full))} width="5" height={base - y(full)} fill="var(--mist)">
              <title>{`shard ${id}: chunk ${(full * 100).toFixed(1)}% full`}</title>
            </rect>
            {cong > 0.005 && <text x={cx} y={base - h - 6} textAnchor="middle" fontSize="12" fill="var(--ink-0)">{cong.toFixed(2)}</text>}
            <text x={cx} y={base + 18} textAnchor="middle" fontSize="12" fill="var(--ink-1)">shard {id}</text>
            <text x={cx} y={base + 34} textAnchor="middle" fontSize="11" fill="var(--ink-2)">
              <title>{role}</title>
              {role.length > 13 ? `${role.slice(0, 12)}…` : role}
            </text>
            {rejecting && <text x={cx} y={base + 52} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--starve)">✕ rejecting</text>}
          </g>
        );
      })}
    </svg>
  );
}

function Timeline({ run, i }: { run: Run; i: number }) {
  const W = 1000, H = 210, x0 = 40, top = 12, base = 176;
  const B = run.blocks, t0 = B[0][0], t1 = B[B.length - 1][0];
  const x = (t: number) => x0 + ((t - t0) / Math.max(1, t1 - t0)) * (W - x0 - 10);
  const y = (v: number) => base - Math.min(1, v) * (base - top);
  // Shards no troll can be placed on are left out; the busiest of the rest is drawn dark.
  const used = run.shard_ids.map((id, k) => [id, k] as const).filter(([id]) => !(run.roles[id] ?? "").endsWith(" only"));
  const peak = used.map(([, k]) => Math.max(...B.map(([, s]) => s[k][0])));
  const hot = used[peak.indexOf(Math.max(...peak))][1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Congestion of every shard over the run">
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={x0} x2={W - 10} y1={y(v)} y2={y(v)} stroke="var(--hairline)" />
          <text x={x0 - 6} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--ink-2)">{v}</text>
        </g>
      ))}
      <line x1={x0} x2={W - 10} y1={y(run.threshold)} y2={y(run.threshold)} stroke="var(--starve)" strokeWidth="1.5" strokeDasharray="5 4" />
      {used.map(([id, k]) =>
        k === hot ? null : (
          <path key={id} d={B.map(([t, s], j) => `${j ? "L" : "M"}${x(t).toFixed(1)},${y(s[k][0]).toFixed(1)}`).join("")} fill="none" stroke="var(--ink-2)" strokeOpacity="0.6" strokeWidth="2" />
        ),
      )}
      <path d={B.map(([t, s], j) => `${j ? "L" : "M"}${x(t).toFixed(1)},${y(s[hot][0]).toFixed(1)}`).join("")} fill="none" stroke="var(--teal-deep)" strokeWidth="2" />
      <line x1={x(B[i][0])} x2={x(B[i][0])} y1={top} y2={base} stroke="var(--ink-1)" />
      <text x={x0} y={H - 6} fontSize="12" fill="var(--ink-2)">
        {`${Math.round((t1 - t0) / 1000)} s shown · dark: the most congested shard (${run.shard_ids[hot]}) · grey: the other ${used.length - 1} shards in use · a line on 0 means no backlog`}
      </text>
    </svg>
  );
}

export function Replay() {
  const [id, setId] = useState(RUNS[0].id);
  const [loaded, setLoaded] = useState<Run | null>(null);
  // The run on screen; while another one loads, nothing is shown.
  const run = loaded?.id === id ? loaded : null;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(4);
  const sim = useRef({ t: 0, last: 0 });

  useEffect(() => {
    let live = true;
    getJSON<Run>(`${LOCALNET}/runs/${id}.json`).then((r) => {
      if (!live || !r) return;
      setLoaded(r);
      setI(0);
      sim.current = { t: r.blocks[0][0], last: 0 };
      setPlaying(true);
    });
    return () => {
      live = false;
    };
  }, [id]);

  // Advance through the blocks in (scaled) real time.
  useEffect(() => {
    if (!run || !playing) return;
    let raf = 0;
    sim.current.last = 0;
    const tick = (ts: number) => {
      const s = sim.current;
      if (s.last) s.t += (ts - s.last) * speed;
      s.last = ts;
      setI((cur) => {
        let k = cur;
        while (k < run.blocks.length - 1 && run.blocks[k + 1][0] <= s.t) k++;
        if (k === run.blocks.length - 1) setPlaying(false);
        return k;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, playing, speed]);

  const label = RUNS.find((r) => r.id === id)?.label;
  const frame = run?.blocks[i];
  const now = frame?.[0] ?? 0;
  const rejected = run ? run.rejections.filter((r) => r.t_ms <= now).length : 0;
  const cong = frame ? Math.max(...frame[1].map(([c]) => c)) : 0;
  const full = frame ? Math.max(...frame[1].map(([, f]) => f)) : 0;
  const kinds = run ? [...new Set(run.rejections.map((r) => r.kind))] : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex w-full min-w-0 items-center gap-2 text-ink-1 sm:w-auto">
          Run
          <select value={id} onChange={(e) => setId(e.target.value)} className="min-h-11 min-w-0 flex-1 border-[3px] border-ink-0 bg-paper px-2 text-ink-0 sm:flex-none">
            {RUNS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            if (run && i === run.blocks.length - 1) {
              setI(0);
              sim.current.t = run.blocks[0][0];
            }
            setPlaying((p) => !p);
          }}
          className="btn btn-moss"
        >
          {playing ? "Pause" : run && i === run.blocks.length - 1 ? "Replay" : "Play"}
        </button>
        <label className="flex items-center gap-2 text-ink-1">
          Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="min-h-11 border-[3px] border-ink-0 bg-paper px-2 text-ink-0">
            {[1, 4, 10].map((s) => (
              <option key={s} value={s}>{s}×</option>
            ))}
          </select>
        </label>
        <input
          type="range"
          min={0}
          max={run ? run.blocks.length - 1 : 0}
          value={i}
          aria-label="Position in the run"
          onChange={(e) => {
            const k = Number(e.target.value);
            setPlaying(false);
            setI(k);
            if (run) sim.current.t = run.blocks[k][0];
          }}
          className="min-h-11 min-w-40 flex-1 accent-[var(--accent-deep)]"
        />
      </div>
      {!run ? (
        <p className="py-24 text-center text-sm text-ink-2">Loading {label}…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Transactions rejected" value={String(rejected)} note={`of ${run.probes} direct transfers sent to the token${kinds.length ? ` (${kinds.join(", ")})` : ""}`} />
            <Tile label="Highest shard congestion" value={cong.toFixed(2)} note={`rejects new transactions at ${run.threshold}`} />
            <Tile label="Busiest chunk" value={`${Math.round(full * 100)}%`} note="gas used of the 1,000 Tgas limit" />
            <Tile label="Time" value={`${Math.max(0, Math.round(now / 1000))} s`} note={`block ${i + 1} of ${run.blocks.length}`} />
          </div>
          <div className="border-[3px] border-ink-0 bg-paper p-4 md:p-6">
            <h3 className="font-display text-2xl text-ink-0">Congestion per shard</h3>
            <p className="mt-1 text-sm text-ink-2">
              Bar: congestion level (backlog against the protocol&apos;s limit). Thin bar: how full this block&apos;s chunk was. Above the dashed line the network rejects new transactions to that shard.
            </p>
            <div className="mt-3">
              <Shards run={run} i={i} />
            </div>
          </div>
          <div className="border-[3px] border-ink-0 bg-paper p-4 md:p-6">
            <h3 className="font-display text-2xl text-ink-0">Congestion over time</h3>
            <div className="mt-3">
              <Timeline run={run} i={i} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
