// THE WORLD IN ONE IMAGE — a newspaper front page for Wednesday 25 November 2026,
// drawn entirely in code: a supersampled RGB raster canvas, hand-built drawing
// primitives, a geometric stroke font, and a zlib PNG writer. Node standard
// library only. The program renders the page and writes it to entry.png in the
// output directory (MAKEFUN_OUTPUT_DIR, or /output inside the grader).

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Canvas: a W x H picture painted on a SS-times larger buffer, then averaged
// down, which gives every edge a smooth anti-aliased finish.
// ---------------------------------------------------------------------------

const W = 1024;
const H = 1024;
const SS = 3;
const BW = W * SS;
const BH = H * SS;
const buf = new Uint8Array(BW * BH * 3);

type RGB = [number, number, number];

const PAPER: RGB = [247, 243, 233];
const INK: RGB = [27, 25, 23];
const SOFT: RGB = [96, 90, 82];
const GOLD: RGB = [198, 156, 44];
const RED: RGB = [176, 52, 40];
const BLUE: RGB = [38, 84, 158];
const GREEN: RGB = [26, 116, 74];
const OCHRE: RGB = [192, 118, 26];
const WHITE: RGB = [252, 250, 245];

function paintAll(c: RGB): void {
  for (let i = 0; i < BW * BH; i++) {
    buf[i * 3] = c[0];
    buf[i * 3 + 1] = c[1];
    buf[i * 3 + 2] = c[2];
  }
}

// Blend one buffer pixel toward a colour by alpha (0..1).
function blendPx(bx: number, by: number, c: RGB, a: number): void {
  if (bx < 0 || by < 0 || bx >= BW || by >= BH || a <= 0) return;
  const i = (by * BW + bx) * 3;
  const t = a > 1 ? 1 : a;
  buf[i] = Math.round(buf[i] + (c[0] - buf[i]) * t);
  buf[i + 1] = Math.round(buf[i + 1] + (c[1] - buf[i + 1]) * t);
  buf[i + 2] = Math.round(buf[i + 2] + (c[2] - buf[i + 2]) * t);
}

// Filled axis-aligned rectangle (image coordinates).
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x * SS));
  const y0 = Math.max(0, Math.round(y * SS));
  const x1 = Math.min(BW, Math.round((x + w) * SS));
  const y1 = Math.min(BH, Math.round((y + h) * SS));
  for (let by = y0; by < y1; by++) {
    let i = (by * BW + x0) * 3;
    for (let bx = x0; bx < x1; bx++) {
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      i += 3;
    }
  }
}

// Stroked rectangle outline.
function strokeRect(x: number, y: number, w: number, h: number, lw: number, c: RGB): void {
  line(x, y, x + w, y, lw, c);
  line(x + w, y, x + w, y + h, lw, c);
  line(x + w, y + h, x, y + h, lw, c);
  line(x, y + h, x, y, lw, c);
}

// Thick round-capped segment between two image-space points.
function line(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB): void {
  const ax = x1 * SS, ay = y1 * SS, bx = x2 * SS, by = y2 * SS;
  const r = (w * SS) / 2;
  const minx = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1));
  const maxx = Math.min(BW - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const miny = Math.max(0, Math.floor(Math.min(ay, by) - r - 1));
  const maxy = Math.min(BH - 1, Math.ceil(Math.max(ay, by) + r + 1));
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      let t = len2 === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + t * dx, py = ay + t * dy;
      const d = Math.hypot(x - px, y - py);
      const a = r + 0.5 - d;
      if (a > 0) blendPx(x, y, c, a);
    }
  }
}

// Polyline through image-space points.
function polyline(pts: number[][], w: number, c: RGB): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c);
  }
  if (pts.length === 1) disc(pts[0][0], pts[0][1], w / 2, c);
}

// Filled disc.
function disc(cx: number, cy: number, r: number, c: RGB): void {
  const ccx = cx * SS, ccy = cy * SS, rr = r * SS;
  const minx = Math.max(0, Math.floor(ccx - rr - 1));
  const maxx = Math.min(BW - 1, Math.ceil(ccx + rr + 1));
  const miny = Math.max(0, Math.floor(ccy - rr - 1));
  const maxy = Math.min(BH - 1, Math.ceil(ccy + rr + 1));
  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      const d = Math.hypot(x - ccx, y - ccy);
      const a = rr + 0.5 - d;
      if (a > 0) blendPx(x, y, c, a);
    }
  }
}

