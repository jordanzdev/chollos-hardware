const V = "techollos-20261008160134";
const CORE = ["./", "style.css", "app.js", "favicon.svg", "manifest.webmanifest", "img/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  const fresh = req.mode === "navigate" || url.pathname.endsWith(".json");
  if (fresh) {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(V).then(k => k.put(req, c)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match("./"))));
  } else {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(k => k.put(req, c)); } return r; });
      return hit || net;
    }));
  }
});
