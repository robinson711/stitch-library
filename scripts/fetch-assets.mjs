// Puts every runtime file the app needs into public/ so the site never
// contacts another server. Library files are copied from node_modules
// (versions pinned in package-lock.json). Model files are downloaded once
// from a pinned Hugging Face revision and checked against SHA-256 hashes.
//
// Run with: npm run assets
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const nm = join(root, 'node_modules');

const copies = [
  // Text reading (Tesseract.js 7, Apache-2.0). LSTM-only cores: smaller, same accuracy.
  ['tesseract.js/dist/worker.min.js', 'ocr/worker.min.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'ocr/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'ocr/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'ocr/tesseract-core-lstm.wasm.js'],
  // English language data, "best_int" (accurate, 2.8 MB). MIT / Apache-2.0.
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'ocr/lang/eng.traineddata.gz'],
  // ONNX Runtime Web (MIT). The asyncify build runs both WebGPU and plain WebAssembly.
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs', 'ort/ort-wasm-simd-threaded.asyncify.mjs'],
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm', 'ort/ort-wasm-simd-threaded.asyncify.wasm'],
  // PDF.js (Apache-2.0): background worker that opens PDFs.
  ['pdfjs-dist/build/pdf.worker.min.mjs', 'pdf/pdf.worker.min.mjs'],
];

// PDF.js support files, loaded only when a PDF needs them: fonts, character
// maps, image decoders and colour profiles. (QuickJS, for PDF scripts, is left out.)
const copyDirs = [
  ['pdfjs-dist/standard_fonts', 'pdf/standard_fonts/'],
  ['pdfjs-dist/cmaps', 'pdf/cmaps/'],
  ['pdfjs-dist/wasm', 'pdf/wasm/', (name) => !name.startsWith('quickjs')],
  ['pdfjs-dist/iccs', 'pdf/iccs/'],
];

// DINOv2-small (Meta, Apache-2.0), ONNX export by Xenova, pinned revision.
const MODEL_REPO = 'Xenova/dinov2-small';
const MODEL_REV = 'c2bb04a51fab207c420665f1946016107bffc701';
const downloads = [
  ['config.json', '471007e1c59df520030a2690998f4e0ba5d810bc4f959d1984f630d198faa07e'],
  ['preprocessor_config.json', '14e780d86fa1861f8751f868d7f45425b5feb55c38ca26f152ca5097ab30f828'],
  ['onnx/model_quantized.onnx', '3afdc8bc63b50558d6e5770f5b799bb82455c2311183a2de43803f343a29d917'],
  ['onnx/model_q4f16.onnx', 'c57fc9ad42585ecbbaa7fefe00858b103c817eb68a37d887ba8ae40772346e12'],
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

for (const [from, to] of copies) {
  const dest = join(pub, to);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(join(nm, from), dest);
  console.log('copied ', to);
}

for (const [from, to, keep = () => true] of copyDirs) {
  const dest = join(pub, to);
  await mkdir(dest, { recursive: true });
  const names = (await readdir(join(nm, from))).filter(keep);
  for (const name of names) await copyFile(join(nm, from, name), join(dest, name));
  console.log('copied ', to, `(${names.length} files)`);
}

for (const [file, hash] of downloads) {
  const dest = join(pub, 'models', MODEL_REPO, file);
  if (await exists(dest) && sha256(await readFile(dest)) === hash) {
    console.log('ok     ', file);
    continue;
  }
  const url = `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REV}/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== hash) throw new Error(`Checksum mismatch for ${file}: ${got}`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  console.log('fetched', file, (buf.length / 1e6).toFixed(1), 'MB');
}
