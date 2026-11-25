import { describe, expect, it } from 'vitest';
import { Zip, ZipPassThrough, strToU8, zipSync } from 'fflate';
import { MemoryLibrary } from '../src/backup/memory';
import { readBackup, writeBackup } from '../src/backup/zip';
import { applyRestore, describePlan, prepareRestore } from '../src/backup/restore';
import { planMerge } from '../src/backup/merge';
import { backupFileName, stamp } from '../src/backup/format';
import { BackupError, validateLibrary } from '../src/backup/validate';
import type { PortChart } from '../src/backup/port';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const jpgBytes = (s: string) => new Uint8Array([0xff, 0xd8, 0xff, ...new TextEncoder().encode(s)]);
const jpg = (s: string) => ({ blob: new Blob([jpgBytes(s)], { type: 'image/jpeg' }), type: 'image/jpeg' });

function chart(n: number, extra: Partial<PortChart> = {}): PortChart {
  return {
    id: id(n), title: `Chart ${n}`, designer: 'Ann', craft: 'cross-stitch', recognizedText: 'Noël', notes: '',
    createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-01T10:00:00Z',
    coverFileId: id(100 + n), sourceFileIds: [], photos: [], ...extra,
  };
}

async function sample() {
  const lib = new MemoryLibrary(() => new Date('2026-11-25T12:00:00Z'));
  await lib.addChart(chart(1, { sourceFileIds: [id(201)], photos: [{ id: id(301), fileId: id(401), kind: 'finished', notes: 'Gift', createdAt: '2026-02-01T00:00:00Z' }] }), [
    { id: id(101), ...jpg('cover1') },
    { id: id(201), blob: new Blob(['%PDF'], { type: 'application/pdf' }), type: 'application/pdf' },
    { id: id(401), ...jpg('photo1') },
  ]);
  await lib.addChart(chart(2), [{ id: id(102), ...jpg('cover2') }]);
  return lib;
}

async function zipOf(files: Record<string, string | Uint8Array>) {
  const data: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) data[k] = typeof v === 'string' ? strToU8(v) : v;
  return new Blob([zipSync(data) as BlobPart]);
}

describe('backup format helpers', () => {
  it('writes dates without fractional seconds and names files by date', () => {
    expect(stamp(new Date('2026-11-25T22:54:42.123Z'))).toBe('2026-11-25T22:54:42Z');
    expect(backupFileName(new Date(2026, 0, 5))).toBe('StitchLibrary-2026-01-05.zip');
  });
});

describe('backup round trip', () => {
  it('restores an exported library into an empty one exactly', async () => {
    const src = await sample();
    const { blob, charts, files } = await writeBackup(src, undefined, new Date('2026-11-25T12:00:00Z'));
    expect(charts).toBe(2);
    expect(files).toBe(4);
    const read = await readBackup(blob);
    expect(read.library.exportedAt).toBe('2026-11-25T12:00:00Z');
    expect(read.library.charts[0].source[0]).toBe(`files/${id(201)}.pdf`);
    expect(read.library.charts[0].photos[0].file).toBe(`files/${id(401)}.jpg`);

    const dest = new MemoryLibrary();
    const plan = await prepareRestore(dest, read);
    await applyRestore(dest, read, plan);
    expect(await dest.listCharts()).toEqual(await src.listCharts());
    expect((await (await dest.getFile(id(401)))!.blob.text()).endsWith('photo1')).toBe(true);
    expect((await dest.getFile(id(201)))!.type).toBe('application/pdf');
  });

  it('restoring the same backup twice changes nothing', async () => {
    const src = await sample();
    const read = await readBackup((await writeBackup(src)).blob);
    const plan = await prepareRestore(src, read);
    expect(plan.charts).toHaveLength(0);
    expect(describePlan(plan)).toMatch(/already in your library/);
  });
});

