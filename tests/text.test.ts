import { describe, expect, it } from 'vitest';
import { foldText, words, similarity, editDistance } from '../src/shared/text';
import { wordRecall, suggestionMatches } from '../src/ocr/accuracy';

describe('foldText', () => {
  it('ignores case and accents', () => {
    expect(foldText('Crème BRÛLÉE')).toBe('creme brulee');
    expect(foldText('Ångström Café')).toBe('angstrom cafe');
    expect(foldText('Straße')).toBe('strasse');
  });
  it('unifies quotes and spaces', () => {
    expect(foldText('  Grandma’s   “Quilt” ')).toBe(`grandma's "quilt"`);
  });
});

describe('words and similarity', () => {
  it('splits into folded words', () => {
    expect(words('Hello, Wörld! 14-count')).toEqual(['hello', 'world', '14', 'count']);
  });
  it('measures edit distance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(similarity('Winter Cardinal', 'WINTER  CARDINAL')).toBe(1);
    expect(similarity('Winter Cardinal', 'Winter Cardlnal')).toBeGreaterThan(0.9);
  });
});

describe('text reading accuracy', () => {
  it('counts expected words found, allowing small slips in long words', () => {
    expect(wordRecall('Winter Cardinal', 'WINTER CARDLNAL by Jane')).toBe(1);
    expect(wordRecall('Winter Cardinal', 'Summer Robin')).toBe(0);
    expect(wordRecall('', 'anything')).toBeNull();
  });
  it('judges suggestions', () => {
    expect(suggestionMatches('Winter Cardinal', 'Winter Cardinal')).toBe(true);
    expect(suggestionMatches('Winter Cardinal', 'Winter')).toBe(false);
    expect(suggestionMatches('', 'x')).toBeNull();
  });
});
