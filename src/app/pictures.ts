// Making the stored pictures: the cover, the small grid picture and chart pages.
import { canvasToJpeg, loadToCanvas, releaseCanvas } from '../image/load';
import { newId } from '../db/stamp';
import type { FileRecord } from '../db/types';
import { shrink } from './reading';

/** Covers and pages are kept sharp enough to read chart symbols on a big phone. */
export const STORE_SIZE = 2400;
export const THUMB_SIZE = 480;

export async function jpegFile(canvas: HTMLCanvasElement, maxSide = STORE_SIZE, quality = 0.86): Promise<FileRecord> {
  const small = shrink(canvas, maxSide);
  const blob = await canvasToJpeg(small, quality);
  if (small !== canvas) releaseCanvas(small);
  return { id: newId(), blob, type: 'image/jpeg' };
}

export async function thumbOf(canvas: HTMLCanvasElement): Promise<Blob> {
  const small = shrink(canvas, THUMB_SIZE);
  const blob = await canvasToJpeg(small, 0.75);
  if (small !== canvas) releaseCanvas(small);
  return blob;
}

/** Rebuilds a grid picture from a stored cover (after a restore, for example). */
export async function thumbFromBlob(blob: Blob): Promise<Blob> {
  const c = await loadToCanvas(blob, THUMB_SIZE);
  const b = await canvasToJpeg(c, 0.75);
  releaseCanvas(c);
  return b;
}
