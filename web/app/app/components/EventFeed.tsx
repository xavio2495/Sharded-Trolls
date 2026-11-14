"use client";

import { useEffect, useState } from "react";
import { ROOT, TROLL_NAMES, TX_API, fmtNear, fmtTokens, postJson, txUrl } from "../lib/near";

type Event = { key: string; hash: string; at: number; who: string; standard: string; event: string; data: Record<string, unknown> };

type AccountTxs = { account_txs?: { transaction_hash: string; tx_block_height: number; is_event_log: boolean }[] };
type Txs = {
  transactions: {
    transaction: { hash: string };
    receipts: { execution_outcome: { block_timestamp: number; id: string; outcome: { logs: string[]; executor_id: string } } }[];
  }[];
};

const POLL_MS = 120_000;
const SHOW = 40;

function label(who: string, trolls: string[]): string {
  if (who === ROOT) return "Root";
  const i = trolls.indexOf(who);
  return i >= 0 ? TROLL_NAMES[i] : who;
}

function summary(e: Event, decimals: number): string {
  const d = e.data;
  const amt =
    typeof d.amount !== "string" ? "" : e.event.startsWith("settle_bounty") ? ` ${fmtNear(d.amount)}` : ` ${fmtTokens(d.amount, decimals)}`;
  const who = (d.account_id ?? d.owner_id ?? d.new_owner_id ?? d.troll) as string | undefined;
  const epoch = d.epoch !== undefined ? ` epoch ${d.epoch}` : "";
  const fed = d.fed !== undefined ? (d.fed ? " fed" : " starved") : "";
  return `${amt}${epoch}${fed}${who ? ` · ${who}` : ""}`;
}

/** Latest NEP-297 events from the root and the eight trolls, newest first. */
export function EventFeed({ trolls, decimals }: { trolls: string[]; decimals: number }) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const seen = new Map<string, number>();
        for (const account of [ROOT, ...trolls]) {
          const r = await postJson<AccountTxs>(`${TX_API}/account`, { account_id: account, max_block_height: null });
          for (const t of r.account_txs ?? []) if (t.is_event_log) seen.set(t.transaction_hash, t.tx_block_height);
        }
        const hashes = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([h]) => h);
        if (hashes.length === 0) return !stop && setEvents([]);
        const txs = await postJson<Txs>(`${TX_API}/transactions`, { tx_hashes: hashes });
        const out: Event[] = [];
        for (const t of txs.transactions) {
          for (const r of t.receipts) {
            const o = r.execution_outcome;
            o.outcome.logs.forEach((log, n) => {
              if (!log.startsWith("EVENT_JSON:")) return;
              try {
                const j = JSON.parse(log.slice(11));
                for (const data of j.data ?? [{}]) {
                  out.push({ key: `${o.id}-${n}-${out.length}`, hash: t.transaction.hash, at: o.block_timestamp / 1e6, who: o.outcome.executor_id, standard: j.standard, event: j.event, data });
                }
              } catch {
                /* not our event shape */
              }
            });
          }
        }
        out.sort((a, b) => b.at - a.at);
        if (!stop) {
          setEvents(out.slice(0, SHOW));
          setError(null);
        }
      } catch (e) {
        if (!stop) setError(String(e));
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [trolls]);

  if (error && !events) return <p className="text-starve">Could not load events: {error}</p>;
  if (!events) return <p className="text-ink-1">Loading events…</p>;
  if (events.length === 0) return <p className="text-ink-1">No events yet.</p>;
  return (
    <ul className="max-h-[32rem] divide-y divide-hairline overflow-y-auto pr-2">
      {events.map((e) => (
        <li key={e.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
          <time className="w-16 shrink-0 tabular-nums text-ink-1 sm:w-20" dateTime={new Date(e.at).toISOString()}>
            {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </time>
          <span className="w-20 shrink-0 font-semibold text-ink-0 sm:w-24">{label(e.who, trolls)}</span>
          <span className="rounded-[var(--radius-ui)] bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink-0">{e.event}</span>
          <span className="order-last basis-full truncate pl-16 text-ink-1 sm:order-none sm:basis-0 sm:flex-1 sm:pl-0">{summary(e, decimals)}</span>
          <a className="text-teal-deep underline" href={txUrl(e.hash)} target="_blank" rel="noreferrer">
            tx
          </a>
        </li>
      ))}
    </ul>
  );
}
