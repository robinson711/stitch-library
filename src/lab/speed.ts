// Speed check: times the image model in several set-ups on this phone, with a
// made-up picture, so no photos are needed. One button, then a numbers-only
// report. On the Mac's test server the report is also sent back to the Mac.
import './lab.css';
import { h, clear } from '../shared/dom';
import { Embedder, type Embedding } from '../match/embedder';
import { dot } from '../match/rank';
import type { Device, Dtype, OrtBuild } from '../match/embed.worker';

const BASE = new URL('./', location.href).href;

interface Setup {
  name: string;
  device: Device;
  dtype: Dtype;
  build: OrtBuild;
  threads: number;
}

interface Result {
  setup: Setup;
  ok: boolean;
  error?: string;
  loadMs?: number;
  firstMs?: number;
  runMs?: number;
  oneViewMs?: number;
  threads?: number;
  agree?: number;
}

const app = document.getElementById('app')!;
const statusEl = h('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
const out = h('section', { class: 'results', 'aria-label': 'Results' });
const say = (t: string) => (statusEl.textContent = t);
const s = (ms?: number) => (ms === undefined ? '–' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

async function webgpuAvailable(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try { return !!(await gpu.requestAdapter()); } catch { return false; }
}

async function hasFullModel(): Promise<boolean> {
  try {
    const r = await fetch(new URL('models/Xenova/dinov2-small/onnx/model.onnx', BASE), { method: 'HEAD' });
    return r.ok;
  } catch { return false; }
}

function setups(isolated: boolean, gpu: boolean, full: boolean): Setup[] {
  const list: Setup[] = [
    { name: 'Processor, Standard, 1 core', device: 'wasm', dtype: 'q8', build: 'plain', threads: 1 },
  ];
  if (full) list.push({ name: 'Processor, Full, 1 core', device: 'wasm', dtype: 'fp32', build: 'plain', threads: 1 });
  if (isolated) {
    list.push({ name: 'Processor, Standard, 4 cores', device: 'wasm', dtype: 'q8', build: 'plain', threads: 4 });
    if (full) list.push({ name: 'Processor, Full, 4 cores', device: 'wasm', dtype: 'fp32', build: 'plain', threads: 4 });
  }
  if (gpu) {
    if (full) list.push({ name: 'Graphics chip, Full', device: 'webgpu', dtype: 'fp32', build: 'asyncify', threads: 1 });
    list.push({ name: 'Graphics chip, Small', device: 'webgpu', dtype: 'q4f16', build: 'asyncify', threads: 1 });
  }
  return list;
}

/** Plain JavaScript arithmetic, to tell a slow phone (e.g. Low Power Mode) from a slow model. */
function calibrate(): number {
  const t0 = performance.now();
  let x = 0.5;
  for (let i = 0; i < 50_000_000; i++) x = x * 1.0000001 + 0.0000001;
  const ms = performance.now() - t0;
  if (x === 42) console.log(x); // keep the loop from being optimised away
  return ms;
}

/** A made-up, detailed picture (stripes, blocks, circles), the same every time. */
function testPicture(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 1200;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#f3efe4';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `hsl(${Math.floor(rnd() * 360)} 60% ${30 + Math.floor(rnd() * 40)}%)`;
    const x = rnd() * c.width, y = rnd() * c.height, r = 10 + rnd() * 90;
    if (i % 3) g.fillRect(x, y, r, r * (0.5 + rnd()));
    else { g.beginPath(); g.arc(x, y, r / 2, 0, Math.PI * 2); g.fill(); }
  }
  for (let y = 0; y < c.height; y += 24) {
    g.fillStyle = y % 48 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)';
    g.fillRect(0, y, c.width, 12);
  }
  return c;
}

function agreement(a: Embedding, b: Embedding): number {
  let worst = 1;
  for (let i = 0; i < a.cls.length; i++) worst = Math.min(worst, dot(a.cls[i], b.cls[i]));
  return worst;
}

async function measure(setup: Setup, pic: HTMLCanvasElement, reference: Embedding | null): Promise<{ r: Result; emb?: Embedding }> {
  let e: Embedder | null = null;
  try {
    e = await Embedder.create(BASE, setup.dtype, setup.device, { build: setup.build, threads: setup.threads });
    const r: Result = { setup, ok: true, loadMs: e.loadMs, threads: e.threads };
    const first = await e.embed(pic);
    r.firstMs = first.ms;
    // Repeat until three runs or 30 seconds, whichever comes first.
    const runs: number[] = [];
    const t0 = performance.now();
    while (runs.length < 3 && performance.now() - t0 < 30_000) runs.push((await e.embed(pic)).ms);
    runs.sort((a, b) => a - b);
    r.runMs = runs[Math.floor(runs.length / 2)];
    r.oneViewMs = (await e.embed(pic, ['whole'])).ms;
    if (reference) r.agree = agreement(reference, first);
    return { r, emb: first };
  } catch (err) {
    return { r: { setup, ok: false, error: String((err as Error)?.message ?? err).slice(0, 160) } };
  } finally {
    e?.dispose();
  }
}

