// Starts offline support and the first-visit install steps on the home page.
// Added to index.html automatically by the build (see src/pwa/vite-plugin.ts).
import { maybeShowInstallGuide } from './install';

export type OfflineState = { ready: boolean; done: number; total: number };
const listeners = new Set<(s: OfflineState) => void>();
let state: OfflineState = { ready: false, done: 0, total: 0 };

/** For a quiet "Getting ready to work offline" line; called again on every change. */
export function onOfflineState(fn: (s: OfflineState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}
function set(s: Partial<OfflineState>) {
  state = { ...state, ...s };
  listeners.forEach((l) => l(state));
}

async function start() {
  // Needs https (GitHub Pages). On the Mac's Wi-Fi test address this is skipped.
  if (!('serviceWorker' in navigator) || !window.isSecureContext || import.meta.env.DEV) return;
  const sw = navigator.serviceWorker;
  sw.addEventListener('message', (e) => {
    const m = e.data as { type?: string; done?: number; total?: number };
    if (m?.type === 'stitch-offline-progress') set({ done: m.done ?? 0, total: m.total ?? 0 });
    if (m?.type === 'stitch-offline-ready') set({ ready: true });
  });
  try {
    const reg = await sw.register('./sw.js', { scope: './' });
    if (reg.active && !reg.installing) {
      set({ ready: true });
      // Finish any big file whose download was interrupted last time.
      reg.active.postMessage('stitch-check-offline');
    }
    // An update waits until she leaves the app, then switches over, so
    // nothing changes under her fingers.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && reg.waiting) reg.waiting.postMessage('stitch-update-now');
    });
    let reloading = false;
    sw.addEventListener('controllerchange', () => {
      const firstInstall = !state.ready;
      set({ ready: true });
      // First install: one quiet reload turns on multi-core matching
      // (see "isolate" in sw.js). An update: reload to use the new version.
      if (reloading || (firstInstall && window.crossOriginIsolated)) return;
      reloading = true;
      reloadWhenSafe();
    });
    setInterval(() => reg.update().catch(() => {}), 6 * 60 * 60 * 1000);
  } catch {
    /* offline support is a bonus; the app still works */
  }
}

/** Reloads only when it can't interrupt her: while the app is in the background, or on the home screen with nothing open. */
function reloadWhenSafe() {
  const safe = () => document.visibilityState === 'hidden' || (/^#?\/?$/.test(location.hash) && !document.querySelector('dialog[open], .working'));
  if (safe()) return location.reload();
  const check = () => {
    if (!safe()) return;
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('hashchange', check);
    location.reload();
  };
  document.addEventListener('visibilitychange', check);
  window.addEventListener('hashchange', check);
}

void start();
maybeShowInstallGuide();
