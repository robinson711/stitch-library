// Where Phases 3 and 4 plug into the Phase 2 screens.
import { openBackupMenu as backupMenu } from '../backup/menu';
import { openFinishFlow as finishFlow } from '../finish/flow';
import { matchService } from '../match/service';
import { renderPhotoSection as photoSection } from '../photos/section';
import { go, parse } from './nav';
import { ask, notice } from './ui';

/** Whether the "I finished one" button and the Backup menu are ready to show. */
export const FINISH_READY = true;
export const BACKUP_READY = true;

/** Fills the "Photos" area of a chart page (progress and finished photos). */
export async function renderPhotoSection(container: HTMLElement, chartId: string): Promise<void> {
  photoSection(container, chartId);
}

/** A finished photo waiting for the new chart she chose to add from "I finished one". */
let pendingAttach: ((chartId: string) => Promise<void>) | null = null;

/** Starts "I finished one". */
export async function openFinishFlow(): Promise<void> {
  finishFlow({
    onSaved: (chartId) => go({ name: 'chart', id: chartId }),
    onAddNew: (attach) => {
      pendingAttach = attach;
      go({ name: 'add' });
    },
  });
}

/** Opens the Backup menu. */
export async function openBackupMenu(): Promise<void> {
  backupMenu({
    onRestored: () => {
      if (parse(location.hash).name === 'home') void import('./home').then((m) => m.homeScreen());
    },
  });
}

/**
 * Called by the add screen right after a new chart is saved. Prepares it for
 * matching, and offers to attach the finished photo she started with.
 */
export async function afterChartAdded(chartId: string): Promise<void> {
  matchService().refresh().catch(() => {});
  const attach = pendingAttach;
  pendingAttach = null;
  if (!attach) return;
  if (!(await ask('Add your finished photo?', 'The photo you took in “I finished one” can be saved to this chart as a finished piece.', 'Add it', 'Not now'))) return;
  try {
    await attach(chartId);
    notice('Finished photo saved.');
    go({ name: 'chart', id: chartId }, true);
  } catch (e) {
    notice((e as Error)?.message || 'The photo could not be saved.');
  }
}

// Quietly prepare matching for charts that don't have it yet (for example
// after an update or a restore), a little after the app opens.
setTimeout(() => {
  if (document.visibilityState === 'visible') matchService().refreshIfNeeded().catch(() => {});
}, 8000);
