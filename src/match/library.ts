// Matching a photo against the whole library: which pictures each chart is
// compared by, keeping their vectors up to date, and ranking.

import type { LibraryPort, PortChart } from '../backup/port';
import { rankCharts, type ChartVectors, type Ranked } from './rank';
import { vectorKey, type VectorStore } from './vectors';

/** The cover plus every photo she has confirmed belongs to the chart. */
export function matchFiles(chart: PortChart): string[] {
  return [chart.coverFileId, ...chart.photos.map((p) => p.fileId)].filter(Boolean);
}

export type EmbedFile = (fileId: string) => Promise<Float32Array[] | null>;

export interface SyncResult {
  added: number;
  removed: number;
  failed: number;
}

/**
 * Brings the vector cache in line with the library: computes vectors that are
 * missing (new charts, restored backups, a new model) and forgets ones whose
 * picture is gone. Stops early, keeping what is done, when `shouldStop` says so.
 */
export async function syncVectors(
  port: LibraryPort,
  store: VectorStore,
  model: string,
  embed: EmbedFile,
  opts: { shouldStop?: () => boolean; onProgress?: (done: number, total: number) => void } = {},
): Promise<SyncResult> {
  const charts = await port.listCharts();
  const have = new Map((await store.all(model)).map((r) => [r.key, r]));
  const wanted = new Map<string, { chartId: string; fileId: string }>();
  for (const c of charts) for (const f of matchFiles(c)) wanted.set(vectorKey(model, f), { chartId: c.id, fileId: f });

  const stale = [...have.keys()].filter((k) => !wanted.has(k));
  await store.delete(stale);

  const todo = [...wanted].filter(([k]) => !have.has(k));
  const res: SyncResult = { added: 0, removed: stale.length, failed: 0 };
  let n = 0;
  for (const [key, { chartId, fileId }] of todo) {
    if (opts.shouldStop?.()) break;
    let vectors: Float32Array[] | null = null;
    try {
      vectors = await embed(fileId);
    } catch {
      vectors = null;
    }
    if (vectors?.length) {
      await store.put({ key, model, chartId, fileId, vectors });
      res.added++;
    } else res.failed++;
    opts.onProgress?.(++n, todo.length);
  }
  return res;
}

/** Ranks every chart that has at least one vector. */
export async function rankLibrary(query: Float32Array[], store: VectorStore, model: string, onlyCharts?: Set<string>): Promise<Ranked[]> {
  const byChart = new Map<string, ChartVectors>();
  for (const r of await store.all(model)) {
    if (onlyCharts && !onlyCharts.has(r.chartId)) continue;
    let cv = byChart.get(r.chartId);
    if (!cv) byChart.set(r.chartId, (cv = { chartId: r.chartId, vectors: [] }));
    cv.vectors.push(...r.vectors);
  }
  return rankCharts(query, [...byChart.values()]);
}
