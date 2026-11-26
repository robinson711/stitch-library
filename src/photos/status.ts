// The three needlework stages a project photo can show: In Progress,
// Finished (stitching done) and Completed (framed or made up). Stored as the
// backup format's `kind` (progress / finished) plus an optional `stage`
// ("completed"), so backups stay readable by the iPhone app version: an app
// that doesn't know "Completed" simply sees it as finished. Photos saved
// before this change are "Finished", as they were.
import type { PortPhoto } from '../backup/port';

export type PhotoStatus = 'progress' | 'finished' | 'completed';

export const STATUSES: PhotoStatus[] = ['progress', 'finished', 'completed'];

export const STATUS_LABEL: Record<PhotoStatus, string> = {
  progress: 'In Progress',
  finished: 'Finished',
  completed: 'Completed',
};

export const STATUS_HINT: Record<PhotoStatus, string> = {
  progress: 'Still stitching',
  finished: 'The stitching is done',
  completed: 'Framed or made up',
};

export function statusOf(p: Pick<PortPhoto, 'kind' | 'stage'>): PhotoStatus {
  if (p.kind === 'progress') return 'progress';
  return p.stage === 'completed' ? 'completed' : 'finished';
}

/** The stored fields for a status. `stage` is left out (not just undefined) when not needed. */
export function fieldsFor(s: PhotoStatus): Pick<PortPhoto, 'kind' | 'stage'> {
  if (s === 'progress') return { kind: 'progress' };
  if (s === 'completed') return { kind: 'finished', stage: 'completed' };
  return { kind: 'finished' };
}

/** Applies a status to a photo, removing `stage` when it no longer applies. */
export function withStatus<T extends Pick<PortPhoto, 'kind' | 'stage'>>(p: T, s: PhotoStatus): T {
  const { stage: _old, ...rest } = p;
  void _old;
  return { ...rest, ...fieldsFor(s) } as T;
}