describe('restore merge', () => {
  const lib = (charts: PortChart[]) => ({ format: 'stitch-library' as const, version: 1 as const, exportedAt: '2026-11-25T00:00:00Z', charts: charts.map((c) => ({
    id: c.id, title: c.title, designer: c.designer, craft: c.craft, recognizedText: c.recognizedText, notes: c.notes,
    createdAt: c.createdAt, updatedAt: c.updatedAt, cover: `files/${c.coverFileId}.jpg`, source: c.sourceFileIds.map((s) => `files/${s}.pdf`),
    photos: c.photos.map((p) => ({ id: p.id, file: `files/${p.fileId}.jpg`, kind: p.kind, notes: p.notes, createdAt: p.createdAt })),
  })) });

  it('keeps text from the newer chart and never deletes photos', () => {
    const mine = chart(1, { title: 'Mine', updatedAt: '2026-05-01T00:00:00Z', photos: [{ id: id(301), fileId: id(401), kind: 'progress', notes: '', createdAt: '2026-03-01T00:00:00Z' }] });
    const older = chart(1, { title: 'Older', updatedAt: '2026-04-01T00:00:00Z', photos: [{ id: id(302), fileId: id(402), kind: 'finished', notes: '', createdAt: '2026-03-02T00:00:00Z' }] });
    const plan = planMerge([mine], lib([older]), '2026-11-25T00:00:00Z');
    expect(plan.charts[0].title).toBe('Mine');
    expect(plan.charts[0].photos.map((p) => p.id)).toEqual([id(301), id(302)]);
    expect(plan.charts[0].updatedAt).toBe('2026-11-25T00:00:00Z');
    expect(plan.newFiles.map((f) => f.fileId)).toEqual([id(402)]);

    const newer = chart(1, { title: 'Newer', updatedAt: '2026-06-01T00:00:00Z', photos: [] });
    const plan2 = planMerge([mine], lib([newer]), '2026-11-25T00:00:00Z');
    expect(plan2.charts[0].title).toBe('Newer');
    expect(plan2.charts[0].photos).toHaveLength(1); // her photo stays
    expect(plan2.charts[0].updatedAt).toBe('2026-06-01T00:00:00Z');
  });

  it('adds missing charts and counts them', () => {
    const plan = planMerge([chart(1)], lib([chart(1), chart(2)]), '2026-11-25T00:00:00Z');
    expect(plan.counts).toEqual({ newCharts: 1, updatedCharts: 0, newPhotos: 0, unchangedCharts: 1 });
    expect(describePlan(plan)).toBe('This will add 1 new chart. Nothing in your library will be deleted.');
  });

  it('leaves the library unchanged when the write fails', async () => {
    const src = await sample();
    const read = await readBackup((await writeBackup(src)).blob);
    const dest = new MemoryLibrary();
    await dest.addChart(chart(9), [{ id: id(109), ...jpg('x') }]);
    const before = await dest.listCharts();
    dest.failNextWrite = new Error('disk');
    await expect(applyRestore(dest, read, await prepareRestore(dest, read))).rejects.toBeInstanceOf(BackupError);
    expect(await dest.listCharts()).toEqual(before);
  });
});

describe('bad backup files', () => {
  const good = (over: Record<string, unknown> = {}, chartOver: Record<string, unknown> = {}) => JSON.stringify({
    format: 'stitch-library', version: 1, exportedAt: '2026-11-25T00:00:00Z',
    charts: [{ id: id(1), title: 'A', designer: '', craft: '', recognizedText: '', notes: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', cover: `files/${id(101)}.jpg`, source: [], photos: [], ...chartOver }],
    ...over,
  });
  const cover: Record<string, string | Uint8Array> = { [`files/${id(101)}.jpg`]: jpgBytes('img') };

  it('accepts a valid minimal backup', async () => {
    const r = await readBackup(await zipOf({ 'library.json': good(), ...cover }));
    expect(r.library.charts).toHaveLength(1);
  });

  const cases: [string, () => Promise<Blob>, RegExp][] = [
    ['not a zip', async () => new Blob(['hello there']), /damaged|not a zip|not a Stitch Library/],
    ['no library.json', async () => zipOf(cover), /library\.json is missing/],
    ['broken JSON', async () => zipOf({ 'library.json': '{', ...cover }), /damaged/],
    ['another app', async () => zipOf({ 'library.json': good({ format: 'other' }), ...cover }), /not a Stitch Library backup/],
    ['newer version', async () => zipOf({ 'library.json': good({ version: 2 }), ...cover }), /newer version/],
    ['unsafe path', async () => zipOf({ 'library.json': good({}, { cover: '../../etc/x.jpg' }), ...cover }), /not safe/],
    ['missing picture', async () => zipOf({ 'library.json': good() }), /missing from the backup/],
    ['bad date', async () => zipOf({ 'library.json': good({}, { updatedAt: '2026-01-01' }), ...cover }), /not a valid date/],
    ['renamed picture', async () => zipOf({ 'library.json': good(), [`files/${id(101)}.jpg`]: 'not really a jpeg' }), /damaged or is not a JPEG/],
    ['bad craft', async () => zipOf({ 'library.json': good({}, { craft: 'knitting' }), ...cover }), /unknown craft/],
    ['uppercase id', async () => zipOf({ 'library.json': good({}, { id: id(1).toUpperCase().replace('0000', 'ABCD') }), ...cover }), /invalid id/],
    ['pdf as cover', async () => zipOf({ 'library.json': good({}, { cover: `files/${id(101)}.pdf` }), [`files/${id(101)}.pdf`]: '%PDF-1.7' }), /must be a JPEG/],
  ];
  for (const [name, make, msg] of cases) {
    it(`refuses: ${name}`, async () => {
      const err = await readBackup(await make()).catch((e) => e);
      expect(err).toBeInstanceOf(BackupError);
      expect(err.message).toMatch(msg);
    });
  }

  it('refuses a chart listed twice', () => {
    const c = JSON.parse(good()).charts[0];
    expect(() => validateLibrary({ format: 'stitch-library', version: 1, exportedAt: '2026-11-25T00:00:00Z', charts: [c, { ...c }] }, new Set([c.cover]))).toThrow(/appears twice/);
  });

  it('ignores stray entries such as macOS folders', async () => {
    const parts: Uint8Array[] = [];
    const z = new Zip((_, c) => parts.push(c));
    for (const [n, v] of Object.entries({ 'library.json': good(), ...cover, '__MACOSX/._library.json': 'junk' })) {
      const e = new ZipPassThrough(n); z.add(e); e.push(typeof v === 'string' ? strToU8(v) : v, true);
    }
    z.end();
    const r = await readBackup(new Blob(parts as BlobPart[]));
    expect([...r.files.keys()]).toEqual([`files/${id(101)}.jpg`]);
  });
});
