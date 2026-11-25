// Small shared pieces for the app's screens: the "Working" message, the
// "Are you sure?" question, short notices, and picture addresses.
import { h, clear } from '../shared/dom';

export const BASE = new URL('./', location.href).href;

/** The screen area. Each screen clears and fills it. */
export const root = (): HTMLElement => document.getElementById('app')!;

// Picture addresses (blob: URLs) made for the current screen; freed when the screen changes.
let urls: string[] = [];
export function blobUrl(blob: Blob): string {
  const u = URL.createObjectURL(blob);
  urls.push(u);
  return u;
}
export function freeScreenUrls() {
  for (const u of urls) URL.revokeObjectURL(u);
  urls = [];
}

/**
 * Starts a new screen and moves focus to its heading for VoiceOver.
 * (Pictures are freed when the address changes, in main.ts, not here, because
 * a screen often makes its pictures before showing them.)
 */
export function newScreen(title: string, ...children: (Node | false | null | undefined)[]): HTMLElement {
  const el = root();
  clear(el);
  for (const c of children) if (c) el.append(c);
  document.title = title === 'Stitch Library' ? title : `${title} · Stitch Library`;
  window.scrollTo(0, 0);
  const heading = el.querySelector('h1');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
  return el;
}

/** A top bar with a Back button that goes to `href`. */
export function topBar(backLabel: string, onBack: () => void, ...right: Node[]): HTMLElement {
  return h('div', { class: 'topbar' }, h('button', { class: 'quiet back', type: 'button', onclick: onBack }, '‹ ' + backLabel), ...right);
}

// "Working" message, shown over everything while something slow happens.
let working: HTMLElement | null = null;
export function showWorking(message: string, onSkip?: { label: string; action: () => void }) {
  hideWorking();
  const msg = h('p', { class: 'working-text', role: 'status', 'aria-live': 'polite' }, message);
  working = h(
    'div',
    { class: 'working', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Working' },
    h('div', { class: 'working-box' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), msg,
      onSkip ? h('button', { type: 'button', onclick: onSkip.action }, onSkip.label) : null),
  );
  document.body.append(working);
}
export function updateWorking(message: string) {
  const p = working?.querySelector('.working-text');
  if (p) p.textContent = message;
}
export function hideWorking() {
  working?.remove();
  working = null;
}

/** Asks a yes/no question. Resolves true only if she taps the first (yes) button. */
export function ask(question: string, detail: string, yes: string, no: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'ask', 'aria-labelledby': 'ask-q' });
    const done = (v: boolean) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    dlg.append(
      h('h2', { id: 'ask-q' }, question),
      detail ? h('p', {}, detail) : '',
      h('div', { class: 'ask-buttons' },
        h('button', { type: 'button', class: danger ? 'danger' : 'primary', onclick: () => done(true) }, yes),
        h('button', { type: 'button', onclick: () => done(false) }, no)),
    );
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(false);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** A short message at the bottom of the screen that goes away by itself. */
export function notice(message: string, ms = 4000) {
  document.querySelector('.notice')?.remove();
  const el = h('div', { class: 'notice', role: 'status', 'aria-live': 'polite' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

/** A problem she needs to read, with one OK button. */
export async function problem(message: string) {
  hideWorking();
  return new Promise<void>((resolve) => {
    const dlg = h('dialog', { class: 'ask', role: 'alertdialog', 'aria-labelledby': 'prob' });
    const ok = h('button', { type: 'button', class: 'primary', onclick: () => { dlg.close(); dlg.remove(); resolve(); } }, 'OK');
    dlg.append(h('p', { id: 'prob' }, message), h('div', { class: 'ask-buttons' }, ok));
    document.body.append(dlg);
    dlg.showModal();
    ok.focus();
  });
}

/** A big button that opens the camera, the photo library or Files. */
export function filePicker(label: string, opts: { accept: string; camera?: boolean; multiple?: boolean; primary?: boolean }, onPick: (files: File[]) => void): HTMLElement {
  const input = h('input', { type: 'file', accept: opts.accept, class: 'visually-hidden', multiple: !!opts.multiple, capture: opts.camera ? 'environment' : undefined });
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) onPick(files);
  });
  return h('label', { class: opts.primary ? 'pick big primary' : 'pick big' }, input, label);
}

/** Lets the screen redraw before slow work starts, so "Working" shows up first. */
export function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}
