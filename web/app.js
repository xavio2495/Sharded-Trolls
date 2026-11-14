// Sharded Trolls page. Replay mode plays a measured run (per-block, per-shard congestion plus the
// probe transactions the network rejected); live mode polls a node and reads the root and trolls.
import { TrollClient, shardSample } from '../packages/client/index.js';
import { shardOf, place } from '../packages/layout/index.js';
import { renderCompare } from './compare.js';

const RUNS = [
  { id: 'control-run4', dir: '../measurements/localnet-2026-11-14/', label: 'Control token · 2,000 transfers/s for 90 s (final build)' },
  { id: 'trolls-run4', dir: '../measurements/localnet-2026-11-14/', label: 'Eight trolls, same-troll · 2,000 transfers/s for 90 s (final build)' },
  { id: 'trolls-mixed-run3', dir: '../measurements/localnet-2026-11-14/', label: 'Eight trolls, mixed · 2,000 transfers/s for 90 s (final build)' },
  { id: 'trolls-run3', dir: '../measurements/localnet-2026-11-14/', label: 'Eight trolls · 2,000 transfers/s for 90 s' },
  { id: 'control-run3', dir: '../measurements/localnet-2026-11-14/', label: 'Control token · 2,000 transfers/s for 90 s' },
  { id: 'trolls-run2', dir: '../measurements/localnet-2026-11-14/', label: 'Eight trolls · 1,000 transfers/s for 60 s' },
  { id: 'control-run2', dir: '../measurements/localnet-2026-11-14/', label: 'Control token · 1,000 transfers/s for 60 s' },
];
const LIVE_WINDOW = 300; // blocks kept in live mode

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fmtTokens = (yocto) => (Number(BigInt(yocto) / 10n ** 18n) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });

// ---------- shared state ----------
const S = {
  mode: 'replay', layout: null, threshold: 0.8, blocks: [], index: 0, rejections: [], roles: {},
  playing: true, speed: 4, simT: 0, lastFrame: 0, live: null,
};

function rolesFor(layout, marks) {
  const reachable = new Set(place('x.near', layout).map((t) => t.shard));
  const roles = {};
  layout.shard_ids.forEach((id, i) => {
    roles[id] = reachable.has(id) ? '' : `${layout.boundary_accounts[i - 1]} only`;
  });
  return Object.assign(roles, marks);
}

// ---------- rendering ----------
function renderShards(frame) {
  const W = 1000, H = 300, x0 = 40, top = 40, base = 230, n = S.layout.shard_ids.length, cw = (W - x0) / n;
  const y = (v) => base - v * (base - top);
  let s = '';
  for (const v of [0, 0.25, 0.5, 0.75, 1]) s += `<line class="grid" x1="${x0}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${x0 - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  S.layout.shard_ids.forEach((id, i) => {
    const sh = frame?.shards[id] ?? { congestion: 0, fullness: 0 };
    const cx = x0 + i * cw + cw / 2, bw = cw * 0.42, role = S.roles[id];
    const unreachable = role.endsWith(' only');
    const rejecting = sh.congestion >= S.threshold;
    if (unreachable) s += `<rect class="unreachable" x="${cx - bw / 2}" y="${top}" width="${bw}" height="${base - top}" rx="4" opacity="0.5"/>`;
    const h = Math.max(0, base - y(sh.congestion));
    if (h > 0) s += `<path class="cong${rejecting ? ' rejecting' : ''}" d="M${cx - bw / 2},${base}V${base - h + Math.min(4, h)}q0,-4 4,-4h${bw - 8}q4,0 4,4V${base}Z"><title>shard ${id}: congestion ${sh.congestion}</title></path>`;
    const fh = base - y(sh.fullness);
    s += `<rect class="full" x="${cx + bw / 2 + 3}" y="${base - fh}" width="5" height="${fh}"><title>shard ${id}: chunk ${(sh.fullness * 100).toFixed(1)}% full</title></rect>`;
    if (sh.congestion > 0.005) s += `<text class="ink" x="${cx}" y="${base - h - 6}" text-anchor="middle">${sh.congestion.toFixed(2)}</text>`;
    s += `<text class="ink2" x="${cx}" y="${base + 18}" text-anchor="middle">shard ${id}</text>`;
    s += `<text x="${cx}" y="${base + 34}" text-anchor="middle">${esc(role.length > 18 ? role.slice(0, 17) + '…' : role)}</text>`;
    if (rejecting) s += `<text class="ink" x="${cx}" y="${base + 52}" text-anchor="middle" font-weight="600">✕ rejecting</text>`;
  });
  s += `<line class="axis" x1="${x0}" x2="${W}" y1="${base}" y2="${base}"/>`;
  s += `<line class="threshold" x1="${x0}" x2="${W}" y1="${y(S.threshold)}" y2="${y(S.threshold)}"/><text class="ink2" x="${W}" y="${y(S.threshold) - 6}" text-anchor="end">rejects new transactions above ${S.threshold}</text>`;
  $('shards').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Congestion level per shard">${s}</svg>`;
}

