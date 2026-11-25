// Phase 1 test bench: checks picture matching and text reading on the iPhone
// with real chart covers and finished pieces. Nothing is saved or sent anywhere;
// the pictures only live in this page's memory until it is closed.
import './lab.css';
import { h, clear } from '../shared/dom';
import { loadToCanvas, canvasToJpeg, releaseCanvas } from '../image/load';
import { Embedder, type Embedding } from '../match/embedder';
import { rankCharts, rankOf, dot, type ChartVectors } from '../match/rank';
import type { Dtype, Device } from '../match/embed.worker';
import { TextReader, type Layout, type ReadResult } from '../ocr/ocr';
import { suggestTitleAndDesigner, type Suggestion } from '../ocr/suggest';
import { wordRecall, suggestionMatches } from '../ocr/accuracy';

const BASE = new URL('./', location.href).href;

interface Pair {
  id: string;
  cover?: File;
  finished?: File;
  title: string;
  designer: string;
  coverThumb?: string;
  finishedThumb?: string;
}

let pairs: Pair[] = [];
let extras: { id: string; file: File; thumb: string }[] = [];
let counter = 0;
let running = false;

const app = document.getElementById('app')!;
const statusEl = h('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
const pairsEl = h('div', { class: 'pairs' });
const extrasEl = h('div', { class: 'extras' });
const resultsEl = h('section', { class: 'results', 'aria-label': 'Results' });

async function thumb(file: File): Promise<string> {
  const c = await loadToCanvas(file, 240);
  const b = await canvasToJpeg(c, 0.7);
  releaseCanvas(c);
  return URL.createObjectURL(b);
}

function picker(label: string, multiple: boolean, onPick: (files: File[]) => void) {
  const input = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', multiple });
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) onPick(files);
  });
  return h('label', { class: 'pick' }, input, label);
}

function renderPairs() {
  clear(pairsEl);
  pairs.forEach((p, i) => {
    const titleIn = h('input', { type: 'text', value: p.title, placeholder: 'Title on the cover (optional)', autocomplete: 'off' });
    titleIn.addEventListener('input', () => (p.title = titleIn.value));
    const desIn = h('input', { type: 'text', value: p.designer, placeholder: 'Designer (optional)', autocomplete: 'off' });
    desIn.addEventListener('input', () => (p.designer = desIn.value));
    const slot = (which: 'cover' | 'finished', label: string) => {
      const t = which === 'cover' ? p.coverThumb : p.finishedThumb;
      return h('div', { class: 'slot' },
        t ? h('img', { src: t, alt: `${label} ${i + 1}` }) : h('div', { class: 'empty' }, label),
        picker(t ? 'Change' : `Choose ${label.toLowerCase()}`, false, async ([f]) => {
          try {
            const url = await thumb(f);
            if (which === 'cover') { p.cover = f; p.coverThumb = url; } else { p.finished = f; p.finishedThumb = url; }
          } catch (e) { say(`Pair ${i + 1}: ${(e as Error).message}`); }
          renderPairs();
        }));
    };
    pairsEl.append(h('div', { class: 'pair' },
      h('h3', {}, `Pair ${i + 1}`),
      h('div', { class: 'slots' }, slot('cover', 'Cover'), slot('finished', 'Finished')),
      titleIn, desIn,
      h('button', { type: 'button', class: 'quiet', onclick: () => { pairs = pairs.filter((x) => x !== p); renderPairs(); } }, 'Remove pair'),
    ));
  });
}

function renderExtras() {
  clear(extrasEl);
  for (const x of extras) extrasEl.append(h('img', { src: x.thumb, alt: 'Extra cover' }));
}

function say(text: string) {
  statusEl.textContent = text;
}

