// Full-screen viewing of a cover, a chart page or a chart PDF.
// Pinch to zoom works as usual on the iPhone.
import { h } from '../shared/dom';
import { releaseCanvas } from '../image/load';
import { BASE, problem } from './ui';

function overlay(label: string): { body: HTMLElement; bar: HTMLElement; onClose: (f: () => void) => void } {
  const el = h('dialog', { class: 'viewer', 'aria-label': label });
  const body = h('div', { class: 'viewer-body' });
  const bar = h('div', { class: 'viewer-bar' });
  const hooks: (() => void)[] = [];
  const close = () => {
    for (const f of hooks.splice(0)) f();
    el.close();
    el.remove();
  };
  bar.append(h('button', { type: 'button', class: 'primary', onclick: close }, 'Close'));
  el.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  el.append(bar, body);
  document.body.append(el);
  el.showModal();
  return { body, bar, onClose: (f) => hooks.push(f) };
}

/** Shows a picture full screen. */
export function viewImage(blob: Blob, alt: string) {
  const url = URL.createObjectURL(blob);
  const v = overlay(alt);
  v.body.append(h('img', { src: url, alt }));
  v.onClose(() => URL.revokeObjectURL(url));
}

/** Shows a PDF one page at a time, with Previous and Next. */
export async function viewPdf(blob: Blob, title: string) {
  const { ChartPdf } = await import('../pdf/pdf');
  let pdf: Awaited<ReturnType<typeof ChartPdf.open>>;
  try {
    pdf = await ChartPdf.open(blob, BASE);
  } catch (e) {
    await problem((e as Error).message);
    return;
  }
  const v = overlay(title);
  let page = 1;
  let canvas: HTMLCanvasElement | null = null;
  const label = h('span', { class: 'page-label', 'aria-live': 'polite' });
  const prev = h('button', { type: 'button' }, '‹ Previous');
  const next = h('button', { type: 'button' }, 'Next ›');
  const show = async () => {
    label.textContent = `Page ${page} of ${pdf.pageCount}`;
    prev.disabled = page <= 1;
    next.disabled = page >= pdf.pageCount;
    const size = Math.min(2400, Math.max(window.innerWidth, window.innerHeight) * Math.min(3, window.devicePixelRatio || 1));
    try {
      const c = await pdf.renderPage(page, size);
      c.className = 'viewer-page';
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', `${title}, page ${page}`);
      if (canvas) {
        canvas.replaceWith(c);
        releaseCanvas(canvas);
      } else v.body.append(c);
      canvas = c;
      v.body.scrollTo(0, 0);
    } catch {
      label.textContent = `Page ${page} could not be shown.`;
    }
  };
  prev.addEventListener('click', () => { if (page > 1) { page--; void show(); } });
  next.addEventListener('click', () => { if (page < pdf.pageCount) { page++; void show(); } });
  v.bar.prepend(h('div', { class: 'pager' }, prev, label, next));
  v.onClose(() => {
    if (canvas) releaseCanvas(canvas);
    void pdf.close();
  });
  await show();
}
