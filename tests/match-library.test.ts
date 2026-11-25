import { describe, expect, it } from 'vitest';
import { MemoryLibrary } from '../src/backup/memory';
import { matchFiles, rankLibrary, syncVectors } from '../src/match/library';
import { isClearWinner, normalize } from '../src/match/rank';
import { MemoryVectorStore } from '../src/match/vectors';
import type { PortChart } from '../src/backup/port';

const v = (...xs: number[]) => normalize(Float32Array.from(xs));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const chart = (n: number, photos: string[] = []): PortChart => ({
  id: id(n), title: `C${n}`, designer: '', craft: '', recognizedText: '', notes: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  coverFileId: `cover${n}`, sourceFileIds: [`pdf${n}`],
  photos: photos.map((f, i) => ({ id: id(900 + n * 10 + i), fileId: f, kind: 'finished' as const, notes: '', createdAt: '2026-01-02T00:00:00Z' })),
});
const blob = { blob: new Blob(['x']), type: 'image/jpeg' };

// Made-up "pictures": each file id maps to a direction.
const fake: Record<string, Float32Array> = { cover1: v(1, 0, 0), cover2: v(0, 1, 0), photo2: v(0.2, 0.9, 0.3), cover3: v(0, 0, 1) };

async function setup() {
  const lib = new MemoryLibrary();
  await lib.addChart(chart(1), [{ id: 'cover1', ...blob }]);
  await lib.addChart(chart(2, ['photo2']), [{ id: 'cover2', ...blob }, { id: 'photo2', ...blob }]);
  return lib;
}

describe('matching against the library', () => {
  it('compares by cover and confirmed photos, never by chart pages or PDFs', () => {
    expect(matchFiles(chart(2, ['photo2']))).toEqual(['cover2', 'photo2']);
  });

  it('builds missing vectors once and forgets removed pictures', async () => {
    const lib = await setup();
    const store = new MemoryVectorStore();
    const calls: string[] = [];
    const embed = async (f: string) => (calls.push(f), [fake[f]]);
    expect(await syncVectors(lib, store, 'm', embed)).toEqual({ added: 3, removed: 0, failed: 0 });
    expect(await syncVectors(lib, store, 'm', embed)).toEqual({ added: 0, removed: 0, failed: 0 });
    expect(calls).toHaveLength(3);

    await lib.deletePhoto(id(2), (await lib.getChart(id(2)))!.photos[0].id);
    expect((await syncVectors(lib, store, 'm', embed)).removed).toBe(1);
    // a different model means everything is rebuilt
    expect((await syncVectors(lib, store, 'other', embed)).added).toBe(2);
  });

  it('keeps going past a picture that cannot be read, and can stop early', async () => {
    const lib = await setup();
    const store = new MemoryVectorStore();
    const r = await syncVectors(lib, store, 'm', async (f) => (f === 'cover1' ? null : [fake[f]]));
    expect(r.failed).toBe(1);
    const store2 = new MemoryVectorStore();
    let n = 0;
    const r2 = await syncVectors(lib, store2, 'm', async (f) => (n++, [fake[f]]), { shouldStop: () => n >= 1 });
    expect(r2.added).toBe(1);
  });

  it('ranks a finished piece first when it looks like a confirmed photo', async () => {
    const lib = await setup();
    const store = new MemoryVectorStore();
    await syncVectors(lib, store, 'm', async (f) => [fake[f]]);
    const ranked = await rankLibrary([v(0.25, 0.85, 0.35)], store, 'm');
    expect(ranked[0].chartId).toBe(id(2));
    expect(ranked).toHaveLength(2);
  });

  it('decides when one quick view is enough', () => {
    expect(isClearWinner([])).toBe(false);
    expect(isClearWinner([{ chartId: 'a', score: 0.75 }, { chartId: 'b', score: 0.5 }])).toBe(true);
    expect(isClearWinner([{ chartId: 'a', score: 0.75 }, { chartId: 'b', score: 0.72 }])).toBe(false);
    expect(isClearWinner([{ chartId: 'a', score: 0.55 }])).toBe(false);
    expect(isClearWinner([{ chartId: 'a', score: 0.7 }])).toBe(true);
  });
});
