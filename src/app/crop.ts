// Simple crop and rotate: a frame with four corner handles over the picture,
// a "Turn" button and a "Done" button. Trimming is optional.
import { h } from '../shared/dom';
import { releaseCanvas } from '../image/load';
import { newScreen } from './ui';

interface Rect { x0: number; y0: number; x1: number; y1: number } // 0..1 of the picture

const MIN = 0.08; // smallest frame, as a share of the picture

/** Turns a canvas a quarter turn clockwise. */
export function rotate90(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.height;
  out.height = src.width;
  const ctx = out.getContext('2d')!;
  ctx.translate(out.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return out;
}

/** Cuts the framed part out of a canvas. */
export function cropCanvas(src: HTMLCanvasElement, r: Rect): HTMLCanvasElement {
  const sx = Math.round(r.x0 * src.width);
  const sy = Math.round(r.y0 * src.height);
  const sw = Math.max(1, Math.round((r.x1 - r.x0) * src.width));
  const sh = Math.max(1, Math.round((r.y1 - r.y0) * src.height));
  if (sx === 0 && sy === 0 && sw === src.width && sh === src.height) return src;
  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  out.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

function preview(src: HTMLCanvasElement, maxSide = 1200): HTMLCanvasElement {
  const s = Math.min(1, maxSide / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * s));
  c.height = Math.max(1, Math.round(src.height * s));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/**
 * Shows the crop screen. Resolves with the trimmed, turned picture, or null
 * if she taps Cancel. The original canvas is released when no longer needed.
 */
export function cropScreen(source: HTMLCanvasElement, heading = 'Trim the picture'): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    let src = source;
    let rect: Rect = { x0: 0, y0: 0, x1: 1, y1: 1 };
    const stage = h('div', { class: 'crop-stage' });
    const frame = h('div', { class: 'crop-frame', 'aria-hidden': 'true' });
    const corners = (['tl', 'tr', 'bl', 'br'] as const).map((k) => {
      const el = h('div', { class: `crop-handle ${k}` });
      el.dataset.corner = k;
      return el;
    });
    frame.append(...corners);
    let view = preview(src);
    view.className = 'crop-image';
    stage.append(view, frame);

    const draw = () => {
      frame.style.left = `${rect.x0 * 100}%`;
      frame.style.top = `${rect.y0 * 100}%`;
      frame.style.width = `${(rect.x1 - rect.x0) * 100}%`;
      frame.style.height = `${(rect.y1 - rect.y0) * 100}%`;
    };

    // Dragging a corner moves that corner; dragging inside the frame moves the whole frame.
    let drag: { corner: string | null; start: { x: number; y: number }; from: Rect } | null = null;
    const pos = (e: PointerEvent) => {
      const b = stage.getBoundingClientRect();
      return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height };
    };
    frame.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      drag = { corner: t.dataset.corner ?? null, start: pos(e), from: { ...rect } };
      frame.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    frame.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = pos(e);
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      const f = drag.from;
      const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
      if (!drag.corner) {
        const w = f.x1 - f.x0;
        const hgt = f.y1 - f.y0;
        const x0 = clamp(f.x0 + dx, 0, 1 - w);
        const y0 = clamp(f.y0 + dy, 0, 1 - hgt);
        rect = { x0, y0, x1: x0 + w, y1: y0 + hgt };
      } else {
        const r = { ...f };
        if (drag.corner.includes('l')) r.x0 = clamp(f.x0 + dx, 0, f.x1 - MIN);
        if (drag.corner.includes('r')) r.x1 = clamp(f.x1 + dx, f.x0 + MIN, 1);
        if (drag.corner.includes('t')) r.y0 = clamp(f.y0 + dy, 0, f.y1 - MIN);
        if (drag.corner.includes('b')) r.y1 = clamp(f.y1 + dy, f.y0 + MIN, 1);
        rect = r;
      }
      draw();
    });
    const end = () => (drag = null);
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);

    const turn = () => {
      const turned = rotate90(src);
      if (src !== source) releaseCanvas(src);
      src = turned;
      // Turn the frame with the picture.
      rect = { x0: 1 - rect.y1, y0: rect.x0, x1: 1 - rect.y0, y1: rect.x1 };
      const next = preview(src);
      next.className = 'crop-image';
      view.replaceWith(next);
      releaseCanvas(view);
      view = next;
      draw();
    };
    const reset = () => {
      rect = { x0: 0, y0: 0, x1: 1, y1: 1 };
      draw();
    };
    const finish = (ok: boolean) => {
      releaseCanvas(view);
      if (!ok) {
        if (src !== source) releaseCanvas(src);
        releaseCanvas(source);
        resolve(null);
        return;
      }
      const out = cropCanvas(src, rect);
      if (src !== out) releaseCanvas(src);
      if (source !== src && source !== out) releaseCanvas(source);
      resolve(out);
    };

    newScreen(
      heading,
      h('div', { class: 'topbar' }, h('button', { type: 'button', class: 'quiet back', onclick: () => finish(false) }, 'Cancel')),
      h('h1', {}, heading),
      h('p', { class: 'hint' }, 'Drag the corners to trim the edges, if you like. This is optional.'),
      h('div', { class: 'crop-wrap' }, stage),
      h('div', { class: 'row-buttons' },
        h('button', { type: 'button', onclick: turn }, '↻ Turn'),
        h('button', { type: 'button', class: 'quiet', onclick: reset }, 'Use whole picture')),
      h('button', { type: 'button', class: 'primary wide', onclick: () => finish(true) }, 'Done'),
    );
    draw();
  });
}
