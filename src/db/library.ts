// The chart library, kept in IndexedDB on the phone.
//
// Stores:
//   charts  ChartRecord, key "id"
//   files   FileRecord (cover JPEGs, chart pages, PDFs, photos), key "id"
//   thumbs  small cover JPEGs for the home grid, key = chart id (rebuilt, not backed up)
//
// Every change is one transaction: it either fully happens or not at all, so a
// closed app or a dead battery never leaves half a chart behind.
//
// Upgrades: add a new entry to UPGRADES and raise DB_VERSION. Never change or
// remove an old entry; each one runs once, in order, and must keep all data.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ChartRecord, FileRecord, PhotoRecord } from './types';
import { nowStamp } from './stamp';

export { nowStamp, newId } from './stamp';

export const DB_NAME = 'stitch-library';

interface LibrarySchema extends DBSchema {
  charts: { key: string; value: ChartRecord };
  files: { key: string; value: FileRecord };
  thumbs: { key: string; value: { id: string; blob: Blob } };
}

export type LibraryDB = IDBPDatabase<LibrarySchema>;

// Index n upgrades a database from version n to n + 1.
type Upgrade = (db: IDBPDatabase<LibrarySchema>) => void;
export const UPGRADES: Upgrade[] = [
  (db) => {
    db.createObjectStore('charts', { keyPath: 'id' });
    db.createObjectStore('files', { keyPath: 'id' });
    db.createObjectStore('thumbs', { keyPath: 'id' });
  },
];
export const DB_VERSION = UPGRADES.length;

/** Plain-language storage problems, shown to her as they are. */
export class StorageError extends Error {}

export function explainStorageError(e: unknown): StorageError {
  if (e instanceof StorageError) return e;
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'QuotaExceededError')
    return new StorageError('The phone is out of space for Stitch Library. Nothing was changed. Free up some space on the iPhone, then try again.');
  return new StorageError('Something went wrong while saving. Nothing was changed. Please try again.');
}

let dbPromise: Promise<LibraryDB> | null = null;

export function openLibrary(name = DB_NAME): Promise<LibraryDB> {
  if (!dbPromise || name !== DB_NAME) {
    const p = openDB<LibrarySchema>(name, DB_VERSION, {
      upgrade(db, oldVersion) {
        for (let v = oldVersion; v < DB_VERSION; v++) UPGRADES[v](db);
      },
      blocking() {
        // A newer version of the app opened in another tab: let it upgrade.
        void p.then((db) => db.close());
      },
    });
    if (name !== DB_NAME) return p;
    dbPromise = p;
    p.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

/** For tests: forget the cached connection. */
export function resetLibraryConnection() {
  dbPromise = null;
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw explainStorageError(e);
  }
}

/** Writes inside a transaction: a failure shows up as the transaction failing. */
const quiet = (p: Promise<unknown>) => void p.catch(() => {});

type AnyTx = { abort(): void; done: Promise<void> };

/** Runs the writes; if any step fails, the whole transaction is undone. */
async function all<T>(tx: AnyTx, fn: () => Promise<T>): Promise<T> {
  tx.done.catch(() => {}); // the error is reported below
  try {
    const out = await fn();
    await tx.done;
    return out;
  } catch (e) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    throw e;
  }
}

/** All charts, newest first. */
export async function listCharts(db?: LibraryDB): Promise<ChartRecord[]> {
  const d = db ?? (await openLibrary());
  const all = await d.getAll('charts');
  return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
}

export async function getChart(id: string, db?: LibraryDB): Promise<ChartRecord | undefined> {
  return (db ?? (await openLibrary())).get('charts', id);
}

export async function getFile(id: string, db?: LibraryDB): Promise<FileRecord | undefined> {
  return (db ?? (await openLibrary())).get('files', id);
}

export async function getThumb(chartId: string, db?: LibraryDB): Promise<Blob | undefined> {
  return (await (db ?? (await openLibrary())).get('thumbs', chartId))?.blob;
}

/** Saves a new chart together with its files (and thumbnail) in one step. */
export async function saveNewChart(chart: ChartRecord, files: FileRecord[], thumb?: Blob, db?: LibraryDB): Promise<void> {
  const d = db ?? (await openLibrary());
  await run(async () => {
    const tx = d.transaction(['charts', 'files', 'thumbs'], 'readwrite');
    return all(tx, async () => {
      if (await tx.objectStore('charts').get(chart.id)) throw new StorageError('This chart is already saved.');
      for (const f of files) quiet(tx.objectStore('files').put(f));
      if (thumb) quiet(tx.objectStore('thumbs').put({ id: chart.id, blob: thumb }));
      quiet(tx.objectStore('charts').put(chart));
    });
  });
}

