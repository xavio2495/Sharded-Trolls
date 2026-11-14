"use client";

// Wallet side: one NearConnector (HOT, Meteor and the other near-connect wallets) and a small
// signer that sends function calls, several calls to one contract in one transaction, or several
// transactions in order.
import { NearConnector } from "@hot-labs/near-connect";
import { useCallback, useEffect, useState } from "react";
import { NETWORK } from "./near";

export type Call = { method: string; args: object; gas: bigint; deposit: bigint };
export type Tx = { receiverId: string; calls: Call[] };

let connector: NearConnector | null = null;

function getConnector(): NearConnector {
  connector ??= new NearConnector({ network: NETWORK });
  return connector;
}

const toActions = (calls: Call[]) =>
  calls.map((c) => ({
    type: "FunctionCall" as const,
    params: { methodName: c.method, args: c.args, gas: c.gas.toString(), deposit: c.deposit.toString() },
  }));

/** Transaction hash of a wallet result, whatever shape the wallet returns. */
export function hashOf(outcome: unknown): string | undefined {
  const o = outcome as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | undefined;
  return o?.transaction?.hash ?? o?.transaction_outcome?.id;
}

/** Throws if the final outcome reports a failure, with the contract's message when there is one. */
function checkOutcome(outcome: unknown) {
  const o = outcome as { status?: { Failure?: unknown } } | undefined;
  if (o?.status && "Failure" in o.status) {
    const s = JSON.stringify(o.status.Failure);
    const m = s.match(/"(?:ExecutionError|panic_msg)":"([^"]+)"/);
    throw new Error(m ? m[1] : s.slice(0, 200));
  }
}

export function useWallet() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const c = getConnector();
    const onIn = (e: { accounts: { accountId: string }[] }) => setAccountId(e.accounts[0]?.accountId ?? null);
    const onOut = () => setAccountId(null);
    c.on("wallet:signIn", onIn);
    c.on("wallet:signOut", onOut);
    c.getConnectedWallet()
      .then(({ accounts }) => setAccountId(accounts[0]?.accountId ?? null))
      .catch(() => setAccountId(null))
      .finally(() => setReady(true));
    return () => {
      c.off("wallet:signIn", onIn);
      c.off("wallet:signOut", onOut);
    };
  }, []);

  const connect = useCallback(async () => {
    await getConnector().connect();
  }, []);

  const disconnect = useCallback(async () => {
    await getConnector().disconnect();
    setAccountId(null);
  }, []);

  /** One transaction with one or more calls to `receiverId`. Returns the tx hash. */
  const send = useCallback(
    async (receiverId: string, calls: Call[]) => {
      const wallet = await getConnector().wallet();
      const out = await wallet.signAndSendTransaction({ network: NETWORK, signerId: accountId ?? undefined, receiverId, actions: toActions(calls) });
      checkOutcome(out);
      return hashOf(out);
    },
    [accountId],
  );

  /** Several transactions, in order (e.g. register the receiver on its troll, then transfer). */
  const sendAll = useCallback(
    async (txs: Tx[]) => {
      if (txs.length === 1) return [await send(txs[0].receiverId, txs[0].calls)];
      const wallet = await getConnector().wallet();
      const outs = await wallet.signAndSendTransactions({
        network: NETWORK,
        signerId: accountId ?? undefined,
        transactions: txs.map((t) => ({ receiverId: t.receiverId, actions: toActions(t.calls) })),
      });
      outs.forEach(checkOutcome);
      return outs.map(hashOf);
    },
    [accountId, send],
  );

  return { accountId, ready, connect, disconnect, send, sendAll };
}

export type Wallet = ReturnType<typeof useWallet>;
