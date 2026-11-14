// Sharded Trolls client: every holder lives on one "home troll"; balances, transfers and storage
// registration go there. Works in Node and the browser (fetch only). Writes go through any signer
// with call(contractId, method, args, { gas, deposit }), e.g. a wallet adapter.

// Must match the contracts' home_index exactly: troll i holds ids in [bounds[i-1], bounds[i]),
// compared as plain strings (account ids are ASCII, so code-unit order equals byte order).
export function homeIndex(accountId, bounds) {
  let i = 0;
  while (i < bounds.length && accountId >= bounds[i]) i++;
  return i;
}

const TGAS = 10n ** 12n;

export class TrollClient {
  // rpcUrl: NEAR JSON-RPC endpoint; root: the root contract account.
  constructor(rpcUrl, root) { this.rpcUrl = rpcUrl; this.root = root; this.trolls = null; this.bounds = null; }

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

  // Troll list and range bounds from the root (immutable after init, so cached).
  async load() {
    if (!this.trolls) [this.trolls, this.bounds] = await Promise.all([this.view(this.root, 'trolls'), this.view(this.root, 'bounds')]);
    return this;
  }

  async homeTroll(accountId) { await this.load(); return this.trolls[homeIndex(accountId, this.bounds)]; }

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

  async claimLaunch(signer, accountId) {
    return signer.call(await this.homeTroll(accountId), 'claim_launch', {}, { gas: 30n * TGAS });
  }
}