/**
 * Saves changed chart details. Sets updatedAt. New files (for example extra
 * chart pages) are saved in the same step; files no longer used are removed.
 */
export async function updateChart(chart: ChartRecord, newFiles: FileRecord[] = [], thumb?: Blob, db?: LibraryDB): Promise<ChartRecord> {
  const d = db ?? (await openLibrary());
  const saved: ChartRecord = { ...chart, updatedAt: nowStamp() };
  await run(async () => {
    const tx = d.transaction(['charts', 'files', 'thumbs'], 'readwrite');
    return all(tx, async () => {
      const old = await tx.objectStore('charts').get(chart.id);
      if (!old) throw new StorageError('This chart is no longer in the library.');
      for (const f of newFiles) quiet(tx.objectStore('files').put(f));
      const keep = new Set(fileIdsOf(saved));
      for (const id of fileIdsOf(old)) if (!keep.has(id)) quiet(tx.objectStore('files').delete(id));
      if (thumb) quiet(tx.objectStore('thumbs').put({ id: chart.id, blob: thumb }));
      quiet(tx.objectStore('charts').put(saved));
    });
  });
  return saved;
}

/** Deletes a chart with all its pictures, pages and photos. */
export async function deleteChart(id: string, db?: LibraryDB): Promise<void> {
  const d = db ?? (await openLibrary());
  await run(async () => {
    const tx = d.transaction(['charts', 'files', 'thumbs'], 'readwrite');
    return all(tx, async () => {
      const old = await tx.objectStore('charts').get(id);
      if (old) for (const f of fileIdsOf(old)) quiet(tx.objectStore('files').delete(f));
      quiet(tx.objectStore('thumbs').delete(id));
      quiet(tx.objectStore('charts').delete(id));
    });
  });
}

/** Adds a progress or finished photo to a chart (used from Phase 3). */
export async function addPhoto(chartId: string, photo: PhotoRecord, file: FileRecord, db?: LibraryDB): Promise<ChartRecord> {
  const d = db ?? (await openLibrary());
  return run(async () => {
    const tx = d.transaction(['charts', 'files'], 'readwrite');
    return all(tx, async () => {
      const chart = await tx.objectStore('charts').get(chartId);
      if (!chart) throw new StorageError('This chart is no longer in the library.');
      const saved: ChartRecord = { ...chart, photos: [...chart.photos, photo], updatedAt: nowStamp() };
      quiet(tx.objectStore('files').put(file));
      quiet(tx.objectStore('charts').put(saved));
      return saved;
    });
  });
}

/** Removes one photo and its picture from a chart. */
export async function deletePhoto(chartId: string, photoId: string, db?: LibraryDB): Promise<ChartRecord> {
  const d = db ?? (await openLibrary());
  return run(async () => {
    const tx = d.transaction(['charts', 'files'], 'readwrite');
    return all(tx, async () => {
      const chart = await tx.objectStore('charts').get(chartId);
      if (!chart) throw new StorageError('This chart is no longer in the library.');
      const photo = chart.photos.find((p) => p.id === photoId);
      const saved: ChartRecord = { ...chart, photos: chart.photos.filter((p) => p.id !== photoId), updatedAt: nowStamp() };
      if (photo) quiet(tx.objectStore('files').delete(photo.fileId));
      quiet(tx.objectStore('charts').put(saved));
      return saved;
    });
  });
}

/**
 * Restore: writes all given charts and files in ONE step. If anything fails,
 * nothing is written. Records are stored exactly as given (the caller has
 * already merged them); nothing is deleted. Thumbnails of restored charts are
 * cleared so the home screen rebuilds them from the restored covers.
 */
export async function restoreBatch(charts: ChartRecord[], files: FileRecord[], db?: LibraryDB): Promise<void> {
  const d = db ?? (await openLibrary());
  await run(async () => {
    const tx = d.transaction(['charts', 'files', 'thumbs'], 'readwrite');
    return all(tx, async () => {
      for (const f of files) quiet(tx.objectStore('files').put(f));
      for (const c of charts) {
        quiet(tx.objectStore('charts').put(c));
        quiet(tx.objectStore('thumbs').delete(c.id));
      }
    });
  });
}

export async function putThumb(chartId: string, blob: Blob, db?: LibraryDB): Promise<void> {
  const d = db ?? (await openLibrary());
  await run(() => d.put('thumbs', { id: chartId, blob }).then(() => undefined));
}

export function fileIdsOf(chart: ChartRecord): string[] {
  return [chart.coverFileId, ...chart.sourceFileIds, ...chart.photos.map((p) => p.fileId)].filter(Boolean);
}

/**
 * Asks Safari to keep the library even when the phone is short of space.
 * Returns true when granted. Refusal is normal (Safari decides by itself),
 * and the app keeps working either way.
 */
export async function askToKeepStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
