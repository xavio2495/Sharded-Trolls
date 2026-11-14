// Testnet panel: the K7 (one global code for eight trolls), K2 (fan-out) and K3 (conservation and
// failed-credit refunds) checks, from the recorded run file. Every transaction links to the explorer.

const FILE = '../measurements/testnet-2026-11-14/k-tests.json';
const TX = 'https://testnet.nearblocks.io/txns/';
const ADDR = 'https://testnet.nearblocks.io/address/';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const tokens = (yocto) => (Number(BigInt(yocto) * 1000n / 10n ** 24n) / 1000).toLocaleString();
const tx = (h) => `<a href="${TX}${esc(h)}" target="_blank" rel="noopener"><code>${esc(h.slice(0, 10))}…</code></a>`;
const acct = (a) => `<a href="${ADDR}${esc(a)}" target="_blank" rel="noopener"><code>${esc(a)}</code></a>`;
const ok = (b) => (b ? '<span class="pass">✓ pass</span>' : '<span class="fail">✗ fail</span>');

export async function renderTestnet(root) {
  const r = await fetch(FILE).then((x) => (x.ok ? x.json() : null));
  if (!r) { root.querySelector('#tn-body').innerHTML = '<p class="muted">No testnet record found.</p>'; return; }
  const k7 = r.k7, hashes = new Set(k7.trolls.map((t) => t.global_contract_hash));
  const k7pass = hashes.size === 1 && k7.trolls.length === 8 && new Set(k7.trolls.map((t) => t.shard)).size === 8;
  const fires = r.k2.fires, cases = r.k3.cases;
  const conservedAll = [...fires.flatMap((f) => [f.conservation_before.conserved, f.conservation_after.conserved]),
    ...cases.flatMap((c) => [c.conserved_before, c.conserved_after])].every(Boolean);
  root.querySelector('#tn-body').innerHTML = `
    <p class="muted">Real NEAR testnet, ${esc(r.k3.at.slice(0, 10))}. Root ${acct(r.root)}. A handful of transactions, not a load test.</p>
    <div class="ccards">
      <div class="ccard"><h3>K7 · one code for eight trolls ${ok(k7pass)}</h3>
        <p class="muted">The troll code is deployed once as a global contract and used by all eight trolls, each on its own shard.</p>
        <dl><dt>Global code hash</dt><dd><code>${esc([...hashes].join(', '))}</code></dd>
          <dt>sha256 of troll.wasm</dt><dd><code>${esc(k7.troll_code_hash.slice(0, 16))}…</code> (${k7.troll_code_bytes.toLocaleString()} bytes)</dd>
          <dt>Deploy cost</dt><dd>${Number(k7.parent_spent_near).toFixed(2)} testnet NEAR (global code + 8 × ${esc(k7.troll_near_each)} NEAR accounts + gas)</dd>
          <dt>Storage per troll</dt><dd>${esc(k7.trolls[0].storage_usage)} bytes</dd></dl>
        <table class="tn"><thead><tr><th>Troll</th><th>Shard</th></tr></thead><tbody>
          ${k7.trolls.map((t) => `<tr><td>${acct(t.account)}</td><td>${t.shard}</td></tr>`).join('')}</tbody></table></div>
      <div class="ccard"><h3>K2 · fan-out ${ok(fires.every((f) => f.pass))}</h3>
        <p class="muted">One <code>fire</code> transaction from the stampede contract issues many token transfers.</p>
        <table class="tn"><thead><tr><th>Fire</th><th>Transfers</th><th>Failed receipts</th><th>Tx</th></tr></thead><tbody>
          ${fires.map((f) => `<tr><td>${esc(f.label)}</td><td>${f.transfers_executed ?? f.ft_transfer_events} of ${f.n}${f.toll_burns ? ` <span class="muted">(${f.toll_burns} cross-troll)</span>` : ''}</td><td>${f.failed_receipts}</td><td>${tx(f.hash)}</td></tr>`).join('')}
        </tbody></table></div>
      <div class="ccard"><h3>K3 · conservation and refunds ${ok(conservedAll && cases.every((c) => c.in_flight_after === '0'))}</h3>
        <p class="muted">Σ over the eight trolls of (supply + in flight + burned − minted) equals the total supply before and after every transaction: ${conservedAll ? 'yes, every time' : 'NO'}.</p>
        <table class="tn"><thead><tr><th>Case</th><th>Sender change</th><th>Tx</th></tr></thead><tbody>
          ${cases.map((c) => `<tr><td>${esc(c.label)}<div class="muted">${esc(c.expect)}</div></td><td>${tokens(c.sender_delta)} tokens</td><td>${tx(c.hash)}</td></tr>`).join('')}
        </tbody></table></div>
    </div>
    ${r.indexer_check ? `<p class="muted">Indexers: ${esc(r.indexer_check.note)}</p>` : ''}`;
}
