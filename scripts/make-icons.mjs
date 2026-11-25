// Draws the app icon (a heart made of cross stitches on chartreuse) and saves
// it as PNG files in public/icons/. No image libraries needed.
// Run with: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const BG = [0xc5, 0xe4, 0x3a];
const INK = [0x1b, 0x21, 0x00];
const HEART = [
  '.XX...XX.',
  'XXXX.XXXX',
  'XXXXXXXXX',
  'XXXXXXXXX',
  '.XXXXXXX.',
  '..XXXXX..',
  '...XXX...',
  '....X....',
];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Distance from point to segment, for drawing the two strokes of each stitch.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** `fill` = how much of the icon the heart may use (smaller for "maskable" icons). */
function icon(size, fill) {
  const cols = HEART[0].length, rows = HEART.length;
  const cell = (size * fill) / cols;
  const ox = (size - cell * cols) / 2;
  const oy = (size - cell * rows) / 2 + cell * 0.25;
  const inset = cell * 0.16, width = cell * 0.13;
  const SS = 4;
  return png(size, (x, y) => {
    let hit = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
      const c = Math.floor((px - ox) / cell), r = Math.floor((py - oy) / cell);
      if (r < 0 || r >= rows || c < 0 || c >= cols || HEART[r][c] !== 'X') continue;
      const x0 = ox + c * cell + inset, y0 = oy + r * cell + inset, x1 = ox + (c + 1) * cell - inset, y1 = oy + (r + 1) * cell - inset;
      if (segDist(px, py, x0, y0, x1, y1) <= width || segDist(px, py, x1, y0, x0, y1) <= width) hit++;
    }
    const a = hit / (SS * SS);
    return BG.map((b, i) => Math.round(b + (INK[i] - b) * a));
  });
}

await mkdir(out, { recursive: true });
const files = [
  ['apple-touch-icon.png', 180, 0.72],
  ['icon-192.png', 192, 0.72],
  ['icon-512.png', 512, 0.72],
  ['icon-maskable-512.png', 512, 0.56],
];
for (const [name, size, fill] of files) {
  await writeFile(join(out, name), icon(size, fill));
  console.log('wrote', name);
}
