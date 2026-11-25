// Adding a chart: pick a photo or PDF, trim, read the words, review, save.
// Nothing is saved until she taps Save.
import { h } from '../shared/dom';
import { loadToCanvas, releaseCanvas, ImageLoadError } from '../image/load';
import { saveNewChart, askToKeepStorage, StorageError } from '../db/library';
import { newId, nowStamp } from '../db/stamp';
import { CRAFTS, type Craft, type FileRecord } from '../db/types';
import { joinText } from '../ocr/clean';
import { cropScreen } from './crop';
import { readPicture, shrink, suggest, READ_SIZE, type Reading } from './reading';
import { jpegFile, thumbOf, STORE_SIZE } from './pictures';
import { go, stillHere } from './nav';
import { ask, blobUrl, filePicker, hideWorking, newScreen, nextFrame, notice, problem, showWorking, topBar, updateWorking, BASE } from './ui';
import { canvasToJpeg } from '../image/load';

/** Scanned PDF pages read after the cover. Each takes several seconds on the phone. */
const SCANNED_PAGES_READ = 3;

interface Draft {
  cover: HTMLCanvasElement;
  sources: FileRecord[];
  text: string;
  title: string;
  designer: string;
}

export function addScreen() {
  newScreen(
    'Add a chart',
    topBar('Library', () => go({ name: 'home' })),
    h('h1', {}, 'Add a chart'),
    h('p', { class: 'hint' }, 'Choose how to add the chart’s cover.'),
    h('div', { class: 'stack' },
      filePicker('Take a photo', { accept: 'image/*', camera: true, primary: true }, (f) => void fromPhoto(f[0])),
      filePicker('Choose a photo', { accept: 'image/*' }, (f) => void fromPhoto(f[0])),
      filePicker('Choose a PDF', { accept: 'application/pdf,.pdf' }, (f) => void fromPdf(f[0]))),
  );
}

/** Runs slow work behind the "Working" message, with a button to skip it. Resolves null if skipped or failed. */
function skippable<T>(message: string, skipLabel: string, work: (update: (m: string) => void) => Promise<T>): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (v: T | null) => {
      if (settled) return;
      settled = true;
      hideWorking();
      resolve(v);
    };
    showWorking(message, { label: skipLabel, action: () => settle(null) });
    nextFrame()
      .then(() => work(updateWorking))
      .then(settle, () => settle(null));
  });
}

async function fromPhoto(file: File) {
  const here = stillHere();
  showWorking('Opening the picture…');
  await nextFrame();
  let canvas: HTMLCanvasElement;
  try {
    canvas = await loadToCanvas(file, STORE_SIZE);
  } catch (e) {
    await problem(e instanceof ImageLoadError ? e.message : 'This picture could not be opened.');
    return;
  }
  hideWorking();
  if (!here()) return releaseCanvas(canvas);
  const cover = await cropScreen(canvas, 'Trim the cover');
  if (!cover) return addScreen();
  const reading = await skippable('Reading the words on the cover…\nThis can take up to half a minute.', 'Skip, I’ll type them', () => readPicture(shrink(cover, READ_SIZE)));
  const s = suggest(reading);
  review({ cover, sources: [], text: reading?.text ?? '', ...s });
}

async function fromPdf(file: File) {
  showWorking('Opening the PDF…');
  await nextFrame();
  const { ChartPdf, hasRealText } = await import('../pdf/pdf');
  let pdf: Awaited<ReturnType<typeof ChartPdf.open>>;
  let first: HTMLCanvasElement;
  let texts: { page: number; text: string }[];
  try {
    pdf = await ChartPdf.open(file, BASE);
    first = await pdf.renderPage(1, STORE_SIZE);
    texts = await pdf.pageTexts((n, of) => updateWorking(`Looking through the PDF… page ${n} of ${of}`));
  } catch (e) {
    await problem((e as Error)?.message || 'This PDF could not be opened.');
    return;
  }
  hideWorking();
  const cover = await cropScreen(first, 'Trim the cover');
  if (!cover) {
    await pdf.close();
    return addScreen();
  }

  // Use the text stored in the PDF where there is some; read the picture only for scanned pages.
  let coverReading: Reading | null = null;
  const scanned = texts.filter((t) => !hasRealText(t.text)).map((t) => t.page);
  const readCover = scanned.includes(1);
  const morePages = scanned.filter((p) => p !== 1).slice(0, SCANNED_PAGES_READ);
  let pagesText = '';
  if (readCover || morePages.length) {
    await skippable('Reading the words in the PDF…\nThis can take a minute.', 'Skip, I’ll type them', async (update) => {
      if (readCover) coverReading = await readPicture(shrink(cover, READ_SIZE));
      for (const [i, p] of morePages.entries()) {
        update(`Reading the words in the PDF… page ${i + 1} of ${morePages.length}`);
        const c = await pdf.renderPage(p, READ_SIZE);
        pagesText = joinText(pagesText, (await readPicture(c)).text);
        releaseCanvas(c);
      }
    });
  }
  await pdf.close();

  // Title and designer: from the cover picture if it was read, else from page 1's own text.
  const s = coverReading ? suggest(coverReading) : suggestFromPlainText(texts.find((t) => t.page === 1)?.text ?? '');
  const text = joinText((coverReading as Reading | null)?.text ?? '', ...texts.map((t) => t.text), pagesText);
  review({ cover, sources: [{ id: newId(), blob: file, type: 'application/pdf' }], text, ...s });
}

