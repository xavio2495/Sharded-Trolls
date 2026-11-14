"use client";

import { useEffect, useState } from "react";
import { routeTo, settleTx, transferTxs, type Route } from "../lib/actions";
import { MAX_MSG_BYTES, ROOT, TROLL_NAMES, fmtDuration, fmtNear, homeIndex, parseTokens } from "../lib/near";
import type { Me } from "../lib/useMe";
import type { Live, Static } from "../lib/useNetwork";
import type { Wallet } from "../lib/wallet";
import { StatusLine, runAction, type Status } from "./Status";

/** Always shown. One tap when a finished round is waiting; otherwise a countdown to the next one. */
export function KeeperCell({ wallet, stat, live, left }: { wallet: Wallet; stat: Static; live: Live | null; left: number | null }) {
  const [status, setStatus] = useState<Status>(null);
  const root = live?.root;
  const bounty = BigInt(stat.params.settle_bounty ?? "0");
  const funded = bounty > BigInt(0) && root?.bounty_budget !== undefined && BigInt(root.bounty_budget) >= bounty;
  const due = !!root && root.settling === null && root.next_epoch < root.current_epoch;
  const behind = root ? root.current_epoch - root.next_epoch : 0;
  return (
    <div className={`flex h-full min-h-0 flex-col justify-between gap-3 p-4 ${due ? "bg-ink-0 text-paper" : ""}`}>
      <div className="min-h-0">
        <h2 className="font-display text-2xl leading-none">{due && funded ? `Close the round, earn ${fmtNear(bounty)}` : "Close the round"}</h2>
        <p className={`mt-2 text-sm ${due ? "text-mist" : "text-ink-1"}`}>
          {!root
            ? "Reading the root…"
            : root.settling !== null
              ? `Round ${root.settling} is being settled.`
              : due
                ? `${behind > 1 ? `${behind} rounds wait to be settled, oldest first.` : "The last round waits to be settled."} Settling rewards the fed trolls and starves the rest.${funded ? "" : " The bounty budget is empty right now."}`
                : `Anyone can settle a finished round${funded ? ` and earn ${fmtNear(bounty)}` : ""}.`}
        </p>
        <StatusLine status={status} />
      </div>
      <button
        className={`rounded-none btn ${due ? "btn-line" : "btn-ink"} min-h-11 w-full`}
        disabled={!due || status?.kind === "busy"}
        onClick={async () => {
          if (!root) return;
          if (!wallet.accountId) return wallet.connect().catch(() => {});
          const tx = settleTx(ROOT, root.next_epoch);
          await runAction(setStatus, "Close the round", () => wallet.send(tx.receiverId, tx.calls));
        }}
      >
        {due ? (wallet.accountId ? "Close the round" : "Connect to close") : `This round ends in ${left !== null ? fmtDuration(left) : "…"}`}
      </button>
    </div>
  );
}

/** Send STRL to a friend, inline. Same stream is free; another stream's troll keeps the toll. */
export function SendCell({ wallet, stat, me }: { wallet: Wallet; stat: Static; me: Me | null }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("1");
  const [withMsg, setWithMsg] = useState(false);
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [hint, setHint] = useState<{ to: string; text: string } | null>(null);
  const { params, metadata, trolls } = stat;
  const receiver = to.trim();

  useEffect(() => {
    if (!receiver || !me) return;
    let live = true;
    homeIndex(receiver, trolls.length).then((i) => {
      if (live) setHint({ to: receiver, text: i === me.index ? "Same stream: free." : `Lives with ${TROLL_NAMES[i]}: the troll keeps ${params.toll_bps / 100}%.` });
    });
    return () => {
      live = false;
    };
  }, [receiver, me, trolls.length, params.toll_bps]);

  const input = "block min-h-11 w-full min-w-0 border-2 border-ink-0 bg-paper px-3 text-ink-0";
  const hintText =
    receiver && hint?.to === receiver
      ? hint.text
      : `Same stream is free; another troll keeps ${params.toll_bps / 100}%. Sending 1 ${metadata.symbol} or more also feeds your troll.`;
  return (
    <form
      className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!wallet.accountId || !me) return wallet.connect().catch(() => {});
        await runAction(setStatus, "Send", async () => {
          if (!receiver) throw new Error("enter your friend's account");
          if (receiver === wallet.accountId) throw new Error("that is you");
          const yocto = parseTokens(amount, metadata.decimals);
          if (yocto <= BigInt(0)) throw new Error("amount must be more than 0");
          const m = withMsg ? msg : "";
          if (m && new TextEncoder().encode(m).length > MAX_MSG_BYTES) throw new Error(`message is over ${MAX_MSG_BYTES} bytes`);
          const route: Route = await routeTo(me, stat, receiver, yocto);
          return wallet.sendAll(transferTxs(me, stat, receiver, yocto, route, m ? m : undefined));
        });
      }}
    >
      <h2 className="font-display text-2xl leading-none text-ink-0">Send to a friend</h2>
      <div className="flex flex-wrap items-stretch gap-2">
        <label className="min-w-0 flex-[3_1_10rem]">
          <span className="sr-only">Friend&apos;s account</span>
          <input className={input} value={to} onChange={(e) => setTo(e.target.value)} placeholder="friend.testnet" autoComplete="off" />
        </label>
        <label className="min-w-0 flex-[1_1_5rem]">
          <span className="sr-only">Amount ({metadata.symbol})</span>
          <input className={input} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label={`Amount in ${metadata.symbol}`} />
        </label>
        <button type="submit" className="rounded-none btn btn-ink flex-[0_0_auto]">
          {wallet.accountId ? "Send" : "Connect"}
        </button>
      </div>
      <p className="text-sm text-accent-deep">{hintText}</p>
      <label className="flex min-h-11 items-center gap-2 text-sm text-ink-1">
        <input type="checkbox" className="size-5" checked={withMsg} onChange={(e) => setWithMsg(e.target.checked)} />
        Add a message for a contract (transfer-and-call)
      </label>
      {withMsg && <input className={input} value={msg} onChange={(e) => setMsg(e.target.value)} aria-label="Message for the receiving contract" />}
      {receiver && <p className="text-xs text-ink-2">If they aren&apos;t registered yet, you pay their {fmtNear(stat.storageMin)} storage first.</p>}
      <StatusLine status={status} />
    </form>
  );
}
