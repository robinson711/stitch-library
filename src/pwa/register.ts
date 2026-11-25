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
    if (reg.active && !reg.installing) set({ ready: true });
    // An update waits until she leaves the app, then switches over, so
    // nothing changes under her fingers.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && reg.waiting) reg.waiting.postMessage('stitch-update-now');
    });
    let reloading = false;
    sw.addEventListener('controllerchange', () => {
      if (!state.ready || reloading) return set({ ready: true });
      reloading = true;
      if (document.visibilityState === 'hidden') location.reload();
      else document.addEventListener('visibilitychange', () => location.reload(), { once: true });
    });
    setInterval(() => reg.update().catch(() => {}), 6 * 60 * 60 * 1000);
  } catch {
    /* offline support is a bonus; the app still works */
  }
}

void start();
maybeShowInstallGuide();
