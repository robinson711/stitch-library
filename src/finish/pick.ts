// Small helpers for the "I finished one" choices (kept free of the screen so they can be tested).
import type { PortChart } from '../backup/port';
import type { Ranked } from '../match/rank';
import { foldText, words } from '../shared/text';

/** Charts whose title, designer, notes or recognised text contain every typed word. */
export function filterCharts(charts: PortChart[], query: string): PortChart[] {
  const q = words(query);
  if (!q.length) return [];
  return charts.filter((c) => {
    const hay = foldText([c.title, c.designer, c.notes, c.recognizedText].join(' '));
    return q.every((w) => hay.includes(w));
  });
}

/** The next choices after "No": the following ranked charts, skipping ones already shown. */
export function nextChoices(ranked: Ranked[], shown: Set<string>, n = 2): string[] {
  return ranked.filter((r) => !shown.has(r.chartId)).slice(0, n).map((r) => r.chartId);
}

export function chartName(c: PortChart): string {
  return c.title.trim() || 'Untitled chart';
}
