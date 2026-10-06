const VERSION = 'nadir-v5.2.0';
const CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'images/icon-1024.png',
  'images/icon-maskable-1024.png',
  'css/base.css',
  'css/components.css',
  'css/layout.css',
  'css/polish.css',
  'css/motion.css',
  'css/install.css',
  'js/engine/core.js',
  'js/engine/syntax.js',
  'js/engine/ir.js',
  'js/engine/model.js',
  'js/engine/reform.js',
  'js/engine/lu.js',
  'js/engine/revised.js',
  'js/engine/presolve.js',
  'js/engine/lp.js',
  'js/engine/mip.js',
  'js/engine/nlp.js',
  'js/engine/solve.js',
  'js/engine/text.js',
  'js/engine/explain.js',
  'js/engine/guide.js',
  'js/engine/tests.js',
  'js/app/util.js',
  'js/app/motion.js',
  'js/app/store.js',
  'js/app/worker-host.js',
  'js/app/overlays.js',
  'js/app/field.js',
  'js/app/list.js',
  'js/app/live.js',
  'js/app/cards-model.js',
  'js/app/cards-rules.js',
  'js/app/results.js',
  'js/app/solve.js',
  'js/app/templates.js',
  'js/app/wizard.js',
  'js/app/io.js',
  'js/app/drawer.js',
  'js/app/tour.js',
  'js/app/help.js',
  'js/app/build.js',
  'js/app/pwa.js',
  'js/app/main.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(VERSION);
    const results = await Promise.allSettled(CORE.map(async (p) => {
      const res = await fetch(new Request(p, { cache: 'reload' }));
      if (!res.ok) throw new Error(p + ' ' + res.status);
      await c.put(p, res);
    }));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 3) throw new Error('Precache failed for ' + failed + ' files');
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('nadir-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'skip-waiting') self.skipWaiting();
  if (msg.type === 'version' && event.source) event.source.postMessage({ type: 'version', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) { const c = await caches.open(VERSION); c.put('index.html', fresh.clone()); }
        return fresh;
      } catch (e) {
        const c = await caches.open(VERSION);
        return (await c.match('index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const c = await caches.open(VERSION);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok && res.type === 'basic') c.put(req, res.clone());
      return res;
    } catch (e) {
      const hit = await c.match(req, { ignoreSearch: true });
      return hit || Response.error();
    }
  })());
});
