// Turns the lines read from a picture into tidy text for search. Text reading
// on a photo also "reads" stitches, fabric and shadows as random letters;
// those lines have low confidence and few real words, so they are dropped.
import type { TextLine } from './suggest';

const MIN_CONFIDENCE = 55;

function realWords(text: string): string[] {
  // A real word: two or more letters, or a number (sizes, counts, codes).
  return text.match(/\p{L}{2,}|\p{N}+/gu) ?? [];
}

export function isNoise(line: TextLine): boolean {
  const text = line.text.trim();
  if (text.length < 2 || line.confidence < MIN_CONFIDENCE) return true;
  const visible = text.replace(/\s/g, '');
  const kept = realWords(text).join('');
  // Mostly symbols or one-letter fragments: noise.
  return kept.length / visible.length < 0.6;
}

/** Clean text, one line per kept line, ready to store in recognizedText. */
export function cleanText(lines: TextLine[]): string {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (isNoise(l)) continue;
    const t = l.text.replace(/\s+/g, ' ').trim();
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.join('\n');
}

/** Joins text from several pictures or pages, skipping repeated lines. */
export function joinText(...parts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts)
    for (const line of p.split('\n')) {
      const t = line.trim();
      if (!t || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      out.push(t);
    }
  return out.join('\n');
}
