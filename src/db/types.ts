// Records kept on the phone. Shaped like the backup format
// (PROJECT_CONTEXT.md section 5) so backup and restore are a straight copy.

export type Craft = '' | 'cross-stitch' | 'needlepoint' | 'quilt';
export type PhotoKind = 'progress' | 'finished';

/** UTC as "YYYY-MM-DDTHH:MM:SSZ", no fractional seconds (same as the backup). */
export type Stamp = string;

export interface PhotoRecord {
  id: string;
  /** Key in the "files" store (a JPEG). */
  fileId: string;
  kind: PhotoKind;
  /** "completed" = framed or made up (kind is then "finished"). */
  stage?: 'completed';
  notes: string;
  createdAt: Stamp;
}

export interface ChartRecord {
  id: string;
  title: string;
  designer: string;
  craft: Craft;
  /** Words read on the cover and pages, already cleaned of noise. Used for search. */
  recognizedText: string;
  notes: string;
  createdAt: Stamp;
  updatedAt: Stamp;
  /** Key in the "files" store (a JPEG). */
  coverFileId: string;
  /** Keys in the "files" store: chart pages (JPEG) or the chart PDF. */
  sourceFileIds: string[];
  /** Progress and finished photos (Phase 3), newest last. */
  photos: PhotoRecord[];
}

export interface FileRecord {
  id: string;
  blob: Blob;
  /** "image/jpeg" or "application/pdf". */
  type: string;
}

export const CRAFTS: { value: Craft; label: string }[] = [
  { value: 'cross-stitch', label: 'Cross stitch' },
  { value: 'needlepoint', label: 'Needlepoint' },
  { value: 'quilt', label: 'Quilt' },
];

export function craftLabel(c: Craft): string {
  return CRAFTS.find((x) => x.value === c)?.label ?? '';
}
