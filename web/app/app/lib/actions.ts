// The calls behind each step of the guided flow. Pure: they build transactions; the wallet sends them.
import { ROOT, TGAS, bps_of, homeIndex, view } from "./near";
import type { Call, Tx } from "./wallet";
import type { Me } from "./useMe";
import type { Static } from "./useNetwork";

/** Where "Feed a troll" sends its coin: the play deployment's tip jar, unless configured otherwise. */
export const TIP = process.env.NEXT_PUBLIC_STRL_TIP || (ROOT === "play.strl.testnet" ? "tips.play.strl.testnet" : null);

export const storageCall = (accountId: string, min: string): Call => ({
  method: "storage_deposit",
  args: { account_id: accountId, registration_only: true },
  gas: BigInt(10) * TGAS,
  deposit: BigInt(min),
});

/** One call: the claim fee, plus the storage deposit when not registered (claim_launch then registers). */
export function claimLaunchTx(me: Me, stat: Static): Tx {
  const fee = BigInt(stat.params.claim_fee ?? "0");
  const deposit = fee + (me.registered ? BigInt(0) : BigInt(stat.storageMin));
  return { receiverId: me.troll, calls: [{ method: "claim_launch", args: {}, gas: BigInt(30) * TGAS, deposit }] };
}

export const claimTx = (me: Me, epoch: number): Tx => ({
  receiverId: me.troll,
  calls: [{ method: "claim", args: { epoch }, gas: BigInt(30) * TGAS, deposit: BigInt(0) }],
});

export const settleTx = (root: string, epoch: number): Tx => ({
  receiverId: root,
  calls: [{ method: "settle", args: { epoch }, gas: BigInt(300) * TGAS, deposit: BigInt(0) }],
});

export type Route = { index: number; troll: string; sameTroll: boolean; toll: bigint; registered: boolean };

/** Where a transfer to `receiver` goes, what the toll is, and whether the receiver must be registered first. */
export async function routeTo(me: Me, stat: Static, receiver: string, amount: bigint): Promise<Route> {
  const index = await homeIndex(receiver, stat.trolls.length);
  const troll = stat.trolls[index];
  const sameTroll = troll === me.troll;
  const registered = (await view<unknown>(troll, "storage_balance_of", { account_id: receiver })) !== null;
  return { index, troll, sameTroll, toll: sameTroll ? BigInt(0) : bps_of(amount, stat.params.toll_bps), registered };
}

/**
 * ft_transfer (or ft_transfer_call with `msg`) from the sender's home troll. An unregistered receiver is
 * registered first: in the same transaction when it shares the sender's troll, otherwise just before.
 */
export function transferTxs(me: Me, stat: Static, receiver: string, amount: bigint, route: Route, msg?: string): Tx[] {
  const call: Call =
    msg !== undefined
      ? { method: "ft_transfer_call", args: { receiver_id: receiver, amount: amount.toString(), msg }, gas: BigInt(150) * TGAS, deposit: BigInt(1) }
      : { method: "ft_transfer", args: { receiver_id: receiver, amount: amount.toString() }, gas: BigInt(50) * TGAS, deposit: BigInt(1) };
  if (route.registered) return [{ receiverId: me.troll, calls: [call] }];
  const reg = storageCall(receiver, stat.storageMin);
  if (route.sameTroll) return [{ receiverId: me.troll, calls: [reg, call] }];
  return [
    { receiverId: route.troll, calls: [reg] },
    { receiverId: me.troll, calls: [call] },
  ];
}
