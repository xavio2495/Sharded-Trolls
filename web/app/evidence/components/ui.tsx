import { ADDR, TX, short } from "./data";

/** A white slab with a hard shadow; `tag` is a short label such as a check id ("K7"). */
export function Panel({ title, tag, children, className = "" }: { title: string; tag?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`slab p-5 md:p-6 ${className}`}>
      {tag && <span className="tag text-accent-deep">{tag}</span>}
      <h3 className="font-display text-2xl leading-tight text-ink-0 md:text-3xl">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Pass/fail badge: icon and word, never colour alone. */
export function Verdict({ ok, children }: { ok: boolean; children?: React.ReactNode }) {
  return (
    <span
      className={`tag inline-flex items-center gap-1 border-2 px-2 py-0.5 font-semibold ${
        ok ? "border-accent-deep text-accent-deep" : "border-starve text-starve"
      }`}
    >
      <span aria-hidden>{ok ? "✓" : "✕"}</span>
      {children ?? (ok ? "pass" : "fail")}
    </span>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-ink-1">{children}</p>;
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
