import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { fieldsFor, statusOf, withStatus } from '../src/photos/status';
import { MemoryLibrary } from '../src/backup/memory';
import { readBackup, writeBackup } from '../src/backup/zip';
import { applyRestore, prepareRestore } from '../src/backup/restore';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const jpg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0])], { type: 'image/jpeg' });

describe('three photo statuses', () => {
  it('maps In Progress, Finished and Completed to the backup fields', () => {
    expect(fieldsFor('progress')).toEqual({ kind: 'progress' });
    expect(fieldsFor('completed')).toEqual({ kind: 'finished', stage: 'completed' });
    expect(fieldsFor('finished')).toEqual({ kind: 'finished' });
    expect(statusOf({ kind: 'finished' })).toBe('finished'); // photos saved before this change
    expect(statusOf({ kind: 'finished', stage: 'completed' })).toBe('completed');
    expect(statusOf({ kind: 'progress', stage: 'completed' })).toBe('progress');
    expect(withStatus({ kind: 'finished' as const, stage: 'completed' as const, notes: 'x' }, 'finished')).toEqual({ kind: 'finished', notes: 'x' });
  });

  it('keeps "Completed" through a backup and restore', async () => {
    const lib = new MemoryLibrary();
    await lib.addChart({
      id: id(1), title: 'A', designer: '', craft: '', recognizedText: '', notes: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      coverFileId: id(101), sourceFileIds: [],
      photos: [
        { id: id(301), fileId: id(401), kind: 'finished', stage: 'completed', notes: '', createdAt: '2026-02-01T00:00:00Z' },
        { id: id(302), fileId: id(402), kind: 'finished', notes: '', createdAt: '2026-03-01T00:00:00Z' },
      ],
    }, [101, 401, 402].map((n) => ({ id: id(n), blob: jpg(), type: 'image/jpeg' })));
    const backup = await readBackup((await writeBackup(lib)).blob);
    const [s, f] = backup.library.charts[0].photos;
    expect(s).toMatchObject({ kind: 'finished', stage: 'completed' });
    expect('stage' in f).toBe(false); // plain finished photos look exactly as before
    const dest = new MemoryLibrary();
    await applyRestore(dest, backup, await prepareRestore(dest, backup));
    expect((await dest.listCharts())[0].photos.map(statusOf)).toEqual(['completed', 'finished']);
  });

  it('ignores a stage it does not know instead of refusing the backup', async () => {
    const lib = JSON.stringify({ format: 'stitch-library', version: 1, exportedAt: '2026-11-25T00:00:00Z', charts: [{
      id: id(1), title: 'A', designer: '', craft: '', recognizedText: '', notes: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      cover: `files/${id(101)}.jpg`, source: [],
      photos: [{ id: id(301), file: `files/${id(401)}.jpg`, kind: 'finished', stage: 'blocked', notes: '', createdAt: '2026-02-01T00:00:00Z' }],
    }] });
    const head = new Uint8Array([0xff, 0xd8, 0xff, 0]);
    const zip = zipSync({ 'library.json': strToU8(lib), [`files/${id(101)}.jpg`]: head, [`files/${id(401)}.jpg`]: head });
    const r = await readBackup(new Blob([zip as BlobPart]));
    expect(r.library.charts[0].photos[0]).not.toHaveProperty('stage');
  });
});
