// An in-memory library for tests and previews. Behaves like the real storage:
// writes are all-or-nothing and updates bump updatedAt.

import { stamp } from './format';
import type { LibraryPort, PortChart, PortFile, PortPhoto } from './port';

const clone = <T>(x: T): T => structuredClone(x);

export class MemoryLibrary implements LibraryPort {
  charts = new Map<string, PortChart>();
  files = new Map<string, PortFile>();
  /** Set to make the next write fail, to test all-or-nothing behaviour. */
  failNextWrite: Error | null = null;
  constructor(private clock: () => Date = () => new Date()) {}

  private guard() {
    const e = this.failNextWrite;
    this.failNextWrite = null;
    if (e) throw e;
  }
  async listCharts() {
    return [...this.charts.values()].map(clone);
  }
  async getChart(id: string) {
    const c = this.charts.get(id);
    return c && clone(c);
  }
  async getFile(id: string) {
    return this.files.get(id);
  }
  async addChart(chart: PortChart, files: PortFile[]) {
    this.guard();
    this.charts.set(chart.id, clone(chart));
    for (const f of files) this.files.set(f.id, f);
  }
  async addPhoto(chartId: string, photo: PortPhoto, file: PortFile) {
    const c = this.charts.get(chartId);
    if (!c) throw new Error('No such chart');
    this.guard();
    c.photos.push(clone(photo));
    c.updatedAt = stamp(this.clock());
    this.files.set(file.id, file);
  }
  async updateChart(chart: PortChart) {
    if (!this.charts.has(chart.id)) throw new Error('No such chart');
    this.guard();
    this.charts.set(chart.id, { ...clone(chart), updatedAt: stamp(this.clock()) });
  }
  async deletePhoto(chartId: string, photoId: string) {
    const c = this.charts.get(chartId);
    const p = c?.photos.find((x) => x.id === photoId);
    if (!c || !p) return;
    this.guard();
    c.photos = c.photos.filter((x) => x.id !== photoId);
    c.updatedAt = stamp(this.clock());
    this.files.delete(p.fileId);
  }
  async restoreBatch(charts: PortChart[], files: PortFile[]) {
    this.guard();
    for (const c of charts) this.charts.set(c.id, clone(c));
    for (const f of files) this.files.set(f.id, f);
  }
}
