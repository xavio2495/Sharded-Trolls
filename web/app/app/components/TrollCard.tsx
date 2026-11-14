import Image from "next/image";
import { TROLL_NAMES, accountUrl, fmtTokens, type TrollInfo } from "../lib/near";

/** Feeders this epoch against the target, as a ring. */
export function FeedRing({ fed, target }: { fed: number; target: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, target ? fed / target : 0);
  const done = fed >= target;
  return (
    <svg viewBox="0 0 64 64" className="size-14 shrink-0" role="img" aria-label={`${fed} of ${target} feeders`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--hairline)" strokeWidth="7" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={done ? "var(--teal-deep)" : "var(--terracotta-deep)"}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${frac * c} ${c}`}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="30" textAnchor="middle" className="fill-ink-0 font-display" fontSize="17">
        {fed}
      </text>
      <text x="32" y="45" textAnchor="middle" className="fill-ink-1" fontSize="10">
        of {target}
      </text>
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-hairline py-1 last:border-0">
      <dt className="text-sm text-ink-1">{label}</dt>
      <dd className="font-semibold tabular-nums text-ink-0">{value}</dd>
    </div>
  );
}

export function TrollCard({
  index,
  account,
  shard,
  info,
  feedTarget,
  symbol,
  mine,
}: {
  index: number;
  account?: string;
  shard?: number;
  info?: TrollInfo;
  feedTarget: number;
  symbol: string;
  mine?: boolean;
}) {
  const fed = info?.senders_this_epoch ?? 0;
  return (
    <li
      className={`relative rounded-[var(--radius-card)] border-2 border-ink-line bg-surface-1 p-4 shadow-[4px_4px_0_0_var(--ink-line)] ${
        mine ? "outline outline-4 outline-offset-2 outline-teal-deep" : ""
      }`}
    >
      {mine && (
        <span className="absolute -top-3 right-3 rounded-[var(--radius-ui)] bg-teal-deep px-2 py-0.5 text-xs font-semibold text-paper">
          your troll
        </span>
      )}
      <div className="flex items-center gap-3">
        <Image
          src={`/art/trolls-v2/troll-${index + 1}.webp`}
          alt={`${TROLL_NAMES[index]}, troll ${index + 1}`}
          width={720}
          height={720}
          className="size-16 shrink-0 mix-blend-multiply"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl leading-tight text-ink-0 xl:text-lg">{TROLL_NAMES[index]}</h3>
          <p className="mt-1 text-sm text-ink-1">{shard !== undefined ? `shard ${shard}` : "finding its shard…"}</p>
          {account ? (
            <a href={accountUrl(account)} target="_blank" rel="noreferrer" className="block truncate text-xs text-ink-1 underline">
              {account}
            </a>
          ) : (
            <span aria-hidden className="mt-1 block h-3 w-28 animate-pulse rounded bg-surface-2" />
          )}
        </div>
        {info ? (
          <FeedRing fed={fed} target={feedTarget} />
        ) : (
          <span aria-hidden className="size-14 shrink-0 animate-pulse rounded-full border-[7px] border-hairline" />
        )}
      </div>
      <dl className="mt-3">
        <Stat label="Food (tolls eaten)" value={info?.food !== undefined ? fmtTokens(info.food) : "—"} />
        <Stat label="Hoard" value={fmtTokens(info?.hoard)} />
        <Stat label="Launch pool" value={fmtTokens(info?.launch_pool)} />
        <Stat label={`Supply (${symbol})`} value={fmtTokens(info?.supply)} />
      </dl>
    </li>
  );
}
