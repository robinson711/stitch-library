// Small previews (480 px) of project photos for the photo grid, so a chart
// with many photos doesn't decode dozens of full-size pictures at once.
// Kept in their own small database; not backed up, rebuilt when missing.
import { canvasToJpeg, loadToCanvas, releaseCanvas } from '../image/load';

export const THUMB_SIDE = 480;
const DB = 'stitch-photo-thumbs';
const STORE = 'thumbs';

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => {
        r.result.onversionchange = () => {
          r.result.close();
          dbp = null;
        };
        resolve(r.result);
      };
      r.onerror = () => reject(r.error);
    });
    dbp.catch(() => (dbp = null));
  }
  return dbp;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

/** The small preview for a photo file, made (and kept) on first use. Falls back to the full photo. */
export async function thumbFor(fileId: string, full: () => Promise<Blob | undefined>): Promise<Blob | undefined> {
  try {
    const have = await run<Blob | undefined>('readonly', (s) => s.get(fileId));
    if (have) return have;
  } catch {
    /* fall through and make one */
  }
  const blob = await full();
  if (!blob) return undefined;
  try {
    const canvas = await loadToCanvas(blob, THUMB_SIDE);
    try {
      const small = await canvasToJpeg(canvas, 0.8);
      run('readwrite', (s) => s.put(small, fileId)).catch(() => {});
      return small;
    } finally {
      releaseCanvas(canvas);
    }
  } catch {
    return blob;
  }
}

export function forgetThumb(fileId: string): void {
  run('readwrite', (s) => s.delete(fileId)).catch(() => {});
}
