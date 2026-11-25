// Checks a whole backup before anything is written. Every problem becomes a
// plain sentence; the library is never touched when validation fails.

import { FORMAT, VERSION, isDate, isUuid, parsePath, type BackupChart, type BackupLibrary, type BackupPhoto } from './format';

export class BackupError extends Error {}

const CRAFTS = new Set(['', 'cross-stitch', 'needlepoint', 'quilt']);
const KINDS = new Set(['progress', 'finished']);
const MAX_TEXT = 2_000_000; // characters; recognised text from a long PDF can be large

function fail(msg: string): never {
  throw new BackupError(msg);
}

function text(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') fail(`${where}: "${key}" should be text.`);
  if (v.length > MAX_TEXT) fail(`${where}: "${key}" is too long.`);
  return v;
}

function date(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  if (!isDate(v)) fail(`${where}: "${key}" is not a valid date.`);
  return v;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validates library.json. `files` holds the paths present in the zip; every
 * path the library mentions must be there. Returns a clean copy (unknown
 * fields are dropped).
 */
export function validateLibrary(json: unknown, files: Set<string>): BackupLibrary {
  if (!isObj(json) || json.format !== FORMAT) fail('This file is not a Stitch Library backup.');
  if (typeof json.version !== 'number') fail('This backup has no version number.');
  if (json.version > VERSION) fail('This backup was made by a newer version of Stitch Library. Please update the app, then try again.');
  if (json.version !== VERSION) fail('This backup version is not supported.');
  const exportedAt = date(json, 'exportedAt', 'Backup');
  if (!Array.isArray(json.charts)) fail('This backup has no list of charts.');

  const chartIds = new Set<string>();
  const photoIds = new Set<string>();
  const usedPaths = new Set<string>();

  const needFile = (p: unknown, where: string, allowPdf: boolean): string => {
    const parsed = parsePath(p);
    if (!parsed) fail(`${where}: a file name is not safe or not allowed.`);
    if (parsed.ext === 'pdf' && !allowPdf) fail(`${where}: a picture must be a JPEG.`);
    const path = p as string;
    if (!files.has(path)) fail(`${where}: the file ${path} is missing from the backup.`);
    if (usedPaths.has(path)) fail(`${where}: the file ${path} is used twice.`);
    usedPaths.add(path);
    return path;
  };

  const charts: BackupChart[] = json.charts.map((c: unknown, i: number) => {
    const where = `Chart ${i + 1}`;
    if (!isObj(c)) fail(`${where} is not readable.`);
    if (!isUuid(c.id)) fail(`${where} has an invalid id.`);
    if (chartIds.has(c.id)) fail(`${where} appears twice.`);
    chartIds.add(c.id);
    const craft = c.craft ?? '';
    if (typeof craft !== 'string' || !CRAFTS.has(craft)) fail(`${where} has an unknown craft.`);
    if (!Array.isArray(c.source ?? [])) fail(`${where}: "source" should be a list.`);
    if (!Array.isArray(c.photos ?? [])) fail(`${where}: "photos" should be a list.`);
    const photos: BackupPhoto[] = ((c.photos ?? []) as unknown[]).map((p, j) => {
      const pw = `${where}, photo ${j + 1}`;
      if (!isObj(p)) fail(`${pw} is not readable.`);
      if (!isUuid(p.id)) fail(`${pw} has an invalid id.`);
      if (photoIds.has(p.id)) fail(`${pw} appears twice.`);
      photoIds.add(p.id);
      if (typeof p.kind !== 'string' || !KINDS.has(p.kind)) fail(`${pw} is neither progress nor finished.`);
      return {
        id: p.id,
        file: needFile(p.file, pw, false),
        kind: p.kind as BackupPhoto['kind'],
        notes: text(p, 'notes', pw),
        createdAt: date(p, 'createdAt', pw),
      };
    });
    return {
      id: c.id,
      title: text(c, 'title', where),
      designer: text(c, 'designer', where),
      craft: craft as BackupChart['craft'],
      recognizedText: text(c, 'recognizedText', where),
      notes: text(c, 'notes', where),
      createdAt: date(c, 'createdAt', where),
      updatedAt: date(c, 'updatedAt', where),
      cover: needFile(c.cover, where, false),
      source: ((c.source ?? []) as unknown[]).map((s) => needFile(s, where, true)),
      photos,
    };
  });

  return { format: FORMAT, version: VERSION, exportedAt, charts };
}
