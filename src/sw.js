// Service Worker der Zuschauer-App.
// Diese Datei ist eine Vorlage: Beim Build ("npm run build") werden VERSION und DATEIEN eingesetzt.
// Aufgaben:
//   1. Alle App-Dateien beim Installieren speichern → die App startet auch ohne Netz.
//   2. Seitenaufrufe sofort aus dem Speicher beantworten (schnell auch bei schlechtem Netz).
//   3. Daten-Dateien (daten/…, mit Versionskennung im Namen) aus dem Speicher liefern,
//      den die App selbst befüllt.
// Kartenkacheln verwaltet die App selbst (siehe src/app/basemap.js).
// Hinweis: „ignoreVary“, weil manche Server „Vary: Origin“ senden und der Speicher sonst nichts findet.

const VERSION = '__VERSION__';
const DATEIEN = [/*__DATEIEN__*/];
const APP_CACHE = `rw-app-${VERSION}`;
const DATEN_CACHE = 'rw-daten';

self.addEventListener('install', (ereignis) => {
  ereignis.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      await cache.addAll(DATEIEN.map((d) => new Request(d, { cache: 'reload' })));
    })(),
  );
});

self.addEventListener('activate', (ereignis) => {
  ereignis.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('rw-app-') && name !== APP_CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (ereignis) => {
  if (ereignis.data === 'jetzt-aktualisieren') self.skipWaiting();
});

self.addEventListener('fetch', (ereignis) => {
  const anfrage = ereignis.request;
  if (anfrage.method !== 'GET') return;
  const url = new URL(anfrage.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  const rel = url.pathname.slice(scope.pathname.length);

  if (anfrage.mode === 'navigate') {
    ereignis.respondWith(seiteLiefern(anfrage));
    return;
  }
  if (rel.startsWith('daten/') && rel !== 'daten/manifest.json') {
    ereignis.respondWith(ausCacheOderNetz(anfrage, DATEN_CACHE));
    return;
  }
  if (DATEIEN.includes(rel)) {
    ereignis.respondWith(ausCacheOderNetz(anfrage, APP_CACHE));
  }
});

async function seiteLiefern(anfrage) {
  const cache = await caches.open(APP_CACHE);
  const gespeichert = await cache.match(new URL('index.html', self.registration.scope).href, { ignoreVary: true });
  if (gespeichert) return gespeichert;
  return fetch(anfrage);
}

async function ausCacheOderNetz(anfrage, cacheName) {
  const cache = await caches.open(cacheName);
  const gespeichert = await cache.match(anfrage, { ignoreSearch: true, ignoreVary: true });
  if (gespeichert) return gespeichert;
  return fetch(anfrage);
}