function pct(n: number, d: number) {
  return d ? `${Math.round((100 * n) / d)}% (${n}/${d})` : '–';
}
function ms(x: number) {
  return x >= 1000 ? `${(x / 1000).toFixed(1)} s` : `${Math.round(x)} ms`;
}
function med(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

interface CoverData { chartId: string; emb: Embedding; reads: Record<Layout, ReadResult>; pair?: Pair }

async function run() {
  if (running) return;
  const ready = pairs.filter((p) => p.cover && p.finished);
  if (ready.length < 2) return say('Add at least two complete pairs first.');
  running = true;
  clear(resultsEl);
  const dtype = (document.getElementById('dtype') as HTMLSelectElement).value as Dtype;
  const device = (document.getElementById('device') as HTMLSelectElement).value as Device | 'auto';
  const log: string[] = [];
  const t0 = performance.now();
  let embedder: Embedder | null = null;
  let reader: TextReader | null = null;
  try {
    say('Working… loading the matching model');
    embedder = await Embedder.create(BASE, dtype, device);
    say('Working… loading the text reader');
    const tr0 = performance.now();
    reader = await TextReader.create(BASE);
    const readerLoad = performance.now() - tr0;

    const covers: CoverData[] = [];
    const allCovers = [...ready.map((p) => ({ id: p.id, file: p.cover!, pair: p })), ...extras.map((x) => ({ id: x.id, file: x.file, pair: undefined }))];
    const decodeTimes: number[] = [];
    for (const [i, c] of allCovers.entries()) {
      say(`Working… cover ${i + 1} of ${allCovers.length}`);
      const d0 = performance.now();
      const small = await loadToCanvas(c.file, 1024);
      decodeTimes.push(performance.now() - d0);
      const emb = await embedder.embed(small);
      releaseCanvas(small);
      const big = await loadToCanvas(c.file, 2400);
      const reads = { auto: await reader.read(big, 'auto'), sparse: await reader.read(big, 'sparse') };
      releaseCanvas(big);
      covers.push({ chartId: c.id, emb, reads, pair: c.pair });
    }
    const finished: { pair: Pair; emb: Embedding }[] = [];
    for (const [i, p] of ready.entries()) {
      say(`Working… finished piece ${i + 1} of ${ready.length}`);
      const c = await loadToCanvas(p.finished!, 1024);
      finished.push({ pair: p, emb: await embedder.embed(c) });
      releaseCanvas(c);
    }

    // ---- Matching: compare three ways of using the model ----
    type Variant = { name: string; q: (e: Embedding) => Float32Array[]; r: (e: Embedding) => Float32Array[] };
    const variants: Variant[] = [
      { name: 'Whole picture (CLS)', q: (e) => [e.cls[0]], r: (e) => [e.cls[0]] },
      { name: '3 views (CLS)', q: (e) => e.cls, r: (e) => e.cls },
      { name: '3 views (patch average)', q: (e) => e.mean, r: (e) => e.mean },
    ];
    const matchTable = h('table', {}, h('tr', {}, h('th', {}, 'Method'), h('th', {}, 'Right chart first'), h('th', {}, 'In top three'), h('th', {}, 'Score: right / best wrong')));
    log.push('MATCHING');
    let bestVariant = variants[0];
    let bestTop1 = -1;
    for (const v of variants) {
      const refs: ChartVectors[] = covers.map((c) => ({ chartId: c.chartId, vectors: v.r(c.emb) }));
      let top1 = 0, top3 = 0;
      const right: number[] = [], wrong: number[] = [];
      for (const f of finished) {
        const ranked = rankCharts(v.q(f.emb), refs);
        const r = rankOf(ranked, f.pair.id);
        if (r === 1) top1++;
        if (r !== null && r <= 3) top3++;
        right.push(ranked.find((x) => x.chartId === f.pair.id)!.score);
        wrong.push(ranked.find((x) => x.chartId !== f.pair.id)?.score ?? 0);
      }
      if (top1 > bestTop1) { bestTop1 = top1; bestVariant = v; }
      const scores = `${med(right).toFixed(2)} / ${med(wrong).toFixed(2)}`;
      matchTable.append(h('tr', {}, h('td', {}, v.name), h('td', {}, pct(top1, finished.length)), h('td', {}, pct(top3, finished.length)), h('td', {}, scores)));
      log.push(`${v.name}: top1 ${pct(top1, finished.length)}, top3 ${pct(top3, finished.length)}, median right ${med(right).toFixed(3)}, median best wrong ${med(wrong).toFixed(3)}, min right ${Math.min(...right).toFixed(3)}, max wrong ${Math.max(...wrong).toFixed(3)}`);
    }

    // Per-pair detail for the best method
    const refs: ChartVectors[] = covers.map((c) => ({ chartId: c.chartId, vectors: bestVariant.r(c.emb) }));
    const thumbOf = (id: string) => pairs.find((p) => p.id === id)?.coverThumb ?? extras.find((x) => x.id === id)?.thumb ?? '';
    const detail = h('div', { class: 'detail' });
    log.push(`Per pair (${bestVariant.name}): rank, right score, top score`);
    finished.forEach((f, i) => {
      const ranked = rankCharts(bestVariant.q(f.emb), refs);
      const r = rankOf(ranked, f.pair.id)!;
      log.push(`  pair ${i + 1}: rank ${r}, right ${ranked[r - 1].score.toFixed(3)}, top ${ranked[0].score.toFixed(3)}`);
      detail.append(h('div', { class: `row ${r === 1 ? 'good' : r <= 3 ? 'ok' : 'bad'}` },
        h('span', {}, `Pair ${i + 1}: right chart is #${r}`),
        h('img', { src: f.pair.finishedThumb!, alt: 'Finished piece' }),
        ...ranked.slice(0, 3).map((x) => h('figure', {}, h('img', { src: thumbOf(x.chartId), alt: 'Match' }), h('figcaption', {}, x.score.toFixed(2)))),
      ));
    });

    // ---- Text reading ----
    const textTable = h('table', {}, h('tr', {}, h('th', {}, 'Layout'), h('th', {}, 'Title words found'), h('th', {}, 'Designer words found'), h('th', {}, 'Title suggested right'), h('th', {}, 'Designer suggested right'), h('th', {}, 'Time per cover')));
    log.push('TEXT READING');
    for (const layout of ['auto', 'sparse'] as Layout[]) {
      const tRec: number[] = [], dRec: number[] = [];
      let tOk = 0, tN = 0, dOk = 0, dN = 0;
      const times: number[] = [];
      for (const c of covers) {
        const read = c.reads[layout];
        times.push(read.ms);
        if (!c.pair) continue;
        const sug: Suggestion = suggestTitleAndDesigner(read.lines);
        const tr = wordRecall(c.pair.title, read.text); if (tr !== null) tRec.push(tr);
        const dr = wordRecall(c.pair.designer, read.text); if (dr !== null) dRec.push(dr);
        const ts = suggestionMatches(c.pair.title, sug.title); if (ts !== null) { tN++; if (ts) tOk++; }
        const ds = suggestionMatches(c.pair.designer, sug.designer); if (ds !== null) { dN++; if (ds) dOk++; }
      }
      const avg = (xs: number[]) => (xs.length ? `${Math.round((100 * xs.reduce((a, b) => a + b, 0)) / xs.length)}%` : '–');
      textTable.append(h('tr', {}, h('td', {}, layout), h('td', {}, avg(tRec)), h('td', {}, avg(dRec)), h('td', {}, pct(tOk, tN)), h('td', {}, pct(dOk, dN)), h('td', {}, ms(med(times)))));
      log.push(`${layout}: title words ${avg(tRec)}, designer words ${avg(dRec)}, title suggestion ${pct(tOk, tN)}, designer suggestion ${pct(dOk, dN)}, median ${ms(med(times))}`);
    }
    const textDetail = h('details', {}, h('summary', {}, 'What was read on each cover'));
    covers.forEach((c, i) => {
      const s = suggestTitleAndDesigner(c.reads.sparse.lines);
      textDetail.append(h('div', { class: 'read' },
        h('strong', {}, c.pair ? `Pair ${i + 1}` : 'Extra cover'),
        h('p', {}, `Suggested title: “${s.title}” · designer: “${s.designer}”`),
        h('pre', {}, c.reads.sparse.text.trim() || '(no text found)')));
    });

    // ---- Speed and size ----
    const embTimes = [...covers.map((c) => c.emb.ms), ...finished.map((f) => f.emb.ms)];
    let sizes = '';
    try {
      const s = await (await fetch(new URL('asset-sizes.json', BASE))).json() as { total: number; totalGzip: number; byGroup: Record<string, number> };
      sizes = `${(s.total / 1e6).toFixed(1)} MB stored, about ${(s.totalGzip / 1e6).toFixed(1)} MB to download`;
      log.push(`DOWNLOAD: ${sizes}; ${Object.entries(s.byGroup).map(([k, v]) => `${k} ${(v / 1e6).toFixed(1)} MB`).join(', ')}`);
    } catch { sizes = 'unknown'; }
    const speed = [
      `Matching runs on: ${embedder.device === 'webgpu' ? 'graphics chip (WebGPU)' : 'processor (WebAssembly)'}, model ${dtype}`,
      `Model start-up: ${ms(embedder.loadMs)} · Text reader start-up: ${ms(readerLoad)}`,
      `Matching one photo (3 views): ${ms(med(embTimes))} median, ${ms(Math.max(...embTimes))} slowest`,
      `Opening one photo: ${ms(med(decodeTimes))} median`,
      `Download size: ${sizes}`,
      `Whole test: ${ms(performance.now() - t0)} for ${covers.length} covers and ${finished.length} finished pieces`,
    ];
    log.push('SPEED', ...speed);
    log.unshift(`Device: ${navigator.userAgent}`, `Standalone: ${matchMedia('(display-mode: standalone)').matches}`, `Self-similarity check: ${dot(covers[0].emb.cls[0], covers[0].emb.cls[0]).toFixed(3)}`);

    const report = log.join('\n');
    const reportBox = h('textarea', { readonly: true, rows: 10, 'aria-label': 'Report text' });
    reportBox.value = report;
    resultsEl.append(
      h('h2', {}, 'Matching'), matchTable, h('p', {}, `Details use “${bestVariant.name}”. Green: right chart first. Yellow: in top three.`), detail,
      h('h2', {}, 'Text reading'), textTable, textDetail,
      h('h2', {}, 'Speed and size'), h('ul', {}, ...speed.map((s) => h('li', {}, s))),
      h('h2', {}, 'Report to send back'),
      h('p', {}, 'This has numbers only — no pictures or text from the charts beyond what you typed.'),
      reportBox,
      h('button', { type: 'button', onclick: async () => {
        try { await navigator.clipboard.writeText(report); say('Report copied.'); }
        catch { reportBox.select(); say('Select the text above and copy it.'); }
      } }, 'Copy report'),
    );
    say('Done.');
  } catch (e) {
    say(`Something went wrong: ${(e as Error).message}`);
    console.error(e);
  } finally {
    embedder?.dispose();
    await reader?.dispose().catch(() => {});
    running = false;
  }
}

async function deviceInfo(): Promise<string[]> {
  const out = [`WebGPU: ${'gpu' in navigator ? 'available' : 'not available'}`];
  out.push(`Opened from Home Screen: ${matchMedia('(display-mode: standalone)').matches ? 'yes' : 'no'}`);
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota) out.push(`Storage allowed: about ${(est.quota / 1e9).toFixed(1)} GB`);
  } catch { /* not supported */ }
  return out;
}

