// Prepares the model's input: square 224×224 views of a picture, normalised
// the way DINOv2 was trained (ImageNet mean and standard deviation).

export const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export type ViewName = 'whole' | 'center' | 'center70';

/**
 * - whole: the entire picture, padded to a square with grey (nothing cut off)
 * - center: the largest centred square
 * - center70: the middle 70% — the stitched piece without frame, hoop or cover text
 */
export const VIEW_NAMES: ViewName[] = ['whole', 'center', 'center70'];

export function makeView(src: HTMLCanvasElement, view: ViewName): ImageData {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  const { width: w, height: h } = src;
  if (view === 'whole') {
    ctx.fillStyle = 'rgb(124,116,104)'; // ImageNet mean colour: neutral to the model
    ctx.fillRect(0, 0, SIZE, SIZE);
    const s = SIZE / Math.max(w, h);
    const dw = w * s;
    const dh = h * s;
    ctx.drawImage(src, (SIZE - dw) / 2, (SIZE - dh) / 2, dw, dh);
  } else {
    const side = Math.min(w, h) * (view === 'center' ? 1 : 0.7);
    ctx.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
  }
  const data = ctx.getImageData(0, 0, SIZE, SIZE);
  c.width = 1;
  c.height = 1;
  return data;
}

/** Packs views into one Float32 tensor of shape [n, 3, 224, 224]. */
export function toPixelValues(views: ImageData[]): Float32Array {
  const plane = SIZE * SIZE;
  const out = new Float32Array(views.length * 3 * plane);
  views.forEach((img, n) => {
    const base = n * 3 * plane;
    const d = img.data;
    for (let i = 0; i < plane; i++) {
      out[base + i] = (d[i * 4] / 255 - MEAN[0]) / STD[0];
      out[base + plane + i] = (d[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
      out[base + 2 * plane + i] = (d[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
    }
  });
  return out;
}
