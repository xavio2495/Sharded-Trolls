"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  MAX_MSG_BYTES,
  TGAS,
  TROLL_NAMES,
  fmtNear,
  fmtTokens,
  homeIndex,
  parseTokens,
  txUrl,
  view,
  viewOpt,
  type Pool,
} from "../lib/near";
import type { Call, Tx, Wallet } from "../lib/wallet";
import type { Live, Static } from "../lib/useNetwork";

type Me = {
  account: string;
  index: number;
  troll: string;
  registered: boolean;
  balance: string;
  claimedLaunch: boolean;
  rewards: { epoch: number; share: string; deadline?: number }[];
};

type Status = { kind: "busy" | "ok" | "err"; text: string; hash?: string } | null;

export const btn =
  "rounded-[var(--radius-ui)] bg-terracotta-deep px-4 py-2 font-semibold text-paper hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
export const btnQuiet =
  "rounded-[var(--radius-ui)] border-2 border-ink-line bg-paper px-4 py-2 font-semibold text-ink-0 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";
const input = "w-full rounded-[var(--radius-ui)] border-2 border-ink-line/60 bg-paper px-3 py-2 text-ink-0 placeholder:text-ink-2";

export function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  const color = status.kind === "err" ? "text-starve" : status.kind === "ok" ? "text-teal-deep" : "text-ink-1";
  return (
    <p role="status" className={`mt-3 text-sm ${color}`}>
      {status.text}{" "}
      {status.hash && (
        <a className="underline" href={txUrl(status.hash)} target="_blank" rel="noreferrer">
          view transaction
        </a>
      )}
    </p>
  );
}

const storageCall = (accountId: string, min: string): Call => ({
  method: "storage_deposit",
  args: { account_id: accountId, registration_only: true },
  gas: BigInt(10) * TGAS,
  deposit: BigInt(min),
});

