// Editing a chart's details, changing its cover and removing chart pages.
import { h } from '../shared/dom';
import { getChart, getFile, updateChart, StorageError } from '../db/library';
import type { Craft, FileRecord } from '../db/types';
import { loadToCanvas, ImageLoadError, releaseCanvas } from '../image/load';
import { cropScreen } from './crop';
import { jpegFile, thumbOf, STORE_SIZE } from './pictures';
import { craftPicker, field } from './add';
import { go, stillHere } from './nav';
import { ask, blobUrl, filePicker, hideWorking, newScreen, nextFrame, notice, problem, showWorking, topBar } from './ui';

export async function editScreen(id: string) {
  const here = stillHere();
  const chart = await getChart(id).catch(() => undefined);
  if (!here()) return;
  if (!chart) return go({ name: 'home' }, true);

  const title = h('input', { type: 'text', value: chart.title, autocomplete: 'off', autocapitalize: 'words' });
  const designer = h('input', { type: 'text', value: chart.designer, autocomplete: 'off', autocapitalize: 'words' });
  const notes = h('textarea', { rows: 4, autocapitalize: 'sentences' });
  notes.value = chart.notes;
  let craft: Craft = chart.craft;
  let sourceIds = [...chart.sourceFileIds];
  let newCover: HTMLCanvasElement | null = null;
  let saving = false;

  const coverImg = h('img', { class: 'review-cover', alt: 'Cover' });
  const coverFile = chart.coverFileId ? await getFile(chart.coverFileId).catch(() => undefined) : undefined;
  const showCover = async () => {
    if (newCover) {
      const { canvasToJpeg } = await import('../image/load');
      coverImg.src = blobUrl(await canvasToJpeg(newCover, 0.8));
    } else if (coverFile) coverImg.src = blobUrl(coverFile.blob);
  };

  const changeCover = async (file: File) => {
    let c: HTMLCanvasElement;
    try {
      c = await loadToCanvas(file, STORE_SIZE);
    } catch (e) {
      return problem(e instanceof ImageLoadError ? e.message : 'This picture could not be opened.');
    }
    // The crop screen replaces this one; remember what was typed, then come back.
    const typed = { t: title.value, d: designer.value, n: notes.value };
    const cut = await cropScreen(c, 'Trim the new cover');
    if (cut) {
      if (newCover) releaseCanvas(newCover);
      newCover = cut;
    }
    render();
    title.value = typed.t;
    designer.value = typed.d;
    notes.value = typed.n;
  };

  const sources = (await Promise.all(chart.sourceFileIds.map((f) => getFile(f).catch(() => undefined)))).filter((f): f is FileRecord => !!f);
  if (!here()) return;

  const pageList = () => {
    const list = h('ul', { class: 'edit-pages' });
    let n = 0;
    for (const f of sources) {
      if (!sourceIds.includes(f.id)) continue;
      const isPdf = f.type === 'application/pdf';
      if (!isPdf) n++;
      const label = isPdf ? 'Chart PDF' : `Chart page ${n}`;
      const remove = async () => {
        if (!(await ask(`Remove ${label.toLowerCase()}?`, 'It will be removed when you tap Save.', 'Remove', 'Keep it', true))) return;
        sourceIds = sourceIds.filter((x) => x !== f.id);
        pagesBox.replaceChildren(pageList());
      };
      list.append(h('li', {},
        isPdf ? h('span', { class: 'pdf-label' }, '📄 Chart PDF') : h('img', { src: blobUrl(f.blob), alt: label }),
        h('button', { type: 'button', class: 'quiet', onclick: () => void remove(), 'aria-label': `Remove ${label}` }, 'Remove')));
    }
    return list.children.length ? list : h('p', { class: 'hint' }, 'No chart pages.');
  };
  const pagesBox = h('div', {});

  const leave = async () => {
    const changed = title.value !== chart.title || designer.value !== chart.designer || notes.value !== chart.notes ||
      craft !== chart.craft || newCover || sourceIds.length !== chart.sourceFileIds.length;
    if (!changed || (await ask('Leave without saving?', 'Your changes will be lost.', 'Leave', 'Keep editing'))) {
      if (newCover) releaseCanvas(newCover);
      go({ name: 'chart', id: chart.id }, true);
    }
  };

  const save = async () => {
    if (saving) return;
    saving = true;
    showWorking('Saving…');
    await nextFrame();
    try {
      const files: FileRecord[] = [];
      let thumb: Blob | undefined;
      let coverFileId = chart.coverFileId;
      if (newCover) {
        const f = await jpegFile(newCover);
        files.push(f);
        coverFileId = f.id;
        thumb = await thumbOf(newCover);
      }
      await updateChart({
        ...chart, title: title.value.trim(), designer: designer.value.trim(), notes: notes.value.trim(), craft,
        coverFileId, sourceFileIds: sourceIds,
      }, files, thumb);
      hideWorking();
      if (newCover) releaseCanvas(newCover);
      go({ name: 'chart', id: chart.id }, true);
      notice('Saved.');
    } catch (e) {
      saving = false;
      await problem(e instanceof StorageError ? e.message : 'The changes could not be saved. Nothing was changed.');
    }
  };

  const render = () => {
    newScreen(
      'Edit details',
      topBar('Cancel', () => void leave()),
      h('h1', {}, 'Edit details'),
      field('Title', title),
      field('Designer', designer),
      craftPicker(craft, (c) => (craft = c)),
      field('Notes', notes),
      h('section', { 'aria-label': 'Cover' }, h('h2', {}, 'Cover'), coverImg,
        filePicker('Change the cover picture', { accept: 'image/*' }, (f) => void changeCover(f[0]))),
      h('section', { 'aria-label': 'Chart pages' }, h('h2', {}, 'Chart pages'), pagesBox),
      h('button', { type: 'button', class: 'primary wide', onclick: () => void save() }, 'Save'),
    );
    // Pictures are made after newScreen, which frees the previous screen's pictures.
    pagesBox.replaceChildren(pageList());
    void showCover();
  };
  render();
}
