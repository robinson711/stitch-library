// Stitch Library service worker: keeps every app file on the phone so the app
// works with no internet. It never touches her library (that lives in
// IndexedDB, which this file does not use).
//
// Updates: a new version downloads only files that changed, copies the rest
// from the old version, and takes over the next time she leaves and returns.
const VERSION = '__VERSION__';
const FILES = __FILES__; // [path relative to this file, sha-256]
const PREFIX = 'stitch-app-';
const CACHE = PREFIX + VERSION;
const HASHES = '__hashes__';

const scopeUrl = (p) => new URL(p, self.registration.scope).href;

async function tell(msg) {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg);
}

async function oldCopies() {
  const found = new Map(); // url -> {cache, hash}
  for (const name of await caches.keys()) {
    if (!name.startsWith(PREFIX) || name === CACHE) continue;
    const cache = await caches.open(name);
    const res = await cache.match(scopeUrl(HASHES), { ignoreVary: true });
    if (!res) continue;
    const hashes = await res.json().catch(() => ({}));
    for (const [url, hash] of Object.entries(hashes)) found.set(url + '|' + hash, cache);
  }
  return found;
}

async function install() {
  const cache = await caches.open(CACHE);
  const old = await oldCopies();
  const hashes = {};
  let done = 0;
  const queue = [...FILES];
  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const [path, hash] = item;
      const url = scopeUrl(path);
      hashes[url] = hash;
      const have = await cache.match(url, { ignoreVary: true });
      if (!have) {
        const from = old.get(url + '|' + hash);
        const res = (from && (await from.match(url, { ignoreVary: true }))) || (await fetch(url, { cache: 'reload' }));
        if (!res.ok) throw new Error('Could not download ' + path);
        await cache.put(url, res);
      }
      done++;
      if (done % 5 === 0 || done === FILES.length) await tell({ type: 'stitch-offline-progress', done, total: FILES.length });
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  await cache.put(scopeUrl(HASHES), new Response(JSON.stringify(hashes), { headers: { 'content-type': 'application/json' } }));
}

self.addEventListener('install', (e) => {
  e.waitUntil(install());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
    await tell({ type: 'stitch-offline-ready' });
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'stitch-update-now') self.skipWaiting();
});

// GitHub Pages can't send these headers, so the worker adds them. They make
// the page "cross-origin isolated", which lets matching use several
// processor cores. Everything the app loads comes from this site, so nothing breaks.
function isolate(res) {
  if (!res || res.status === 0 || res.type === 'opaque') return res;
  const headers = new Headers(res.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(self.registration.scope)) return;
  e.respondWith(serve(req, url).then(isolate));
});

async function serve(req, url) {
  const cache = await caches.open(CACHE);
  if (req.mode === 'navigate') {
    const page = url.pathname.endsWith('/') ? scopeUrl('index.html') : url.href.split('#')[0].split('?')[0];
    const hit = await cache.match(page, { ignoreVary: true });
    if (hit) return hit;
    // Pages that aren't kept offline (the lab and speed check) come from the
    // network; the home page is the fallback when there is no connection.
    try {
      return await fetch(req);
    } catch (err) {
      const home = await cache.match(scopeUrl('index.html'), { ignoreVary: true });
      if (home) return home;
      throw err;
    }
  } else {
    const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
    if (hit) return hit;
  }
  return fetch(req);
}