function report(results: Result[], head: string[]): string {
  const lines = [...head, 'SETUPS (matching one photo = 3 views)'];
  for (const r of results) {
    if (!r.ok) { lines.push(`${r.setup.name}: FAILED – ${r.error}`); continue; }
    lines.push(`${r.setup.name}: one photo ${s(r.runMs)} (first ${s(r.firstMs)}), whole picture only ${s(r.oneViewMs)}, start-up ${s(r.loadMs)}, threads ${r.threads}${r.agree !== undefined ? `, agrees ${r.agree.toFixed(3)}` : ''}`);
  }
  const done = results.filter((r) => r.ok && r.runMs !== undefined).sort((a, b) => a.runMs! - b.runMs!);
  if (done.length) lines.push(`FASTEST: ${done[0].setup.name}, ${s(done[0].runMs)} per photo`);
  return lines.join('\n');
}

/** True when the Mac's test server received the report. */
async function send(text: string): Promise<boolean> {
  try {
    const r = await fetch(new URL('__speed-report', BASE), { method: 'POST', body: text, headers: { 'Content-Type': 'text/plain' } });
    return r.status === 204;
  } catch { return false; } // only the Mac's test server listens
}

/**
 * On the live site (GitHub Pages) several cores need the app's service worker,
 * which adds the cross-origin isolation headers. Installs it (a one-time
 * download of the app's files), then reloads once and starts the check.
 */
async function isolateFirst(): Promise<boolean> {
  if (crossOriginIsolated || !isSecureContext || !('serviceWorker' in navigator) || location.hostname === 'localhost') return false;
  try {
    if (sessionStorage.getItem('stitch-speed-reloaded')) return false;
  } catch { /* private mode: carry on */ }
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    navigator.serviceWorker.addEventListener('message', (e) => {
      const m = e.data as { type?: string; done?: number; total?: number };
      if (m?.type === 'stitch-offline-progress' && m.total) say(`Getting ready (one time only)… ${Math.round((100 * (m.done ?? 0)) / m.total)}%`);
    });
    say('Getting ready (one time only)…');
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
        if (reg.active) resolve();
      });
    }
    try { sessionStorage.setItem('stitch-speed-reloaded', '1'); } catch { /* fine */ }
    location.replace(`${location.pathname}?run`);
    return true;
  } catch {
    return false;
  }
}

let running = false;
async function run() {
  if (running) return;
  running = true;
  if (await isolateFirst()) return;
  clear(out);
  const isolated = crossOriginIsolated === true;
  const gpu = await webgpuAvailable();
  const head = [
    `Device: ${navigator.userAgent}`,
    `Secure (https): ${isSecureContext} · Several cores allowed: ${isolated} · Cores reported: ${navigator.hardwareConcurrency} · Graphics chip (WebGPU): ${gpu}`,
    `Standalone: ${matchMedia('(display-mode: standalone)').matches}`,
  ];
  const full = await hasFullModel();
  say('Working… warming up');
  head.push(`Plain arithmetic check: ${s(calibrate())}`);
  const list = setups(isolated, gpu, full);
  const results: Result[] = [];
  const box = h('textarea', { readonly: true, rows: 12, 'aria-label': 'Report text' });
  const pic = testPicture();
  let sent = false;
  let reference: Embedding | null = null;
  out.append(h('h2', {}, 'Report'), box,
    h('button', { type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(box.value); say('Report copied.'); }
      catch { box.select(); say('Select the text above and copy it.'); }
    } }, 'Copy report'));
  for (const [i, setup] of list.entries()) {
    say(`Working… test ${i + 1} of ${list.length}: ${setup.name}. Please keep this screen open.`);
    const { r, emb } = await measure(setup, pic, reference);
    // If the very first set-up can't even start, the page is probably out of
    // date (the test server was rebuilt): stop and ask for a reload.
    if (i === 0 && !r.ok && /could not start/.test(r.error ?? '')) {
      results.push(r);
      box.value = report(results, head);
      say('This page is out of date. Please reload it (pull down, or press Reload), then tap Start again.');
      running = false;
      return;
    }
    // Agreement is measured against the first Standard result.
    if (!reference && emb && setup.dtype === 'q8') reference = emb;
    results.push(r);
    box.value = report(results, head);
    sent = await send(box.value);
  }
  say(sent ? 'Done. Thank you! The results were sent. You can close this page.' : 'Done. Thank you! Tap “Copy report” below, then paste it into the chat.');
  running = false;
}

app.append(
  h('h1', {}, 'Speed check'),
  h('p', {}, 'This times picture matching on this phone in a few different ways. It uses a made-up picture, so you don’t need any photos. It takes about five minutes. Please keep the screen on and this page open until it says Done.'),
  h('button', { type: 'button', class: 'primary', onclick: run }, 'Start the speed check'),
  statusEl,
  out,
);
if (new URLSearchParams(location.search).has('run')) run();