function renderTimeline() {
  const W = 1000, H = 220, x0 = 40, top = 14, base = 180, B = S.blocks;
  if (B.length < 2) { $('timeline').innerHTML = ''; return; }
  const t0 = B[0].timestamp_ms, t1 = B.at(-1).timestamp_ms;
  const x = (t) => x0 + ((t - t0) / Math.max(1, t1 - t0)) * (W - x0 - 10);
  const y = (v) => base - v * (base - top);
  const peak = Object.fromEntries(S.layout.shard_ids.map((id) => [id, Math.max(...B.map((b) => b.shards[id]?.congestion ?? 0))]));
  const hot = Object.entries(peak).sort((a, b) => b[1] - a[1])[0];
  let s = '';
  for (const v of [0, 0.5, 1]) s += `<line class="grid" x1="${x0}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}"/><text x="${x0 - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  for (const id of S.layout.shard_ids) {
    const d = B.map((b, i) => `${i ? 'L' : 'M'}${x(b.timestamp_ms).toFixed(1)},${y(b.shards[id]?.congestion ?? 0).toFixed(1)}`).join('');
    s += `<path class="line${id === Number(hot[0]) && hot[1] > 0 ? ' hot' : ''}" d="${d}"/>`;
  }
  if (hot[1] > 0) s += `<text class="ink2" x="${x(B[B.findIndex((b) => b.shards[hot[0]]?.congestion === hot[1])].timestamp_ms) + 6}" y="${y(hot[1]) - 4}">shard ${hot[0]}</text>`;
  s += `<line class="threshold" x1="${x0}" x2="${W - 10}" y1="${y(S.threshold)}" y2="${y(S.threshold)}"/>`;
  s += `<line class="axis" x1="${x0}" x2="${W - 10}" y1="${base}" y2="${base}"/>`;
  for (let sec = 0; sec <= (t1 - t0) / 1000; sec += 30) s += `<text x="${x(t0 + sec * 1000)}" y="${base + 16}" text-anchor="middle">${sec} s</text>`;
  if (S.mode === 'replay') { const px = x(B[S.index].timestamp_ms); s += `<line class="playhead" x1="${px}" x2="${px}" y1="${top}" y2="${base}"/>`; }
  s += `<text x="${W - 10}" y="${H - 6}" text-anchor="end">blue: the most congested shard · grey: the other shards</text>`;
  $('timeline').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Congestion level over time per shard">${s}</svg>`;
}

function renderTiles(frame) {
  const vals = Object.values(frame?.shards ?? {});
  const cong = Math.max(0, ...vals.map((v) => v.congestion));
  $('t-congestion').textContent = cong.toFixed(2);
  $('t-threshold').textContent = S.threshold;
  $('t-fullness').textContent = `${(Math.max(0, ...vals.map((v) => v.fullness)) * 100).toFixed(0)}%`;
  if (frame && S.blocks.length) {
    $('t-time').textContent = `${((frame.timestamp_ms - S.blocks[0].timestamp_ms) / 1000).toFixed(0)} s`;
    $('t-block').textContent = `block ${frame.height}`;
  }
  if (S.mode === 'replay') {
    const now = frame?.timestamp_ms ?? 0;
    $('t-rejected').textContent = S.rejections.filter((r) => r.at <= now).length.toLocaleString();
    $('t-rejected-note').textContent = `of ${S.probeCount} probe transfers sent to the token`;
  } else {
    $('t-rejected').textContent = '–';
    $('t-rejected-note').textContent = 'a rejected transaction never reaches the chain, so only the sender sees it (see replay)';
  }
}

function render() {
  const frame = S.blocks[S.index];
  renderTiles(frame);
  renderShards(frame);
  renderTimeline();
}

