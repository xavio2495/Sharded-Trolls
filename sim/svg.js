// Minimal hand-rolled SVG charts: line panels, bar panels, legends. Light and dark themes via CSS,
// hover values via <title> on invisible hit targets.

const STYLE = `
  .bg{fill:#fcfcfb} .t1{fill:#0b0b0b} .t2{fill:#52514e} .t3{fill:#898781}
  .grid{stroke:#e1e0d9;stroke-width:1} .axis{stroke:#c3c2b7;stroke-width:1} .ref{stroke:#52514e;stroke-width:1.5;stroke-dasharray:5 4}
  .s1{--c:#2a78d6} .s2{--c:#eb6834} .s3{--c:#1baf7a} .s4{--c:#eda100} .mint{--c:#6250d6} .burn{--c:#e34948}
  .line{fill:none;stroke:var(--c);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
  .fill{fill:var(--c)} .hit{fill:transparent} .hit:hover{fill:var(--c);fill-opacity:.25}
  text{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:12px}
  .title{font-size:15px;font-weight:600} .num{font-variant-numeric:tabular-nums}
  @media (prefers-color-scheme: dark){
    .bg{fill:#1a1a19} .t1{fill:#f0efec} .t2{fill:#c3c2b7} .grid{stroke:#2c2c2a} .axis{stroke:#383835} .ref{stroke:#c3c2b7}
    .s1{--c:#3987e5} .s2{--c:#d95926} .s3{--c:#199e70} .s4{--c:#c98500} .mint{--c:#9085e9} .burn{--c:#e66767}
  }`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const r1 = (v) => Math.round(v * 10) / 10;

export function doc(w, h, title, subtitle, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}">
<style>${STYLE}</style>
<rect class="bg" width="${w}" height="${h}"/>
<text class="t1 title" x="16" y="26">${esc(title)}</text>
<text class="t2" x="16" y="46">${esc(subtitle)}</text>
${body}
</svg>
`;
}

export function legend(x, y, items) {
  let cx = x;
  return items.map(({ label, cls }) => {
    const out = `<rect class="${cls} fill" x="${cx}" y="${y - 9}" width="10" height="10" rx="2"/><text class="t2" x="${cx + 15}" y="${y}">${esc(label)}</text>`;
    cx += 30 + label.length * 6.5;
    return out;
  }).join('\n');
}

function niceTicks(max, count = 4) {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = 0; v <= max + step * 1e-9; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

// A plotting area with gridlines and axes. Returns scales and the axis markup.
export function panel({ x, y, w, h, xMin = 0, xMax, yMin = 0, yMax, xTicks, yFmt = String, xFmt = String, xLabel, yLabel, title }) {
  const yt = yMin === 0 ? niceTicks(yMax) : niceTicks(yMax - yMin).map((v) => v + yMin);
  const top = yt[yt.length - 1];
  const sx = (v) => r1(x + ((v - xMin) / (xMax - xMin)) * w);
  const sy = (v) => r1(y + h - ((v - yMin) / (top - yMin)) * h);
  let s = title ? `<text class="t1" x="${x}" y="${y - 10}" font-weight="600">${esc(title)}</text>` : '';
  for (const v of yt) {
    s += `<line class="grid" x1="${x}" x2="${x + w}" y1="${sy(v)}" y2="${sy(v)}"/>`;
    s += `<text class="t3 num" x="${x - 6}" y="${sy(v) + 4}" text-anchor="end">${esc(yFmt(v))}</text>`;
  }
  s += `<line class="axis" x1="${x}" x2="${x + w}" y1="${y + h}" y2="${y + h}"/>`;
  for (const v of xTicks) s += `<text class="t3 num" x="${sx(v)}" y="${y + h + 16}" text-anchor="middle">${esc(xFmt(v))}</text>`;
  if (xLabel) s += `<text class="t3" x="${x + w}" y="${y + h + 32}" text-anchor="end">${esc(xLabel)}</text>`;
  if (yLabel) s += `<text class="t3" x="${x}" y="${y - (title ? 26 : 10)}">${esc(yLabel)}</text>`;
  return { sx, sy, svg: s };
}

// Lines with hover targets and optional end labels (nudged apart so they don't collide).
export function lines(p, series, { endLabels = true, fmt = String, xName = 'x' } = {}) {
  let s = '';
  const ends = [];
  for (const { cls, label, points } of series) {
    s += `<path class="${cls} line" d="${points.map(([a, b], i) => `${i ? 'L' : 'M'}${p.sx(a)},${p.sy(b)}`).join('')}"/>`;
    for (const [a, b] of points) s += `<circle class="${cls} hit" cx="${p.sx(a)}" cy="${p.sy(b)}" r="6"><title>${esc(label)}, ${xName} ${a}: ${esc(fmt(b))}</title></circle>`;
    const [a, b] = points[points.length - 1];
    ends.push({ x: p.sx(a) + 8, y: p.sy(b) + 4, label });
  }
  if (endLabels) {
    ends.sort((m, n) => m.y - n.y);
    for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 14);
    for (const e of ends) s += `<text class="t2" x="${e.x}" y="${e.y}">${esc(e.label)}</text>`;
  }
  return s;
}

// Vertical bars for categories; `groups` = [{ name, bars: [{ cls, value, label }] }].
export function bars(p, groups, { fmt = String, slot = 1 } = {}) {
  let s = '';
  const gw = (p.sx(slot) - p.sx(0));
  groups.forEach((g, gi) => {
    const bw = Math.min(28, (gw * 0.7) / g.bars.length - 2);
    const x0 = p.sx(gi) + gw / 2 - (g.bars.length * (bw + 2)) / 2;
    g.bars.forEach((b, bi) => {
      const x = r1(x0 + bi * (bw + 2));
      const y = p.sy(b.value), base = p.sy(0);
      const hgt = Math.max(0, base - y);
      if (hgt > 0) s += `<path class="${b.cls} fill" d="M${x},${base}V${r1(y + Math.min(4, hgt))}q0,-4 4,-4h${r1(bw - 8)}q4,0 4,4V${base}Z"/>`;
      s += `<rect class="${b.cls} hit" x="${x}" y="${Math.min(y, base - 12)}" width="${r1(bw)}" height="${Math.max(hgt, 12)}"><title>${esc(g.name)}, ${esc(b.label)}: ${esc(fmt(b.value))}</title></rect>`;
      if (b.showValue) s += `<text class="t2 num" x="${r1(x + bw / 2)}" y="${y - 5}" text-anchor="middle">${esc(fmt(b.value))}</text>`;
    });
    s += `<text class="t2" x="${r1(p.sx(gi) + gw / 2)}" y="${p.sy(0) + 16}" text-anchor="middle">${esc(g.name)}</text>`;
  });
  return s;
}
