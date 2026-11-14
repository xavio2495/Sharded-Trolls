// Read side of the Sharded Trolls dashboard: NEAR JSON-RPC with 429 backoff, contract views, home
// troll (same hash as the contracts), shard layout, and the root's epoch start parsed from its state.

export const NETWORK = "testnet" as const;
export const ROOT = process.env.NEXT_PUBLIC_STRL_ROOT || "play.strl.testnet";
export const RPC = process.env.NEXT_PUBLIC_NEAR_RPC ?? "https://test.rpc.fastnear.com";
export const TX_API = "https://tx.test.fastnear.com/v0";
export const EXPLORER = "https://testnet.nearblocks.io";
export const DECIMALS = 24;
export const TGAS = BigInt(10) ** BigInt(12);
export const MAX_MSG_BYTES = 4096;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST JSON with retries on 429, 5xx and network errors: exponential backoff, honouring Retry-After. */
export async function postJson<T>(url: string, body: unknown, tries = 6): Promise<T> {
  let wait = 500;
  for (let i = 0; ; i++) {
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) {
      // A rate-limited reply without CORS headers surfaces as a network error: retry it too.
      if (i >= tries - 1) throw e;
      await sleep(wait);
      wait = Math.min(wait * 2, 8000);
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && i < tries - 1) {
      const after = Number(res.headers.get("retry-after"));
      await sleep(after > 0 ? after * 1000 : wait);
      wait = Math.min(wait * 2, 8000);
      continue;
    }
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }
}

type RpcReply<T> = { result?: T; error?: unknown };

