// Project photos on a chart's page: a row of photos marked "In progress" or
// "Finished", each with an optional note. Tap one to see it full screen.

import { library as defaultLibrary } from '../backup/adapter';
import { newId, stamp } from '../backup/format';
import type { LibraryPort, PhotoKind, PortChart, PortPhoto } from '../backup/port';
import { matchService } from '../match/service';
import { button, buttonRow, errorText, openScreen, photoButton, working, type Screen } from '../overlay/screen';
import { clear, h } from '../shared/dom';
import { preparePhoto } from './prepare';
import { forgetThumb, thumbFor } from './thumbs';
import './photos.css';

export interface PhotoSectionOptions {
  port?: LibraryPort;
  /** Called after any change, so the chart page can refresh its other parts. */
  onChange?: () => void;
}

const KIND_LABEL: Record<PhotoKind, string> = { progress: 'In progress', finished: 'Finished' };

export function formatDay(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Draws the Photos part of a chart page into `container`; returns a function that redraws it. */
export function renderPhotoSection(container: HTMLElement, chartId: string, opts: PhotoSectionOptions = {}): () => Promise<void> {
  const port = opts.port ?? defaultLibrary;
  const urls: string[] = [];
  const section = h('section', { class: 'ph', 'aria-labelledby': `ph-h-${chartId}` });
  container.append(section);

  const changed = async () => {
    matchService().refresh().catch(() => {});
    opts.onChange?.();
    await draw();
  };

  let drawing = 0;
  async function draw() {
    const mine = ++drawing;
    const old = urls.splice(0);
    const chart = await port.getChart(chartId);
    if (!chart) {
      clear(section);
      return;
    }
    const list = h('ul', { class: 'ph-grid' });
    for (const p of [...chart.photos].reverse()) {
      const small = await thumbFor(p.fileId, async () => (await port.getFile(p.fileId))?.blob);
      if (!small) continue;
      const u = URL.createObjectURL(small);
      urls.push(u);
      const label = `${KIND_LABEL[p.kind]} photo${p.createdAt ? `, ${formatDay(p.createdAt)}` : ''}${p.notes ? `. ${p.notes}` : ''}`;
      list.append(h('li', {},
        h('button', { type: 'button', class: 'ph-tile', 'aria-label': label, onclick: () => void open(chart, p) },
          h('img', { src: u, alt: '', loading: 'lazy' }),
          h('span', { class: `ph-badge ph-${p.kind}` }, KIND_LABEL[p.kind]),
        ),
      ));
    }
    if (mine !== drawing) return; // a newer redraw has started
    old.forEach((u) => URL.revokeObjectURL(u));
    section.replaceChildren(
      h('h3', { id: `ph-h-${chartId}`, class: 'ph-title' }, 'Photos'),
      chart.photos.length ? list : h('p', { class: 'ph-empty' }, 'No photos yet. Add one as you stitch, or when it’s finished.'),
      button('Add a photo', () => add(chart)),
    );
  }

  function add(chart: PortChart) {
    const scr = openScreen('Add a photo');
    const pick = (problem?: string) =>
      scr.show('Add a photo', problem ? errorText(problem) : null, buttonRow(photoButton('Take a photo', true, (f) => picked(f), true), photoButton('Choose a photo', false, (f) => picked(f))));
    async function picked(file: File) {
      scr.show('One moment', working('Getting the photo ready…').el);
      let blob: Blob;
      try {
        blob = await preparePhoto(file);
      } catch (e) {
        return pick((e as Error)?.message || 'This picture could not be opened.');
      }
      details(scr, blob, null, async (kind, notes) => {
        const fileId = newId();
        await port.addPhoto(chart.id, { id: newId(), fileId, kind, notes, createdAt: stamp() }, { id: fileId, blob, type: 'image/jpeg' });
        scr.close();
        await changed();
      });
    }
    pick();
  }

  async function open(chart: PortChart, p: PortPhoto) {
    const f = await port.getFile(p.fileId);
    if (f) view(chart, p, f.blob);
  }

  function view(chart: PortChart, p: PortPhoto, blob: Blob) {
    const scr = openScreen('Photo', undefined, 'Close');
    const show = () =>
      scr.show(
        KIND_LABEL[p.kind],
        h('div', { class: 'ph-full' }, h('img', { src: scr.url(blob), alt: `${KIND_LABEL[p.kind]} photo of ${chart.title || 'this chart'}` })),
        p.createdAt ? h('p', { class: 'scr-muted' }, formatDay(p.createdAt)) : null,
        p.notes ? h('p', {}, p.notes) : null,
        buttonRow(
          button('Change', () =>
            details(scr, blob, p, async (kind, notes) => {
              const cur = await port.getChart(chart.id);
              if (!cur) return;
              cur.photos = cur.photos.map((x) => (x.id === p.id ? { ...x, kind, notes } : x));
              await port.updateChart(cur);
              p = { ...p, kind, notes };
              show();
              await changed();
            }),
          ),
          button('Delete photo', () => {
            scr.show(
              'Delete this photo?',
              h('p', {}, 'The photo will be removed from this chart. This can’t be undone.'),
              buttonRow(
                button('Delete', async () => {
                  await port.deletePhoto(chart.id, p.id);
                  forgetThumb(p.fileId);
                  scr.close();
                  await changed();
                }, 'danger'),
                button('Keep it', show, 'quiet'),
              ),
            );
          }, 'quiet'),
        ),
      );
    show();
  }

  void draw();
  return draw;
}

/** In progress or finished, plus a note. Shared by adding and changing a photo. */
function details(scr: Screen, blob: Blob, p: PortPhoto | null, onSave: (kind: PhotoKind, notes: string) => Promise<void>) {
  let kind: PhotoKind = p?.kind ?? 'progress';
  const radios = (['progress', 'finished'] as PhotoKind[]).map((k) => {
    const input = h('input', { type: 'radio', name: 'ph-kind', value: k, id: `ph-kind-${k}` });
    input.checked = k === kind;
    input.addEventListener('change', () => (kind = k));
    return h('label', { class: 'ph-radio', for: `ph-kind-${k}` }, input, KIND_LABEL[k]);
  });
  const note = h('textarea', { id: 'ph-note', rows: 3 });
  note.value = p?.notes ?? '';
  const save = button('Save', async () => {
    save.disabled = true;
    try {
      await onSave(kind, note.value.trim());
    } catch (e) {
      save.disabled = false;
      save.before(errorText((e as Error)?.message || 'The photo could not be saved. Please try again.'));
    }
  }, 'primary');
  scr.show(
    p ? 'Change photo' : 'About this photo',
    h('img', { class: 'scr-img', src: scr.url(blob), alt: 'The photo' }),
    h('fieldset', { class: 'ph-kinds' }, h('legend', { class: 'scr-label' }, 'This photo is'), ...radios),
    h('div', {}, h('label', { for: 'ph-note', class: 'scr-label' }, 'Note (optional)'), note),
    save,
  );
}
