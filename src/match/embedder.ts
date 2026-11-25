// Main-thread side of the image model worker.
import type { Device, Dtype, EmbedRequest, EmbedResponse } from './embed.worker';
import { VIEW_NAMES, makeView, toPixelValues, type ViewName } from './views';

export interface Embedding {
  /** One normalised vector per view, by pooling method. */
  cls: Float32Array[];
  mean: Float32Array[];
  views: ViewName[];
  ms: number;
}

export class Embedder {
  private worker: Worker;
  private next = 1;
  private pending = new Map<number, { resolve: (r: EmbedResponse) => void; reject: (e: Error) => void }>();
  device: Device | null = null;
  loadMs = 0;

  private constructor() {
    this.worker = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' });
  }

  static async create(base: string, dtype: Dtype, device: Device | 'auto'): Promise<Embedder> {
    const e = new Embedder();
    await new Promise<void>((resolve, reject) => {
      e.worker.onmessage = (ev: MessageEvent<EmbedResponse>) => {
        const m = ev.data;
        if (m.type === 'ready') {
          e.device = m.device;
          e.loadMs = m.loadMs;
          e.worker.onmessage = (x) => e.onMessage(x.data);
          resolve();
        } else if (m.type === 'error') reject(new Error(m.message));
      };
      e.worker.onerror = (ev) => reject(new Error(ev.message || 'The matching helper stopped.'));
      e.worker.postMessage({ type: 'init', base, dtype, device } satisfies EmbedRequest);
    });
    e.worker.onerror = (ev) => {
      for (const p of e.pending.values()) p.reject(new Error(ev.message || 'The matching helper stopped.'));
      e.pending.clear();
    };
    return e;
  }

  private onMessage(m: EmbedResponse) {
    if (m.type === 'ready') return;
    const p = m.id !== undefined ? this.pending.get(m.id) : undefined;
    if (!p || m.id === undefined) return;
    this.pending.delete(m.id);
    if (m.type === 'error') p.reject(new Error(m.message));
    else p.resolve(m);
  }

  async embed(canvas: HTMLCanvasElement, views: ViewName[] = VIEW_NAMES): Promise<Embedding> {
    const pixels = toPixelValues(views.map((v) => makeView(canvas, v)));
    const id = this.next++;
    const res = await new Promise<EmbedResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'embed', id, pixels, count: views.length } satisfies EmbedRequest, [pixels.buffer]);
    });
    if (res.type !== 'result') throw new Error('Unexpected reply');
    const split = (a: Float32Array) => views.map((_, i) => a.slice(i * res.dim, (i + 1) * res.dim));
    return { cls: split(res.cls), mean: split(res.mean), views, ms: res.ms };
  }

  dispose() {
    this.worker.terminate();
  }
}
