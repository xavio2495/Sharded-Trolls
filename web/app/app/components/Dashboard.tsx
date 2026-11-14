"use client";

import { useEffect, useState } from "react";
import { ROOT, accountUrl, fmtDuration, fmtNear, fmtTokens, homeIndex } from "../lib/near";
import { useNetwork, useNow } from "../lib/useNetwork";
import { useWallet } from "../lib/wallet";
import { EventFeed } from "./EventFeed";
import { Keeper } from "./Keeper";
import { TrollCard } from "./TrollCard";
import { YourTroll } from "./YourTroll";

function Panel({ title, kicker, children }: { title: string; kicker?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border-2 border-ink-line bg-surface-1 p-5 shadow-[4px_4px_0_0_var(--ink-line)] md:p-6">
      {kicker && <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent-deep">{kicker}</p>}
      <h2 className="font-display text-3xl text-ink-0 md:text-4xl">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Figure({ label, value, coin }: { label: string; value: string; coin?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-1">{label}</dt>
      <dd className="mt-1 flex items-center gap-2 truncate font-display text-2xl text-ink-0 md:text-3xl">
        {coin && <span aria-hidden className="inline-block size-4 shrink-0 rounded-full border-2 border-ink-line bg-gold" />}
        {value}
      </dd>
    </div>
  );
}

export function Dashboard() {
  const { stat, live, error } = useNetwork();
  const wallet = useWallet();
  const now = useNow();
  const [home, setHome] = useState<{ account: string; index: number } | null>(null);
  useEffect(() => {
    const account = wallet.accountId;
    if (!stat || !account) return;
    homeIndex(account, stat.trolls.length).then((index) => setHome({ account, index }));
  }, [stat, wallet.accountId]);
  const mine = home && home.account === wallet.accountId ? home.index : null;

  if (!stat) {
    return (
      <p className="py-20 text-center text-ink-1">
        {error ? `Could not reach the trolls: ${error}` : `Waking the trolls on ${ROOT}…`}
      </p>
    );
  }

  const { params, metadata, trolls, shards, startMs } = stat;
  const root = live?.root;
  const nextEpochAt = startMs !== null && root ? startMs + (root.current_epoch + 1) * params.epoch_ms : null;
  const fedAll = live ? live.trolls.every((t) => t.senders_this_epoch >= params.feed_target) : false;

  return (
    <div className="space-y-8">
      <section className="rounded-[var(--radius-card)] border-2 border-ink-line bg-paper p-5 shadow-[5px_5px_0_0_var(--ink-line)] md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-display text-5xl leading-none text-ink-0 md:text-6xl">The Feeding</h1>
          <p className="text-sm text-ink-1">
            testnet ·{" "}
            <a className="underline" href={accountUrl(ROOT)} target="_blank" rel="noreferrer">
              {ROOT}
            </a>
          </p>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-5 md:grid-cols-4">
          <Figure
            label={root ? `Epoch ${root.current_epoch} ends in` : "Epoch"}
            value={nextEpochAt !== null && now !== null ? fmtDuration(nextEpochAt - now) : "—"}
          />
          <Figure label="Streak (best)" value={root ? `${root.streak} (${root.best_streak})` : "—"} />
          <Figure label="Bounty budget" value={root?.bounty_budget !== undefined ? fmtNear(root.bounty_budget) : "—"} coin />
          <Figure label={`Total supply (${metadata.symbol})`} value={root ? fmtTokens(root.total_supply, metadata.decimals) : "—"} />
        </dl>
        <p className="mt-4 text-ink-1">
          {live
            ? fedAll
              ? "Every troll has enough feeders this epoch. Keep it up and the streak grows."
              : `Each troll needs ${params.feed_target} feeders this epoch, or it starves and burns ${params.starve_burn_bps / 100}% of its hoard.`
            : "Counting feeders…"}
          {error && <span className="ml-2 text-starve">(last refresh failed; retrying)</span>}
        </p>
      </section>

      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {trolls.map((t, i) => (
          <TrollCard
            key={t}
            index={i}
            account={t}
            shard={shards[i]}
            info={live?.trolls[i]}
            feedTarget={params.feed_target}
            symbol={metadata.symbol}
            mine={mine === i}
          />
        ))}
      </ul>

      <Panel kicker="Your troll" title="Feed your troll">
        <YourTroll wallet={wallet} stat={stat} live={live} now={now} />
      </Panel>

      <div className="grid items-start gap-8 lg:grid-cols-2">
        <Panel kicker="Keeper" title="Anyone can close the day">
          <Keeper wallet={wallet} stat={stat} live={live} />
        </Panel>
        <Panel kicker="Live" title="What the trolls are doing">
          <EventFeed trolls={trolls} decimals={metadata.decimals} />
        </Panel>
      </div>
    </div>
  );
}
