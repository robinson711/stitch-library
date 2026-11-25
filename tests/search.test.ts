import { describe, expect, it } from 'vitest';
import { searchCharts } from '../src/search/search';
import { cleanText, joinText } from '../src/ocr/clean';
import type { ChartRecord } from '../src/db/types';

let n = 0;
function chart(over: Partial<ChartRecord>): ChartRecord {
  n++;
  return {
    id: `id-${n}`, title: '', designer: '', craft: '', recognizedText: '', notes: '',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
    coverFileId: '', sourceFileIds: [], photos: [], ...over,
  };
}

const cardinal = chart({ title: 'Winter Cardinal', designer: 'Lavender Lane', recognizedText: 'WINTER CARDINAL\n14 count aida' });
const noel = chart({ title: 'Joyeux Noël', designer: 'Crème Brûlée Designs' });
const garden = chart({ title: 'Cottage Garden', notes: 'Gift for Mum, started in spring', recognizedText: 'Mill Hill beads' });
const sampler = chart({ title: 'Alphabet Sampler', designer: 'Cardinal Stitchery' });
const all = [cardinal, noel, garden, sampler];

describe('search', () => {
  it('returns everything for an empty search', () => {
    expect(searchCharts(all, '   ')).toEqual(all);
  });

  it('ignores capital letters and accents', () => {
    expect(searchCharts(all, 'NOEL')).toEqual([noel]);
    expect(searchCharts(all, 'creme brulee')).toEqual([noel]);
    expect(searchCharts(all, 'Brûlée')).toEqual([noel]);
  });

  it('finds the start of a word', () => {
    expect(searchCharts(all, 'cott')).toEqual([garden]);
  });

  it('searches notes and the words read on the cover', () => {
    expect(searchCharts(all, 'mum')).toEqual([garden]);
    expect(searchCharts(all, 'mill hill')).toEqual([garden]);
    expect(searchCharts(all, 'aida')).toEqual([cardinal]);
  });

  it('needs every typed word', () => {
    expect(searchCharts(all, 'winter garden')).toEqual([]);
    expect(searchCharts(all, 'winter lavender')).toEqual([cardinal]);
  });

  it('puts title matches before designer matches', () => {
    expect(searchCharts(all, 'cardinal')).toEqual([cardinal, sampler]);
  });

  it('forgives one wrong letter in longer words', () => {
    expect(searchCharts(all, 'cardinel')).toEqual([cardinal, sampler]);
    expect(searchCharts(all, 'mun')).toEqual([]); // short words must be exact or a word start
  });

  it('notices edits (uses the updated text)', () => {
    const c = chart({ title: 'Old Name' });
    expect(searchCharts([c], 'new')).toEqual([]);
    const edited = { ...c, title: 'New Name', updatedAt: '2027-01-01T00:00:00Z' };
    expect(searchCharts([edited], 'new')).toEqual([edited]);
  });
});

describe('cleaning read text', () => {
  const line = (text: string, confidence = 90) => ({ text, confidence, height: 10, top: 0 });

  it('keeps real lines and drops noise', () => {
    const text = cleanText([
      line('Winter Cardinal'),
      line('~ | ; ., ;\' :', 80),
      line('a e i o u l', 80),
      line('Lavender Lane', 40),
      line('14 count Aida'),
      line('Winter Cardinal'),
    ]);
    expect(text).toBe('Winter Cardinal\n14 count Aida');
  });

  it('joins text from several pages without repeats', () => {
    expect(joinText('A line\nB line', 'b LINE\nC line', '')).toBe('A line\nB line\nC line');
  });
});
