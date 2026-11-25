// After `vite build`: lists every file in dist/ with its SHA-256 and writes
// dist/sw.js from scripts/sw-template.js. Run by `npm run build`.
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

// Not needed on the phone: the test bench and the smaller model only it uses.
const skip = [/^sw\.js$/, /^asset-sizes\.json$/, /^(lab|speed)\.html$/, /^assets\/(lab|speed)-/, /model_q4f16\.onnx$/, /\.map$/, /(^|\/)\.DS_Store$/];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const BIG = 1_000_000; // bytes
const files = [];
for (const p of (await walk(dist)).sort()) {
  const rel = relative(dist, p).split(sep).join('/');
  if (skip.some((r) => r.test(rel))) continue;
  const data = await readFile(p);
  files.push([rel, createHash('sha256').update(data).digest('hex'), data.length > BIG ? 1 : 0]);
}
// Big files are downloaded after the app itself, smallest risk first: the
// model and processor build before the graphics-chip build.
const order = (f) => (f[0].includes('asyncify') ? 2 : f[2]);
files.sort((a, b) => order(a) - order(b));
const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16);
const template = await readFile(join(root, 'scripts', 'sw-template.js'), 'utf8');
await writeFile(join(dist, 'sw.js'), template.replace('__VERSION__', version).replace('__FILES__', JSON.stringify(files, null, 0)));
console.log(`sw.js: ${files.length} files kept for offline use, version ${version}`);