// ---------- replay ----------
async function loadRun(run) {
  const [m, l] = await Promise.all(['measure', 'load'].map((k) => fetch(`${run.dir}${run.id}-${k}.json`).then((r) => r.json())));
  S.layout = { shard_ids: m.shard_ids, boundary_accounts: m.boundary_accounts };
  S.threshold = m.reject_tx_congestion_threshold;
  S.blocks = m.blocks;
  const start = Date.parse(l.started_at);
  S.rejections = l.probes.filter((p) => !p.ok).map((p) => ({ at: start + p.t, kind: p.kind }));
  S.probeCount = l.probes.length;
  const tokens = [...new Set(l.probes.map((p) => p.token))];
  const marks = l.target === 'control'
    ? { [shardOf(tokens[0], S.layout)]: 'control token' }
    : Object.fromEntries(tokens.map((t) => [shardOf(t, S.layout), t]));
  S.roles = rolesFor(S.layout, marks);
  S.index = 0; S.simT = S.blocks[0].timestamp_ms; S.playing = true;
  $('scrub').max = S.blocks.length - 1;
  $('play').textContent = 'Pause';
  const kinds = [...new Set(S.rejections.map((r) => r.kind))];
  $('honest').textContent = `Synthetic load on a local NEAR network running mainnet's 10-shard layout (measured ${m.started_at.slice(0, 10)}). `
    + (l.target === 'control' ? 'Control = one NEP-141 contract on one shard. ' : 'Eight trolls, one per reachable shard. ')
    + `"Rejected" counts direct ft_transfer probes the network refused${kinds.length ? ` (${kinds.join(', ')})` : ''}. `
    + 'Same-shard transfers are not faster; the gain is throughput and no congestion rejections.';
  render();
}

function tick(ts) {
  if (S.mode === 'replay' && S.playing && S.blocks.length) {
    const dt = S.lastFrame ? ts - S.lastFrame : 0;
    S.simT += dt * S.speed;
    let i = S.index;
    while (i + 1 < S.blocks.length && S.blocks[i + 1].timestamp_ms <= S.simT) i++;
    if (i !== S.index) { S.index = i; $('scrub').value = i; render(); }
    if (i === S.blocks.length - 1) { S.playing = false; $('play').textContent = 'Replay'; }
  }
  S.lastFrame = ts;
  requestAnimationFrame(tick);
}

// ---------- live ----------
async function connectLive(rpc, root) {
  if (S.live) S.live.stop = true;
  const live = { stop: false, client: new TrollClient(rpc, root), seen: {} };
  S.live = live;
  $('live-status').textContent = 'connecting…';
  const cfg = await live.client.rpc('EXPERIMENTAL_protocol_config', { finality: 'final' });
  const L = cfg.shard_layout[Object.keys(cfg.shard_layout)[0]];
  const cc = cfg.runtime_config.congestion_control_config;
  S.layout = { shard_ids: L.shard_ids, boundary_accounts: L.boundary_accounts };
  S.threshold = cc.reject_tx_congestion_threshold;
  S.blocks = []; S.index = 0;
  let marks = {};
  try {
    await live.client.load();
    marks = Object.fromEntries(live.client.trolls.map((t) => [shardOf(t, S.layout), t]));
    live.params = await live.client.view(root, 'params');
    $('feeding-note').textContent = `feed_target ${live.params.feed_target} distinct senders per troll per epoch of ${live.params.epoch_ms / 1000} s.`;
  } catch (e) {
    $('feeding-note').textContent = `No Sharded Trolls root at ${root}: showing shard load only.`;
  }
  S.roles = rolesFor(S.layout, marks);
  $('honest').textContent = `Live data from ${rpc}. Same-shard transfers are not faster; the gain is throughput and no congestion rejections.`;
  $('live-status').textContent = `connected, protocol ${cfg.protocol_version}`;
  pollBlocks(live, cc);
  if (live.params) pollFeeding(live);
}

async function pollBlocks(live, cc) {
  let last = 0;
  while (!live.stop) {
    try {
      const b = await live.client.rpc('block', { finality: 'optimistic' });
      if (b.header.height !== last) {
        last = b.header.height;
        S.blocks.push({ height: last, timestamp_ms: Math.round(b.header.timestamp / 1e6), shards: Object.fromEntries(b.chunks.map((c) => [c.shard_id, shardSample(c, cc)])) });
        if (S.blocks.length > LIVE_WINDOW) S.blocks.shift();
        S.index = S.blocks.length - 1;
        if (S.mode === 'live') render();
      }
    } catch (e) { $('live-status').textContent = `error: ${e.message.slice(0, 80)}`; }
    await new Promise((r) => setTimeout(r, 500));
  }
}

