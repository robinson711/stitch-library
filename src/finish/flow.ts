// "I finished one": she takes or picks a photo of a finished piece, the phone
// suggests which chart it is, and nothing is attached until she says yes.
//
//  choose photo -> working -> "Is this the chart?" --Yes--> confirm & save -> done
//                                   |No
//                                   v
//                    two more choices, search, "Add a new chart"

import { library as defaultLibrary } from '../backup/adapter';
import { newId, stamp } from '../backup/format';
import type { LibraryPort, PortChart } from '../backup/port';
import { matchService, type MatchResult, type MatchService } from '../match/service';
import { button, buttonRow, errorText, openScreen, photoButton, working } from '../overlay/screen';
import { preparePhoto } from '../photos/prepare';
import { h } from '../shared/dom';
import { chartName, filterCharts, nextChoices } from './pick';

export interface FinishOptions {
  port?: LibraryPort;
  match?: MatchService;
  /** Starts adding a new chart; `attach` saves her photo to it once the chart exists. */
  onAddNew?: (attach: (chartId: string) => Promise<void>) => void;
  /** Called after a photo is saved, e.g. to open that chart's page. */
  onSaved?: (chartId: string) => void;
  onClose?: () => void;
}

export function openFinishFlow(opts: FinishOptions = {}): void {
  const port = opts.port ?? defaultLibrary;
  const match = opts.match ?? matchService();
  const scr = openScreen('I finished one', opts.onClose);
  // Start the model now: it loads while she is taking the photo.
  match.warmUp().catch(() => {});

  let photo: Blob | null = null;
  let photoUrl = '';
  let result: MatchResult | null = null;
  let charts = new Map<string, PortChart>();
  const shown = new Set<string>();

  const cover = async (c: PortChart): Promise<string> => {
    const t = (await port.getThumb?.(c.id)) ?? (await port.getFile(c.coverFileId))?.blob;
    return t ? scr.url(t) : '';
  };
  const img = (src: string, alt: string) => (src ? h('img', { class: 'scr-img', src, alt }) : h('div', { class: 'scr-img', role: 'img', 'aria-label': alt }));

  function choose(problem?: string) {
    scr.show(
      'I finished one',
      problem ? errorText(problem) : null,
      h('p', {}, 'Take a photo of the finished piece, or choose one you already took.'),
      buttonRow(photoButton('Take a photo', true, picked, true), photoButton('Choose a photo', false, picked)),
    );
  }

  async function picked(file: File) {
    const w = working('Looking through your charts…');
    scr.show('One moment', w.el);
    try {
      photo = await preparePhoto(file);
      photoUrl = scr.url(photo);
      charts = new Map((await port.listCharts()).map((c) => [c.id, c]));
      if (!charts.size) return noCharts();
      result = await match.find(photo, (d, t) => w.set(`Getting your charts ready: ${d} of ${t}`));
      if (scr.closed) return;
      result.ranked = result.ranked.filter((r) => charts.has(r.chartId));
      if (result.likely) return isThis(result.ranked[0].chartId);
      return others('I couldn’t find a close match. Is it one of these?');
    } catch (e) {
      if (scr.closed) return;
      if (!photo) return choose((e as Error)?.message || 'This picture could not be opened. Please try another.');
      // Matching failed (for example, not enough memory): she can still search.
      result = { ranked: [], query: [], likely: false, ms: 0 };
      return others('The phone couldn’t compare this photo right now. You can find the chart by name instead.');
    }
  }

  function noCharts() {
    scr.show(
      'No charts yet',
      h('p', {}, 'Your library is empty, so there is nothing to compare with yet.'),
      addNewButton(),
      button('Cancel', () => scr.close(), 'quiet'),
    );
  }

  async function isThis(chartId: string) {
    const c = charts.get(chartId)!;
    shown.add(chartId);
    const src = await cover(c);
    if (scr.closed) return;
    scr.show(
      'Is this the chart?',
      h('div', { class: 'scr-pair' },
        h('figure', {}, img(photoUrl, 'Your photo'), h('figcaption', {}, 'Your photo')),
        h('figure', {}, img(src, `Cover of ${chartName(c)}`), h('figcaption', {}, 'Chart')),
      ),
      h('p', { class: 'scr-chart-title' }, chartName(c)),
      c.designer ? h('p', { class: 'scr-muted' }, c.designer) : null,
      buttonRow(
        button('Yes, that’s it', () => confirm(chartId), 'primary'),
        button('No', () => others('Is it one of these?')),
      ),
    );
  }

  async function others(question: string) {
    const ids = nextChoices(result?.ranked ?? [], shown);
    ids.forEach((id) => shown.add(id));
    const list = h('ul', { class: 'scr-choices' });
    for (const id of ids) list.append(h('li', {}, await choiceButton(charts.get(id)!)));
    const results = h('ul', { class: 'scr-choices', 'aria-live': 'polite' });
    const search = h('input', { type: 'text', inputmode: 'search', enterkeyhint: 'search', autocomplete: 'off', id: 'fin-search', placeholder: 'Title, designer or any word' });
    let seq = 0;
    search.addEventListener('input', async () => {
      const mine = ++seq;
      const found = filterCharts([...charts.values()], search.value).slice(0, 20);
      const items = await Promise.all(found.map(async (c) => h('li', {}, await choiceButton(c))));
      if (mine !== seq) return;
      results.replaceChildren(...items);
      if (search.value.trim() && !found.length) results.append(h('li', { class: 'scr-muted' }, 'No charts found.'));
    });
    if (scr.closed) return;
    scr.show(
      ids.length ? question : 'Which chart is it?',
      h('div', { class: 'scr-pair' }, h('figure', {}, img(photoUrl, 'Your photo'), h('figcaption', {}, 'Your photo'))),
      ids.length ? list : null,
      h('div', {}, h('label', { for: 'fin-search', class: 'scr-label' }, 'Find it by name'), search),
      results,
      addNewButton(),
    );
  }

  async function choiceButton(c: PortChart) {
    const src = await cover(c);
    return h('button', { type: 'button', class: 'scr-choice', onclick: () => confirm(c.id) },
      src ? h('img', { src, alt: '' }) : h('span', {}),
      h('span', {}, chartName(c), c.designer ? h('small', {}, c.designer) : null),
    );
  }

  function addNewButton() {
    if (!opts.onAddNew) return null;
    return button('Add a new chart', () => {
      const p = photo;
      const q = result?.query ?? [];
      scr.close();
      opts.onAddNew!(async (chartId) => {
        if (p) await save(chartId, p, '', q);
      });
    });
  }

  async function confirm(chartId: string) {
    const c = charts.get(chartId)!;
    const src = await cover(c);
    const note = h('textarea', { id: 'fin-note', rows: 3 });
    const save1 = button('Save', async () => {
      save1.disabled = true;
      try {
        await save(chartId, photo!, note.value.trim(), result?.query ?? []);
        done(c);
      } catch (e) {
        save1.disabled = false;
        save1.before(errorText((e as Error)?.message || 'The photo could not be saved. Please try again.'));
      }
    }, 'primary');
    if (scr.closed) return;
    scr.show(
      `Add to “${chartName(c)}”?`,
      h('div', { class: 'scr-pair' },
        h('figure', {}, img(photoUrl, 'Your photo'), h('figcaption', {}, 'Your photo')),
        h('figure', {}, img(src, `Cover of ${chartName(c)}`), h('figcaption', {}, 'Chart')),
      ),
      h('p', {}, 'Your photo will be saved to this chart as a finished piece.'),
      h('div', {}, h('label', { for: 'fin-note', class: 'scr-label' }, 'Note (optional)'), note),
      buttonRow(save1, button('Back', () => others('Is it one of these?'), 'quiet')),
    );
  }

  async function save(chartId: string, blob: Blob, notes: string, query: Float32Array[]) {
    const fileId = newId();
    await port.addPhoto(chartId, { id: newId(), fileId, kind: 'finished', notes, createdAt: stamp() }, { id: fileId, blob, type: 'image/jpeg' });
    if (query.length) await match.remember(chartId, fileId, query);
  }

  function done(c: PortChart) {
    scr.show(
      'Saved',
      h('p', {}, `Your photo is saved with “${chartName(c)}”. Well stitched!`),
      buttonRow(
        opts.onSaved ? button('Open the chart', () => (scr.close(), opts.onSaved!(c.id)), 'primary') : null,
        button('Done', () => scr.close(), opts.onSaved ? '' : 'primary'),
      ),
    );
  }

  choose();
}
