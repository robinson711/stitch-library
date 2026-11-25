// Connects Phases 3 and 4 to the Phase 2 storage (src/db/library.ts).
import * as db from '../db/library';
import type { LibraryPort } from './port';

export const library: LibraryPort = {
  listCharts: () => db.listCharts(),
  getChart: (id) => db.getChart(id),
  getFile: (id) => db.getFile(id),
  addPhoto: async (chartId, photo, file) => void (await db.addPhoto(chartId, photo, file)),
  updateChart: async (chart) => void (await db.updateChart(chart)),
  deletePhoto: async (chartId, photoId) => void (await db.deletePhoto(chartId, photoId)),
  restoreBatch: (charts, files) => db.restoreBatch(charts, files),
};

/** The same, on a named database (tests). */
export async function libraryOn(name: string): Promise<LibraryPort> {
  const d = await db.openLibrary(name);
  return {
    listCharts: () => db.listCharts(d),
    getChart: (id) => db.getChart(id, d),
    getFile: (id) => db.getFile(id, d),
    addPhoto: async (c, p, f) => void (await db.addPhoto(c, p, f, d)),
    updateChart: async (c) => void (await db.updateChart(c, [], undefined, d)),
    deletePhoto: async (c, p) => void (await db.deletePhoto(c, p, d)),
    restoreBatch: (c, f) => db.restoreBatch(c, f, d),
  };
}
