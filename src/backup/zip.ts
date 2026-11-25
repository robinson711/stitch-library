// Writes and reads StitchLibrary-YYYY-MM-DD.zip files, streaming so a large
// library doesn't need all of its pictures in memory twice.

import { Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough, strFromU8, strToU8 } from 'fflate';
import { FORMAT, VERSION, parsePath, pathFor, stamp, type BackupChart, type BackupLibrary } from './format';
import type { LibraryPort, PortChart } from './port';
import { BackupError, validateLibrary } from './validate';

export function toBackupChart(c: PortChart, typeOf: (fileId: string) => string): BackupChart {
  return {
    id: c.id,
    title: c.title,
    designer: c.designer,
    craft: c.craft,
    recognizedText: c.recognizedText,
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    cover: pathFor(c.coverFileId, 'image/jpeg'),
    source: c.sourceFileIds.map((id) => pathFor(id, typeOf(id))),
    photos: c.photos.map((p) => ({ id: p.id, file: pathFor(p.fileId, 'image/jpeg'), kind: p.kind, notes: p.notes, createdAt: p.createdAt })),
  };
}

export interface WriteProgress {
  (done: number, total: number): void;
}

/** Builds the backup zip. Pictures and PDFs are stored as-is (already compressed). */
export async function writeBackup(port: LibraryPort, onProgress?: WriteProgress, now = new Date()): Promise<{ blob: Blob; charts: number; files: number }> {
  const charts = await port.listCharts();
  const parts: Uint8Array[] = [];
  let zipError: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) zipError = err;
    else parts.push(chunk);
  });

  const types = new Map<string, string>();
  const fileIds: string[] = [];
  for (const c of charts) fileIds.push(c.coverFileId, ...c.sourceFileIds, ...c.photos.map((p) => p.fileId));

  let done = 0;
  for (const id of fileIds) {
    const f = await port.getFile(id);
    if (!f) throw new BackupError('A picture is missing from the library, so the backup could not be made.');
    types.set(id, f.type);
    const entry = new ZipPassThrough(pathFor(id, f.type));
    zip.add(entry);
    entry.push(new Uint8Array(await f.blob.arrayBuffer()), true);
    if (zipError) throw zipError;
    onProgress?.(++done, fileIds.length);
  }

  const library: BackupLibrary = {
    format: FORMAT,
    version: VERSION,
    exportedAt: stamp(now),
    charts: charts.map((c) => toBackupChart(c, (id) => types.get(id) ?? 'image/jpeg')),
  };
  const json = new ZipDeflate('library.json', { level: 6 });
  zip.add(json);
  json.push(strToU8(JSON.stringify(library, null, 1)), true);
  zip.end();
  if (zipError) throw zipError;
  return { blob: new Blob(parts as BlobPart[], { type: 'application/zip' }), charts: charts.length, files: fileIds.length };
}

export interface ReadBackup {
  library: BackupLibrary;
  files: Map<string, Blob>;
}

const MAX_TOTAL = 4 * 1024 ** 3; // 4 GB unpacked: far beyond any real library, stops "zip bombs"

/** Reads and fully validates a backup zip. Throws BackupError with a plain message. */
export async function readBackup(file: Blob): Promise<ReadBackup> {
  const chunks = new Map<string, Uint8Array[]>();
  let total = 0;
  let error: Error | null = null;
  const unzip = new Unzip((f) => {
    const name = f.name;
    const wanted = name === 'library.json' || !!parsePath(name);
    if (!wanted) return; // ignore anything else (folders, system files)
    if (chunks.has(name)) {
      error = new BackupError(`The backup contains ${name} twice.`);
      return;
    }
    const list: Uint8Array[] = [];
    chunks.set(name, list);
    f.ondata = (err, data) => {
      if (err) {
        error = new BackupError('The backup file is damaged.');
        return;
      }
      total += data.length;
      if (total > MAX_TOTAL) {
        error = new BackupError('The backup is too large to open.');
        f.terminate();
        return;
      }
      list.push(data);
    };
    try {
      f.start();
    } catch {
      error = new BackupError('The backup uses a kind of compression the app cannot read.');
    }
  });
  unzip.register(UnzipInflate);

  try {
    const reader = file.stream().getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      unzip.push(value);
      if (error) throw error;
    }
    unzip.push(new Uint8Array(0), true);
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError('The backup file is damaged or is not a zip file.');
  }
  if (error) throw error;

  const jsonParts = chunks.get('library.json');
  if (!jsonParts) throw new BackupError('This file is not a Stitch Library backup (library.json is missing).');
  let json: unknown;
  try {
    json = JSON.parse(strFromU8(concat(jsonParts)));
  } catch {
    throw new BackupError('The list of charts in this backup is damaged.');
  }
  chunks.delete('library.json');
  const library = validateLibrary(json, new Set(chunks.keys()));
  const files = new Map<string, Blob>();
  for (const [name, list] of chunks) {
    files.set(name, new Blob(list as BlobPart[], { type: name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg' }));
  }
  return { library, files };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
