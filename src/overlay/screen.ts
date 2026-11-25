// A full-screen page on top of the app, used by "I finished one", photos and
// backup. Built on <dialog> so VoiceOver and the keyboard stay inside it.
import { clear, h } from '../shared/dom';
import './screen.css';

export interface Screen {
  dialog: HTMLDialogElement;
  /** Replaces the page content and moves VoiceOver to the new heading. */
  show(heading: string, ...content: (Node | null | false | undefined)[]): void;
  /** Keeps blob: URLs alive until the screen closes. */
  url(blob: Blob): string;
  close(): void;
  /** Changes the top-right button's words, e.g. to "Close" once something is saved. */
  setCancelText(text: string): void;
  closed: boolean;
}

export function openScreen(label: string, onClose?: () => void, cancelText = 'Cancel'): Screen {
  const urls: string[] = [];
  const heading = h('h2', { tabindex: '-1', class: 'scr-title' });
  const body = h('div', { class: 'scr-body' });
  const cancel = h('button', { type: 'button', class: 'quiet scr-cancel' }, cancelText);
  const dialog = h('dialog', { class: 'scr', 'aria-label': label }, h('div', { class: 'scr-bar' }, heading, cancel), body);
  const screen: Screen = {
    dialog,
    closed: false,
    show(title, ...content) {
      heading.textContent = title;
      clear(body);
      for (const c of content) if (c) body.append(c);
      body.scrollTop = 0;
      heading.focus();
    },
    url(blob) {
      const u = URL.createObjectURL(blob);
      urls.push(u);
      return u;
    },
    setCancelText(text) {
      cancel.textContent = text;
    },
    close() {
      if (screen.closed) return;
      screen.closed = true;
      dialog.close();
      dialog.remove();
      urls.forEach((u) => URL.revokeObjectURL(u));
      onClose?.();
    },
  };
  cancel.addEventListener('click', () => screen.close());
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    screen.close();
  });
  document.body.append(dialog);
  dialog.showModal();
  return screen;
}

/** A plain "Working" message with optional detail that can change. */
export function working(text: string): { el: HTMLElement; set(detail: string): void } {
  const detail = h('p', { class: 'scr-muted', 'aria-live': 'polite' });
  const el = h('div', { class: 'scr-working', role: 'status' }, h('div', { class: 'scr-spinner', 'aria-hidden': 'true' }), h('p', {}, text), detail);
  return { el, set: (d) => (detail.textContent = d) };
}

/** A big button that opens the camera or the photo library. */
export function photoButton(text: string, camera: boolean, onPick: (file: File) => void, primary = false): HTMLElement {
  const input = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true' });
  if (camera) input.setAttribute('capture', 'environment');
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    input.value = '';
    if (f) onPick(f);
  });
  const btn = h('button', { type: 'button', class: primary ? 'primary scr-wide' : 'scr-wide' }, text);
  btn.addEventListener('click', () => input.click());
  return h('div', {}, btn, input);
}

export function buttonRow(...buttons: (HTMLElement | null)[]): HTMLElement {
  return h('div', { class: 'scr-buttons' }, ...buttons);
}

export function button(text: string, onClick: () => void, kind: '' | 'primary' | 'quiet' | 'danger' = ''): HTMLButtonElement {
  return h('button', { type: 'button', class: `${kind} scr-wide`.trim(), onclick: () => onClick() }, text);
}

export function errorText(text: string): HTMLElement {
  return h('p', { class: 'scr-error', role: 'alert' }, text);
}