// Stroked circle.
function ring(cx: number, cy: number, r: number, w: number, c: RGB): void {
  const ccx = cx * SS, ccy = cy * SS, rr = r * SS, hw = (w * SS) / 2;
  const minx = Math.max(0, Math.floor(ccx - rr - hw - 1));
  const maxx = Math.min(BW - 1, Math.ceil(ccx + rr + hw + 1));
  const miny = Math.max(0, Math.floor(ccy - rr - hw - 1));
  const maxy = Math.min(BH - 1, Math.ceil(ccy + rr + hw + 1));
  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      const d = Math.abs(Math.hypot(x - ccx, y - ccy) - rr);
      const a = hw + 0.5 - d;
      if (a > 0) blendPx(x, y, c, a);
    }
  }
}

// Filled polygon (image-space points), even-odd scanline fill.
function polygon(pts: number[][], c: RGB): void {
  const p = pts.map(([x, y]) => [x * SS, y * SS]);
  let miny = BH - 1, maxy = 0;
  for (const [, y] of p) {
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
  }
  const y0 = Math.max(0, Math.floor(miny));
  const y1 = Math.min(BH - 1, Math.ceil(maxy));
  const n = p.length;
  for (let by = y0; by <= y1; by++) {
    const yc = by + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const [xa, ya] = p[i];
      const [xb, yb] = p[(i + 1) % n];
      if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) {
        xs.push(xa + ((yc - ya) / (yb - ya)) * (xb - xa));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.round(xs[k]));
      const xb = Math.min(BW - 1, Math.round(xs[k + 1]));
      let idx = (by * BW + xa) * 3;
      for (let bx = xa; bx <= xb; bx++) {
        buf[idx] = c[0];
        buf[idx + 1] = c[1];
        buf[idx + 2] = c[2];
        idx += 3;
      }
    }
  }
}

// Ellipse outline as a polyline (for orbit rings).
function ellipseLine(cx: number, cy: number, rx: number, ry: number, rotDeg: number, w: number, c: RGB): void {
  const rot = (rotDeg * Math.PI) / 180;
  const pts: number[][] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const ex = Math.cos(t) * rx, ey = Math.sin(t) * ry;
    pts.push([cx + ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot)]);
  }
  polyline(pts, w, c);
}

// Rotate a point around a centre (degrees, clockwise on screen).
function rotPt(x: number, y: number, cx: number, cy: number, deg: number): number[] {
  const r = (deg * Math.PI) / 180;
  const dx = x - cx, dy = y - cy;
  return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
}

