// Troque a versão quando fizer deploy de alterações
const CACHE_NAME = "book-app-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./src/css/main.css",
  "./src/js/app.js",
  "./public/icons/icon-192.png",
  "./public/icons/icon-512.png",
  "./manifest.webmanifest"
];

// Instala: pré-cache
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

// Ativa: limpa versões antigas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estratégia:
// - Navegação (HTML): sempre serve index do cache (SPA offline)
// - Assets listados: cache-first
// - Outros: network-first com fallback em cache
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.mode === "navigate") {
    event.respondWith(caches.match("./index.html").then(r => r || fetch(req)));
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        try {
          const url = new URL(req.url);
          if (url.origin === location.origin) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
        } catch {}
        return res;
      }).catch(() => cached);
    })
  );
});
