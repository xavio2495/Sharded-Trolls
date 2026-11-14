"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ROOT,
  fetchLayout,
  fetchStartMs,
  shardOf,
  view,
  type Metadata,
  type Params,
  type RootInfo,
  type TrollInfo,
} from "./near";

export type Static = {
  params: Params;
  trolls: string[];
  shards: number[];
  metadata: Metadata;
  storageMin: string;
  startMs: number | null;
};

export type Live = { root: RootInfo; trolls: TrollInfo[]; at: number };

const POLL_MS = 15_000;

/** Loads the deployment once, then polls the root and the eight trolls. */
export function useNetwork() {
  const [stat, setStat] = useState<Static | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statRef = useRef<Static | null>(null);

  const refresh = useCallback(async () => {
    const s = statRef.current;
    if (!s) return;
    try {
      const root = await view<RootInfo>(ROOT, "info");
      const trolls: TrollInfo[] = [];
      for (const t of s.trolls) trolls.push(await view<TrollInfo>(t, "info")); // sequential: gentle on the RPC
      setLive({ root, trolls, at: Date.now() });
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      try {
        const [params, trolls, metadata, layout, root] = await Promise.all([
          view<Params>(ROOT, "params"),
          view<string[]>(ROOT, "trolls"),
          view<Metadata>(ROOT, "ft_metadata"),
          fetchLayout(),
          view<RootInfo>(ROOT, "info"),
        ]);
        const bounds = await view<{ min: string }>(trolls[0], "storage_balance_bounds");
        const startMs = await fetchStartMs(params, root.current_epoch).catch(() => null);
        if (stop) return;
        const s: Static = { params, trolls, metadata, shards: trolls.map((t) => shardOf(t, layout)), storageMin: bounds.min, startMs };
        statRef.current = s;
        setStat(s);
        await refresh();
        timer = setInterval(refresh, POLL_MS);
      } catch (e) {
        setError(String(e));
      }
    })();
    return () => {
      stop = true;
      if (timer) clearInterval(timer);
    };
  }, [refresh]);

  return { stat, live, error, refresh };
}

/** Ticks once a second (for countdowns); null until mounted, so prerendering stays static. */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  return now;
}
