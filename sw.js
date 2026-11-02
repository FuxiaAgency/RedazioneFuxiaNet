// Service worker: rende l'app installabile e la apre anche con rete debole.
// Strategia "prima la rete": le modifiche pubblicate arrivano subito; la copia salvata serve solo offline.
// Dati e foto (Supabase) non passano di qui.
const CACHE = 'redazione-v25';
const SHARED = 'condivisi'; // vocali condivisi da WhatsApp (Android), raccolti da vocali.js
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'agenda.js', 'vocali.js', 'config.js', 'manifest.webmanifest',
  'img/fuxia_logo.png', 'img/rnv_logo.png', 'img/ch1_logo.png', 'img/fuxia_banner.jpg', 'img/rnv_banner.jpg', 'img/ch1_banner.jpg',
  'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== SHARED).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/condividi')) {
    e.respondWith((async () => {
      try {
        const fd = await req.formData();
        const c = await caches.open(SHARED);
        let i = 0;
        for (const f of fd.getAll('audio')) {
          if (!(f instanceof File)) continue;
          await c.put(new Request('./condivisi/' + Date.now() + '-' + (i++)),
            new Response(f, { headers: { 'content-type': f.type || 'audio/ogg', 'x-name': encodeURIComponent(f.name || 'vocale.ogg') } }));
        }
      } catch (err) { /* niente da salvare */ }
      return Response.redirect('./#vocali', 303);
    })());
    return;
  }
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
