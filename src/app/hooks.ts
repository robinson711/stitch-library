// Places where Phase 3 and 4 plug into the Phase 2 screens.
// The Phase 3/4 work replaces these stubs with its own modules.
import { problem } from './ui';

/** Fills the "Photos" area of a chart page (progress and finished photos). */
export async function renderPhotoSection(container: HTMLElement, chartId: string): Promise<void> {
  void container;
  void chartId;
}

/** Whether the "I finished one" button and the Backup menu are ready to show. */
export const FINISH_READY = false;
export const BACKUP_READY = false;

/** Starts "I finished one". */
export async function openFinishFlow(): Promise<void> {
  await problem('“I finished one” is coming in the next update.');
}

/** Opens the Backup menu. */
export async function openBackupMenu(): Promise<void> {
  await problem('Backing up is coming in a later update.');
}

/** Runs after a new chart is saved, before its page opens (matching set-up, "I finished one" follow-up). */
export async function afterChartAdded(chartId: string): Promise<void> {
  void chartId;
}