function addPair() {
  pairs.push({ id: `pair-${++counter}`, title: '', designer: '' });
  renderPairs();
}

const info = h('ul', { class: 'info' });
deviceInfo().then((lines) => info.append(...lines.map((l) => h('li', {}, l))));

app.append(
  h('h1', {}, 'Stitch Library — test bench'),
  h('p', {}, 'Choose a chart cover and a photo of the finished piece for each pair. Typing the title and designer is optional; it lets the test score the text reading. Pictures stay on this phone and are forgotten when you close the page.'),
  info,
  pairsEl,
  h('button', { type: 'button', onclick: addPair }, 'Add a pair'),
  h('h2', {}, 'Extra covers (optional)'),
  h('p', {}, 'Covers without a finished piece make the test harder and more realistic.'),
  picker('Choose extra covers', true, async (files) => {
    for (const f of files) {
      try { extras.push({ id: `extra-${++counter}`, file: f, thumb: await thumb(f) }); } catch { /* skip unreadable */ }
    }
    renderExtras();
  }),
  extrasEl,
  h('h2', {}, 'Settings'),
  h('label', {}, 'Model size ',
    h('select', { id: 'dtype' }, h('option', { value: 'q8' }, 'Standard (24 MB)'), h('option', { value: 'q4f16' }, 'Small (13 MB)'))),
  h('label', {}, 'Run on ',
    h('select', { id: 'device' }, h('option', { value: 'auto' }, 'Best available'), h('option', { value: 'wasm' }, 'Processor only'))),
  h('button', { type: 'button', class: 'primary', onclick: run }, 'Run the test'),
  statusEl,
  resultsEl,
);
addPair();
addPair();
