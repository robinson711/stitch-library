import { describe, expect, it } from 'vitest';
import { chartName, filterCharts, nextChoices } from '../src/finish/pick';
import type { PortChart } from '../src/backup/port';

const c = (id: string, title: string, designer = '', recognizedText = ''): PortChart => ({
  id, title, designer, craft: '', recognizedText, notes: '', createdAt: '', updatedAt: '', coverFileId: '', sourceFileIds: [], photos: [],
});

describe('"I finished one" choices', () => {
  const charts = [c('1', 'Joyeux Noël', 'Lavender Lane'), c('2', 'Spring Garden', 'Ann', 'tulips and bees'), c('3', '')];

  it('finds charts by any word, ignoring case and accents', () => {
    expect(filterCharts(charts, 'noel').map((x) => x.id)).toEqual(['1']);
    expect(filterCharts(charts, 'LAVENDER joyeux').map((x) => x.id)).toEqual(['1']);
    expect(filterCharts(charts, 'bees').map((x) => x.id)).toEqual(['2']);
    expect(filterCharts(charts, '   ')).toEqual([]);
  });

  it('offers the next two best charts after "No"', () => {
    const ranked = ['a', 'b', 'c', 'd'].map((chartId, i) => ({ chartId, score: 1 - i / 10 }));
    expect(nextChoices(ranked, new Set(['a']))).toEqual(['b', 'c']);
    expect(nextChoices(ranked, new Set(['a', 'b', 'c']))).toEqual(['d']);
  });

  it('names untitled charts plainly', () => {
    expect(chartName(charts[2])).toBe('Untitled chart');
  });
});
