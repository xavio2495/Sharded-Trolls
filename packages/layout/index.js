// Map NEAR account ids to shards and choose one troll account per reachable shard.

export const RPCS = {
  mainnet: 'https://free.rpc.fastnear.com',
  testnet: 'https://rpc.testnet.fastnear.com',
};

// Same rule nearcore uses: the shard index is the number of boundaries <= the full account id
// (plain string order), mapped through shard_ids. Sub-accounts are placed by their full id.
export function shardOf(accountId, { boundary_accounts, shard_ids }) {
  let i = 0;
  while (i < boundary_accounts.length && accountId >= boundary_accounts[i]) i++;
  return shard_ids[i];
}

// Troll prefixes tried first, so troll names stay the same on every network where the layouts
// agree. Any shard none of them reaches falls back to the short-prefix enumeration below.
export const PREFERRED = ['0', '7', 'ax', 'f', 'h', 'kz', 'u', 'wz', 'e'];

const CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
function* candidates() {
  yield* PREFERRED;
  for (const a of CHARS) yield a;
  for (const a of CHARS) for (const b of CHARS) yield a + b;
}

// One `<prefix>.<parent>` per reachable shard, sorted by account id. A shard is reachable when
// some prefix of up to two characters lands on it; shards that admit only one app's own ids
// (e.g. [aurora, aurora-0)) never match. `taken` lists account ids that already exist.
export function place(parent, layout, { taken = [] } = {}) {
  const used = new Set(taken);
  const byShard = new Map();
  for (const prefix of candidates()) {
    const account = `${prefix}.${parent}`;
    if (used.has(account)) continue;
    const shard = shardOf(account, layout);
    if (!byShard.has(shard)) byShard.set(shard, { prefix, account, shard });
  }
  return [...byShard.values()].sort((x, y) => (x.account < y.account ? -1 : 1));
}

// Range bounds for the contracts' init args: troll i (in `place` order) holds ids in
// [bounds[i-1], bounds[i]). Each bound is the layout boundary where that troll's shard starts, so a
// troll's range covers its shard plus any unreachable shard just below it.
export function bounds(trolls, { boundary_accounts, shard_ids }) {
  return trolls.slice(1).map((t) => boundary_accounts[shard_ids.indexOf(t.shard) - 1]);
}

export async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error).slice(0, 300)}`);
  return j.result;
}

// Live layout: { protocol, version, boundary_accounts, shard_ids }.
export async function fetchLayout(url) {
  const cfg = await rpc(url, 'EXPERIMENTAL_protocol_config', { finality: 'final' });
  const [version] = Object.keys(cfg.shard_layout);
  const { boundary_accounts, shard_ids } = cfg.shard_layout[version];
  return { protocol: cfg.protocol_version, version, boundary_accounts, shard_ids };
}
