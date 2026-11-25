import { describe, expect, it } from 'vitest';
import { suggestTitleAndDesigner, type TextLine } from '../src/ocr/suggest';

const line = (text: string, height: number, top: number, confidence = 90): TextLine => ({ text, height, top, confidence });

describe('suggestTitleAndDesigner', () => {
  it('picks the biggest text as title and the "by" line as designer', () => {
    const s = suggestTitleAndDesigner([
      line('Counted Cross Stitch Chart', 20, 10),
      line('WINTER CARDINAL', 80, 60),
      line('Designed by Jane Smith', 24, 400),
      line('14 count Aida 140 x 98 stitches', 14, 600),
    ]);
    expect(s).toEqual({ title: 'Winter Cardinal', designer: 'Jane Smith' });
  });

  it('joins a title split over two lines of the same size', () => {
    const s = suggestTitleAndDesigner([
      line('Autumn', 70, 50),
      line('Harvest Sampler', 66, 130),
      line('© Lavender Lane Designs', 20, 500),
    ]);
    expect(s.title).toBe('Autumn Harvest Sampler');
    expect(s.designer).toBe('Lavender Lane Designs');
  });

  it('ignores low-confidence noise and descriptive words', () => {
    const s = suggestTitleAndDesigner([
      line('~~|||~~', 120, 0, 30),
      line('CROSS STITCH', 90, 10),
      line('Sea Glass', 60, 200),
    ]);
    expect(s.title).toBe('Sea Glass');
    expect(s.designer).toBe('');
  });

  it('returns empty suggestions when nothing was read', () => {
    expect(suggestTitleAndDesigner([])).toEqual({ title: '', designer: '' });
  });
});
