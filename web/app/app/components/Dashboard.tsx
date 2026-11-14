"use client";

import { useEffect, useState } from "react";
import { ROOT, accountUrl, fmtDuration, fmtNear, fmtTokens, homeIndex } from "../lib/near";
import { useMe } from "../lib/useMe";
import { useNetwork, useNow } from "../lib/useNetwork";
import { useWallet } from "../lib/wallet";
import { EventFeed } from "./EventFeed";
import { GuidedAction, TrollStrip } from "./GuidedAction";
import { KeeperCell, SendCell } from "./Secondary";

/** One bento cell: no rounding, the ink lattice comes from the grid gap. */
function Cell({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`min-h-0 min-w-0 overflow-hidden bg-paper ${className}`}>{children}</section>;
}

/*
  Desktop (lg): 4 columns × 3 rows, one screen.
    hero hero status keeper
    hero hero strip  strip
    send send events buy
  Tablet (md): 2 columns × 5 rows, one screen. Phones: one column, guided action first, page scrolls.
*/
const GRID =
  "grid gap-[3px] border-[3px] border-ink-0 bg-ink-0 md:h-full " +
  "md:grid-cols-2 md:grid-rows-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] " +
  "lg:grid-cols-4 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.95fr)]";

export function Dashboard() {
  const { stat, live, error } = useNetwork();
  const wallet = useWallet();
  const now = useNow();
  const { me, optimistic } = useMe(wallet.accountId, stat, live);
  const [home, setHome] = useState<{ account: string; index: number } | null>(null);

  useEffect(() => {
    const account = wallet.accountId;
    if (!stat || !account) return;
    homeIndex(account, stat.trolls.length).then((index) => setHome({ account, index }));
  }, [stat, wallet.accountId]);
  const mine = home && home.account === wallet.accountId ? home.index : null;

  if (!stat) {
    return (
      <div className={GRID} aria-busy="true">
        <Cell className="p-8 md:col-span-2 lg:row-span-2">
          <h1 className="font-display text-4xl text-ink-0 md:text-6xl">Waking the trolls…</h1>
          <p className="mt-3 text-ink-1" role="status">
            {error ? `Could not reach the trolls: ${error}` : `Reading ${ROOT} on NEAR testnet.`}
          </p>
        </Cell>
        {["", "", "md:col-span-2", "md:col-span-2", "", ""].map((c, i) => (
          <Cell key={i} className={`${c} hidden md:block`}>
            <span className="sr-only">loading</span>
          </Cell>
        ))}
      </div>
    );
  }

  const { params, startMs, metadata } = stat;
  const root = live?.root;
  const left = startMs !== null && root && now !== null ? startMs + (root.current_epoch + 1) * params.epoch_ms - now : null;
  const minutes = params.epoch_ms / 60_000;
  const bounty = BigInt(params.settle_bounty ?? "0");

  return (
    <div className={GRID}>
      <Cell className="md:col-span-2 lg:row-span-2">
        <GuidedAction wallet={wallet} stat={stat} live={live} me={me} optimistic={optimistic} now={now} />
      </Cell>

      <Cell className="flex flex-col justify-between gap-1 px-4 pb-3">
        <a
          className="tag flex min-h-11 items-center gap-2 text-ink-1 hover:text-ink-0"
          href={accountUrl(ROOT)}
          target="_blank"
          rel="noreferrer"
          title={`${ROOT} on the explorer`}
        >
          <span className="bg-ink-0 px-1.5 text-paper">testnet</span>
          <span className="truncate">
            {minutes}-min days · {params.feed_target} feeder{params.feed_target === 1 ? "" : "s"} per troll
          </span>
        </a>
        <div>
          <p className="tag text-ink-1">round {root?.current_epoch ?? "…"} ends in</p>
          <p className="font-display text-3xl leading-none text-ink-0 tabular-nums [@media(min-height:860px)]:xl:text-5xl">
            {left !== null ? fmtDuration(left) : "—"}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 text-sm">
          <dt className="text-ink-1">Streak (best)</dt>
          <dd className="text-right font-semibold tabular-nums text-ink-0">{root ? `${root.streak} (${root.best_streak})` : "—"}</dd>
          <dt className="text-ink-1">Bounty budget</dt>
          <dd className="flex items-center justify-end gap-1.5 font-semibold tabular-nums text-ink-0">
            {bounty > BigInt(0) && <span aria-hidden className="inline-block size-3 border-2 border-ink-0 bg-gold" />}
            {root?.bounty_budget !== undefined ? fmtNear(root.bounty_budget) : "—"}
          </dd>
          <dt className="text-ink-1">Supply</dt>
          <dd className="text-right font-semibold tabular-nums text-ink-0">
            {root ? fmtTokens(root.total_supply, metadata.decimals) : "—"} {metadata.symbol}
          </dd>
        </dl>
      </Cell>

      <Cell>
        <KeeperCell wallet={wallet} stat={stat} live={live} left={left} />
      </Cell>

      <Cell className="md:col-span-2">
        <TrollStrip stat={stat} live={live} mine={mine} />
      </Cell>

      <Cell className="md:col-span-2">
        <SendCell wallet={wallet} stat={stat} me={me} />
      </Cell>

      <Cell className="flex flex-col">
        <h2 className="border-b-[3px] border-ink-0 px-4 py-2 font-display text-xl text-ink-0">What the trolls are doing</h2>
        {/* the only scrolling area on desktop */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 max-md:max-h-96">
          <EventFeed trolls={stat.trolls} decimals={metadata.decimals} limit={8} />
        </div>
      </Cell>

      <Cell className="flex flex-col justify-center bg-surface-1 p-4">
        <h2 className="font-display text-2xl leading-none text-ink-0">Buy STRL?</h2>
        <p className="mt-2 text-sm text-ink-1">
          No market yet: STRL is earned by claiming and feeding. Trading would go through a single-shard wrapper, built but not deployed.
        </p>
      </Cell>
    </div>
  );
}
