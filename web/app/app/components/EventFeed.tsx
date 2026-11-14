"use client";

import { useEffect, useState } from "react";
import { ROOT, TROLL_NAMES, TX_API, fmtNear, fmtTokens, postJson, txUrl } from "../lib/near";

type Event = { key: string; hash: string; at: number; who: string; standard: string; event: string; data: Record<string, unknown> };
type Row = Event & Line;

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

type Line = { verb: string; detail: string };

/**
 * One event in plain words, or null for bookkeeping that would only repeat
 * another row (launch mints, the receiving half of a cross-troll send, reward plumbing).
 */
function describe(e: Event, decimals: number, trolls: string[]): Line | null {
  const d = e.data;
  const memo = typeof d.memo === "string" ? d.memo : "";
  const amt = typeof d.amount === "string" ? `${fmtTokens(d.amount, decimals)} STRL` : "";
  const round = d.epoch !== undefined ? `round ${d.epoch}` : "";
  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" · ");
  const acct = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : undefined);
  const roundIn = (m: string) => m.match(/epoch (\d+)/)?.[1];

  if (e.standard === "nep141") {
    if (e.event === "ft_mint") {
      if (memo.startsWith("feeding reward")) {
        const r = roundIn(memo);
        return { verb: "reward", detail: join(amt, r && `round ${r}`) };
      }
      return null;
    }
    if (e.event === "ft_transfer") {
      const to = acct("new_owner_id");
      if (memo === "launch claim") return { verb: "claimed", detail: join(amt, to) };
      if (memo === "feeding reward") return { verb: "reward paid", detail: join(amt, to) };
      if (memo === "refund") return { verb: "refunded", detail: join(amt, to) };
      return { verb: "sent", detail: join(amt, `${acct("old_owner_id")} → ${to}`) };
    }
    if (e.event === "ft_burn") {
      if (memo.startsWith("cross-troll return")) return null;
      if (memo.startsWith("cross-troll")) return { verb: "sent", detail: join(amt, acct("owner_id"), "to another troll") };
      if (memo.startsWith("starved")) {
        const r = roundIn(memo);
        return { verb: "starved", detail: join(`${amt} burned`, r && `round ${r}`) };
      }
      return { verb: "burned", detail: join(amt, acct("owner_id")) };
    }
    return null;
  }

  switch (e.event) {
    case "toll":
      return { verb: "fed", detail: join(`${amt} toll`, acct("account_id")) };
    case "toll_eaten":
      return { verb: "toll kept", detail: join(amt, acct("account_id")) };
    case "credit_refunded":
      return { verb: "refunded", detail: join(amt, acct("account_id")) };
    case "credit_unresolved":
      return { verb: "send stuck", detail: join(amt, acct("account_id")) };
    case "reward_forfeited":
      return { verb: "reward lost", detail: join(round, acct("account_id")) };
    case "reward_expired":
      return { verb: "reward expired", detail: join(amt, round) };
    case "feeding_settled":
      return { verb: "settled", detail: join(round, d.fed ? "all eight fed" : "some trolls starved") };
    case "troll_starved": {
      const t = acct("troll");
      const i = t ? trolls.indexOf(t) : -1;
      return { verb: "starved", detail: join(i >= 0 ? TROLL_NAMES[i] : t, round) };
    }
    case "settle_failed":
      return { verb: "settle failed", detail: round };
    case "settle_bounty_paid":
      return { verb: "bounty paid", detail: join(typeof d.amount === "string" ? fmtNear(d.amount) : "", acct("account_id")) };
    default:
      return null;
  }
}

/** Latest NEP-297 events from the root and the eight trolls, newest first. */
export function EventFeed({ trolls, decimals, limit = SHOW }: { trolls: string[]; decimals: number; limit?: number }) {
  const [events, setEvents] = useState<Row[] | null>(null);
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
        const out: Row[] = [];
        for (const t of txs.transactions) {
          for (const r of t.receipts) {
            const o = r.execution_outcome;
            o.outcome.logs.forEach((log, n) => {
              if (!log.startsWith("EVENT_JSON:")) return;
              try {
                const j = JSON.parse(log.slice(11));
                for (const data of j.data ?? [{}]) {
                  const ev: Event = { key: `${o.id}-${n}-${out.length}`, hash: t.transaction.hash, at: o.block_timestamp / 1e6, who: o.outcome.executor_id, standard: j.standard, event: j.event, data };
                  const line = describe(ev, decimals, trolls);
                  if (line) out.push({ ...ev, ...line });
                }
              } catch {
                /* not our event shape */
              }
            });
          }
        }
        out.sort((a, b) => b.at - a.at);
        if (!stop) {
          setEvents(out.slice(0, limit));
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
  }, [trolls, limit, decimals]);

  if (error && !events) return <p className="text-starve">Could not load events: {error}</p>;
  if (!events) return <p className="text-ink-1">Loading events…</p>;
  if (events.length === 0) return <p className="text-ink-1">Nothing yet. Claims, feeds, sends and settled rounds show up here.</p>;
  return (
    <ul className="divide-y divide-hairline">
      {events.map((e) => (
        <li key={e.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
          <time className="w-16 shrink-0 tabular-nums text-ink-1 sm:w-20" dateTime={new Date(e.at).toISOString()}>
            {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </time>
          <span className="w-20 shrink-0 font-semibold text-ink-0 sm:w-24">{label(e.who, trolls)}</span>
          <span className="tag text-ink-0">{e.verb}</span>
          <span className="order-last basis-full truncate pl-16 text-ink-1 sm:order-none sm:basis-0 sm:flex-1 sm:pl-0">{e.detail}</span>
          <a className="-my-3 inline-flex min-h-11 min-w-11 items-center justify-center text-teal-deep underline" href={txUrl(e.hash)} target="_blank" rel="noreferrer" aria-label={`transaction: ${e.verb}`}>
            tx
          </a>
        </li>
      ))}
    </ul>
  );
}
