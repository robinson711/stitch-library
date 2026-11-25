// A cache of picture vectors (the model's "fingerprint" of each cover and
// confirmed photo), kept in its own small database so the main library's
// storage never needs changing for it. Not backed up: rebuilt when missing.

export interface VectorRecord {
  /** `${model}|${fileId}` */
  key: string;
  model: string;
  chartId: string;
  fileId: string;
  /** One vector per view. */
  vectors: Float32Array[];
}

export interface VectorStore {
  all(model: string): Promise<VectorRecord[]>;
  put(rec: VectorRecord): Promise<void>;
  delete(keys: string[]): Promise<void>;
}

export const vectorKey = (model: string, fileId: string) => `${model}|${fileId}`;

export class MemoryVectorStore implements VectorStore {
  map = new Map<string, VectorRecord>();
  async all(model: string) {
    return [...this.map.values()].filter((r) => r.model === model);
  }
  async put(rec: VectorRecord) {
    this.map.set(rec.key, rec);
  }
  async delete(keys: string[]) {
    for (const k of keys) this.map.delete(k);
  }
}

const DB = 'stitch-vectors';
const STORE = 'vectors';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });
}

export class IdbVectorStore implements VectorStore {
  private db: Promise<IDBDatabase> | null = null;
  constructor(private name = DB) {}

  private open(): Promise<IDBDatabase> {
    if (!this.db) {
      const r = indexedDB.open(this.name, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'key' });
      };
      this.db = req(r).then((db) => {
        db.onversionchange = () => {
          db.close();
          this.db = null;
        };
        return db;
      });
      this.db.catch(() => (this.db = null));
    }
    return this.db;
  }

  async all(model: string) {
    const db = await this.open();
    const rows = await req(db.transaction(STORE).objectStore(STORE).getAll() as IDBRequest<VectorRecord[]>);
    return rows.filter((r) => r.model === model);
  }
  async put(rec: VectorRecord) {
    const db = await this.open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    await done(tx);
  }
  async delete(keys: string[]) {
    if (!keys.length) return;
    const db = await this.open();
    const tx = db.transaction(STORE, 'readwrite');
    for (const k of keys) tx.objectStore(STORE).delete(k);
    await done(tx);
  }
}
