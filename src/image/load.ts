// Turns a photo file (JPEG, PNG or iPhone HEIC) into a canvas no larger than
// needed, so 12–48 megapixel photos don't exhaust the phone's memory.
// Safari decodes HEIC itself and applies the photo's rotation (EXIF).

export class ImageLoadError extends Error {}

function decodeWithImg(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageLoadError('This picture could not be opened.'));
    };
    img.src = url;
  });
}

/** Draws the photo into a canvas whose longest side is at most `maxSide` pixels. */
export async function loadToCanvas(blob: Blob, maxSide: number): Promise<HTMLCanvasElement> {
  const img = await decodeWithImg(blob);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) throw new ImageLoadError('This picture appears to be empty.');
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageLoadError('The phone ran out of memory for this picture.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.src = '';
  return canvas;
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageLoadError('Could not save the picture.'))), 'image/jpeg', quality);
  });
}

/** Frees a canvas's memory right away (Safari keeps it otherwise). */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 1;
  canvas.height = 1;
}