export function YourTroll({ wallet, stat, live, now }: { wallet: Wallet; stat: Static; live: Live | null; now: number | null }) {
  const { accountId } = wallet;
  const [loaded, setMe] = useState<Me | null>(null);
  const me = loaded && loaded.account === accountId ? loaded : null;
  const [status, setStatus] = useState<Status>(null);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");
  const [withCall, setWithCall] = useState(false);
  const { params, trolls, metadata, storageMin, startMs } = stat;
  const symbol = metadata.symbol;

  const load = useCallback(async () => {
    if (!accountId) return;
    const index = await homeIndex(accountId, trolls.length);
    const troll = trolls[index];
    const [reg, balance, claimedLaunch, info] = await Promise.all([
      view<unknown>(troll, "storage_balance_of", { account_id: accountId }),
      view<string>(troll, "ft_balance_of", { account_id: accountId }),
      view<boolean>(troll, "has_claimed_launch", { account_id: accountId }),
      view<{ last_applied: number | null }>(troll, "info"),
    ]);
    // Unpaid rewards: the account holds at most two unpaid fed epochs, both recent.
    const rewards: Me["rewards"] = [];
    if (info.last_applied !== null) {
      const from = Math.max(0, info.last_applied - 12);
      for (let e = info.last_applied; e >= from; e--) {
        if (!(await view<boolean>(troll, "is_feeder", { epoch: e, account_id: accountId }))) continue;
        const pool = await viewOpt<Pool | null>(troll, "pool", { epoch: e });
        if (pool) rewards.push({ epoch: e, share: pool.share, deadline: pool.deadline });
        if (rewards.length === 2) break;
      }
    }
    setMe({ account: accountId, index, troll, registered: reg !== null, balance, claimedLaunch, rewards });
  }, [accountId, trolls]);

  useEffect(() => {
    const first = setTimeout(() => load().catch((e) => setStatus({ kind: "err", text: String(e) })), 0);
    const t = setInterval(() => load().catch(() => {}), 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, live?.root.next_epoch]);

  const run = async (label: string, f: () => Promise<(string | undefined)[] | string | undefined>) => {
    setStatus({ kind: "busy", text: `${label}: confirm in your wallet…` });
    try {
      const r = await f();
      const hash = Array.isArray(r) ? r[r.length - 1] : r;
      setStatus({ kind: "ok", text: `${label}: done.`, hash });
      await load();
    } catch (e) {
      setStatus({ kind: "err", text: `${label}: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  if (!accountId) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-md text-ink-1">
          Connect a NEAR testnet wallet (HOT, Meteor and others) to see your home troll, claim, and send {symbol}.
        </p>
        <button className={btn} onClick={() => wallet.connect().catch((e) => setStatus({ kind: "err", text: String(e) }))}>
          Connect wallet
        </button>
        <StatusLine status={status} />
      </div>
    );
  }

  const epoch = live?.root.current_epoch ?? 0;
  const fee = BigInt(params.claim_fee ?? "0");
  const windowOpen = startMs === null || now === null || now < startMs + params.launch_window_ms;

  const sendTokens = async () => {
    if (!me) return;
    const receiver = to.trim();
    if (!receiver) throw new Error("enter a receiver account");
    if (receiver === accountId) throw new Error("you cannot send to yourself");
    const yocto = parseTokens(amount, metadata.decimals);
    if (yocto <= BigInt(0)) throw new Error("amount must be more than 0");
    if (withCall && new TextEncoder().encode(msg).length > MAX_MSG_BYTES) throw new Error(`msg is over ${MAX_MSG_BYTES} bytes`);
    const rIndex = await homeIndex(receiver, trolls.length);
    const rTroll = trolls[rIndex];
    const registered = (await view<unknown>(rTroll, "storage_balance_of", { account_id: receiver })) !== null;
    const call: Call = withCall
      ? { method: "ft_transfer_call", args: { receiver_id: receiver, amount: yocto.toString(), msg }, gas: BigInt(150) * TGAS, deposit: BigInt(1) }
      : { method: "ft_transfer", args: { receiver_id: receiver, amount: yocto.toString(), memo: msg || undefined }, gas: BigInt(50) * TGAS, deposit: BigInt(1) };
    const txs: Tx[] = [];
    if (!registered && rTroll === me.troll) txs.push({ receiverId: me.troll, calls: [storageCall(receiver, storageMin), call] });
    else {
      if (!registered) txs.push({ receiverId: rTroll, calls: [storageCall(receiver, storageMin)] });
      txs.push({ receiverId: me.troll, calls: [call] });
    }
    return wallet.sendAll(txs);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        {me && (
          <Image src={`/art/trolls-v3/troll-${me.index + 1}.webp`} alt={`${TROLL_NAMES[me.index]}, your home troll`} width={720} height={720} className="size-24 mix-blend-multiply" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink-0">{accountId}</p>
          {me ? (
            <p className="text-ink-1">
              Home troll <span className="font-display text-xl text-ink-0">{TROLL_NAMES[me.index]}</span> · shard {stat.shards[me.index]} ·{" "}
              {me.registered ? "registered" : "not registered"}
            </p>
          ) : (
            <p className="text-ink-1">Finding your home troll…</p>
          )}
          <p className="mt-1 font-display text-3xl text-ink-0">
            {me ? fmtTokens(me.balance, metadata.decimals) : "—"} <span className="text-xl">{symbol}</span>
          </p>
        </div>
        <button className={btnQuiet} onClick={() => wallet.disconnect()}>
          Disconnect
        </button>
      </div>

      {me && (
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <section className="rounded-[var(--radius-card)] border-2 border-ink-line/60 bg-paper p-4">
            <h3 className="font-display text-2xl text-ink-0">Join</h3>
            {!me.registered && (
              <div className="mt-2">
                <p className="text-sm text-ink-1">Register at your home troll to hold {symbol} ({fmtNear(storageMin)}, refunded if you leave).</p>
                <button className={`${btn} mt-2`} onClick={() => run("Register", () => wallet.send(me.troll, [storageCall(accountId, storageMin)]))}>
                  Register
                </button>
              </div>
            )}
            <div className="mt-3">
              {me.claimedLaunch ? (
                <p className="text-sm text-ink-1">You have claimed your launch bag.</p>
              ) : windowOpen ? (
                <>
                  <p className="text-sm text-ink-1">
                    Claim {fmtTokens(params.launch_claim_amount, metadata.decimals)} {symbol} once. Fee {fmtNear(fee)}
                    {me.registered ? "" : ` plus ${fmtNear(storageMin)} storage`}; the fee funds the settle bounty.
                  </p>
                  <button
                    className={`${btn} mt-2`}
                    onClick={() =>
                      run("Launch claim", () =>
                        wallet.send(me.troll, [{ method: "claim_launch", args: {}, gas: BigInt(30) * TGAS, deposit: fee + (me.registered ? BigInt(0) : BigInt(storageMin)) }]),
                      )
                    }
                  >
                    Claim launch bag
                  </button>
                </>
              ) : (
                <p className="text-sm text-ink-1">The launch window has closed.</p>
              )}
            </div>
            <h3 className="mt-5 font-display text-2xl text-ink-0">Feeding rewards</h3>
            {me.rewards.length === 0 ? (
              <p className="text-sm text-ink-1">No unpaid rewards. Send at least {fmtTokens(params.min_counted_transfer, metadata.decimals)} {symbol} in an epoch to feed your troll.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {me.rewards.map((r) => {
                  const expired = r.deadline !== undefined && epoch > r.deadline;
                  return (
                    <li key={r.epoch} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-ink-0">
                        Epoch {r.epoch}: {fmtTokens(r.share, metadata.decimals)} {symbol}
                        <span className="block text-ink-1">
                          {r.deadline === undefined ? "no deadline on this build" : expired ? "deadline passed" : `claim by epoch ${r.deadline} (${r.deadline - epoch} left)`}
                        </span>
                      </span>
                      <button
                        className={btnQuiet}
                        disabled={expired}
                        onClick={() => run(`Claim epoch ${r.epoch}`, () => wallet.send(me.troll, [{ method: "claim", args: { epoch: r.epoch }, gas: BigInt(30) * TGAS, deposit: BigInt(0) }]))}
                      >
                        Claim
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-xs text-ink-1">Unclaimed rewards are also paid on your next counted send.</p>
          </section>

          <section className="rounded-[var(--radius-card)] border-2 border-ink-line/60 bg-paper p-4">
            <h3 className="font-display text-2xl text-ink-0">Send</h3>
            <form
              className="mt-2 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(withCall ? "Transfer and call" : "Transfer", sendTokens);
              }}
            >
              <label className="block text-sm text-ink-1">
                To
                <input className={input} value={to} onChange={(e) => setTo(e.target.value)} placeholder="friend.testnet" autoComplete="off" />
              </label>
              <ReceiverHint id={to.trim()} myIndex={me.index} n={trolls.length} tollBps={params.toll_bps} />
              <label className="block text-sm text-ink-1">
                Amount ({symbol})
                <input className={input} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10" inputMode="decimal" />
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-1">
                <input type="checkbox" checked={withCall} onChange={(e) => setWithCall(e.target.checked)} />
                Transfer and call (to a contract)
              </label>
              <label className="block text-sm text-ink-1">
                {withCall ? `msg (max ${MAX_MSG_BYTES} bytes)` : "Memo (optional)"}
                <input className={input} value={msg} onChange={(e) => setMsg(e.target.value)} />
              </label>
              <p className="text-xs text-ink-1">An unregistered receiver is registered first; you pay its storage deposit.</p>
              <button type="submit" className={btn}>
                Send
              </button>
            </form>
          </section>
        </div>
      )}
      <StatusLine status={status} />
    </div>
  );
}

/** Which troll the receiver lives with, and whether a toll applies. */
function ReceiverHint({ id, myIndex, n, tollBps }: { id: string; myIndex: number; n: number; tollBps: number }) {
  const [hint, setHint] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    homeIndex(id, n).then((i) => {
      if (live) setHint({ id, text: i === myIndex ? "Same troll: no toll." : `Crosses to ${TROLL_NAMES[i]}'s stream: ${tollBps / 100}% toll.` });
    });
    return () => {
      live = false;
    };
  }, [id, myIndex, n, tollBps]);
  const text = id && hint?.id === id ? hint.text : "";
  return text ? <p className="text-xs text-teal-deep">{text}</p> : null;
}
