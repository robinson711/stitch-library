// Text helpers shared by search, text-reading checks and suggestions.

const SPECIAL: Record<string, string> = {
  ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', ı: 'i', þ: 'th',
  '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-',
};

/** Lowercase, remove accents, unify quotes and collapse spaces. "Crème BRÛLÉE" -> "creme brulee". */
export function foldText(input: string): string {
  let s = input.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
  s = s.replace(/[ßæœøđłıþ’‘“”–—]/g, (c) => SPECIAL[c] ?? c);
  return s.replace(/\s+/g, ' ').trim();
}

/** Folded words made of letters or digits, e.g. "Hello, World!" -> ["hello", "world"]. */
export function words(input: string): string[] {
  return foldText(input).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Levenshtein edit distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** 1 = identical after folding, 0 = nothing alike. */
export function similarity(a: string, b: string): number {
  const fa = words(a).join(' ');
  const fb = words(b).join(' ');
  const len = Math.max(fa.length, fb.length);
  if (!len) return 1;
  return 1 - editDistance(fa, fb) / len;
}
