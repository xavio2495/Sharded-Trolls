import { ADDR, TX, short } from "./data";

export function Panel({ title, kicker, children, className = "" }: { title: string; kicker?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[var(--radius-card)] border-2 border-ink-line bg-surface-1 p-5 shadow-[4px_4px_0_0_var(--ink-line)] md:p-6 ${className}`}>
      {kicker && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-deep">{kicker}</p>}
      <h3 className="font-display text-2xl leading-tight text-ink-0 md:text-3xl">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Pass/fail badge: icon and word, never colour alone. */
export function Verdict({ ok, children }: { ok: boolean; children?: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--radius-ui)] border-2 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.1em] ${
        ok ? "border-accent-deep text-accent-deep" : "border-starve text-starve"
      }`}
    >
      <span aria-hidden>{ok ? "✓" : "✕"}</span>
      {children ?? (ok ? "pass" : "fail")}
    </span>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="border-l-4 border-mist pl-3 text-sm leading-relaxed text-ink-1">{children}</p>;
}

export function Tx({ hash }: { hash: string }) {
  return (
    <a href={`${TX}${hash}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-teal-deep underline underline-offset-2">
      {short(hash, 8)}
    </a>
  );
}

export function Account({ id }: { id: string }) {
  return (
    <a href={`${ADDR}${id}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-teal-deep underline underline-offset-2">
      {id}
    </a>
  );
}

export function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-2">{k}</dt>
          <dd className="min-w-0 break-words font-medium tabular-nums text-ink-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Big({ value, unit }: { value: string; unit?: string }) {
  return (
    <p className="font-display text-4xl leading-none text-ink-0 tabular-nums">
      {value}
      {unit && <span className="ml-2 font-sans text-sm text-ink-1">{unit}</span>}
    </p>
  );
}
