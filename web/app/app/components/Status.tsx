import { txUrl } from "../lib/near";

export type Status = { kind: "busy" | "ok" | "err"; text: string; hash?: string } | null;

export function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  const color = status.kind === "err" ? "text-starve" : status.kind === "ok" ? "text-accent-deep" : "text-ink-1";
  return (
    <p role="status" className={`mt-3 text-sm ${color}`}>
      {status.text}{" "}
      {status.hash && (
        <a className="-my-3 inline-block py-3 font-semibold underline" href={txUrl(status.hash)} target="_blank" rel="noreferrer">
          See the transaction
        </a>
      )}
    </p>
  );
}

/** Runs a wallet action with busy / done / error status. Returns false on failure. */
export async function runAction(
  setStatus: (s: Status) => void,
  label: string,
  f: () => Promise<(string | undefined)[] | string | undefined>,
): Promise<boolean> {
  setStatus({ kind: "busy", text: `${label}: confirm in your wallet…` });
  try {
    const r = await f();
    const hash = Array.isArray(r) ? r[r.length - 1] : r;
    setStatus({ kind: "ok", text: `${label}: done.`, hash });
    return true;
  } catch (e) {
    setStatus({ kind: "err", text: `${label}: ${e instanceof Error ? e.message : String(e)}` });
    return false;
  }
}
