// Search across titles, designers, notes and the words read on covers and pages.
// Capital letters and accents never matter ("noel" finds "Noël"). Every word
// she types must appear somewhere; a word can be the start of a longer word
// ("card" finds "Cardinal"). Longer words also forgive one wrong letter,
// because text read from a photo is sometimes a letter off.
import { editDistance, words } from '../shared/text';
import type { ChartRecord } from '../db/types';

const FIELDS = [
  { key: 'title', weight: 4 },
  { key: 'designer', weight: 3 },
  { key: 'notes', weight: 2 },
  { key: 'recognizedText', weight: 1 },
] as const;

interface Indexed {
  stamp: string;
  fields: { weight: number; words: string[] }[];
}

const cache = new Map<string, Indexed>();

function indexOf(chart: ChartRecord): Indexed {
  const hit = cache.get(chart.id);
  if (hit && hit.stamp === chart.updatedAt) return hit;
  const built: Indexed = {
    stamp: chart.updatedAt,
    fields: FIELDS.map((f) => ({ weight: f.weight, words: [...new Set(words(chart[f.key] ?? ''))] })),
  };
  cache.set(chart.id, built);
  return built;
}

/** How well one typed word matches a word in the library: 3 exact, 2 start of word, 1 one letter off, 0 none. */
function wordScore(typed: string, word: string): number {
  if (word === typed) return 3;
  if (word.startsWith(typed)) return 2;
  if (typed.length >= 5 && Math.abs(word.length - typed.length) <= 1 && editDistance(typed, word) <= 1) return 1;
  return 0;
}

/** Score of one chart for the typed words, or 0 if some word is missing. */
export function scoreChart(chart: ChartRecord, typed: string[]): number {
  const idx = indexOf(chart);
  let total = 0;
  for (const t of typed) {
    let best = 0;
    for (const f of idx.fields)
      for (const w of f.words) {
        const s = wordScore(t, w);
        if (s) best = Math.max(best, s * f.weight);
      }
    if (!best) return 0;
    total += best;
  }
  return total;
}

/** Charts matching the search, best first. An empty search returns all charts as given. */
export function searchCharts(charts: ChartRecord[], query: string): ChartRecord[] {
  const typed = [...new Set(words(query))];
  if (!typed.length) return charts;
  return charts
    .map((c, i) => ({ c, i, s: scoreChart(c, typed) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}
