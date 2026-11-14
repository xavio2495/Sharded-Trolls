// Sharded Trolls client: every holder lives on one "home troll"; balances, transfers and storage
// registration go there. Works in Node and the browser (fetch only). Writes go through any signer
// with call(contractId, method, args, { gas, deposit }), e.g. a wallet adapter.

// Must match the contracts' home_index exactly: the first 16 bytes of sha256(account_id), read
// as a big-endian integer, modulo the number of trolls. WebCrypto, so it works in Node and browsers.
export async function homeIndex(accountId, trollCount) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accountId)));
  let x = 0n;
  for (let i = 0; i < 16; i++) x = (x << 8n) | BigInt(h[i]);
  return Number(x % BigInt(trollCount));
}

const TGAS = 10n ** 12n;

export class TrollClient {
  // rpcUrl: NEAR JSON-RPC endpoint; root: the root contract account.
  constructor(rpcUrl, root) { this.rpcUrl = rpcUrl; this.root = root; this.trolls = null; }

  async rpc(method, params) {
    const res = await fetch(this.rpcUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const j = await res.json();
    if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error).slice(0, 300)}`);
    return j.result;
  }

  async view(contractId, method, args = {}) {
    const r = await this.rpc('query', {
      request_type: 'call_function', finality: 'optimistic', account_id: contractId, method_name: method,
      args_base64: btoa(JSON.stringify(args)),
    });
    return JSON.parse(new TextDecoder().decode(new Uint8Array(r.result)));
  }

  // Troll list from the root, in home_index order (immutable after init, so cached).
  async load() {
    if (!this.trolls) this.trolls = await this.view(this.root, 'trolls');
    return this;
  }

  async homeTroll(accountId) { await this.load(); return this.trolls[await homeIndex(accountId, this.trolls.length)]; }

  async balanceOf(accountId) { return BigInt(await this.view(await this.homeTroll(accountId), 'ft_balance_of', { account_id: accountId })); }

  async totalSupply() { return BigInt(await this.view(this.root, 'ft_total_supply')); }

  async isRegistered(accountId) {
    return (await this.view(await this.homeTroll(accountId), 'storage_balance_of', { account_id: accountId })) !== null;
  }

  // NEP-145: register `accountId` at its home troll (anyone may pay). No-op if already registered.
  async storageDepositAtHome(signer, accountId) {
    const troll = await this.homeTroll(accountId);
    if (await this.isRegistered(accountId)) return null;
    const { min } = await this.view(troll, 'storage_balance_bounds');
    return signer.call(troll, 'storage_deposit', { account_id: accountId, registration_only: true }, { gas: 10n * TGAS, deposit: BigInt(min) });
  }

  // Sender's home troll debits; the troll forwards to the receiver's home troll if it differs.
  // The receiver must already be registered at its home troll.
  async transfer(signer, senderId, receiverId, amount, memo) {
    return signer.call(await this.homeTroll(senderId), 'ft_transfer', { receiver_id: receiverId, amount: String(amount), memo }, { gas: 50n * TGAS, deposit: 1n });
  }

  // Attaches the claim fee plus the registration deposit; the troll refunds what was not due.
  async claimLaunch(signer, accountId) {
    const troll = await this.homeTroll(accountId);
    const [{ claim_fee: fee = '0' }, { min }] = await Promise.all([this.view(troll, 'params'), this.view(troll, 'storage_balance_bounds')]);
    return signer.call(troll, 'claim_launch', {}, { gas: 30n * TGAS, deposit: BigInt(fee) + BigInt(min) });
  }
}

// One chunk header -> per-shard load sample. Congestion is the larger of delayed-receipt gas,
// buffered outgoing gas and receipt memory against the protocol's limits (`cc` is
// runtime_config.congestion_control_config); new transactions to a shard are rejected at or above
// reject_tx_congestion_threshold.
export function shardSample(chunk, cc) {
  const ci = chunk.congestion_info ?? {};
  const delayed = Number(ci.delayed_receipts_gas ?? 0);
  const buffered = Number(ci.buffered_receipts_gas ?? 0);
  const bytes = Number(ci.receipt_bytes ?? 0);
  const congestion = Math.min(1, Math.max(delayed / cc.max_congestion_incoming_gas, buffered / cc.max_congestion_outgoing_gas, bytes / cc.max_congestion_memory_consumption));
  return {
    gas_used: chunk.gas_used, gas_limit: chunk.gas_limit,
    fullness: chunk.gas_limit ? +(chunk.gas_used / chunk.gas_limit).toFixed(4) : 0,
    new_chunk: chunk.height_included === chunk.height_created,
    delayed_gas: delayed, buffered_gas: buffered, receipt_bytes: bytes,
    congestion: +congestion.toFixed(4),
  };
}
