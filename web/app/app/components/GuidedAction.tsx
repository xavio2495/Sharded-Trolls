"use client";

import Image from "next/image";
import { useState } from "react";
import { TIP, claimLaunchTx, claimTx, routeTo, transferTxs } from "../lib/actions";
import { TROLL_NAMES, fmtDuration, fmtNear, fmtTokens } from "../lib/near";
import type { Me } from "../lib/useMe";
import type { Live, Static } from "../lib/useNetwork";
import type { Wallet } from "../lib/wallet";
import { StatusLine, runAction, type Status } from "./Status";

type Step =
  | { kind: "connect" }
  | { kind: "loading" }
  | { kind: "collect"; epoch: number; share: string }
  | { kind: "claim" }
  | { kind: "empty" }
  | { kind: "feed" }
  | { kind: "wait" };

function stepOf(wallet: Wallet, me: Me | null, launchOpen: boolean, one: bigint): Step {
  if (!wallet.accountId) return { kind: "connect" };
  if (!me) return { kind: "loading" };
  const r = me.rewards[me.rewards.length - 1]; // the oldest unpaid reward first
  if (r) return { kind: "collect", epoch: r.epoch, share: r.share };
  if (!me.fed && me.balance >= one) return { kind: "feed" };
  if (!me.claimedLaunch && launchOpen) return { kind: "claim" };
  if (me.fed) return { kind: "wait" };
  return { kind: "empty" };
}