function logLine(text) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()} ${text}`;
  $('log').prepend(li);
}

async function pollFeeding(live) {
  const { client, params } = live;
  while (!live.stop) {
    try {
      const [info, trollInfo] = await Promise.all([client.view(client.root, 'info'), Promise.all(client.trolls.map((t) => client.view(t, 'info')))]);
      $('streak').textContent = info.streak; $('streak').classList.remove('empty'); $('best').textContent = info.best_streak; $('epoch').textContent = info.current_epoch;
      $('rings').innerHTML = trollInfo.map((ti, i) => {
        const frac = Math.min(1, ti.senders_this_epoch / params.feed_target), fed = frac >= 1, c = 2 * Math.PI * 28;
        return `<div class="ring${fed ? ' fed' : ''}"><svg viewBox="0 0 72 72"><circle class="track" cx="36" cy="36" r="28" fill="none" stroke-width="7"/>`
          + (frac > 0 ? `<circle class="fill" cx="36" cy="36" r="28" fill="none" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(frac * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 36 36)"/>` : '')
          + `<text class="count" x="36" y="41" text-anchor="middle">${ti.senders_this_epoch}</text></svg>`
          + `<div>${esc(client.trolls[i].split('.')[0])}. · ${fed ? '✓ fed' : `${ti.senders_this_epoch}/${params.feed_target}`}</div></div>`;
      }).join('');
      const seen = live.seen;
      if (seen.streak !== undefined && info.streak !== seen.streak) logLine(info.streak > seen.streak ? `all eight fed: streak ${info.streak}` : `a troll starved: streak reset (was ${seen.streak})`);
      seen.streak = info.streak;
      trollInfo.forEach((ti, i) => {
        const k = client.trolls[i], prev = seen[k];
        if (prev && BigInt(ti.minted) > BigInt(prev.minted)) logLine(`${k} minted ${fmtTokens(BigInt(ti.minted) - BigInt(prev.minted))} M tokens for its feeders`);
        if (prev && BigInt(ti.burned) > BigInt(prev.burned)) logLine(`${k} burned ${fmtTokens(BigInt(ti.burned) - BigInt(prev.burned))} M tokens`);
        seen[k] = ti;
      });
    } catch (e) { $('feeding-note').textContent = `read error: ${e.message.slice(0, 80)}`; }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

// ---------- wiring ----------
for (const r of RUNS) $('run').append(new Option(r.label, r.id));
$('run').onchange = () => loadRun(RUNS.find((r) => r.id === $('run').value));
$('play').onclick = () => {
  if (S.index === S.blocks.length - 1) { S.index = 0; S.simT = S.blocks[0].timestamp_ms; }
  S.playing = !S.playing || $('play').textContent === 'Replay';
  $('play').textContent = S.playing ? 'Pause' : 'Play';
};
$('speed').onchange = () => { S.speed = Number($('speed').value); };
$('scrub').oninput = () => { S.index = Number($('scrub').value); S.simT = S.blocks[S.index].timestamp_ms; render(); };
$('live-controls').onsubmit = (e) => { e.preventDefault(); connectLive($('rpc').value.trim(), $('root').value.trim()); };
document.querySelectorAll('.modes button').forEach((b) => (b.onclick = () => {
  S.mode = b.dataset.mode;
  document.querySelectorAll('.modes button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  $('replay-controls').hidden = S.mode !== 'replay';
  $('live-controls').hidden = S.mode !== 'live';
  $('compare').hidden = S.mode !== 'compare';
  document.querySelector('main').hidden = S.mode === 'compare';
  if (S.mode !== 'live' && S.live) S.live.stop = true;
  if (S.mode === 'replay') loadRun(RUNS.find((r) => r.id === $('run').value));
  else if (S.mode === 'compare') showCompare();
  else { S.blocks = []; render(); }
}));

let rate = 2000;
function showCompare() {
  $('honest').textContent = 'Single-node localnet with mainnet\'s shard layout, synthetic load (measured 2026-11-14). Control = one NEP-141 contract on one shard. '
    + 'Same-shard transfers are not faster; the gain is throughput and no congestion rejections.';
  document.querySelectorAll('.rate').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.rate) === rate)));
  renderCompare($('compare'), rate);
}
document.querySelectorAll('.rate').forEach((b) => (b.onclick = () => { rate = Number(b.dataset.rate); showCompare(); }));

const params = new URLSearchParams(location.search);
if (params.get('mode') === 'live') {
  document.querySelector('.modes button[data-mode="live"]').click();
  if (params.has('rpc')) $('rpc').value = params.get('rpc');
  if (params.has('root')) $('root').value = params.get('root');
  await connectLive($('rpc').value.trim(), $('root').value.trim());
} else if (params.get('mode') === 'compare') {
  if (params.has('rate')) rate = Number(params.get('rate'));
  document.querySelector('.modes button[data-mode="compare"]').click();
} else {
  if (params.has('run')) $('run').value = params.get('run');
  await loadRun(RUNS.find((r) => r.id === $('run').value));
}
if (S.mode === 'replay' && params.has('at')) { S.playing = false; S.index = Math.min(S.blocks.length - 1, Number(params.get('at'))); $('scrub').value = S.index; render(); }
requestAnimationFrame(tick);
