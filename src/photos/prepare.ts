// Turns a picked photo (JPEG, PNG or HEIC, any size) into a JPEG that is big
// enough to enjoy full screen but small enough to keep hundreds of them.
import { canvasToJpeg, loadToCanvas, releaseCanvas } from '../image/load';

export const PHOTO_MAX_SIDE = 2560;

export async function preparePhoto(file: Blob): Promise<Blob> {
  const canvas = await loadToCanvas(file, PHOTO_MAX_SIDE);
  try {
    return await canvasToJpeg(canvas, 0.85);
  } finally {
    releaseCanvas(canvas);
  }
}
