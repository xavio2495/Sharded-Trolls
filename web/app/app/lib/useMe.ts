"use client";

import { useCallback, useEffect, useState } from "react";
import { homeIndex, view, viewOpt, type Pool } from "./near";
import type { Live, Static } from "./useNetwork";

export type Reward = { epoch: number; share: string; deadline?: number };

export type Me = {
  account: string;
  index: number;
  troll: string;
  registered: boolean;
  balance: bigint;
  claimedLaunch: boolean;
  /** Counted as a feeder of the current epoch. */
  fed: boolean;
  /** Settled, unpaid rewards (at most two). */
  rewards: Reward[];
  lastApplied: number | null;
};

/**
 * Optimistic changes from transactions the wallet confirmed but the chain views have not caught up
 * with. Each one stops applying as soon as the view shows it, so nothing is counted twice.
 */
export type Pending = { claimAmount?: bigint; fedEpoch?: number; feedAmount?: bigint; paid?: Reward[]; at?: number };

/** The connected account's state at its home troll, refreshed every 15 s and after each action. */
export function useMe(accountId: string | null, stat: Static | null, live: Live | null) {
  const [loaded, setLoaded] = useState<Me | null>(null);
  const [pending, setPending] = useState<Pending>({});
  const epoch = live?.root.current_epoch;

  const load = useCallback(async () => {
    if (!accountId || !stat || epoch === undefined) return;
    const index = await homeIndex(accountId, stat.trolls.length);
    const troll = stat.trolls[index];
    const [reg, balance, claimedLaunch, fed, info] = await Promise.all([
      view<unknown>(troll, "storage_balance_of", { account_id: accountId }),
      view<string>(troll, "ft_balance_of", { account_id: accountId }),
      view<boolean>(troll, "has_claimed_launch", { account_id: accountId }),
      view<boolean>(troll, "is_feeder", { epoch, account_id: accountId }),
      view<{ last_applied: number | null }>(troll, "info"),
    ]);
    const rewards: Reward[] = [];
    if (info.last_applied !== null) {
      for (let e = info.last_applied; e >= Math.max(0, info.last_applied - 6) && rewards.length < 2; e--) {
        if (!(await view<boolean>(troll, "is_feeder", { epoch: e, account_id: accountId }))) continue;
        const pool = await viewOpt<Pool | null>(troll, "pool", { epoch: e });
        if (pool) rewards.push({ epoch: e, share: pool.share, deadline: pool.deadline });
      }
    }
    setLoaded({ account: accountId, index, troll, registered: reg !== null, balance: BigInt(balance), claimedLaunch, fed, rewards, lastApplied: info.last_applied });
    // Views catch up within a few blocks; keep optimistic changes for 30 s at most.
    setPending((old) => (old.at && Date.now() - old.at < 30_000 ? old : {}));
  }, [accountId, stat, epoch]);

  useEffect(() => {
    const first = setTimeout(() => load().catch(() => {}), 0);
    const t = setInterval(() => load().catch(() => {}), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const raw = loaded && loaded.account === accountId ? loaded : null;
  let me: Me | null = null;
  if (raw) {
    const claimNew = pending.claimAmount !== undefined && !raw.claimedLaunch;
    const feedNew = pending.fedEpoch === epoch && !raw.fed;
    const paidNew = (pending.paid ?? []).filter((p) => raw.rewards.some((r) => r.epoch === p.epoch));
    let balance = raw.balance;
    if (claimNew) balance += pending.claimAmount!;
    if (feedNew) balance -= pending.feedAmount ?? BigInt(0);
    for (const p of paidNew) balance += BigInt(p.share);
    me = {
      ...raw,
      claimedLaunch: raw.claimedLaunch || claimNew,
      registered: raw.registered || claimNew,
      fed: raw.fed || feedNew,
      balance,
      rewards: raw.rewards.filter((r) => !paidNew.some((p) => p.epoch === r.epoch)),
    };
  }

  const optimistic = useCallback((p: Pending) => {
    setPending((old) => ({ ...old, ...p, paid: [...(old.paid ?? []), ...(p.paid ?? [])], at: Date.now() }));
    setTimeout(() => load().catch(() => {}), 4000);
  }, [load]);

  return { me, reload: load, optimistic };
}
