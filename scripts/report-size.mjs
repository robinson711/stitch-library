// After a build: lists what the phone downloads and stores, and writes
// dist/asset-sizes.json for the test bench to show.
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const byGroup = {};
let total = 0;
let totalGzip = 0;
for await (const p of walk(dist)) {
  const rel = relative(dist, p);
  if (rel === 'asset-sizes.json' || rel.endsWith('.map')) continue;
  const size = (await stat(p)).size;
  // GitHub Pages compresses text and wasm; .gz and .onnx are sent as they are.
  const compressible = /\.(js|mjs|css|html|json|wasm|svg|webmanifest)$/.test(rel);
  const gz = compressible ? gzipSync(await readFile(p), { level: 6 }).length : size;
  const group = rel.split('/')[0].includes('.') ? 'pages' : rel.split('/')[0];
  byGroup[group] = (byGroup[group] ?? 0) + size;
  total += size;
  totalGzip += gz;
}
await writeFile(join(dist, 'asset-sizes.json'), JSON.stringify({ total, totalGzip, byGroup }, null, 2));
for (const [k, v] of Object.entries(byGroup)) console.log(`${k.padEnd(10)} ${(v / 1e6).toFixed(1)} MB`);
console.log(`total      ${(total / 1e6).toFixed(1)} MB stored, ~${(totalGzip / 1e6).toFixed(1)} MB to download`);
