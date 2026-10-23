#!/usr/bin/env node
/**
 * make-icon.mjs — generate media/icon.png (128×128, no dependencies).
 *
 * #199 EDITORS-2: `vsce package` refused the extension because
 * media/icon.png did not exist. The icon is deterministic: the OLYMPUS
 * night background + a gold column mark. Re-run after changing the brand.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'media', 'icon.png');
const W = 128;
const H = 128;

const BG = [10, 14, 22, 255];
const GOLD = [201, 162, 39, 255];
const GOLD_DIM = [201, 162, 39, 150];
const px = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) px.set(BG, i * 4);

function put(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  px.set(c, (y * W + x) * 4);
}
function rect(x0, y0, x1, y1, c) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c);
}

// A gold ring (the Olympus halo).
const cx = 63.5, cy = 63.5;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d >= 52 && d <= 56) put(x, y, GOLD_DIM);
  }
}

// A Greek column: capital, shaft (with flutes), base.
rect(48, 34, 79, 40, GOLD);   // capital
rect(53, 41, 74, 90, GOLD);   // shaft
rect(57, 41, 58, 90, BG);     // flute
rect(63, 41, 64, 90, BG);     // flute
rect(69, 41, 70, 90, BG);     // flute
rect(46, 91, 81, 97, GOLD);   // base
rect(42, 98, 85, 103, GOLD);  // plinth

// Encode: filter byte 0 + RGBA per row.
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  px.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, png);
console.log(`wrote ${OUT} (${png.length} bytes)`);
