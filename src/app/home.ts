// Home: the grid of chart covers, one search box, Add, "I finished one" and Backup.
import { h, clear } from '../shared/dom';
import { listCharts, getFile, getThumb, putThumb } from '../db/library';
import type { ChartRecord } from '../db/types';
import { searchCharts } from '../search/search';
import { thumbFromBlob } from './pictures';
import { go, hrefOf, stillHere } from './nav';
import { blobUrl, newScreen, problem } from './ui';
import { openBackupMenu, openFinishFlow } from './hooks';

let lastQuery = '';

async function coverThumb(chart: ChartRecord): Promise<Blob | undefined> {
  const t = await getThumb(chart.id);
  if (t) return t;
  // Missing (for example after a restore): make it from the stored cover.
  const cover = chart.coverFileId ? await getFile(chart.coverFileId) : undefined;
  if (!cover) return undefined;
  const made = await thumbFromBlob(cover.blob);
  await putThumb(chart.id, made).catch(() => {});
  return made;
}

function card(chart: ChartRecord, here: () => boolean): HTMLElement {
  const label = chart.title || 'Untitled chart';
  const img = h('img', { alt: '', loading: 'lazy', decoding: 'async' });
  const pic = h('div', { class: 'cover' }, img);
  coverThumb(chart).then((b) => {
    if (b && here()) img.src = blobUrl(b);
    else if (!b) pic.classList.add('empty');
  }, () => pic.classList.add('empty'));
  return h('li', {},
    h('a', { class: 'card', href: hrefOf({ name: 'chart', id: chart.id }) },
      pic,
      h('span', { class: 'card-title' }, label),
      chart.designer ? h('span', { class: 'card-sub' }, chart.designer) : null));
}

export async function homeScreen() {
  const here = stillHere();
  let charts: ChartRecord[] = [];
  try {
    charts = await listCharts();
  } catch {
    await problem('Your library could not be opened. Please close the app and open it again.');
  }
  if (!here()) return;

  const grid = h('ul', { class: 'grid', 'aria-label': 'Your charts' });
  const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const search = h('input', {
    type: 'search', placeholder: 'Search your charts', value: lastQuery, 'aria-label': 'Search your charts',
    autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'search',
  });

  const show = () => {
    lastQuery = search.value;
    const found = searchCharts(charts, search.value);
    clear(grid);
    for (const c of found) grid.append(card(c, here));
    if (!charts.length) status.textContent = '';
    else if (!search.value.trim()) status.textContent = '';
    else if (!found.length) status.textContent = `No charts match “${search.value.trim()}”.`;
    else status.textContent = found.length === 1 ? '1 chart found.' : `${found.length} charts found.`;
    clearBtn.hidden = !search.value;
  };
  const clearBtn = h('button', { type: 'button', class: 'quiet', onclick: () => { search.value = ''; show(); search.focus(); } }, 'Clear');
  search.addEventListener('input', show);
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') search.blur(); });

  const empty = h('div', { class: 'empty-state' },
    h('p', {}, 'Your library is empty.'),
    h('p', { class: 'hint' }, 'Tap “Add a chart” to take a picture of a chart cover or choose a PDF.'));

  newScreen(
    'Stitch Library',
    h('header', { class: 'home-head' },
      h('h1', {}, 'Stitch Library'),
      h('button', { type: 'button', class: 'quiet small', onclick: () => void openBackupMenu() }, 'Backup')),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'primary big', onclick: () => go({ name: 'add' }) }, '+ Add a chart'),
      h('button', { type: 'button', class: 'big', onclick: () => void openFinishFlow() }, 'I finished one')),
    charts.length ? h('div', { class: 'search' }, search, clearBtn) : null,
    status,
    charts.length ? grid : empty,
  );
  show();
}
