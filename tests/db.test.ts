import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import {
  openLibrary, listCharts, getChart, getFile, getThumb, saveNewChart, updateChart, deleteChart,
  addPhoto, deletePhoto, restoreBatch, fileIdsOf, explainStorageError, DB_VERSION, UPGRADES,
} from '../src/db/library';
import { newId, nowStamp } from '../src/db/stamp';
import type { ChartRecord, FileRecord } from '../src/db/types';

let n = 0;
const freshDb = () => openLibrary(`test-${++n}`);
const file = (type = 'image/jpeg'): FileRecord => ({ id: newId(), blob: new Blob(['x'], { type }), type });

function chart(over: Partial<ChartRecord> = {}): ChartRecord {
  const now = nowStamp();
  return {
    id: newId(), title: 'Winter Cardinal', designer: 'Lavender Lane', craft: 'cross-stitch',
    recognizedText: 'winter cardinal', notes: '', createdAt: now, updatedAt: now,
    coverFileId: '', sourceFileIds: [], photos: [], ...over,
  };
}

describe('dates and ids', () => {
  it('uses the backup date format with no fractional seconds', () => {
    expect(nowStamp(new Date('2026-03-04T05:06:07.890Z'))).toBe('2026-03-04T05:06:07Z');
    expect(nowStamp()).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  });
  it('makes lowercase UUIDs', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('library storage', () => {
  it('saves a chart with its cover, pages and thumbnail together', async () => {
    const db = await freshDb();
    const cover = file();
    const pdf = file('application/pdf');
    const c = chart({ coverFileId: cover.id, sourceFileIds: [pdf.id] });
    await saveNewChart(c, [cover, pdf], new Blob(['t']), db);
    expect(await getChart(c.id, db)).toEqual(c);
    expect((await getFile(pdf.id, db))?.type).toBe('application/pdf');
    expect(await getThumb(c.id, db)).toBeDefined();
  });

  it('lists newest first', async () => {
    const db = await freshDb();
    const a = chart({ createdAt: '2026-01-01T00:00:00Z' });
    const b = chart({ createdAt: '2026-02-01T00:00:00Z' });
    await saveNewChart(a, [], undefined, db);
    await saveNewChart(b, [], undefined, db);
    expect((await listCharts(db)).map((c) => c.id)).toEqual([b.id, a.id]);
  });

  it('refuses to save the same chart twice and leaves no new files behind', async () => {
    const db = await freshDb();
    const c = chart();
    await saveNewChart(c, [], undefined, db);
    const extra = file();
    await expect(saveNewChart(c, [extra], undefined, db)).rejects.toThrow();
    expect(await getFile(extra.id, db)).toBeUndefined();
  });

  it('updates details, sets updatedAt and removes files no longer used', async () => {
    const db = await freshDb();
    const page1 = file();
    const page2 = file();
    const c = chart({ updatedAt: '2020-01-01T00:00:00Z', sourceFileIds: [page1.id] });
    await saveNewChart(c, [page1], undefined, db);
    const saved = await updateChart({ ...c, title: 'Summer Robin', sourceFileIds: [page2.id] }, [page2], undefined, db);
    expect(saved.updatedAt > c.updatedAt).toBe(true);
    expect((await getChart(c.id, db))?.title).toBe('Summer Robin');
    expect(await getFile(page1.id, db)).toBeUndefined();
    expect(await getFile(page2.id, db)).toBeDefined();
  });

  it('deletes a chart with every file it used', async () => {
    const db = await freshDb();
    const cover = file();
    const c = chart({ coverFileId: cover.id });
    await saveNewChart(c, [cover], new Blob(['t']), db);
    const photoFile = file();
    await addPhoto(c.id, { id: newId(), fileId: photoFile.id, kind: 'finished', notes: '', createdAt: nowStamp() }, photoFile, db);
    await deleteChart(c.id, db);
    expect(await getChart(c.id, db)).toBeUndefined();
    expect(await getFile(cover.id, db)).toBeUndefined();
    expect(await getFile(photoFile.id, db)).toBeUndefined();
    expect(await getThumb(c.id, db)).toBeUndefined();
  });

  it('adds and removes photos', async () => {
    const db = await freshDb();
    const c = chart({ updatedAt: '2020-01-01T00:00:00Z' });
    await saveNewChart(c, [], undefined, db);
    const f = file();
    const photo = { id: newId(), fileId: f.id, kind: 'progress' as const, notes: 'half way', createdAt: nowStamp() };
    const withPhoto = await addPhoto(c.id, photo, f, db);
    expect(withPhoto.photos).toEqual([photo]);
    expect(fileIdsOf(withPhoto)).toContain(f.id);
    const without = await deletePhoto(c.id, photo.id, db);
    expect(without.photos).toEqual([]);
    expect(await getFile(f.id, db)).toBeUndefined();
  });

  it('restores a batch of charts and files in one step', async () => {
    const db = await freshDb();
    const f = file();
    const charts = [chart({ coverFileId: f.id }), chart()];
    await restoreBatch(charts, [f], db);
    expect((await listCharts(db)).length).toBe(2);
    expect(await getFile(f.id, db)).toBeDefined();
  });

  it('writes nothing from a restore that fails part way', async () => {
    const db = await freshDb();
    const good = chart();
    const bad = { ...chart(), id: undefined } as unknown as ChartRecord; // no key: the store refuses it
    await expect(restoreBatch([good, bad], [file()], db)).rejects.toThrow();
    expect(await listCharts(db)).toEqual([]);
  });

  it('explains a full phone plainly', () => {
    const e = explainStorageError(Object.assign(new Error('q'), { name: 'QuotaExceededError' }));
    expect(e.message).toMatch(/out of space/);
    expect(e.message).toMatch(/Nothing was changed/);
  });
});

describe('database upgrades', () => {
  it('has one upgrade step per version', () => {
    expect(DB_VERSION).toBe(UPGRADES.length);
  });

  it('keeps existing charts when a newer app version opens an older database', async () => {
    const name = `upgrade-${++n}`;
    // An older app wrote this with version 1.
    const v1 = await openDB(name, 1, { upgrade: (db) => UPGRADES[0](db as never) });
    const c = chart();
    await v1.put('charts', c);
    v1.close();
    const db = await openLibrary(name);
    expect(await getChart(c.id, db)).toEqual(c);
  });
});