export async function rpc<T>(method: string, params: unknown): Promise<T> {
  const j = await postJson<RpcReply<T>>(RPC, { jsonrpc: "2.0", id: "strl", method, params });
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error).slice(0, 240)}`);
  return j.result as T;
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

export async function view<T>(contractId: string, method: string, args: object = {}): Promise<T> {
  const r = await rpc<{ result?: number[]; error?: string }>("query", {
    request_type: "call_function",
    finality: "optimistic",
    account_id: contractId,
    method_name: method,
    args_base64: b64(JSON.stringify(args)),
  });
  if (r.error) throw new Error(`${contractId}.${method}: ${r.error.slice(0, 200)}`);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(r.result ?? [])));
}

/** Like `view`, but null when the method does not exist on this build (older deployments). */
export async function viewOpt<T>(contractId: string, method: string, args: object = {}): Promise<T | null> {
  try {
    return await view<T>(contractId, method, args);
  } catch (e) {
    if (String(e).includes("MethodNotFound")) return null;
    throw e;
  }
}

/** Must match the contracts: first 16 bytes of sha256(account_id), big-endian, modulo n. */
export async function homeIndex(accountId: string, n: number): Promise<number> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accountId)));
  let x = BigInt(0);
  for (let i = 0; i < 16; i++) x = (x << BigInt(8)) | BigInt(h[i]);
  return Number(x % BigInt(n));
}

export type Layout = { boundary_accounts: string[]; shard_ids: number[] };

export async function fetchLayout(): Promise<Layout> {
  const cfg = await rpc<{ shard_layout: Record<string, Layout> }>("EXPERIMENTAL_protocol_config", { finality: "final" });
  const [v] = Object.keys(cfg.shard_layout);
  return cfg.shard_layout[v];
}

export function shardOf(accountId: string, { boundary_accounts, shard_ids }: Layout): number {
  let i = 0;
  while (i < boundary_accounts.length && accountId >= boundary_accounts[i]) i++;
  return shard_ids[i];
}

// ---------- contract shapes (fields missing on older builds are optional) ----------

export type Params = {
  troll_count: number;
  toll_bps: number;
  feed_target: number;
  reward_per_epoch: string;
  starve_burn_bps: number;
  epoch_ms: number;
  launch_window_ms: number;
  launch_claim_amount: string;
  min_counted_transfer: string;
  claim_fee?: string;
  settle_bounty?: string;
  claim_epochs?: number;
};

export type RootInfo = {
  next_epoch: number;
  current_epoch: number;
  settling: number | null;
  streak: number;
  best_streak: number;
  total_supply: string;
  troll_supply: string[];
  troll_in_flight: string[];
  last_senders: number[];
  bounty_budget?: string;
};

export type TrollInfo = {
  index: number;
  root: string;
  epoch: number;
  senders_this_epoch: number;
  supply: string;
  in_flight: string;
  hoard: string;
  launch_pool: string;
  food?: string;
  minted: string;
  burned: string;
  last_applied: number | null;
};

export type Pool = { share: string; remaining: string; open?: number; deadline?: number };
export type Metadata = { name: string; symbol: string; decimals: number };

/**
 * The root's `start_ms`, read from its borsh state: Params, then the troll list, then start_ms.
 * Params ends with claim_fee (89 bytes) on older builds, or with settle_bounty and claim_epochs
 * (113 bytes). Returns null if the result does not reproduce `current_epoch`.
 */
export async function fetchStartMs(params: Params, currentEpoch: number): Promise<number | null> {
  const r = await rpc<{ values: { key: string; value: string }[] }>("query", {
    request_type: "view_state",
    finality: "optimistic",
    account_id: ROOT,
    prefix_base64: b64("STATE"),
  });
  const v = r.values.find((x) => atob(x.key) === "STATE");
  if (!v) return null;
  const raw = Uint8Array.from(atob(v.value), (c) => c.charCodeAt(0));
  const dv = new DataView(raw.buffer);
  let at = params.claim_epochs !== undefined ? 113 : params.claim_fee !== undefined ? 89 : 73;
  const n = dv.getUint32(at, true);
  at += 4;
  for (let i = 0; i < n; i++) at += 4 + dv.getUint32(at, true);
  const start = Number(dv.getBigUint64(at, true));
  const epoch = Math.floor(Math.max(0, Date.now() - start) / params.epoch_ms);
  return Math.abs(epoch - currentEpoch) <= 1 ? start : null;
}

// ---------- formatting ----------

export function toTokens(yocto: string | bigint | undefined, decimals = DECIMALS): number {
  if (yocto === undefined) return NaN;
  const v = BigInt(yocto);
  const unit = BigInt(10) ** BigInt(decimals);
  return Number(v / unit) + Number(v % unit) / Number(unit);
}

export function fmtTokens(yocto: string | bigint | undefined, decimals = DECIMALS): string {
  const t = toTokens(yocto, decimals);
  if (!Number.isFinite(t)) return "—";
  if (t >= 1e9) return `${(t / 1e9).toFixed(2)}B`;
  if (t >= 1e6) return `${(t / 1e6).toFixed(2)}M`;
  if (t >= 1e3) return `${(t / 1e3).toFixed(1)}K`;
  return t.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function fmtNear(yocto: string | bigint | undefined): string {
  if (yocto === undefined) return "—";
  const t = toTokens(yocto, 24);
  return `${t.toLocaleString("en-US", { maximumFractionDigits: 4 })} NEAR`;
}

/** "12.5" tokens -> yocto string; throws on bad input. */
export function parseTokens(s: string, decimals = DECIMALS): bigint {
  const m = s.trim().match(/^(\d+)(?:\.(\d*))?$/);
  if (!m) throw new Error("enter an amount like 12.5");
  const frac = (m[2] ?? "").slice(0, decimals).padEnd(decimals, "0");
  return BigInt(m[1]) * BigInt(10) ** BigInt(decimals) + BigInt(frac || "0");
}

export function fmtDuration(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(sec).padStart(2, "0")}s`;
}

export const txUrl = (hash: string) => `${EXPLORER}/txns/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER}/address/${id}`;

/** Troll keepers, by index (the contracts' home order). */
export const TROLL_NAMES = ["Beanie", "Lantern", "Fisher", "Straw Hat", "Scholar", "Kettle", "Oar", "Mushroom"];

/** `amount * bps / 10_000`, rounded down, as the contracts compute the toll. */
export function bps_of(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / BigInt(10_000);
}
