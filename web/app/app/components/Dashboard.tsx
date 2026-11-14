"use client";

import { useEffect, useState } from "react";
import { ROOT, accountUrl, fmtDuration, homeIndex } from "../lib/near";
import { useMe } from "../lib/useMe";
import { useNetwork, useNow } from "../lib/useNetwork";
import { useWallet } from "../lib/wallet";
import { EventFeed } from "./EventFeed";
import { GuidedAction, TrollStrip } from "./GuidedAction";
import { KeeperCall, SendToFriend } from "./Secondary";

/** Testnet with shortened demo parameters, said plainly. */
function NetworkLine({
  epochMinutes,
  feedTarget,
  left,
  round,
  streak,
}: {
  epochMinutes?: number;
  feedTarget?: number;
  left?: number | null;
  round?: number;
  streak?: number;
}) {
  return (
    <p className="tag flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-1">
      <span className="border-2 border-ink-0 bg-ink-0 px-2 py-0.5 text-paper">testnet · demo parameters</span>
      <a className="-my-[13px] inline-block py-[13px] underline" href={accountUrl(ROOT)} target="_blank" rel="noreferrer">
        {ROOT}
      </a>
      {epochMinutes !== undefined && (
        <span>
          {epochMinutes}-min rounds · {feedTarget} feeder{feedTarget === 1 ? "" : "s"} per troll
        </span>
      )}
      {round !== undefined && (
        <span>
          round {round}
          {left !== undefined && left !== null ? ` ends in ${fmtDuration(left)}` : ""} · streak {streak}
        </span>
      )}
    </p>
  );
}

export function Dashboard() {
  const { stat, live, error } = useNetwork();
  const wallet = useWallet();
  const now = useNow();
  const { me, optimistic } = useMe(wallet.accountId, stat, live);
  const [home, setHome] = useState<{ account: string; index: number } | null>(null);
  const [activity, setActivity] = useState(false);

  useEffect(() => {
    const account = wallet.accountId;
    if (!stat || !account) return;
    homeIndex(account, stat.trolls.length).then((index) => setHome({ account, index }));
  }, [stat, wallet.accountId]);
  const mine = home && home.account === wallet.accountId ? home.index : null;

  if (!stat) {
    return (
      <div className="space-y-6" aria-busy="true">
        <NetworkLine />
        <section className="border-[3px] border-ink-0 p-8">
          <h1 className="font-display text-4xl text-ink-0 md:text-6xl">Waking the trolls…</h1>
          <p className="mt-3 text-ink-1" role="status">
            {error ? `Could not reach the trolls: ${error}` : `Reading ${ROOT} on NEAR testnet.`}
          </p>
        </section>
      </div>
    );
  }

  const { params, startMs } = stat;
  const root = live?.root;
  const left = startMs !== null && root && now !== null ? startMs + (root.current_epoch + 1) * params.epoch_ms - now : null;

  return (
    <div className="space-y-6">
      <NetworkLine epochMinutes={params.epoch_ms / 60_000} feedTarget={params.feed_target} left={left} round={root?.current_epoch} streak={root?.streak} />
      <GuidedAction wallet={wallet} stat={stat} live={live} me={me} optimistic={optimistic} now={now} />
      <KeeperCall wallet={wallet} stat={stat} live={live} />
      <TrollStrip stat={stat} live={live} mine={mine} />
      <SendToFriend wallet={wallet} stat={stat} me={me} />
      <section className="border-[3px] border-ink-0 bg-surface-1 p-5">
        <h2 className="font-display text-2xl text-ink-0">Buy STRL?</h2>
        <p className="mt-2 max-w-2xl text-ink-1">
          No market yet: STRL is earned by claiming and feeding. Trading would go through a single-shard wrapper, which is built but not deployed.
        </p>
      </section>
      <details className="group border-[3px] border-ink-0 bg-paper" onToggle={(e) => setActivity((e.target as HTMLDetailsElement).open)}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 font-semibold text-ink-0 hover:bg-surface-1">
          What the trolls are doing <span aria-hidden className="group-open:hidden">+</span>
          <span aria-hidden className="hidden group-open:inline">−</span>
        </summary>
        <div className="border-t-[3px] border-ink-0 p-4">{activity && <EventFeed trolls={stat.trolls} decimals={stat.metadata.decimals} />}</div>
      </details>
    </div>
  );
}
