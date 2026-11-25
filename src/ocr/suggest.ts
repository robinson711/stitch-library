// Suggests a title and designer from the lines of text read on a chart cover.
// Simple, explainable rules: the title is usually the biggest text; the
// designer is usually introduced by "by", "designed by", "©" or a studio word.

import { foldText, words } from '../shared/text';

export interface TextLine {
  text: string;
  /** Typical letter height in pixels. */
  height: number;
  /** Top edge in pixels, used to join titles split over two lines. */
  top: number;
  /** 0–100 as reported by the text reader. */
  confidence: number;
}

export interface Suggestion {
  title: string;
  designer: string;
}

const DESIGNER_PREFIX = /^(?:©|\(c\)|copyright|designed\s+by|design\s+by|stitched\s+by|charted\s+by|by)\s*[:\-]?\s*/i;
const DESIGNER_HINT = /(©|\(c\)|\bcopyright\b|\bdesigned by\b|\bdesign by\b|\bby\s+\p{Lu}|\bdesigns?\b|\bstudio\b|\bneedlework\b|\bstitchery\b|\bneedleart\b)/iu;

// Words that describe the product rather than name it.
const NOT_TITLE = new Set([
  'cross', 'stitch', 'counted', 'chart', 'charts', 'pattern', 'patterns', 'kit', 'needlepoint', 'quilt',
  'quilting', 'aida', 'evenweave', 'linen', 'count', 'ct', 'dmc', 'anchor', 'floss', 'stitches', 'size',
  'design', 'area', 'fabric', 'colors', 'colours', 'threads', 'thread', 'includes', 'instructions',
  'leaflet', 'www', 'com', 'inches', 'cm', 'mm', 'x', 'w', 'h', 'and', 'the', 'of', 'for', 'on', 'with',
]);

function letterShare(s: string): number {
  const letters = s.match(/\p{L}/gu)?.length ?? 0;
  const visible = s.replace(/\s/g, '').length;
  return visible ? letters / visible : 0;
}

function looksDescriptive(text: string): boolean {
  const w = words(text);
  if (!w.length) return true;
  const meaningful = w.filter((x) => !NOT_TITLE.has(x) && !/^\d+$/.test(x));
  return meaningful.length === 0 || /\b(www\.|https?:|@|\.com\b)/i.test(text);
}

function tidy(text: string): string {
  let s = text.replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}!?'")]+$/gu, '').trim();
  // Covers are often in capitals; Title Case is easier to read on the review screen.
  const letters = s.match(/\p{L}/gu) ?? [];
  const upper = s.match(/\p{Lu}/gu) ?? [];
  if (letters.length >= 4 && upper.length / letters.length > 0.8) {
    s = s.toLowerCase().replace(/(^|[\s\-'"(])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());
  }
  return s;
}

export function suggestTitleAndDesigner(lines: TextLine[]): Suggestion {
  const usable = lines
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text.length >= 2 && l.confidence >= 45 && letterShare(l.text) >= 0.5);

  let designer = '';
  let designerLine: TextLine | undefined;
  for (const l of usable) {
    if (DESIGNER_HINT.test(l.text)) {
      const name = tidy(l.text.replace(DESIGNER_PREFIX, ''));
      if (words(name).length) {
        designer = name;
        designerLine = l;
        break;
      }
    }
  }

  const candidates = usable.filter((l) => l !== designerLine && !looksDescriptive(l.text));
  if (!candidates.length) return { title: '', designer };

  const biggest = candidates.reduce((a, b) => (b.height > a.height ? b : a));
  // Join neighbouring lines of nearly the same size (a title split over two lines).
  const sameSize = candidates
    .filter((l) => Math.abs(l.height - biggest.height) <= biggest.height * 0.18)
    .sort((a, b) => a.top - b.top);
  const group: TextLine[] = [biggest];
  const idx = sameSize.indexOf(biggest);
  for (let i = idx - 1; i >= 0; i--) {
    if (group[0].top - sameSize[i].top <= biggest.height * 2.6) group.unshift(sameSize[i]);
    else break;
  }
  for (let i = idx + 1; i < sameSize.length; i++) {
    if (sameSize[i].top - group[group.length - 1].top <= biggest.height * 2.6) group.push(sameSize[i]);
    else break;
  }
  const title = tidy(group.slice(0, 3).map((l) => l.text).join(' '));
  return { title, designer: foldText(designer) === foldText(title) ? '' : designer };
}
