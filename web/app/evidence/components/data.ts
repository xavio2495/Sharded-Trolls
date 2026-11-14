// Data for the evidence views: the measurement files copied into /measurements at build time,
// and small formatting helpers.

export const LOCALNET = "/measurements/localnet-2026-11-14";
export const TESTNET_FINAL = "/measurements/testnet-2026-11-14-final";
export const TX = "https://testnet.nearblocks.io/txns/";
export const ADDR = "https://testnet.nearblocks.io/address/";

const cache = new Map<string, Promise<unknown>>();
/** Fetches a JSON file once per page load; null if it is missing. */
export function getJSON<T>(url: string): Promise<T | null> {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(url) as Promise<T | null>;
}

const YOCTO = BigInt(10) ** BigInt(24);
/** Token amount (24 decimals) as a number of whole tokens, 3 decimal places. */
export const tokens = (yocto: string | number | bigint) => Number((BigInt(yocto) * BigInt(1000)) / YOCTO) / 1000;
export const fmtTokens = (yocto: string | number | bigint) => tokens(yocto).toLocaleString("en-US", { maximumFractionDigits: 3 });
/** yoctoNEAR as NEAR with up to 4 decimals. */
export const fmtNear = (yocto: string | number | bigint) =>
  (Number(BigInt(yocto) / BigInt(10) ** BigInt(18)) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 4 });
export const short = (s: string, n = 10) => (s.length > n ? `${s.slice(0, n)}…` : s);

// ---------- localnet load runs ----------

export type Run = {
  id: string;
  target: "control" | "trolls";
  started_at: string;
  measured_at: string;
  threshold: number;
  shard_ids: number[];
  roles: Record<string, string>;
  probes: number;
  rejections: { t_ms: number; kind: string }[];
  blocks: [number, [number, number][]][];
  troll_wasm_sha256: string | null;
};

export type RunSummary = {
  offered_per_s: number;
  executed_per_s: number;
  inclusion: number;
  fires_included: number;
  fires_accepted: number;
  peak_congestion: number;
  probes: number;
  probes_rejected: number;
  rejection_kinds: string[];
  block_time_s: number;
  troll_wasm_sha256?: string;
  started_at: string;
};

export const RUNS: { id: string; label: string }[] = [
  { id: "control-run4", label: "Control token · 2,000 transfers/s for 90 s" },
  { id: "trolls-hash-same-2000", label: "Eight trolls, same-troll · 2,000/s for 90 s" },
  { id: "trolls-mixed-hash-2000", label: "Eight trolls, mixed · 2,000/s for 90 s" },
  { id: "control-run5", label: "Control token · 1,000/s for 60 s" },
  { id: "trolls-mixed-hash-1000", label: "Eight trolls, mixed · 1,000/s for 60 s" },
  { id: "trolls-step6000", label: "Eight trolls, same-troll · 6,000/s ceiling (earlier build)" },
  { id: "trolls-run4", label: "Eight trolls, same-troll · 2,000/s (earlier build, range homes)" },
  { id: "trolls-mixed-run3", label: "Eight trolls, mixed · 2,000/s (earlier build, run 3)" },
  { id: "trolls-mixed-run2", label: "Eight trolls, mixed · 2,000/s (earlier build, run 2)" },
];

export const LOCALNET_NOTE =
  "Localnet: synthetic load, single node, running mainnet's 10-shard layout (measured 2026-11-14). Not mainnet or testnet numbers. Same-shard transfers are not faster; the gain is throughput and no congestion rejections.";
