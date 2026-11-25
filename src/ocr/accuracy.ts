// Measures how well the text reader found the words the tester typed in.
import { similarity, words } from '../shared/text';

/** Share (0–1) of expected words that appear in the text that was read. Close spellings count. */
export function wordRecall(expected: string, readText: string): number | null {
  const want = words(expected).filter((w) => w.length >= 2);
  if (!want.length) return null;
  const have = new Set(words(readText));
  const haveList = [...have];
  let found = 0;
  for (const w of want) {
    if (have.has(w)) found++;
    else if (w.length >= 5 && haveList.some((h) => similarity(h, w) >= 0.8)) found++;
  }
  return found / want.length;
}

/** True when a suggestion is the same as the expected value, allowing small reading slips. */
export function suggestionMatches(expected: string, suggested: string): boolean | null {
  if (!words(expected).length) return null;
  return similarity(expected, suggested) >= 0.85;
}
