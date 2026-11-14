"use client";

import { useEffect, useState } from "react";
import { routeTo, settleTx, transferTxs, type Route } from "../lib/actions";
import { MAX_MSG_BYTES, ROOT, TROLL_NAMES, fmtNear, homeIndex, parseTokens } from "../lib/near";
import type { Me } from "../lib/useMe";
import type { Live, Static } from "../lib/useNetwork";
import type { Wallet } from "../lib/wallet";
import { StatusLine, runAction, type Status } from "./Status";

/** Shown only when a finished round is waiting to be settled: one tap, paid from the bounty budget. */
export function KeeperCall({ wallet, stat, live }: { wallet: Wallet; stat: Static; live: Live | null }) {
  const [status, setStatus] = useState<Status>(null);
  const root = live?.root;
  if (!root || root.settling !== null || root.next_epoch >= root.current_epoch) return status ? <StatusLine status={status} /> : null;
  const bounty = BigInt(stat.params.settle_bounty ?? "0");
  const paid = bounty > BigInt(0) && root.bounty_budget !== undefined && BigInt(root.bounty_budget) >= bounty;
  const behind = root.current_epoch - root.next_epoch;
  return (
    <section className="flex flex-col gap-4 border-[3px] border-ink-0 bg-ink-0 p-5 text-paper sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="font-display text-3xl leading-none">{paid ? `Close the day, earn ${fmtNear(bounty)}` : "Close the day"}</h2>
        <p className="mt-2 text-sm text-mist">
          Round {root.next_epoch} is over{behind > 1 ? ` (${behind} rounds waiting)` : ""}. Settling feeds the fed trolls and starves the rest.
          {paid ? "" : " The bounty budget is empty right now."}
        </p>
        <StatusLine status={status} />
      </div>
      <button
        className="rounded-none btn btn-line shrink-0"
        disabled={status?.kind === "busy"}
        onClick={async () => {
          if (!wallet.accountId) return wallet.connect().catch(() => {});
          const tx = settleTx(ROOT, root.next_epoch);
          await runAction(setStatus, `Close round ${root.next_epoch}`, () => wallet.send(tx.receiverId, tx.calls));
        }}
      >
        {wallet.accountId ? "Close the day" : "Connect to close"}
      </button>
    </section>
  );
}

/** Secondary: send STRL to a friend. Same stream is free; another stream's troll keeps the toll. */
export function SendToFriend({ wallet, stat, me }: { wallet: Wallet; stat: Static; me: Me | null }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("1");
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [hint, setHint] = useState<{ to: string; text: string } | null>(null);
  const { params, metadata, trolls } = stat;
  const receiver = to.trim();

  useEffect(() => {
    if (!receiver || !me) return;
    let live = true;
    homeIndex(receiver, trolls.length).then((i) => {
      if (live)
        setHint({ to: receiver, text: i === me.index ? "Same stream: free." : `Lives with ${TROLL_NAMES[i]}: the troll keeps ${params.toll_bps / 100}%.` });
    });
    return () => {
      live = false;
    };
  }, [receiver, me, trolls.length, params.toll_bps]);

  const input = "mt-1 block min-h-11 w-full border-2 border-ink-0 bg-paper px-3 text-ink-0";
  return (
    <details className="group border-[3px] border-ink-0 bg-paper">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 font-semibold text-ink-0 hover:bg-surface-1">
        Send to a friend <span aria-hidden className="group-open:hidden">+</span>
        <span aria-hidden className="hidden group-open:inline">−</span>
      </summary>
      <form
        className="grid gap-3 border-t-[3px] border-ink-0 p-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!wallet.accountId || !me) return wallet.connect().catch(() => {});
          await runAction(setStatus, "Send", async () => {
            if (!receiver) throw new Error("enter your friend's account");
            if (receiver === wallet.accountId) throw new Error("that is you");
            const yocto = parseTokens(amount, metadata.decimals);
            if (yocto <= BigInt(0)) throw new Error("amount must be more than 0");
            if (msg && new TextEncoder().encode(msg).length > MAX_MSG_BYTES) throw new Error(`message is over ${MAX_MSG_BYTES} bytes`);
            const route: Route = await routeTo(me, stat, receiver, yocto);
            return wallet.sendAll(transferTxs(me, stat, receiver, yocto, route, msg ? msg : undefined));
          });
        }}
      >
        <label className="text-sm text-ink-1">
          Friend
          <input className={input} value={to} onChange={(e) => setTo(e.target.value)} placeholder="friend.testnet" autoComplete="off" />
          {receiver && hint?.to === receiver && <span className="mt-1 block text-accent-deep">{hint.text}</span>}
        </label>
        <label className="text-sm text-ink-1">
          Amount ({metadata.symbol})
          <input className={input} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </label>
        <label className="text-sm text-ink-1 sm:col-span-2">
          Message for a contract (optional; sends with transfer-and-call)
          <input className={input} value={msg} onChange={(e) => setMsg(e.target.value)} />
        </label>
        <p className="text-xs text-ink-2 sm:col-span-2">
          If your friend isn&apos;t registered yet, you pay their {fmtNear(stat.storageMin)} storage first. Sending at least 1 {metadata.symbol} also feeds your troll.
        </p>
        <div className="sm:col-span-2">
          <button type="submit" className="rounded-none btn btn-ink w-full sm:w-auto">
            {wallet.accountId ? "Send" : "Connect to send"}
          </button>
          <StatusLine status={status} />
        </div>
      </form>
    </details>
  );
}
