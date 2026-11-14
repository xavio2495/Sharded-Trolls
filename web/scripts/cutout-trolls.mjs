#!/usr/bin/env node
// Cuts the eight troll paintings out of their paper background: 720 px webp with a soft alpha edge.
// Paper = the average colour of the four corners. A pixel is "paper-like" within distance HARD of it.
// Cleared: every paper-like region touching the border, and enclosed paper-like regions (gaps between
// legs, inside handles, between arm and paddle) that are large and close to the paper colour, plus small
// ones right at the silhouette (paper showing through hair). Eye whites, lenses, teeth, flowers and book
// pages are also light, but they are smaller than MIN_AREA and away from the edge, or further from the
// paper colour, so they stay opaque.
// Usage: node scripts/cutout-trolls.mjs <dir with troll-1..8.png> <out dir>
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const [srcDir, outDir] = process.argv.slice(2);
if (!srcDir || !outDir) throw new Error('usage: cutout-trolls.mjs <src dir> <out dir>');
const W = 720;
const HARD = 40; // colour distance below which a pixel belongs to a paper-like region
const SOFT = 12; // fully transparent below this distance; alpha ramps from SOFT to HARD
const MIN_AREA = 800; // enclosed regions at least this big (px at 720 px) are cleared...
const MAX_MEAN = 12; // ...if their mean distance from the paper colour is at most this
const NEAR = 14; // smaller enclosed paper-like regions (from NEAR_MIN px) within NEAR px of the cleared
const NEAR_MIN = 40; // background are paper showing through hair or fringes at the silhouette: cleared too
const EDGE = 2; // the soft alpha ramp only applies this close to the figure; further out it is clear
const SPECK = 30; // figure islands smaller than this (paper grain) inside the cleared background go too
mkdirSync(outDir, { recursive: true });

for (let n = 1; n <= 8; n++) {
  const rgb = await sharp(resolve(srcDir, `troll-${n}.png`)).resize(W, W, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
  let acc = [0, 0, 0], count = 0;
  for (const [x0, y0] of [[0, 0], [W - 12, 0], [0, W - 12], [W - 12, W - 12]]) {
    for (let y = y0; y < y0 + 12; y++) for (let x = x0; x < x0 + 12; x++) {
      const i = (y * W + x) * 3;
      acc = acc.map((v, k) => v + rgb[i + k]);
      count++;
    }
  }
  const paper = acc.map((v) => v / count);
  const dist = new Float32Array(W * W);
  for (let i = 0; i < W * W; i++) dist[i] = Math.hypot(rgb[i * 3] - paper[0], rgb[i * 3 + 1] - paper[1], rgb[i * 3 + 2] - paper[2]);

  // Paper-like connected regions (4-neighbour), and which of them to clear.
  const label = new Int32Array(W * W).fill(-1);
  const clear = [];
  const comps = [];
  const stats = { border: 0, enclosed: [], near: [], kept: [] };
  for (let s = 0; s < W * W; s++) {
    if (label[s] !== -1 || dist[s] >= HARD) continue;
    const id = clear.length, stack = [s];
    label[s] = id;
    let area = 0, sum = 0, border = false;
    while (stack.length) {
      const i = stack.pop();
      area++;
      sum += dist[i];
      const x = i % W, y = (i / W) | 0;
      if (x === 0 || y === 0 || x === W - 1 || y === W - 1) border = true;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < W - 1 ? i + W : -1]) {
        if (j >= 0 && label[j] === -1 && dist[j] < HARD) { label[j] = id; stack.push(j); }
      }
    }
    const enclosedClear = !border && area >= MIN_AREA && sum / area <= MAX_MEAN;
    clear.push(border || enclosedClear);
    comps.push({ area, mean: sum / area, border });
    if (border) stats.border += area;
    else if (enclosedClear) stats.enclosed.push(area);
  }
  // Distance (in px, up to NEAR) from the background cleared so far, by breadth-first search.
  const near = new Int16Array(W * W).fill(-1);
  let frontier = [];
  for (let i = 0; i < W * W; i++) if (label[i] !== -1 && clear[label[i]]) { near[i] = 0; frontier.push(i); }
  for (let step = 1; step <= NEAR && frontier.length; step++) {
    const next = [];
    for (const i of frontier) {
      const x = i % W, y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < W - 1 ? i + W : -1]) {
        if (j >= 0 && near[j] === -1) { near[j] = step; next.push(j); }
      }
    }
    frontier = next;
  }
  const touches = new Uint8Array(comps.length);
  for (let i = 0; i < W * W; i++) if (label[i] !== -1 && near[i] !== -1) touches[label[i]] = 1;
  comps.forEach((c, id) => {
    if (clear[id]) return;
    if (touches[id] && c.area >= NEAR_MIN && c.mean <= MAX_MEAN) { clear[id] = true; stats.near.push(c.area); }
    else if (c.area >= 200) stats.kept.push(c.area);
  });

  // The figure: everything not cleared. Tiny figure islands surrounded by background are paper grain.
  const cleared = new Uint8Array(W * W);
  for (let i = 0; i < W * W; i++) if (label[i] !== -1 && clear[label[i]]) cleared[i] = 1;
  const seen = new Uint8Array(W * W);
  for (let s = 0; s < W * W; s++) {
    if (cleared[s] || seen[s]) continue;
    const stack = [s], px = [];
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop();
      px.push(i);
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * W + nx;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < W && ny < W && !cleared[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (px.length < SPECK) for (const i of px) cleared[i] = 1;
  }
  // Distance from the figure into the background, up to EDGE: the band where the edge stays soft.
  const band = new Int8Array(W * W).fill(-1);
  let ring = [];
  for (let i = 0; i < W * W; i++) if (!cleared[i]) { band[i] = 0; ring.push(i); }
  for (let step = 1; step <= EDGE; step++) {
    const next = [];
    for (const i of ring) {
      const x = i % W, y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < W - 1 ? i + W : -1]) {
        if (j >= 0 && band[j] === -1) { band[j] = step; next.push(j); }
      }
    }
    ring = next;
  }

  // Alpha: opaque figure; in the background, a ramp on the colour distance next to the figure and clear
  // beyond. Colours of partly transparent pixels are un-blended from the paper so no cream halo shows on
  // dark backgrounds.
  const out = Buffer.alloc(W * W * 4);
  for (let i = 0; i < W * W; i++) {
    let a = 1;
    if (cleared[i]) a = band[i] === -1 ? 0 : Math.min(1, Math.max(0, (dist[i] - SOFT) / (HARD - SOFT)));
    for (let k = 0; k < 3; k++) {
      const c = a > 0 && a < 1 ? (rgb[i * 3 + k] - (1 - a) * paper[k]) / a : rgb[i * 3 + k];
      out[i * 4 + k] = Math.max(0, Math.min(255, Math.round(c)));
    }
    out[i * 4 + 3] = Math.round(a * 255);
  }
  await sharp(out, { raw: { width: W, height: W, channels: 4 } }).webp({ quality: 76, alphaQuality: 80, effort: 6 }).toFile(resolve(outDir, `troll-${n}.webp`));
  console.log(`troll-${n}: paper ${paper.map((v) => v.toFixed(0)).join(',')}; cleared enclosed ${stats.enclosed.join(', ') || 'none'} px, at the edge ${stats.near.length} (${stats.near.reduce((a, b) => a + b, 0)} px); kept light regions ≥200 px: ${stats.kept.join(', ') || 'none'}`);
}
