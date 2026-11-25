// One place the app asks "which chart is this photo?". Keeps the model warm,
// keeps library vectors up to date in the background, and answers quickly:
//
// - On the graphics chip (WebGPU, available on the published https site) all
//   three views are checked at once; this takes about a second.
// - On the processor (slower), it first checks only the whole picture. If one
//   chart is clearly ahead, that is the answer; otherwise it checks the two
//   other views too. This roughly thirds the wait for clear matches.
// - The model starts loading the moment she taps "I finished one", while she
//   is still taking or choosing the photo.

import { library as defaultLibrary } from '../backup/adapter';
import type { LibraryPort } from '../backup/port';
import { loadToCanvas, releaseCanvas } from '../image/load';
import { Embedder } from './embedder';
import { matchFiles, rankLibrary, syncVectors } from './library';
import { DEFAULT_THRESHOLDS, isClearWinner, type Ranked } from './rank';
import { IdbVectorStore, vectorKey, type VectorStore } from './vectors';
import { VIEW_NAMES, type ViewName } from './views';

/** Changing the model, views or pooling must change this name so old vectors are rebuilt. */
export const MODEL_ID = 'dinov2s-q8-cls-v1';
const PHOTO_MAX_SIDE = 1024;

export interface MatchResult {
  ranked: Ranked[];
  /** Vectors of her photo (reused when she confirms, so it is never computed twice). */
  query: Float32Array[];
  likely: boolean;
  ms: number;
}

export class MatchService {
  private embedder: Promise<Embedder> | null = null;
  private syncing: Promise<void> | null = null;
  private busy = 0;
  private syncAgain = false;
  private listeners = new Set<(done: number, total: number) => void>();

  constructor(
    private port: LibraryPort = defaultLibrary,
    private store: VectorStore = new IdbVectorStore(),
    private base = new URL('./', location.href).href,
  ) {}

  /** Starts loading the model; safe to call many times. */
  warmUp(): Promise<Embedder> {
    if (!this.embedder) {
      this.embedder = Embedder.create(this.base, 'q8', 'auto');
      this.embedder.catch(() => (this.embedder = null));
    }
    return this.embedder;
  }

  private async embedBlob(blob: Blob, views: ViewName[]): Promise<Float32Array[]> {
    const e = await this.warmUp();
    const canvas = await loadToCanvas(blob, PHOTO_MAX_SIDE);
    try {
      return (await e.embed(canvas, views)).cls;
    } finally {
      releaseCanvas(canvas);
    }
  }

  /**
   * Makes sure every cover and confirmed photo has vectors. Runs quietly; any
   * search pauses it so her photo is never kept waiting.
   */
  refresh(): Promise<void> {
    if (this.syncing) {
      this.syncAgain = true;
      return this.syncing;
    }
    this.syncing = (async () => {
      do {
        this.syncAgain = false;
        await syncVectors(this.port, this.store, MODEL_ID, async (fileId) => {
          while (this.busy) await new Promise((r) => setTimeout(r, 300));
          const f = await this.port.getFile(fileId);
          return f ? this.embedBlob(f.blob, VIEW_NAMES) : null;
        }, { onProgress: (d, t) => this.listeners.forEach((l) => l(d, t)) });
      } while (this.syncAgain);
    })().finally(() => (this.syncing = null));
    return this.syncing;
  }

  /** Starts a quiet refresh only if some picture has no vectors yet (does not load the model otherwise). */
  async refreshIfNeeded(): Promise<void> {
    if (await this.missingCount()) await this.refresh();
  }

  private async missingCount(): Promise<number> {
    const have = new Set((await this.store.all(MODEL_ID)).map((r) => r.key));
    let n = 0;
    for (const c of await this.port.listCharts()) for (const f of matchFiles(c)) if (!have.has(vectorKey(MODEL_ID, f))) n++;
    return n;
  }

  /**
   * Ranks every chart for her photo. `onPrep` reports progress when charts
   * still need preparing first (for example right after a restore).
   */
  async find(photo: Blob, onPrep?: (done: number, total: number) => void): Promise<MatchResult> {
    const t0 = performance.now();
    this.busy++;
    try {
      const e = await this.warmUp();
      // Charts added since the last check need vectors first; usually none.
      await this.catchUp(onPrep);
      const canvas = await loadToCanvas(photo, PHOTO_MAX_SIDE);
      try {
        const fast = e.device === 'wasm';
        let views: ViewName[] = fast ? ['whole'] : VIEW_NAMES;
        let query = (await e.embed(canvas, views)).cls;
        let ranked = await rankLibrary(query, this.store, MODEL_ID);
        if (fast && !isClearWinner(ranked)) {
          const rest = VIEW_NAMES.filter((v) => !views.includes(v));
          query = [...query, ...(await e.embed(canvas, rest)).cls];
          views = VIEW_NAMES;
          ranked = await rankLibrary(query, this.store, MODEL_ID);
        }
        return { ranked, query, likely: !!ranked.length && ranked[0].score >= DEFAULT_THRESHOLDS.minScore, ms: performance.now() - t0 };
      } finally {
        releaseCanvas(canvas);
      }
    } finally {
      this.busy--;
    }
  }

  /** Computes vectors for pictures the cache doesn't have yet, without waiting for the background run. */
  private async catchUp(onPrep?: (done: number, total: number) => void) {
    if (!(await this.missingCount())) return;
    this.busy--; // let the sync run now: her answer depends on it
    if (onPrep) this.listeners.add(onPrep);
    try {
      await this.refresh();
    } finally {
      if (onPrep) this.listeners.delete(onPrep);
      this.busy++;
    }
  }

  /** After she confirms: remember the photo's vectors so the chart is easier to find next time. */
  async remember(chartId: string, fileId: string, query: Float32Array[]): Promise<void> {
    try {
      await this.store.put({ key: vectorKey(MODEL_ID, fileId), model: MODEL_ID, chartId, fileId, vectors: query });
    } catch {
      /* the background refresh will rebuild it */
    }
  }
}

let shared: MatchService | null = null;
export function matchService(): MatchService {
  return (shared ??= new MatchService());
}
