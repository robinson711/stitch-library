import { describe, expect, it } from 'vitest';
import { normalize, dot, rankCharts, rankOf, confidence } from '../src/match/rank';

const v = (...xs: number[]) => normalize(Float32Array.from(xs));

describe('match ranking', () => {
  it('normalises vectors so a vector matches itself with score 1', () => {
    const a = v(3, 4);
    expect(dot(a, a)).toBeCloseTo(1, 6);
  });

  it('ranks by closest vector, using the best of all views and photos', () => {
    const ranked = rankCharts([v(1, 0, 0)], [
      { chartId: 'far', vectors: [v(0, 1, 0)] },
      { chartId: 'near', vectors: [v(0, 0, 1), v(0.9, 0.1, 0)] }, // confirmed photo is close
      { chartId: 'mid', vectors: [v(0.6, 0.4, 0)] },
    ]);
    expect(ranked.map((r) => r.chartId)).toEqual(['near', 'mid', 'far']);
    expect(rankOf(ranked, 'mid')).toBe(2);
    expect(rankOf(ranked, 'missing')).toBeNull();
  });

  it('uses every query view', () => {
    const ranked = rankCharts([v(0, 1), v(1, 0)], [{ chartId: 'a', vectors: [v(1, 0)] }]);
    expect(ranked[0].score).toBeCloseTo(1, 6);
  });

  it('is stable for ties and skips charts with no vectors', () => {
    const ranked = rankCharts([v(1, 0)], [
      { chartId: 'b', vectors: [v(1, 0)] },
      { chartId: 'a', vectors: [v(1, 0)] },
      { chartId: 'empty', vectors: [] },
    ]);
    expect(ranked.map((r) => r.chartId)).toEqual(['a', 'b']);
  });

  it('reports confidence for offering search instead', () => {
    expect(confidence([])).toBe('none');
    expect(confidence([{ chartId: 'a', score: 0.9 }])).toBe('likely');
    expect(confidence([{ chartId: 'a', score: 0.1 }])).toBe('unsure');
  });

  it('rejects vectors of different sizes', () => {
    expect(() => dot(v(1, 0), v(1, 0, 0))).toThrow();
  });
});
