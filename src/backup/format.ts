// The backup file format shared with the iPhone version (PROJECT_CONTEXT.md §5).

import type { Craft, PhotoKind } from './port';

export const FORMAT = 'stitch-library';
export const VERSION = 1;

export interface BackupPhoto {
  id: string;
  file: string;
  kind: PhotoKind;
  /** Optional addition: "completed" (only with kind "finished"). Readers that don't know it ignore it. */
  stage?: 'completed';
  notes: string;
  createdAt: string;
}

export interface BackupChart {
  id: string;
  title: string;
  designer: string;
  craft: Craft;
  recognizedText: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  cover: string;
  source: string[];
  photos: BackupPhoto[];
}

export interface BackupLibrary {
  format: typeof FORMAT;
  version: typeof VERSION;
  exportedAt: string;
  charts: BackupChart[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
/** Only files/<uuid>.jpg or .pdf: no folders, no "..", no absolute paths. */
const PATH = /^files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|pdf)$/;

export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);
export const isDate = (s: unknown): s is string => typeof s === 'string' && DATE.test(s) && !Number.isNaN(Date.parse(s));

/** UTC date without fractional seconds, e.g. 2026-11-25T22:54:42Z. */
export function stamp(d: Date = new Date()): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function newId(): string {
  return crypto.randomUUID().toLowerCase();
}

/** Parses a safe backup path into its file id and extension, or null. */
export function parsePath(p: unknown): { id: string; ext: 'jpg' | 'pdf' } | null {
  if (typeof p !== 'string') return null;
  const m = PATH.exec(p);
  return m ? { id: m[1], ext: m[2] as 'jpg' | 'pdf' } : null;
}

export function pathFor(fileId: string, type: string): string {
  return `files/${fileId}.${type === 'application/pdf' ? 'pdf' : 'jpg'}`;
}

export function typeForPath(p: string): string {
  return p.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
}

/** StitchLibrary-YYYY-MM-DD.zip in the phone's local date. */
export function backupFileName(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `StitchLibrary-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.zip`;
}
