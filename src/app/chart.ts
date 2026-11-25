// A chart's page: cover, details, chart pages or PDF, notes and photos.
import { h } from '../shared/dom';
import { getChart, getFile, deleteChart, updateChart, StorageError } from '../db/library';
import { craftLabel, type ChartRecord, type FileRecord } from '../db/types';
import { loadToCanvas, releaseCanvas, ImageLoadError } from '../image/load';
import { joinText } from '../ocr/clean';
import { readPicture, shrink, READ_SIZE } from './reading';
import { jpegFile } from './pictures';
import { go, stillHere } from './nav';
import { ask, blobUrl, filePicker, hideWorking, newScreen, nextFrame, notice, problem, showWorking, topBar, updateWorking } from './ui';
import { viewImage, viewPdf } from './viewer';
import { renderPhotoSection } from './hooks';

export async function chartScreen(id: string) {
  const here = stillHere();
  const chart = await getChart(id).catch(() => undefined);
  if (!here()) return;
  if (!chart) {
    newScreen('Not found', topBar('Library', () => go({ name: 'home' })), h('h1', {}, 'This chart isn’t in your library'),
      h('p', {}, 'It may have been deleted.'));
    return;
  }
  const title = chart.title || 'Untitled chart';

  const coverBox = h('button', { type: 'button', class: 'cover-button', 'aria-label': `${title} cover. Tap to see it full screen.` });
  const cover = chart.coverFileId ? await getFile(chart.coverFileId).catch(() => undefined) : undefined;
  if (!here()) return;
  if (cover) {
    coverBox.append(h('img', { src: blobUrl(cover.blob), alt: '' }));
    coverBox.addEventListener('click', () => viewImage(cover.blob, `${title} cover`));
  } else coverBox.disabled = true;

  // Chart pages (photos of pages) and PDFs.
  const sources = (await Promise.all(chart.sourceFileIds.map((f) => getFile(f).catch(() => undefined)))).filter((f): f is FileRecord => !!f);
  if (!here()) return;
  const pages = h('ul', { class: 'pages' });
  let pageNo = 0;
  for (const f of sources) {
    if (f.type === 'application/pdf') {
      pages.append(h('li', {}, h('button', { type: 'button', class: 'pdf-button', onclick: () => void viewPdf(f.blob, title) }, '📄 Open the chart PDF')));
    } else {
      pageNo++;
      const n = pageNo;
      pages.append(h('li', {}, h('button', { type: 'button', class: 'page-thumb', 'aria-label': `Chart page ${n}. Tap to see it full screen.`, onclick: () => viewImage(f.blob, `${title}, page ${n}`) },
        h('img', { src: blobUrl(f.blob), alt: '', loading: 'lazy' }))));
    }
  }

  const photos = h('section', { class: 'photos', 'aria-label': 'Photos' });
  void renderPhotoSection(photos, chart.id);

  const details = h('dl', { class: 'details' });
  const addDetail = (k: string, v: string) => { if (v) details.append(h('dt', {}, k), h('dd', {}, v)); };
  addDetail('Designer', chart.designer);
  addDetail('Craft', craftLabel(chart.craft));

  newScreen(
    title,
    topBar('Library', () => go({ name: 'home' }), h('button', { type: 'button', class: 'quiet', onclick: () => go({ name: 'edit', id: chart.id }) }, 'Edit')),
    coverBox,
    h('h1', {}, title),
    details,
    chart.notes ? h('section', { 'aria-label': 'Notes' }, h('h2', {}, 'Notes'), h('p', { class: 'notes' }, chart.notes)) : null,
    h('section', { 'aria-label': 'Chart pages' },
      h('h2', {}, 'Chart pages'),
      sources.length ? pages : h('p', { class: 'hint' }, 'No chart pages yet. You can add photos of the chart pages so they’re all in one place.'),
      filePicker('Add photos of chart pages', { accept: 'image/*', multiple: true }, (files) => void addPages(chart, files))),
    photos,
    h('div', { class: 'stack bottom' },
      h('button', { type: 'button', class: 'wide', onclick: () => go({ name: 'edit', id: chart.id }) }, 'Edit details'),
      h('button', { type: 'button', class: 'danger wide', onclick: () => void removeChart(chart) }, 'Delete chart')),
  );
}

async function addPages(chart: ChartRecord, files: File[]) {
  showWorking(files.length === 1 ? 'Adding the page…' : `Adding ${files.length} pages…`);
  await nextFrame();
  const newFiles: FileRecord[] = [];
  let text = chart.recognizedText;
  let failed = 0;
  for (const [i, file] of files.entries()) {
    updateWorking(files.length === 1 ? 'Adding the page and reading its words…' : `Adding page ${i + 1} of ${files.length} and reading its words…`);
    let c: HTMLCanvasElement | null = null;
    try {
      c = await loadToCanvas(file, 2400);
      newFiles.push(await jpegFile(c));
      try {
        text = joinText(text, (await readPicture(shrink(c, READ_SIZE))).text);
      } catch {
        /* words are a bonus; the page is still added */
      }
    } catch (e) {
      if (!(e instanceof ImageLoadError)) throw e;
      failed++;
    } finally {
      if (c) releaseCanvas(c);
    }
  }
  try {
    if (newFiles.length)
      await updateChart({ ...chart, recognizedText: text, sourceFileIds: [...chart.sourceFileIds, ...newFiles.map((f) => f.id)] }, newFiles);
    hideWorking();
    if (failed) await problem(failed === 1 ? 'One picture could not be opened, so it was left out.' : `${failed} pictures could not be opened, so they were left out.`);
    else notice(newFiles.length === 1 ? 'Page added.' : 'Pages added.');
  } catch (e) {
    await problem(e instanceof StorageError ? e.message : 'The pages could not be saved. Nothing was changed.');
  }
  go({ name: 'chart', id: chart.id }, true);
}

async function removeChart(chart: ChartRecord) {
  const name = chart.title ? `“${chart.title}”` : 'this chart';
  const sure = await ask(`Delete ${name}?`, 'This removes the chart, its pages and its photos from this phone. This can’t be undone.', 'Delete', 'Keep it', true);
  if (!sure) return;
  try {
    await deleteChart(chart.id);
    go({ name: 'home' }, true);
    notice('Chart deleted.');
  } catch (e) {
    await problem(e instanceof StorageError ? e.message : 'The chart could not be deleted. Please try again.');
  }
}