/** For PDFs with real text: no letter sizes are known, so the first proper line is taken as the title. */
function suggestFromPlainText(text: string): { title: string; designer: string } {
  const lines = text.split('\n').map((t, i) => ({ text: t, height: 20 - Math.min(i, 10), top: i * 30, confidence: 95 }));
  return suggest({ lines, text });
}

function craftPicker(value: Craft, onChange: (c: Craft) => void): HTMLElement {
  const group = h('div', { class: 'craft', role: 'group', 'aria-labelledby': 'craft-label' });
  const buttons = CRAFTS.map((c) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(c.value === value) }, c.label);
    b.addEventListener('click', () => {
      value = value === c.value ? '' : c.value; // tap again to clear
      buttons.forEach((x, i) => x.setAttribute('aria-pressed', String(CRAFTS[i].value === value)));
      onChange(value);
    });
    return b;
  });
  group.append(...buttons);
  return h('div', { class: 'field' }, h('span', { id: 'craft-label', class: 'label' }, 'Craft (optional)'), group);
}

export function field(label: string, input: HTMLInputElement | HTMLTextAreaElement, hint?: string): HTMLElement {
  return h('label', { class: 'field' }, h('span', { class: 'label' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
}

export { craftPicker };

async function review(d: Draft) {
  let craft: Craft = '';
  let saving = false;
  const preview = h('img', { class: 'review-cover', alt: 'The cover you added' });
  canvasToJpeg(shrink(d.cover, 900), 0.8).then((b) => (preview.src = blobUrl(b)), () => {});
  const title = h('input', { type: 'text', value: d.title, autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'next' });
  const designer = h('input', { type: 'text', value: d.designer, autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'done' });
  const notes = h('textarea', { rows: 3, autocapitalize: 'sentences' });

  const leave = async () => {
    if (await ask('Leave without saving?', 'This chart has not been saved yet.', 'Leave', 'Keep editing')) {
      releaseCanvas(d.cover);
      go({ name: 'home' });
    }
  };

  const save = async () => {
    if (saving) return;
    saving = true;
    showWorking('Saving…');
    await nextFrame();
    try {
      const cover = await jpegFile(d.cover);
      const thumb = await thumbOf(d.cover);
      const now = nowStamp();
      const chart = {
        id: newId(), title: title.value.trim(), designer: designer.value.trim(), craft,
        recognizedText: d.text, notes: notes.value.trim(), createdAt: now, updatedAt: now,
        coverFileId: cover.id, sourceFileIds: d.sources.map((s) => s.id), photos: [],
      };
      await saveNewChart(chart, [cover, ...d.sources], thumb);
      hideWorking();
      releaseCanvas(d.cover);
      void askToKeepStorage();
      go({ name: 'chart', id: chart.id }, true);
      notice('Saved.');
    } catch (e) {
      saving = false;
      await problem(e instanceof StorageError ? e.message : 'The chart could not be saved. Nothing was changed. Please try again.');
    }
  };

  newScreen(
    'Check the details',
    topBar('Cancel', () => void leave()),
    h('h1', {}, 'Check the details'),
    h('p', { class: 'hint' }, d.title || d.designer ? 'These were read from the cover. Fix anything that’s wrong.' : 'Type a title so you can find this chart later. Everything is optional.'),
    preview,
    field('Title', title),
    field('Designer', designer),
    craftPicker(craft, (c) => (craft = c)),
    field('Notes (optional)', notes),
    h('button', { type: 'button', class: 'primary wide', onclick: () => void save() }, 'Save'),
  );
}
