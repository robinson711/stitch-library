// Applies a validated backup: plans the merge, then writes everything in one
// transaction through the storage layer. On any failure nothing changes.

import { StorageError } from '../db/library';
import { stamp } from './format';
import { planMerge, type MergePlan } from './merge';
import type { LibraryPort, PortFile } from './port';
import { BackupError } from './validate';
import type { ReadBackup } from './zip';

export async function prepareRestore(port: LibraryPort, backup: ReadBackup, now = new Date()): Promise<MergePlan> {
  return planMerge(await port.listCharts(), backup.library, stamp(now));
}

export async function applyRestore(port: LibraryPort, backup: ReadBackup, plan: MergePlan): Promise<void> {
  const files: PortFile[] = plan.newFiles.map((f) => {
    const blob = backup.files.get(f.path);
    if (!blob) throw new BackupError(`The file ${f.path} is missing from the backup.`);
    return { id: f.fileId, blob, type: f.type };
  });
  if (!plan.charts.length) return;
  try {
    await port.restoreBatch(plan.charts, files);
  } catch (e) {
    if (e instanceof StorageError) throw new BackupError(e.message);
    if ((e as Error)?.name === 'QuotaExceededError') throw new BackupError('The phone is out of space, so nothing was restored. Your library is unchanged.');
    throw new BackupError('Restoring stopped part way, so nothing was changed. Your library is as it was.');
  }
}

/** One plain sentence for the confirmation screen. */
export function describePlan(plan: MergePlan): string {
  const { newCharts, updatedCharts, newPhotos } = plan.counts;
  if (!newCharts && !updatedCharts) return 'Everything in this backup is already in your library. Nothing needs to change.';
  const bits: string[] = [];
  if (newCharts) bits.push(`${newCharts} new ${newCharts === 1 ? 'chart' : 'charts'}`);
  if (updatedCharts) bits.push(`${updatedCharts} ${updatedCharts === 1 ? 'chart' : 'charts'} with changes`);
  if (newPhotos) bits.push(`${newPhotos} new ${newPhotos === 1 ? 'photo' : 'photos'}`);
  return `This will add ${joinAnd(bits)}. Nothing in your library will be deleted.`;
}

function joinAnd(xs: string[]): string {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
