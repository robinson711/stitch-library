// Restore merges by id: add missing charts and photos, keep chart text from
// the newer updatedAt, never delete anything that is already there.

import { parsePath, typeForPath, type BackupChart, type BackupLibrary } from './format';
import type { PortChart, PortPhoto } from './port';

export interface MergePlan {
  /** Complete chart records to write (new charts and changed existing ones). */
  charts: PortChart[];
  /** Backup paths whose files must be written (only files not already in the library). */
  newFiles: { path: string; fileId: string; type: string }[];
  counts: { newCharts: number; updatedCharts: number; newPhotos: number; unchangedCharts: number };
}

const fileId = (path: string) => parsePath(path)!.id;

function toPhoto(p: BackupChart['photos'][number]): PortPhoto {
  return { id: p.id, fileId: fileId(p.file), kind: p.kind, notes: p.notes, createdAt: p.createdAt };
}

export function fromBackup(c: BackupChart): PortChart {
  return {
    id: c.id,
    title: c.title,
    designer: c.designer,
    craft: c.craft,
    recognizedText: c.recognizedText,
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    coverFileId: fileId(c.cover),
    sourceFileIds: c.source.map(fileId),
    photos: c.photos.map(toPhoto),
  };
}

export function planMerge(existing: PortChart[], incoming: BackupLibrary, now: string): MergePlan {
  const byId = new Map(existing.map((c) => [c.id, c]));
  const plan: MergePlan = { charts: [], newFiles: [], counts: { newCharts: 0, updatedCharts: 0, newPhotos: 0, unchangedCharts: 0 } };
  const addFile = (path: string) => plan.newFiles.push({ path, fileId: fileId(path), type: typeForPath(path) });

  for (const inc of incoming.charts) {
    const cur = byId.get(inc.id);
    if (!cur) {
      plan.charts.push(fromBackup(inc));
      addFile(inc.cover);
      inc.source.forEach(addFile);
      inc.photos.forEach((p) => addFile(p.file));
      plan.counts.newCharts++;
      plan.counts.newPhotos += inc.photos.length;
      continue;
    }
    const merged: PortChart = { ...cur, photos: [...cur.photos], sourceFileIds: [...cur.sourceFileIds] };
    let changed = false;
    let filesAdded = false;
    if (inc.updatedAt > cur.updatedAt) {
      // Same-format UTC strings compare correctly as text.
      Object.assign(merged, {
        title: inc.title,
        designer: inc.designer,
        craft: inc.craft,
        recognizedText: inc.recognizedText,
        notes: inc.notes,
        updatedAt: inc.updatedAt,
      });
      changed = true;
    }
    const havePhotos = new Set(cur.photos.map((p) => p.id));
    for (const p of inc.photos) {
      if (havePhotos.has(p.id)) continue;
      merged.photos.push(toPhoto(p));
      addFile(p.file);
      plan.counts.newPhotos++;
      changed = filesAdded = true;
    }
    const haveSources = new Set(cur.sourceFileIds);
    for (const s of inc.source) {
      const id = fileId(s);
      if (haveSources.has(id)) continue;
      merged.sourceFileIds.push(id);
      addFile(s);
      changed = filesAdded = true;
    }
    if (changed) {
      merged.photos.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      // Adding photos or pages is a change to the chart, so it gets a new date.
      if (filesAdded && now > merged.updatedAt) merged.updatedAt = now;
      plan.charts.push(merged);
      plan.counts.updatedCharts++;
    } else plan.counts.unchangedCharts++;
  }
  return plan;
}
