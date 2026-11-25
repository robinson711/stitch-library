// Ranks charts by how close a photo is to each chart's cover and confirmed photos.
// Vectors are L2-normalised, so the dot product is the cosine similarity
// (1 = identical, 0 = unrelated) and "closest distance" is the highest score.

export interface ChartVectors {
  chartId: string;
  /** One vector per view of the cover and each confirmed photo. */
  vectors: Float32Array[];
}

export interface Ranked {
  chartId: string;
  score: number;
}

export function normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const n = Math.sqrt(sum) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error('Vector sizes differ');
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Best score per chart: the closest pair among all query views and all chart vectors. */
export function rankCharts(query: Float32Array[], charts: ChartVectors[]): Ranked[] {
  const out: Ranked[] = [];
  for (const c of charts) {
    let best = -Infinity;
    for (const q of query) for (const v of c.vectors) best = Math.max(best, dot(q, v));
    if (best > -Infinity) out.push({ chartId: c.chartId, score: best });
  }
  return out.sort((a, b) => b.score - a.score || a.chartId.localeCompare(b.chartId));
}

export type Confidence = 'likely' | 'unsure' | 'none';

export interface Thresholds {
  /** Below this the best match is not shown as "Is this the chart?"; search is offered instead. */
  minScore: number;
}

/** Phase 1 measures real scores to set this. Until then, a cautious default. */
export const DEFAULT_THRESHOLDS: Thresholds = { minScore: 0.35 };

export function confidence(ranked: Ranked[], t: Thresholds = DEFAULT_THRESHOLDS): Confidence {
  if (!ranked.length) return 'none';
  return ranked[0].score >= t.minScore ? 'likely' : 'unsure';
}

/** 1-based position of the right chart, or null if it is missing. */
export function rankOf(ranked: Ranked[], chartId: string): number | null {
  const i = ranked.findIndex((r) => r.chartId === chartId);
  return i < 0 ? null : i + 1;
}
