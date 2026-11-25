// Moving between screens. Each screen has an address after "#", so the
// iPhone's back swipe and the Back buttons behave the same way.

type Route = { name: 'home' } | { name: 'chart'; id: string } | { name: 'edit'; id: string } | { name: 'add' };

let token = 0;
let render: (r: Route) => void = () => {};

export function parse(hash: string): Route {
  const m = hash.replace(/^#\/?/, '').split('/');
  if (m[0] === 'chart' && m[1]) return { name: 'chart', id: decodeURIComponent(m[1]) };
  if (m[0] === 'edit' && m[1]) return { name: 'edit', id: decodeURIComponent(m[1]) };
  if (m[0] === 'add') return { name: 'add' };
  return { name: 'home' };
}

export function hrefOf(r: Route): string {
  switch (r.name) {
    case 'chart': return `#/chart/${encodeURIComponent(r.id)}`;
    case 'edit': return `#/edit/${encodeURIComponent(r.id)}`;
    case 'add': return '#/add';
    default: return '#/';
  }
}

export function startNav(fn: (r: Route) => void) {
  render = fn;
  window.addEventListener('hashchange', show);
  show();
}

function show() {
  token++;
  render(parse(location.hash));
}

/** Goes to a screen. `replace` skips leaving the current screen in the back history. */
export function go(r: Route, replace = false) {
  const href = hrefOf(r);
  if (location.hash === href || (href === '#/' && !location.hash)) {
    show();
    return;
  }
  if (replace) {
    history.replaceState(null, '', href);
    show();
  } else location.hash = href;
}

/** A check that is true only while the screen it was taken on is still showing. */
export function stillHere(): () => boolean {
  const t = token;
  return () => t === token;
}

export type { Route };
