// Compare view: the same offered load against the control token, the trolls with same-troll
// traffic and the trolls with mixed traffic. Headline numbers come from summary.json; the
// congestion timeline from each run's measure file. Only runs whose fires were looked up after the
// run (method "inclusion-logged") are used.

const DIR = '../measurements/localnet-2026-11-14/';
const SETS = {
  2000: { control: 'control-run4', same: 'trolls-run4', mixed: 'trolls-mixed-run3' },
  1000: { control: 'control-run5', same: null, mixed: 'trolls-mixed-1000' },
};
const COLS = [
  { key: 'control', title: 'Control token', sub: 'one NEP-141 contract on one shard', cls: 's1' },
  { key: 'same', title: 'Eight trolls, same-troll traffic', sub: 'holders pay others on their own troll', cls: 's2' },
  { key: 'mixed', title: 'Eight trolls, mixed traffic', sub: '~88% of transfers cross to another troll', cls: 's3' },
];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const cache = {};
const getJSON = (url) => (cache[url] ??= fetch(url).then((r) => (r.ok ? r.json() : null)));

function card(col, r, control) {
  if (!r) return `<div class="ccard"><h3>${col.title}</h3><p class="muted">${col.sub}</p><p class="muted">Not run at this rate.</p></div>`;
  const rejecting = r.peak_congestion >= 0.8;
  const kept = r.inclusion === 1 && r.executed_per_s >= 0.95 * r.offered_per_s;
  const mult = control && control.executed_per_s && col.key !== 'control'
    ? `${(r.executed_per_s / control.executed_per_s).toFixed(1)}× the control${kept ? ' · kept up with the full offered load, so this is not its ceiling' : ''}`
    : (kept ? 'kept up with the offered load'
      : r.inclusion < 1 ? 'at capacity: the excess was rejected or dropped'
      : 'could not keep up: a backlog built up and drained after the load stopped');
  return `<div class="ccard"><h3><span class="swatch ${col.cls}"></span>${col.title}</h3><p class="muted">${col.sub}</p>
    <div class="big">${r.executed_per_s.toLocaleString()}<span class="unit"> transfers/s executed</span></div>
    <div class="note">${mult || '&nbsp;'}</div>
    <dl>
      <dt>Transactions included</dt><dd>${Math.round(r.inclusion * 100)}% <span class="muted">(${r.fires_included.toLocaleString()} of ${r.fires_accepted.toLocaleString()} accepted)</span></dd>
      <dt>Peak congestion</dt><dd>${r.peak_congestion.toFixed(2)}${rejecting ? ' — <strong>rejecting</strong>' : ''}</dd>
      <dt>Direct transfers rejected</dt><dd>${r.probes_rejected} of ${r.probes}${r.rejection_kinds.length ? ` <span class="muted">(${esc(r.rejection_kinds.join(', '))})</span>` : ''}</dd>
      <dt>Block time</dt><dd>${r.block_time_s.toFixed(2)} s</dd>
    </dl></div>`;
}

async function timeline(set, summary) {
  const W = 1000, H = 240, x0 = 40, top = 14, base = 196, maxT = 180, right = W - 20;
  const x = (t) => x0 + (t / maxT) * (right - x0);
  const y = (v) => base - v * (base - top);
  let s = '';
  for (const v of [0, 0.5, 1]) s += `<line class="grid" x1="${x0}" x2="${right}" y1="${y(v)}" y2="${y(v)}"/><text x="${x0 - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  s += `<line class="threshold" x1="${x0}" x2="${right}" y1="${y(0.8)}" y2="${y(0.8)}"/><text class="ink2" x="${right}" y="${y(0.8) - 6}" text-anchor="end">rejects new transactions above 0.8</text>`;
  const legend = [];
  for (const col of COLS) {
    const id = set[col.key];
    if (!id || !summary[id]) continue;
    const m = await getJSON(`${DIR}${id}-measure.json`);
    const t0 = Date.parse(summary[id].started_at);
    const pts = m.blocks.filter((b) => b.timestamp_ms >= t0 && b.timestamp_ms <= t0 + maxT * 1000)
      .map((b) => [(b.timestamp_ms - t0) / 1000, Math.max(...Object.values(b.shards).map((sh) => sh.congestion))]);
    s += `<path class="cline ${col.cls}" d="${pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('')}"/>`;
    legend.push(col);
  }
  s += `<line class="axis" x1="${x0}" x2="${right}" y1="${base}" y2="${base}"/>`;
  for (let t = 0; t <= maxT; t += 30) s += `<text x="${x(t)}" y="${base + 16}" text-anchor="middle">${t} s</text>`;
  let lx = x0;
  for (const col of legend) {
    s += `<rect class="lswatch ${col.cls}" x="${lx}" y="${H - 14}" width="10" height="10" rx="2"/><text class="ink2" x="${lx + 15}" y="${H - 5}">${esc(col.title)}</text>`;
    lx += 30 + col.title.length * 7;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Highest shard congestion over time, per setup">${s}</svg>`;
}

export async function renderCompare(root, rate) {
  const summary = await getJSON(`${DIR}summary.json`);
  const set = SETS[rate];
  const control = summary[set.control];
  const offered = Number(rate).toLocaleString();
  root.querySelector('#cmp-cards').innerHTML = COLS.map((c) => card(c, set[c.key] ? summary[set[c.key]] : null, control)).join('');
  root.querySelector('#cmp-title').textContent = `Same offered load: ${offered} transfers/s`;
  root.querySelector('#cmp-chart').innerHTML = await timeline(set, summary);
  const step = summary['trolls-step6000'];
  root.querySelector('#cmp-ceiling').textContent = step && control
    ? `Ceiling run (build ${(step.troll_wasm_sha256 ?? '').slice(0, 8)}, same transfer path): offered 6,000 transfers/s of same-troll traffic, the eight trolls executed ${step.executed_per_s.toLocaleString()}/s (${Math.round(step.inclusion * 100)}% of transactions included, peak congestion ${step.peak_congestion.toFixed(2)}, none rejected), about ${(step.executed_per_s / control.executed_per_s).toFixed(1)}× this control. Mixed traffic is at its ceiling at 2,000/s.`
    : '';
  const hashes = [...new Set(COLS.map((c) => set[c.key] && summary[set[c.key]]?.troll_wasm_sha256).filter(Boolean))];
  root.querySelector('#cmp-foot').textContent = `Executed = transfers carried out, divided by the time until the busiest shard drained. Included = transactions the network actually put on chain (the rest were accepted by the RPC and silently dropped). Runs: ${Object.values(set).filter(Boolean).join(', ')}. Troll code sha256: ${hashes.map((h) => h.slice(0, 12) + '…').join(', ') || 'n/a'}.`;
}
