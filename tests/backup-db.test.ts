import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { libraryOn } from '../src/backup/adapter';
import { readBackup, writeBackup } from '../src/backup/zip';
import { applyRestore, prepareRestore } from '../src/backup/restore';
import { saveNewChart, openLibrary } from '../src/db/library';
import { newId, nowStamp } from '../src/db/stamp';
import type { ChartRecord } from '../src/db/types';

describe('backup with the real phone storage', () => {
  it('round-trips charts, PDFs and photos between two libraries', async () => {
    const a = await openLibrary('bk-a');
    const cover = { id: newId(), blob: new Blob(['cover'], { type: 'image/jpeg' }), type: 'image/jpeg' };
    const pdf = { id: newId(), blob: new Blob(['%PDF-1.7'], { type: 'application/pdf' }), type: 'application/pdf' };
    const now = nowStamp();
    const c: ChartRecord = {
      id: newId(), title: 'Winter Cardinal', designer: 'Lavender Lane', craft: 'cross-stitch', recognizedText: 'winter cardinal',
      notes: 'for Mum', createdAt: now, updatedAt: now, coverFileId: cover.id, sourceFileIds: [pdf.id], photos: [],
    };
    await saveNewChart(c, [cover, pdf], undefined, a);
    const portA = await libraryOn('bk-a');
    const photoFile = { id: newId(), blob: new Blob(['done'], { type: 'image/jpeg' }), type: 'image/jpeg' };
    await portA.addPhoto(c.id, { id: newId(), fileId: photoFile.id, kind: 'finished', notes: '', createdAt: now }, photoFile);

    const backup = await readBackup((await writeBackup(portA)).blob);
    const portB = await libraryOn('bk-b');
    await applyRestore(portB, backup, await prepareRestore(portB, backup));
    const [restored] = await portB.listCharts();
    expect(restored).toEqual((await portA.listCharts())[0]);
    expect(await (await portB.getFile(pdf.id))!.blob.text()).toBe('%PDF-1.7');
    expect((await portB.getFile(pdf.id))!.type).toBe('application/pdf');
  });
});
