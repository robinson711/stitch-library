// Reads the words in a picture, loading the text reader only the first time.
import { TextReader } from '../ocr/ocr';
import { cleanText } from '../ocr/clean';
import { suggestTitleAndDesigner, type Suggestion, type TextLine } from '../ocr/suggest';
import { BASE } from './ui';

let readerPromise: Promise<TextReader> | null = null;

function reader(): Promise<TextReader> {
  if (!readerPromise) {
    readerPromise = TextReader.create(BASE);
    readerPromise.catch(() => (readerPromise = null));
  }
  return readerPromise;
}

/** Largest side, in pixels, of the picture given to the text reader. */
export const READ_SIZE = 2000;

export interface Reading {
  lines: TextLine[];
  /** Cleaned text for search. */
  text: string;
}

/** Reads a picture. "auto" layout was much faster than "sparse" on the iPhone in Phase 1. */
export async function readPicture(canvas: HTMLCanvasElement): Promise<Reading> {
  const r = await reader();
  const res = await r.read(canvas, 'auto');
  return { lines: res.lines, text: cleanText(res.lines) };
}

export function suggest(reading: Reading | null): Suggestion {
  return reading ? suggestTitleAndDesigner(reading.lines) : { title: '', designer: '' };
}

/** Copies a canvas, shrinking it so its longest side is at most `maxSide`. */
export function shrink(canvas: HTMLCanvasElement, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  if (scale === 1) return canvas;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}
