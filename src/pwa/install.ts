// First visit in Safari: short steps to add the app to the Home Screen, and a
// warning to add charts only there (its storage is separate from Safari's).
import { button, buttonRow, openScreen } from '../overlay/screen';
import { h } from '../shared/dom';

export function isHomeScreenApp(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const SEEN = 'stitch-install-guide-seen';

export function maybeShowInstallGuide(force = false): void {
  if (!force) {
    if (isHomeScreenApp() || import.meta.env.DEV) return;
    try {
      if (sessionStorage.getItem(SEEN)) return;
      sessionStorage.setItem(SEEN, '1');
    } catch {
      /* show it */
    }
  }
  const scr = openScreen('Put Stitch Library on your Home Screen', undefined, 'Not now');
  const step = (n: number, text: string) => h('li', { class: 'inst-step' }, h('span', { class: 'inst-num', 'aria-hidden': 'true' }, String(n)), h('span', {}, text));
  scr.show(
    'Put Stitch Library on your Home Screen',
    h('ol', { class: 'inst-steps' },
      step(1, 'Tap the Share button. It looks like a square with an arrow pointing up.'),
      step(2, 'Scroll down and tap “Add to Home Screen”.'),
      step(3, 'Tap “Add”.'),
      step(4, 'Open Stitch Library from your Home Screen.'),
    ),
    h('div', { class: 'scr-note' },
      h('p', {}, h('strong', {}, 'Please add your charts only in the Home Screen app.')),
      h('p', {}, 'Safari keeps its own separate copy, so charts added here in the browser won’t appear in the app.'),
    ),
    buttonRow(button('Continue in the browser', () => scr.close(), 'quiet')),
  );
}
