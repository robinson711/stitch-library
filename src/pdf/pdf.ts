// Opens chart PDFs on the phone with PDF.js. Loaded only when she picks a PDF.
// Every support file comes from this site (copied by `npm run assets`).
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFDocumentLoadingTask } from 'pdfjs-dist';

export class PdfError extends Error {}

/** Largest PDF we try to open, to stay within the phone's memory. */
export const MAX_PDF_BYTES = 150 * 1024 * 1024;
/** Pages read for search. Charts rarely need more; this keeps very long books quick. */
export const MAX_PAGES_READ = 40;

export interface PageText {
  page: number;
  /** Text stored inside the PDF itself (empty for scanned pages). */
  text: string;
}

export class ChartPdf {
  private constructor(private doc: PDFDocumentProxy, private task: PDFDocumentLoadingTask) {}

  static async open(file: Blob, base: string): Promise<ChartPdf> {
    if (file.size > MAX_PDF_BYTES) throw new PdfError('This PDF is too large for the phone to open (over 150 MB).');
    GlobalWorkerOptions.workerSrc = new URL('pdf/pdf.worker.min.mjs', base).href;
    let data: Uint8Array;
    try {
      data = new Uint8Array(await file.arrayBuffer());
    } catch {
      throw new PdfError('The phone ran out of memory opening this PDF.');
    }
    const task = getDocument({
      data,
      enableXfa: false,
      useSystemFonts: false,
      standardFontDataUrl: new URL('pdf/standard_fonts/', base).href,
      cMapUrl: new URL('pdf/cmaps/', base).href,
      wasmUrl: new URL('pdf/wasm/', base).href,
      iccUrl: new URL('pdf/iccs/', base).href,
    });
    try {
      return new ChartPdf(await task.promise, task);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === 'PasswordException') throw new PdfError('This PDF is locked with a password, so it can’t be opened here.');
      void task.destroy();
      throw new PdfError('This PDF could not be opened. It may be damaged.');
    }
  }

  get pageCount(): number {
    return this.doc.numPages;
  }

  /** Draws one page into a canvas whose longest side is about `maxSide` pixels. */
  async renderPage(pageNumber: number, maxSide: number): Promise<HTMLCanvasElement> {
    const page = await this.doc.getPage(pageNumber);
    try {
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(4, maxSide / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new PdfError('The phone ran out of memory for this page.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      return canvas;
    } finally {
      page.cleanup();
    }
  }

  /** Text stored in each page (up to MAX_PAGES_READ pages). */
  async pageTexts(onPage?: (n: number, of: number) => void): Promise<PageText[]> {
    const out: PageText[] = [];
    const last = Math.min(this.doc.numPages, MAX_PAGES_READ);
    for (let n = 1; n <= last; n++) {
      onPage?.(n, last);
      const page = await this.doc.getPage(n);
      try {
        const content = await page.getTextContent();
        const lines: string[] = [];
        let cur = '';
        for (const item of content.items) {
          if (!('str' in item)) continue;
          cur += item.str;
          if (item.hasEOL) {
            lines.push(cur);
            cur = '';
          } else if (item.str && !item.str.endsWith(' ')) cur += ' ';
        }
        if (cur.trim()) lines.push(cur);
        out.push({ page: n, text: lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n') });
      } finally {
        page.cleanup();
      }
    }
    return out;
  }

  async close() {
    await this.task.destroy();
  }
}

/** True when a page has enough real text that reading the picture is not needed. */
export function hasRealText(text: string): boolean {
  return (text.match(/\p{L}{2,}/gu) ?? []).length >= 3;
}
