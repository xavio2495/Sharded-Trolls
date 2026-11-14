"use client";

import { useState } from "react";
import { ROOT, TGAS, TROLL_NAMES, fmtNear, viewOpt, type Pool } from "../lib/near";
import type { Wallet } from "../lib/wallet";
import type { Live, Static } from "../lib/useNetwork";
import { StatusLine, btn, btnQuiet } from "./YourTroll";

type Status = { kind: "busy" | "ok" | "err"; text: string; hash?: string } | null;
type Expired = { troll: string; index: number; epoch: number };

export function Keeper({ wallet, stat, live }: { wallet: Wallet; stat: Static; live: Live | null }) {
  const [status, setStatus] = useState<Status>(null);
  const [expired, setExpired] = useState<Expired[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const root = live?.root;
  const { params, trolls } = stat;
  const bounty = params.settle_bounty !== undefined ? BigInt(params.settle_bounty) : null;
  const budget = root?.bounty_budget !== undefined ? BigInt(root.bounty_budget) : null;
  const due = root ? root.next_epoch < root.current_epoch : false;
  const backlog = root ? root.current_epoch - root.next_epoch : 0;

  const run = async (label: string, f: () => Promise<string | undefined>) => {
    if (!wallet.accountId) {
      await wallet.connect().catch(() => {});
      return;
    }
    setStatus({ kind: "busy", text: `${label}: confirm in your wallet…` });
    try {
      const hash = await f();
      setStatus({ kind: "ok", text: `${label}: done.`, hash });
    } catch (e) {
      setStatus({ kind: "err", text: `${label}: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  // Pools expire claim_epochs after they are settled; look a little behind the current epoch.
  const scan = async () => {
    if (!root || params.claim_epochs === undefined) return;
    setScanning(true);
    const found: Expired[] = [];
    try {
      const hi = root.current_epoch - params.claim_epochs - 1;
      for (let i = 0; i < trolls.length; i++) {
        for (let e = Math.max(0, hi - 5); e <= hi; e++) {
          const p = await viewOpt<Pool | null>(trolls[i], "pool", { epoch: e });
          if (p && p.deadline !== undefined && root.current_epoch > p.deadline) found.push({ troll: trolls[i], index: i, epoch: e });
        }
      }
      setExpired(found);
    } catch (e) {
      setStatus({ kind: "err", text: String(e) });
    } finally {
      setScanning(false);
    }
  };

  let bountyText = "This build pays no settle bounty.";
  if (bounty !== null && budget !== null) {
    bountyText =
      bounty === BigInt(0)
        ? "No settle bounty is set."
        : budget >= bounty
          ? `Settling pays you ${fmtNear(bounty)} from the bounty budget (${fmtNear(budget)} left).`
          : `The bounty budget (${fmtNear(budget)}) is below the ${fmtNear(bounty)} bounty, so no bounty now.`;
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <section>
        <h3 className="font-display text-2xl text-ink-0">Close the day</h3>
        <p className="mt-1 text-ink-1">
          {root === undefined
            ? "Loading…"
            : root.settling !== null
              ? `Epoch ${root.settling} is being settled.`
              : due
                ? `Epoch ${root.next_epoch} has ended and is waiting to be settled${backlog > 1 ? ` (${backlog} epochs behind)` : ""}.`
                : `Nothing to settle: epoch ${root.current_epoch} is still running.`}
        </p>
        <p className="mt-1 text-sm text-ink-1">{bountyText}</p>
        <button
          className={`${btn} mt-3`}
          disabled={!root || !due || root.settling !== null}
          onClick={() =>
            run(`Settle epoch ${root!.next_epoch}`, () => wallet.send(ROOT, [{ method: "settle", args: { epoch: root!.next_epoch }, gas: BigInt(300) * TGAS, deposit: BigInt(0) }]))
          }
        >
          {wallet.accountId ? `Settle epoch ${root?.next_epoch ?? ""}` : "Connect to settle"}
        </button>
      </section>
      <section>
        <h3 className="font-display text-2xl text-ink-0">Sweep expired rewards</h3>
        {params.claim_epochs === undefined ? (
          <p className="mt-1 text-ink-1">This build has no claim deadline, so there is nothing to sweep.</p>
        ) : (
          <>
            <p className="mt-1 text-ink-1">
              Rewards left unclaimed {params.claim_epochs} epochs after settlement go back to the troll&apos;s food. Each settlement sweeps
              one; anyone can sweep the rest.
            </p>
            <button className={`${btnQuiet} mt-3`} disabled={scanning || !root} onClick={scan}>
              {scanning ? "Looking…" : "Find expired pools"}
            </button>
            {expired && expired.length === 0 && <p className="mt-2 text-sm text-ink-1">None right now.</p>}
            {expired && expired.length > 0 && (
              <ul className="mt-2 space-y-2">
                {expired.map((x) => (
                  <li key={`${x.troll}-${x.epoch}`} className="flex items-center justify-between gap-3 text-sm text-ink-0">
                    {TROLL_NAMES[x.index]}, epoch {x.epoch}
                    <button
                      className={btnQuiet}
                      onClick={() => run(`Sweep ${TROLL_NAMES[x.index]} epoch ${x.epoch}`, () => wallet.send(x.troll, [{ method: "sweep", args: { epoch: x.epoch }, gas: BigInt(30) * TGAS, deposit: BigInt(0) }]))}
                    >
                      Sweep
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      <div className="md:col-span-2">
        <StatusLine status={status} />
      </div>
    </div>
  );
}
