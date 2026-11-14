#!/usr/bin/env node
// Local single-node NEAR network with mainnet's real shard layout (10 shards, 1,000 Tgas chunks,
// mainnet congestion thresholds), built from the near-sandbox binary that the Rust tests download.
// Usage: node scripts/localnet.mjs start|stop|status [--home target/localnet] [--rpc-port 3040] [--keep]
//   start  wipes --home (unless --keep), writes a patched genesis, runs the node in the background
//   stop   kills the node by its pid file
// The genesis account `sandbox` gets the validator key; its secret is in <home>/validator_key.json.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync, openSync, globSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Near } from './lib/near.mjs';

export const MAINNET_LAYOUT = {
  boundary_accounts: ['650', 'aurora', 'aurora-0', 'earn.kaiching', 'game.hot.tg', 'game.hot.tg-0',
    'kkuuue2akv_1630967379.near', 'tge-lockup.sweat', 'wallet.ka'],
  shard_ids: [10, 11, 1, 8, 9, 6, 7, 4, 12, 13],
};

const ROOT = resolve(import.meta.dirname, '..');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { home: { type: 'string', default: 'target/localnet' }, 'rpc-port': { type: 'string', default: '3040' }, keep: { type: 'boolean', default: false } },
});
const home = resolve(ROOT, values.home);
const rpcUrl = `http://127.0.0.1:${values['rpc-port']}`;
const pidFile = `${home}/node.pid`;

function binary() {
  if (process.env.NEAR_SANDBOX_BIN) return process.env.NEAR_SANDBOX_BIN;
  const found = globSync('target/debug/build/near-sandbox-*/out/.near/near-sandbox-*/near-sandbox', { cwd: ROOT });
  if (!found.length) throw new Error('near-sandbox binary not found: run the Rust integration tests once, or set NEAR_SANDBOX_BIN');
  return resolve(ROOT, found.sort().at(-1));
}

function patchGenesis() {
  const g = JSON.parse(readFileSync(`${home}/genesis.json`));
  const { boundary_accounts, shard_ids } = MAINNET_LAYOUT;
  g.shard_layout = { V2: {
    boundary_accounts, shard_ids,
    id_to_index_map: Object.fromEntries(shard_ids.map((id, i) => [id, i])),
    index_to_id_map: Object.fromEntries(shard_ids.map((id, i) => [i, id])),
    shards_split_map: null, shards_parent_map: null, version: 3,
  } };
  // Add the `sandbox` account (short top-level names can't be created after genesis).
  const validator = JSON.parse(readFileSync(`${home}/validator_key.json`));
  const base = g.records.find((r) => r.Account?.account_id === validator.account_id).Account.account;
  const key = g.records.find((r) => r.AccessKey?.account_id === validator.account_id).AccessKey;
  const amount = 10n ** 33n; // 1e9 NEAR
  g.records.push({ Account: { account_id: 'sandbox', account: { ...base, amount: amount.toString(), locked: '0' } } });
  g.records.push({ AccessKey: { ...key, account_id: 'sandbox' } });
  g.total_supply = (BigInt(g.total_supply) + amount).toString();
  writeFileSync(`${home}/genesis.json`, JSON.stringify(g, null, 2));

  const c = JSON.parse(readFileSync(`${home}/config.json`));
  const port = Number(values['rpc-port']);
  c.rpc.addr = `127.0.0.1:${port}`;
  c.network.addr = `127.0.0.1:${port + 1}`;
  c.rpc.prometheus_addr = null;
  writeFileSync(`${home}/config.json`, JSON.stringify(c, null, 2));
}

const alive = (pid) => { if (!(pid > 0)) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
const runningPid = () => (existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8')) : 0);

async function waitForBlocks() {
  const near = new Near(rpcUrl);
  for (let i = 0; i < 120; i++) {
    try {
      const s = await near.rpc('status', []);
      if (s.sync_info.latest_block_height > 2) return s;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`node did not produce blocks; see ${home}/node.log`);
}

const cmd = positionals[0] ?? 'status';
if (cmd === 'start') {
  if (alive(runningPid())) throw new Error(`already running (pid ${runningPid()}); stop it first`);
  const bin = binary();
  if (!values.keep || !existsSync(`${home}/genesis.json`)) {
    rmSync(home, { recursive: true, force: true });
    execFileSync(bin, ['--home', home, 'init'], { stdio: 'ignore' });
    patchGenesis();
  }
  const log = openSync(`${home}/node.log`, 'a');
  const child = spawn(bin, ['--home', home, 'run'], { detached: true, stdio: ['ignore', log, log] });
  child.unref();
  writeFileSync(pidFile, String(child.pid));
  const s = await waitForBlocks();
  const cfg = await new Near(rpcUrl).rpc('EXPERIMENTAL_protocol_config', { finality: 'final' });
  const layout = cfg.shard_layout[Object.keys(cfg.shard_layout)[0]];
  console.log(`localnet up: pid ${child.pid}, rpc ${rpcUrl}, height ${s.sync_info.latest_block_height}, protocol ${cfg.protocol_version}, ${layout.shard_ids.length} shards`);
  console.log(`home ${home}; signer sandbox, key in validator_key.json`);
} else if (cmd === 'stop') {
  const pid = runningPid();
  if (alive(pid)) { process.kill(pid, 'SIGTERM'); console.log(`stopped pid ${pid}`); } else console.log('not running');
} else if (cmd === 'status') {
  const pid = runningPid();
  if (!alive(pid)) { console.log('not running'); process.exit(1); }
  const s = await new Near(rpcUrl).rpc('status', []);
  console.log(`running: pid ${pid}, rpc ${rpcUrl}, height ${s.sync_info.latest_block_height}`);
} else throw new Error(`unknown command ${cmd}`);
