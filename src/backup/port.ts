// The small set of storage operations Phases 3 and 4 need. The shapes mirror
// the Phase 2 database (src/db/types.ts), which follows the backup format in
// PROJECT_CONTEXT.md section 5. src/backup/adapter.ts connects the two.

export type Craft = '' | 'cross-stitch' | 'needlepoint' | 'quilt';
export type PhotoKind = 'progress' | 'finished';

export interface PortPhoto {
  id: string;
  fileId: string;
  kind: PhotoKind;
  /** "completed" = framed or made up. Only with kind "finished". */
  stage?: 'completed';
  notes: string;
  /** UTC 'YYYY-MM-DDTHH:MM:SSZ' */
  createdAt: string;
}

export interface PortChart {
  id: string;
  title: string;
  designer: string;
  craft: Craft;
  recognizedText: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  coverFileId: string;
  sourceFileIds: string[];
  photos: PortPhoto[];
}

export interface PortFile {
  id: string;
  blob: Blob;
  /** 'image/jpeg' or 'application/pdf' */
  type: string;
}

export interface LibraryPort {
  listCharts(): Promise<PortChart[]>;
  getChart(id: string): Promise<PortChart | undefined>;
  getFile(id: string): Promise<PortFile | undefined>;
  /** Small cover picture for lists, if one is stored. */
  getThumb?(chartId: string): Promise<Blob | undefined>;
  /** Adds a photo and its file in one transaction and bumps the chart's updatedAt. */
  addPhoto(chartId: string, photo: PortPhoto, file: PortFile): Promise<void>;
  /** Saves a changed chart record (used for photo kind/note edits). Bumps updatedAt. */
  updateChart(chart: PortChart): Promise<void>;
  /** Removes one photo and its file in one transaction. Bumps updatedAt. */
  deletePhoto(chartId: string, photoId: string): Promise<void>;
  /** Puts all charts and files in ONE transaction: all or nothing. Never deletes. */
  restoreBatch(charts: PortChart[], files: PortFile[]): Promise<void>;
}