// ---------------------------------------------------------------------------
// PNG writer: CRC32, IHDR/IDAT/IEND, zlib-deflated RGB scanlines.
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function downsampledRGB(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        let i = ((y * SS + sy) * BW + x * SS) * 3;
        for (let sx = 0; sx < SS; sx++) {
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
          i += 3;
        }
      }
      const n = SS * SS;
      raw[o++] = Math.round(r / n);
      raw[o++] = Math.round(g / n);
      raw[o++] = Math.round(b / n);
    }
  }
  return raw;
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(downsampledRGB(), { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// A geometric stroke font. Each glyph lives on a grid 10 units tall (cap
// height), baseline at y=0, descenders reaching y=-3. A glyph is a list of
// strokes; a stroke is a list of "x,y" points joined in order. A one-point
// stroke is a dot.
// ---------------------------------------------------------------------------

interface Glyph {
  w: number; // advance width in units (before tracking)
  s: string[];
}

const GLYPHS: Record<string, Glyph> = {
  A: { w: 6.6, s: ['0,0 3.3,10 6.6,0', '1.4,3.9 5.2,3.9'] },
  B: { w: 6.2, s: ['0,0 0,10', '0,10 3.4,10 5,8.9 5,6.9 3.4,5.4 0,5.4', '0,5.4 3.8,5.4 5.4,4.2 5.4,1.4 3.8,0 0,0'] },
  C: { w: 6.2, s: ['6,8.4 4.4,10 1.9,10 0.2,7.2 0.2,2.8 1.9,0 4.4,0 6,1.6'] },
  D: { w: 6.4, s: ['0,0 0,10', '0,10 3.2,10 5.6,7.4 5.6,2.6 3.2,0 0,0'] },
  E: { w: 5.8, s: ['6,10 0,10 0,0 6,0', '0,5.3 4.4,5.3'] },
  F: { w: 5.6, s: ['6,10 0,10 0,0', '0,5.3 4.2,5.3'] },
  G: { w: 6.6, s: ['6.2,8.4 4.6,10 1.9,10 0.2,7.2 0.2,2.8 1.9,0 4.6,0 6.2,2.4 6.2,4.6 3.6,4.6'] },
  H: { w: 6.6, s: ['0,0 0,10', '6.6,0 6.6,10', '0,5.1 6.6,5.1'] },
  I: { w: 3.4, s: ['1.7,0 1.7,10', '0.2,10 3.2,10', '0.2,0 3.2,0'] },
  J: { w: 5.4, s: ['5.4,10 5.4,2.4 3.9,0 1.6,0 0.2,1.4'] },
  K: { w: 6.4, s: ['0,0 0,10', '6.2,10 1,4.6', '2.1,5.9 6.4,0'] },
  L: { w: 5.6, s: ['0,10 0,0 5.8,0'] },
  M: { w: 7.6, s: ['0,0 0,10 3.8,4.6 7.6,10 7.6,0'] },
  N: { w: 6.8, s: ['0,0 0,10 6.8,0 6.8,10'] },
  O: { w: 6.8, s: ['1.8,0 0.2,2.6 0.2,7.4 1.8,10 5,10 6.6,7.4 6.6,2.6 5,0 1.8,0'] },
  P: { w: 6, s: ['0,0 0,10 3.8,10 5.4,8.4 5.4,6.1 3.8,4.6 0,4.6'] },
  Q: { w: 6.8, s: ['1.8,0 0.2,2.6 0.2,7.4 1.8,10 5,10 6.6,7.4 6.6,2.6 5,0 1.8,0', '4,2.4 6.6,-0.6'] },
  R: { w: 6.2, s: ['0,0 0,10 3.8,10 5.4,8.4 5.4,6.1 3.8,4.6 0,4.6', '3.4,4.6 6.2,0'] },
  S: { w: 6, s: ['5.8,8.2 4.4,10 1.9,10 0.4,8.4 1.1,6.2 4.9,4.7 5.9,3.1 4.9,0.9 3.1,0 1.1,0 0.1,1.1'] },
  T: { w: 6.2, s: ['0,10 6.2,10', '3.1,10 3.1,0'] },
  U: { w: 6.6, s: ['0,10 0,2.6 1.7,0 4.9,0 6.6,2.6 6.6,10'] },
  V: { w: 6.6, s: ['0,10 3.3,0 6.6,10'] },
  W: { w: 8.4, s: ['0,10 1.7,0 4.2,6.4 6.7,0 8.4,10'] },
  X: { w: 6.4, s: ['0,0 6.4,10', '0,10 6.4,0'] },
  Y: { w: 6.4, s: ['0,10 3.2,5.4 6.4,10', '3.2,5.4 3.2,0'] },
  Z: { w: 6.2, s: ['0,10 6.2,10 0,0 6.2,0'] },
  a: { w: 5.8, s: ['5.4,1.6 4,0 1.9,0 0.3,1.9 0.3,5.1 1.9,7 4,7 5.4,5.1 5.4,0'] },
  b: { w: 5.8, s: ['0,0 0,10', '0,1.9 1.9,0 4,0 5.4,1.9 5.4,5.1 4,7 1.9,7 0,5.1'] },
  c: { w: 5.4, s: ['5.4,5.8 4,7 1.9,7 0.3,5.1 0.3,1.9 1.9,0 4,0 5.4,1.2'] },
  d: { w: 5.8, s: ['5.4,0 5.4,10', '5.4,5.1 4,7 1.9,7 0.3,5.1 0.3,1.9 1.9,0 4,0 5.4,1.9'] },
  e: { w: 5.6, s: ['0.3,3.7 5.5,3.7 5.2,5.6 3.9,7 1.9,7 0.3,5.1 0.3,1.9 1.9,0 4,0 5.4,1.2'] },
  f: { w: 3.6, s: ['5,9.4 3.9,10 2.2,10 1.9,8.2 1.9,0', '0.2,6.8 3.6,6.8'] },
  g: { w: 5.8, s: ['5.4,7 5.4,-1.4 4,-2.9 1.9,-2.9 0.4,-1.9', '5.4,5.1 4,7 1.9,7 0.3,5.1 0.3,1.9 1.9,0.1 4,0.1 5.4,1.9'] },
  h: { w: 5.8, s: ['0,0 0,10', '0,4.9 1.9,7 4,7 5.4,5.1 5.4,0'] },
  i: { w: 2.8, s: ['1.4,0 1.4,7', '1.4,9.4'] },
  j: { w: 3, s: ['1.6,7 1.6,-1.4 0.6,-2.8 -0.6,-2.4', '1.6,9.4'] },
  k: { w: 5.4, s: ['0,0 0,10', '5.2,7 1.1,3.5', '2.1,4.4 5.4,0'] },
  l: { w: 2.8, s: ['1.4,0 1.4,10'] },
  m: { w: 8.6, s: ['0,0 0,7', '0,4.9 1.7,7 3.2,6.8 4,5.2 4,0', '4,4.9 5.5,7 7.2,6.8 8.2,5.2 8.2,0'] },
  n: { w: 5.8, s: ['0,0 0,7', '0,4.9 1.9,7 4,7 5.4,5.1 5.4,0'] },
  o: { w: 5.8, s: ['1.9,0 0.3,1.9 0.3,5.1 1.9,7 4,7 5.5,5.1 5.5,1.9 4,0 1.9,0'] },
  p: { w: 5.8, s: ['0,-3 0,7', '0,1.9 1.9,0 4,0 5.4,1.9 5.4,5.1 4,7 1.9,7 0,5.1'] },
  q: { w: 5.8, s: ['5.4,-3 5.4,7', '5.4,5.1 4,7 1.9,7 0.3,5.1 0.3,1.9 1.9,0 4,0 5.4,1.9'] },
  r: { w: 4.2, s: ['0,0 0,7', '0,4.6 1.8,7 3.8,7'] },
  s: { w: 5.2, s: ['5.1,5.9 3.9,7 1.7,7 0.3,5.9 1,4.3 4.6,3.2 5.4,1.7 4.2,0 1.5,0 0.1,1'] },
  t: { w: 3.8, s: ['2,9.4 2,1.6 3.2,0 5,0.1', '0.2,6.8 4.6,6.8'] },
  u: { w: 5.8, s: ['0,7 0,1.9 1.9,0 4,0 5.4,1.9 5.4,7', '5.4,0 5.4,0.4'] },
  v: { w: 5.6, s: ['0,7 2.8,0 5.6,7'] },
  w: { w: 7.8, s: ['0,7 1.5,0 3.9,4.6 6.3,0 7.8,7'] },
  x: { w: 5.4, s: ['0,0 5.4,7', '0,7 5.4,0'] },
  y: { w: 5.6, s: ['0,7 2.8,1.6 5.6,7', '2.8,1.6 2.8,-1.7 1.6,-2.9 0.2,-2.5'] },
  z: { w: 5.4, s: ['0,7 5.4,7 0,0 5.4,0'] },
  '0': { w: 6.2, s: ['1.8,0 0.3,2.6 0.3,7.4 1.8,10 4.4,10 5.9,7.4 5.9,2.6 4.4,0 1.8,0'] },
  '1': { w: 4.6, s: ['1.2,7.4 3.1,10 3.1,0', '1,0 5,0'] },
  '2': { w: 6, s: ['0.4,8 1.9,10 4.1,10 5.5,8.1 5.2,5.6 0,0 6,0'] },
  '3': { w: 6, s: ['0.4,8.5 1.9,10 3.9,10 5.2,8.1 3.9,5.7 1.9,5.3', '1.9,5.3 4.1,5.1 5.5,3.1 4.4,0.9 2.1,0 0.2,1.2'] },
  '4': { w: 6.2, s: ['4.3,0 4.3,10 0,3.4 6.2,3.4'] },
  '5': { w: 6, s: ['5.8,10 1,10 0.8,6.2 2.9,6.9 5.1,5.6 5.5,2.6 4,0.3 1.5,0 0.2,1.3'] },
  '6': { w: 6.2, s: ['5.5,8.7 3.9,10.1 1.3,7.2 0.3,3.6 1.5,0.8 3.6,0 5.2,1.2 5.5,3.8 4.1,5.8 1.9,5.7 0.4,4.2'] },
  '7': { w: 6, s: ['0,10 6,10 2.9,0'] },
  '8': { w: 6.2, s: ['3.1,5.3 1.2,6.2 0.6,8.1 1.6,9.9 4.6,9.9 5.6,8.1 5,6.2 3.1,5.3 1.4,4.3 0.4,2.4 1.4,0.2 4.8,0.2 5.8,2.4 4.8,4.3 3.1,5.3'] },
  '9': { w: 6.2, s: ['0.7,1.3 2.3,-0.1 4.9,2.8 5.9,6.4 4.5,9.2 2.6,10 0.9,8.8 0.5,6.2 2,4.3 4.2,4.4 5.6,6.1'] },
  '.': { w: 2.2, s: ['1.1,0.3'] },
  ',': { w: 2.4, s: ['1.5,0.5 1.1,-1.3'] },
  '%': { w: 7, s: ['0.4,0 6.6,10', '0.5,8.5 1.8,9.9 3.1,8.5 1.8,7.1 0.5,8.5', '3.9,1.5 5.2,2.9 6.5,1.5 5.2,0.1 3.9,1.5'] },
  '+': { w: 6, s: ['3,1.8 3,8.2', '0.4,5 5.6,5'] },
  '·': { w: 2.6, s: ['1.3,3.6'] },
  '—': { w: 7.4, s: ['0,5 7.4,5'] },
  '–': { w: 5.4, s: ['0,5 5.4,5'] },
  '-': { w: 4.4, s: ['0.4,5 4,5'] },
  "'": { w: 2.2, s: ['1.2,10 0.9,8.5'] },
  ':': { w: 2.4, s: ['1.2,1', '1.2,6'] },
  '/': { w: 4.6, s: ['0.6,0 4,10'] },
  '(': { w: 3.6, s: ['3.2,10 1.6,7 1.6,3 3.2,0'] },
  ')': { w: 3.6, s: ['0.4,10 2,7 2,3 0.4,0'] },
};

const SPACE_W = 3.6;

function glyphOf(ch: string): Glyph | null {
  return GLYPHS[ch] ?? null;
}

// Width of a string at a given cap size (image pixels).
function textWidth(text: string, size: number, track: number): number {
  const unit = size / 10;
  let w = 0;
  for (const ch of text) {
    if (ch === ' ') w += (SPACE_W + track) * unit;
    else {
      const g = glyphOf(ch);
      w += ((g ? g.w : SPACE_W) + track) * unit;
    }
  }
  return w - track * unit;
}

// Draw text with its baseline at y. align: 0 left, 1 centre, 2 right.
function drawText(
  text: string,
  x: number,
  yBase: number,
  size: number,
  c: RGB,
  opts: { track?: number; weight?: number; align?: number } = {},
): number {
  const track = opts.track ?? 1.05;
  const unit = size / 10;
  const lw = size * (opts.weight ?? 0.15);
  const total = textWidth(text, size, track);
  let cx = opts.align === 1 ? x - total / 2 : opts.align === 2 ? x - total : x;
  for (const ch of text) {
    if (ch === ' ') {
      cx += (SPACE_W + track) * unit;
      continue;
    }
    const g = glyphOf(ch);
    if (!g) {
      cx += (SPACE_W + track) * unit;
      continue;
    }
    for (const stroke of g.s) {
      const pts = stroke.split(' ').map((pair) => {
        const [gx, gy] = pair.split(',').map(Number);
        return [cx + gx * unit, yBase - gy * unit];
      });
      if (pts.length === 1) disc(pts[0][0], pts[0][1], lw / 2, c);
      else polyline(pts, lw, c);
    }
    cx += (g.w + track) * unit;
  }
  return total;
}

// Greedy word wrap: lines of text no wider than maxW at the given size.
function wrapText(text: string, size: number, maxW: number, track: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const trial = cur === '' ? word : cur + ' ' + word;
    if (textWidth(trial, size, track) <= maxW || cur === '') cur = trial;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

// Draw a wrapped block, shrinking the size until it fits maxLines and, when
// limitY is given, until the last baseline stays above it. Returns the size
// actually used. Lines are drawn downward from firstBaseline.
function drawBlock(
  text: string,
  x: number,
  firstBaseline: number,
  maxW: number,
  startSize: number,
  minSize: number,
  maxLines: number,
  c: RGB,
  opts: { track?: number; weight?: number; align?: number; gap?: number; limitY?: number } = {},
): number {
  const track = opts.track ?? 1.0;
  const gapMul = opts.gap ?? 1.34;
  let size = startSize;
  let lines = wrapText(text, size, maxW, track);
  const tooLow = () =>
    opts.limitY !== undefined && firstBaseline + (lines.length - 1) * size * gapMul > opts.limitY;
  while ((lines.length > maxLines || tooLow()) && size > minSize) {
    size -= 0.5;
    lines = wrapText(text, size, maxW, track);
  }
  const gap = size * gapMul;
  lines.forEach((ln, i) => {
    drawText(ln, x, firstBaseline + i * gap, size, c, { track, weight: opts.weight, align: opts.align });
  });
  return size;
}

// ---------------------------------------------------------------------------
// Icons. Each draws inside a box with top-left corner (x, y), about 138 wide
// and 132 tall, in ink plus one accent colour.
// ---------------------------------------------------------------------------

function wave(x: number, y: number, len: number, amp: number, w: number, c: RGB): void {
  const pts: number[][] = [];
  for (let i = 0; i <= 16; i++) {
    pts.push([x + (len * i) / 16, y + Math.sin((i / 16) * Math.PI * 4) * amp]);
  }
  polyline(pts, w, c);
}

function iconShip(x: number, y: number, accent: RGB): void {
  // Incoming missile with an accent fire trail.
  line(x + 130, y + 2, x + 108, y + 22, 3, accent);
  line(x + 136, y + 12, x + 114, y + 32, 2.4, accent);
  line(x + 108, y + 22, x + 88, y + 42, 9.5, INK);
  disc(x + 86, y + 44, 5.2, accent);
  line(x + 78, y + 34, x + 84, y + 44, 2.4, accent);
  line(x + 96, y + 32, x + 90, y + 43, 2.4, accent);
  // Container stack and bridge.
  fillRect(x + 24, y + 54, 26, 20, INK);
  fillRect(x + 52, y + 54, 26, 20, INK);
  fillRect(x + 38, y + 34, 26, 20, accent);
  fillRect(x + 96, y + 38, 15, 36, INK);
  fillRect(x + 99, y + 43, 9, 7, PAPER);
  // Hull and sea.
  polygon([[x + 10, y + 76], [x + 130, y + 76], [x + 117, y + 98], [x + 24, y + 98]], INK);
  wave(x + 4, y + 110, 130, 3.4, 2.6, accent);
  wave(x + 12, y + 121, 114, 3, 2.2, INK);
}

function iconSunk(x: number, y: number, accent: RGB): void {
  const cx = x + 69, cy = y + 64;
  const R = (px: number, py: number) => rotPt(px, py, cx, cy, -17);
  const hull = [[x + 12, y + 52], [x + 126, y + 52], [x + 114, y + 75], [x + 26, y + 75]].map(([a, b]) => R(a, b));
  polygon(hull, INK);
  const m1 = R(x + 42, y + 52), m2 = R(x + 42, y + 20);
  line(m1[0], m1[1], m2[0], m2[1], 4.4, INK);
  const crate = [[x + 68, y + 33], [x + 96, y + 33], [x + 96, y + 52], [x + 68, y + 52]].map(([a, b]) => R(a, b));
  polygon(crate, INK);
  // Sea surface across the wreck, bubbles escaping upward.
  wave(x + 2, y + 60, 134, 3.2, 2.8, accent);
  wave(x + 8, y + 118, 120, 3, 2.2, accent);
  ring(x + 110, y + 42, 3.6, 1.7, INK);
  ring(x + 119, y + 29, 2.7, 1.5, INK);
  ring(x + 103, y + 24, 2.1, 1.4, INK);
}

function iconRocket(x: number, y: number, accent: RGB): void {
  const cx = x + 69;
  ellipseLine(cx, y + 82, 63, 23, -16, 2.4, accent);
  // Flame, fins, body.
  polygon([[cx - 8, y + 80], [cx + 8, y + 80], [cx, y + 106]], accent);
  polygon([[cx - 15, y + 56], [cx - 29, y + 80], [cx - 15, y + 80]], INK);
  polygon([[cx + 15, y + 56], [cx + 29, y + 80], [cx + 15, y + 80]], INK);
  const body: number[][] = [
    [cx - 15, y + 80], [cx - 15, y + 38], [cx - 8, y + 18], [cx, y + 5],
    [cx + 8, y + 18], [cx + 15, y + 38], [cx + 15, y + 80],
  ];
  polygon(body, WHITE);
  polyline([...body, body[0]], 2.8, INK);
  line(cx - 15, y + 66, cx + 15, y + 66, 2.4, INK);
  disc(cx, y + 36, 7.6, accent);
  ring(cx, y + 36, 7.6, 2.4, INK);
  // Stars.
  line(x + 12, y + 12, x + 12, y + 22, 2.2, INK);
  line(x + 7, y + 17, x + 17, y + 17, 2.2, INK);
  line(x + 120, y + 26, x + 120, y + 34, 2, accent);
  line(x + 116, y + 30, x + 124, y + 30, 2, accent);
}

function person(cx: number, feet: number, c: RGB): void {
  disc(cx, feet - 27, 4.9, c);
  line(cx, feet - 21, cx, feet - 10, 3.6, c);
  line(cx, feet - 10, cx - 5.5, feet, 3.2, c);
  line(cx, feet - 10, cx + 5.5, feet, 3.2, c);
  line(cx, feet - 18, cx - 7, feet - 12, 2.8, c);
  line(cx, feet - 18, cx + 7, feet - 12, 2.8, c);
}

function iconGate(x: number, y: number, accent: RGB): void {
  disc(x + 69, y + 54, 21, accent); // sun seen through the open gate
  // Posts and lintel.
  fillRect(x + 15, y + 16, 9, 94, INK);
  fillRect(x + 114, y + 16, 9, 94, INK);
  fillRect(x + 9, y + 9, 120, 9, INK);
  // Doors swung open toward the viewer.
  const dl = [[x + 24, y + 20], [x + 55, y + 31], [x + 55, y + 103], [x + 24, y + 110]];
  const dr = [[x + 114, y + 20], [x + 83, y + 31], [x + 83, y + 103], [x + 114, y + 110]];
  polyline([...dl, dl[0]], 3.2, INK);
  polyline([...dr, dr[0]], 3.2, INK);
  line(x + 39, y + 26, x + 39, y + 106, 2.2, INK);
  line(x + 99, y + 26, x + 99, y + 106, 2.2, INK);
  // Freed people walking out.
  person(x + 58, y + 112, INK);
  person(x + 80, y + 116, INK);
  person(x + 68, y + 100, INK);
  line(x + 2, y + 122, x + 136, y + 122, 2.4, INK);
}

// ---------------------------------------------------------------------------
// Hero illustration: a courthouse and a gavel over a circuit board, on ink.
// ---------------------------------------------------------------------------

function circuits(): void {
  const dim: RGB = [148, 116, 42];
  const traces: number[][][] = [
    [[70, 214], [150, 214], [150, 248], [228, 248]],
    [[70, 330], [128, 330], [128, 296], [196, 296]],
    [[954, 222], [884, 222], [884, 262], [820, 262]],
    [[954, 336], [896, 336], [896, 300], [838, 300]],
    [[70, 272], [104, 272], [104, 306]],
    [[954, 282], [922, 282], [922, 248]],
  ];
  for (const t of traces) {
    polyline(t, 2.2, dim);
    const [ex, ey] = t[t.length - 1];
    ring(ex, ey, 4.4, 2, dim);
    const [sx, sy] = t[0];
    disc(sx, sy, 3, dim);
  }
}

function courthouse(): void {
  const cx = 392;
  // Pediment, entablature, columns, steps — all in paper white on the ink band.
  polygon([[cx - 118, 252], [cx + 118, 252], [cx, 210]], PAPER);
  disc(cx, 236, 6.5, INK);
  fillRect(cx - 109, 254, 218, 13, PAPER);
  for (let i = 0; i < 4; i++) {
    const colX = cx - 93 + i * 53;
    fillRect(colX, 272, 15, 62, PAPER);
    fillRect(colX - 2.5, 267, 20, 5, PAPER);
    fillRect(colX - 2.5, 334, 20, 5, PAPER);
  }
  fillRect(cx - 104, 339, 208, 10, PAPER);
  fillRect(cx - 117, 349, 234, 9, PAPER);
  fillRect(cx - 131, 358, 262, 10, PAPER);
}

function gavel(): void {
  // Sound block.
  fillRect(648, 344, 86, 8, PAPER);
  fillRect(632, 354, 118, 10, PAPER);
  // Handle in gold, head as a bold paper capsule with gold bands.
  line(728, 266, 688, 348, 13, GOLD);
  line(676, 234, 792, 282, 37, PAPER);
  const band = (t: number) => {
    const px = 676 + 116 * t, py = 234 + 48 * t;
    line(px + 7.4, py - 16.6, px - 7.4, py + 16.6, 5.5, GOLD);
  };
  band(0.24);
  band(0.76);
}

// A gold seal stamped on the ink band at the hero panel's top-right corner:
// a filled gold disc with an ink ring and TOP / STORY stacked inside it.
function seal(): void {
  const cx = 905, cy = 250;
  disc(cx, cy, 33, GOLD);
  ring(cx, cy, 26.5, 1.6, INK);
  drawText('TOP', cx, cy + 1, 12.5, INK, { align: 1, weight: 0.17, track: 0.8 });
  drawText('STORY', cx, cy + 15, 12.5, INK, { align: 1, weight: 0.17, track: 0.8 });
}

// ---------------------------------------------------------------------------
// The page.
// ---------------------------------------------------------------------------

function panel(
  x: number, y: number, w: number, h: number,
  accent: RGB, kicker: string, headline: string,
  icon: (ix: number, iy: number, a: RGB) => void,
): void {
  strokeRect(x, y, w, h, 2.2, INK);
  icon(x + 13, y + 22, accent);
  drawText(kicker, x + 166, y + 31, 13.5, accent, { weight: 0.17, track: 1.6 });
  drawBlock(headline, x + 166, y + 61, w - 182, 24.5, 16.5, 5, INK,
    { weight: 0.165, gap: 1.27, limitY: y + h - 13 });
}

function render(): void {
  paintAll(PAPER);

  // Page frame: one bold rule, one hairline.
  strokeRect(30, 30, 964, 964, 3.4, INK);
  strokeRect(39.5, 39.5, 945, 945, 1, INK);

  // Masthead.
  let mSize = 68;
  while (textWidth('THE WORLD IN ONE IMAGE', mSize, 1.1) > 884 && mSize > 30) mSize -= 2;
  drawText('THE WORLD IN ONE IMAGE', 512, 124, mSize, INK, { align: 1, weight: 0.155, track: 1.1 });

  // Dateline between rules.
  line(64, 140, 960, 140, 2.2, INK);
  drawText('WEDNESDAY 25 NOVEMBER 2026', 512, 165, 20, INK, { align: 1, weight: 0.15, track: 1.4 });
  line(64, 178, 960, 178, 1.1, INK);

  // Hero panel.
  strokeRect(56, 192, 912, 330, 2.6, INK);
  fillRect(58.5, 194.5, 907, 178, INK);
  circuits();
  courthouse();
  gavel();
  seal();
  drawText('US JURY CONVICTS HUAWEI OF', 512, 428, 42, INK, { align: 1, weight: 0.16, track: 1 });
  drawText('TRADE-SECRET CONSPIRACY', 512, 484, 42, INK, { align: 1, weight: 0.16, track: 1 });
  drawText('Guilty on 10 of 12 counts · Beijing protests', 512, 511, 18, SOFT, { align: 1, weight: 0.14, track: 0.9 });

  // Four story panels, two by two.
  panel(56, 538, 444, 174, RED, 'MIDDLE EAST',
    'HORMUZ SHIPPING ATTACKED AGAIN — HOUTHI STRIKE WOUNDS 11 IN RIYADH', iconShip);
  panel(524, 538, 444, 174, BLUE, 'WAR AT SEA',
    'UKRAINE SINKS RUSSIAN WARSHIP IN LIBYA — TWO LIBYAN OFFICERS DEAD', iconSunk);
  panel(56, 726, 444, 174, GREEN, 'SPACE',
    'PAKISTAN REJOICES: ITS FIRST ASTRONAUT ENTERS ORBIT', iconRocket);
  panel(524, 726, 444, 174, OCHRE, 'COLOMBIA',
    'ALL CARTAGENA HOSTAGES FREED — ONE GUNMAN KILLED', iconGate);

  // Bottom ticker.
  fillRect(56, 914, 912, 64, INK);
  drawText('EURO INFLATION 4.0% · SENEGAL RESTORED AS AFRICA CUP CHAMPIONS', 512, 941, 15.5, PAPER,
    { align: 1, weight: 0.15, track: 0.9 });
  drawText('AUSTRALIA–SOLOMON ISLANDS TREATY · NORTH KOREA EXPELS SWISS ENVOY · PAGE ONE', 512, 965, 15.5, PAPER,
    { align: 1, weight: 0.15, track: 0.9 });
}

render();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const png = encodePNG();
writeFileSync(join(outDir, 'entry.png'), png);
console.log(`entry.png written: ${png.length} bytes, ${W}x${H}`);
