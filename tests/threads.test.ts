import { describe, expect, it } from 'vitest';
import { threadCount } from '../src/match/threads';

describe('threadCount', () => {
  it('uses one thread without cross-origin isolation', () => {
    expect(threadCount(undefined, false, 8)).toBe(1);
    expect(threadCount(4, false, 8)).toBe(1);
  });
  it('uses up to four threads when isolated', () => {
    expect(threadCount(undefined, true, 8)).toBe(4);
    expect(threadCount(undefined, true, 3)).toBe(3);
  });
  it('allows two threads even when the browser reports fewer cores', () => {
    expect(threadCount(undefined, true, 1)).toBe(2);
    expect(threadCount(undefined, true, 0)).toBe(2);
  });
  it('honours a smaller request', () => {
    expect(threadCount(2, true, 8)).toBe(2);
    expect(threadCount(16, true, 8)).toBe(4);
  });
});
