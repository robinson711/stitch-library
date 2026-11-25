// Reads text on the phone with Tesseract.js. All files come from this site.
import { createWorker, PSM, type Worker as TessWorker, type Page } from 'tesseract.js';
import type { TextLine } from './suggest';

export type Layout = 'auto' | 'sparse';

export interface ReadResult {
  text: string;
  lines: TextLine[];
  ms: number;
}

export class TextReader {
  private constructor(private worker: TessWorker, private layout: Layout | null = null) {}

  static async create(base: string): Promise<TextReader> {
    const worker = await createWorker('eng', 1 /* LSTM only */, {
      workerPath: new URL('ocr/worker.min.js', base).href,
      corePath: new URL('ocr/', base).href,
      langPath: new URL('ocr/lang', base).href,
      workerBlobURL: false,
      cacheMethod: 'none',
      gzip: true,
    });
    return new TextReader(worker);
  }

  async read(image: HTMLCanvasElement, layout: Layout = 'auto'): Promise<ReadResult> {
    if (layout !== this.layout) {
      await this.worker.setParameters({
        tessedit_pageseg_mode: layout === 'sparse' ? PSM.SPARSE_TEXT : PSM.AUTO,
        preserve_interword_spaces: '1',
      });
      this.layout = layout;
    }
    const t0 = performance.now();
    const { data } = await this.worker.recognize(image, {}, { text: true, blocks: true });
    return { text: data.text ?? '', lines: linesOf(data), ms: performance.now() - t0 };
  }

  async dispose() {
    await this.worker.terminate();
  }
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function linesOf(page: Page): TextLine[] {
  const out: TextLine[] = [];
  for (const b of page.blocks ?? [])
    for (const p of b.paragraphs)
      for (const l of p.lines) {
        const heights = l.words.map((w) => w.bbox.y1 - w.bbox.y0).filter((h) => h > 0);
        out.push({
          text: l.text.trim(),
          height: median(heights) || l.bbox.y1 - l.bbox.y0,
          top: l.bbox.y0,
          confidence: l.confidence,
        });
      }
  return out;
}