/** The one big action: connect, get STRL, feed a troll, collect. */
export function GuidedAction({
  wallet,
  stat,
  live,
  me,
  optimistic,
  now,
}: {
  wallet: Wallet;
  stat: Static;
  live: Live | null;
  me: Me | null;
  optimistic: (p: { claimAmount?: bigint; fedEpoch?: number; feedAmount?: bigint; paid?: { epoch: number; share: string }[] }) => void;
  now: number | null;
}) {
  const [status, setStatus] = useState<Status>(null);
  const [ate, setAte] = useState<string | null>(null);
  const { params, metadata, startMs } = stat;
  const tip = TIP;
  const one = BigInt(10) ** BigInt(metadata.decimals);
  const epoch = live?.root.current_epoch ?? 0;
  const launchOpen = startMs === null || now === null || now < startMs + params.launch_window_ms;
  const step = stepOf(wallet, me, launchOpen, one);
  const index = me?.index ?? 0;
  const name = TROLL_NAMES[index];
  const myTroll = live?.trolls[index];
  const epochEnd = startMs !== null ? startMs + (epoch + 1) * params.epoch_ms : null;
  const left = epochEnd !== null && now !== null ? epochEnd - now : null;
  const symbol = metadata.symbol;
  const fee = BigInt(params.claim_fee ?? "0");

  let title = "";
  let lead = "";
  let action: { label: string; run: () => void; disabled?: boolean } | null = null;

  switch (step.kind) {
    case "connect":
      title = "Feed a troll. Earn STRL.";
      lead = "Eight trolls keep eight streams. Claim a bag, feed your troll once a round, collect your share. Three taps.";
      action = { label: "Connect wallet", run: () => wallet.connect().catch((e) => setStatus({ kind: "err", text: String(e) })) };
      break;
    case "loading":
      title = "Finding your troll…";
      lead = "Your home troll comes from a hash of your account.";
      break;
    case "claim":
      title = `Get ${fmtTokens(params.launch_claim_amount, metadata.decimals)} ${symbol}`;
      lead = `One transaction. It costs a ${fmtNear(fee)} fee${me!.registered ? "" : ` plus ${fmtNear(stat.storageMin)} storage (refunded if you leave)`}.`;
      action = {
        label: `Get ${fmtTokens(params.launch_claim_amount, metadata.decimals)} ${symbol}`,
        run: async () => {
          const tx = claimLaunchTx(me!, stat);
          if (await runAction(setStatus, "Claim", () => wallet.send(tx.receiverId, tx.calls))) optimistic({ claimAmount: BigInt(params.launch_claim_amount) });
        },
      };
      break;
    case "feed":
      title = "Feed a troll";
      lead = tip
        ? `Send 1 ${symbol} to the troll jar. It counts you as one of ${name}'s feeders this round.`
        : `Send 1 ${symbol} to a friend (below) to count as one of ${name}'s feeders this round.`;
      action = tip
        ? {
            label: `Feed 1 ${symbol}`,
            run: async () => {
              const route = await routeTo(me!, stat, tip, one);
              const txs = transferTxs(me!, stat, tip, one, route);
              if (await runAction(setStatus, "Feed", () => wallet.sendAll(txs))) {
                optimistic({ fedEpoch: epoch, feedAmount: one });
                setAte(route.sameTroll ? `Same stream as the jar: no toll.` : `${TROLL_NAMES[route.index]} ate the ${fmtTokens(route.toll, metadata.decimals)} ${symbol} toll.`);
              }
            },
          }
        : null;
      break;
    case "wait":
      title = left !== null && left > 0 ? `Collect in ${fmtDuration(left)}` : "Waiting for the round to close";
      lead =
        left !== null && left > 0
          ? `You fed ${name} this round. When the round ends and someone closes it, your share pays on your next send, or tap Collect.`
          : "The round is over. Anyone can close the round (below); then your share is ready.";
      break;
    case "collect":
      title = `Collect ${fmtTokens(step.share, metadata.decimals)} ${symbol}`;
      lead = `Your share from round ${step.epoch}. It also pays automatically on your next send.`;
      action = {
        label: `Collect ${fmtTokens(step.share, metadata.decimals)} ${symbol}`,
        run: async () => {
          if (await runAction(setStatus, "Collect", () => wallet.send(me!.troll, claimTx(me!, step.epoch).calls)))
            optimistic({ paid: [{ epoch: step.epoch, share: step.share }] });
        },
      };
      break;
    case "empty":
      title = `No ${symbol} yet`;
      lead = `The launch bags are gone. Ask a friend to send you ${symbol}; there is no market yet.`;
      break;
  }

  const fed = myTroll?.senders_this_epoch ?? 0;
  return (
    <div className="flex h-full min-h-0 flex-col sm:flex-row">
      <div className="relative flex min-h-0 items-end justify-center border-b-[3px] border-ink-0 bg-accent-tint p-3 sm:w-2/5 sm:border-b-0 sm:border-r-[3px]">
        <Image
          src={`/art/trolls-v3/troll-${index + 1}.webp`}
          alt={me ? `${name}, your home troll` : "A troll keeper"}
          width={720}
          height={720}
          priority
          className={`max-h-full w-full max-w-[18rem] object-contain object-bottom mix-blend-multiply max-sm:max-h-64 ${me?.fed ? "" : "saturate-50"}`}
        />
        {me && (
          <p className="tag absolute left-0 top-0 border-b-[3px] border-r-[3px] border-ink-0 bg-paper px-3 py-2 text-ink-0">
            {name} · {fed}/{params.feed_target} fed
          </p>
        )}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center overflow-hidden p-5 lg:p-7">
        {me && (
          <p className="tag text-ink-1">
            {wallet.accountId} · {fmtTokens(me.balance, metadata.decimals)} {symbol}
          </p>
        )}
        <h1 className="mt-2 font-display text-4xl leading-[0.95] text-ink-0 xl:text-5xl [@media(min-height:900px)]:xl:text-6xl">{title}</h1>
        <p className="mt-3 max-w-xl leading-relaxed text-ink-1 xl:text-lg">{lead}</p>
        {action && (
          <button className="rounded-none btn btn-moss mt-5 w-full sm:w-auto sm:self-start" onClick={action.run} disabled={action.disabled || status?.kind === "busy"}>
            {action.label}
          </button>
        )}
        {ate && step.kind === "wait" && <p className="mt-4 font-semibold text-ink-0">{ate}</p>}
        <StatusLine status={status} />
        {wallet.accountId && (
          <button className="mt-2 inline-flex min-h-11 items-center self-start text-sm text-ink-1 underline" onClick={() => wallet.disconnect()}>
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

/** The eight trolls; a troll lights up once it has enough feeders this round. Details swap in, inside the cell. */
export function TrollStrip({ stat, live, mine }: { stat: Static; live: Live | null; mine: number | null }) {
  const [open, setOpen] = useState(false);
  const { params, metadata, trolls, shards } = stat;
  const fedCount = trolls.filter((_, i) => (live?.trolls[i]?.senders_this_epoch ?? 0) >= params.feed_target).length;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b-[3px] border-ink-0 pl-4">
        <h2 className="flex min-w-0 items-baseline gap-x-3 font-display text-xl text-ink-0">
          The trolls <span className="tag whitespace-nowrap text-ink-1">{fedCount}/8 fed</span>
        </h2>
        <button
          className="min-h-11 border-l-[3px] border-ink-0 px-4 text-sm font-semibold text-ink-0 hover:bg-surface-1"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Trolls" : "Details"}
        </button>
      </div>
      {!open ? (
        /* the grid gap shows the ink background: hard rules between the trolls */
        <ul className="grid min-h-0 flex-1 grid-cols-4 gap-[3px] bg-ink-0 sm:grid-cols-8">
          {trolls.map((t, i) => {
            const info = live?.trolls[i];
            const fed = (info?.senders_this_epoch ?? 0) >= params.feed_target;
            return (
              <li key={t} className={`flex min-h-0 min-w-0 flex-col items-center justify-center px-0.5 py-2 text-center ${fed ? "bg-accent-tint" : "bg-paper"}`}>
                <Image
                  src={`/art/trolls-v3/troll-${i + 1}.webp`}
                  alt={`${TROLL_NAMES[i]}${fed ? ", fed" : ", hungry"}`}
                  width={720}
                  height={720}
                  className={`aspect-square min-h-0 w-full max-w-16 flex-1 object-contain mix-blend-multiply transition ${fed ? "" : "opacity-55 grayscale"}`}
                />
                <span className="mt-1 w-full truncate font-sans text-[0.7rem] font-bold leading-tight tracking-tight text-ink-0 xl:text-xs">{TROLL_NAMES[i]}</span>
                <span className={`tag text-[0.65rem] ${fed ? "text-accent-deep" : "text-ink-2"}`}>
                  {mine === i ? "yours · " : ""}
                  {fed ? "fed" : `${info?.senders_this_epoch ?? 0}/${params.feed_target}`}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="sticky top-0 bg-paper">
              <tr className="tag text-left text-ink-1">
                {["Troll", "Shard", "Feeders", "Food", "Hoard", "Launch pool", `Supply (${metadata.symbol})`].map((h) => (
                  <th key={h} className="border-b-2 border-ink-0 px-3 py-1.5 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trolls.map((t, i) => {
                const info = live?.trolls[i];
                return (
                  <tr key={t} className="border-b border-hairline">
                    <td className="px-3 py-1 font-semibold text-ink-0">{TROLL_NAMES[i]}</td>
                    <td className="px-3 py-1 tabular-nums">{shards[i]}</td>
                    <td className="px-3 py-1 tabular-nums">
                      {info?.senders_this_epoch ?? "—"}/{params.feed_target}
                    </td>
                    <td className="px-3 py-1 tabular-nums">{info?.food !== undefined ? fmtTokens(info.food, metadata.decimals) : "—"}</td>
                    <td className="px-3 py-1 tabular-nums">{fmtTokens(info?.hoard, metadata.decimals)}</td>
                    <td className="px-3 py-1 tabular-nums">{fmtTokens(info?.launch_pool, metadata.decimals)}</td>
                    <td className="px-3 py-1 tabular-nums">{fmtTokens(info?.supply, metadata.decimals)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
