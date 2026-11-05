// Grundkarte (z. B. OpenFreeMap) mit Offline-Speicher.
//
// Alle Anfragen der Karte an den Kartenanbieter laufen über das eigene Protokoll "rwkarte://".
// So entscheidet die App selbst, was aus dem Speicher kommt – unabhängig vom Browser:
//   • Kacheln, Schriften, Symbole: zuerst aus dem Speicher, sonst aus dem Netz (und speichern)
//   • Kartenstil und TileJSON („Kopf“): die zuletzt vollständig gespeicherte Fassung wird benutzt
// Beim Start lädt die App im Hintergrund die ganze Region aus einstellungen.json vor
// (höchstens 4 gleichzeitige Anfragen, wie von OpenFreeMap gewünscht).

import { addProtocol } from 'maplibre-gl';
import { kachelnFuerRegion, kachelUrl } from '../lib/kacheln.js';
import { zustand, melden } from './zustand.js';
import { lesen, schreiben } from './speicher.js';
import { speicherDauerhaft } from './geraet.js';

const PROTOKOLL = 'rwkarte';
const KARTE_CACHE = 'rw-karte';
const KOPF_CACHE = 'rw-karte-kopf';
const PARALLEL = 4;
const SCHRIFT_BEREICHE = ['0-255', '256-511', '8192-8447'];

let ursprung = null;
const kopfUrls = new Set();

async function cache(name) {
  try {
    return 'caches' in self ? await caches.open(name) : null;
  } catch {
    return null;
  }
}

const zuEcht = (url) => `https://${url.slice(PROTOKOLL.length + 3)}`;

/** Richtet das Protokoll ein. Muss vor dem Erzeugen der Karte aufgerufen werden. */
export function grundkarteEinrichten(stilUrl) {
  ursprung = new URL(stilUrl).origin;
  kopfUrls.add(stilUrl);
  addProtocol(PROTOKOLL, async (parameter, abbruch) => {
    const antwort = await holen(zuEcht(parameter.url), abbruch.signal);
    if (parameter.type === 'json') return { data: await antwort.json() };
    if (parameter.type === 'string') return { data: await antwort.text() };
    return { data: await antwort.arrayBuffer() };
  });
}

/** Für MapLibre: leitet Anfragen an den Kartenanbieter über das eigene Protokoll. */
export function anfrageUmleiten(url) {
  if (ursprung && url.startsWith(`${ursprung}/`) && url.startsWith('https://')) {
    return { url: `${PROTOKOLL}://${url.slice('https://'.length)}` };
  }
  return undefined;
}

async function holen(url, signal) {
  const istKopf = kopfUrls.has(url);
  const c = await cache(istKopf ? KOPF_CACHE : KARTE_CACHE);
  if (c) {
    const gespeichert = await c.match(url, { ignoreVary: true });
    if (gespeichert) return gespeichert;
  }
  const antwort = await fetch(url, { signal });
  if (!antwort.ok) throw new Error(`Karte: HTTP ${antwort.status}`);
  if (c) await c.put(url, antwort.clone()).catch(() => {});
  return antwort;
}

/** Lädt den Kartenstil (aus dem Speicher oder dem Netz). Rückgabe null, wenn nicht verfügbar. */
export async function stilLaden(stilUrl) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const stil = await (await holen(stilUrl, ac.signal)).json();
    for (const q of Object.values(stil.sources || {})) if (q.url) kopfUrls.add(q.url);
    return stil;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Ersatz-Stil, wenn keine Grundkarte verfügbar ist: nur Hintergrund, die eigenen Ebenen bleiben sichtbar. */
export function ersatzStil() {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'hintergrund', type: 'background', paint: { 'background-color': '#E9ECE1' } }],
  };
}

function spriteUrls(sprite) {
  const liste = typeof sprite === 'string' ? [sprite] : Array.isArray(sprite) ? sprite.map((s) => s.url) : [];
  const urls = [];
  for (const basis of liste) {
    for (const zusatz of ['.json', '.png', '@2x.json', '@2x.png']) {
      try {
        const u = new URL(basis);
        u.pathname += zusatz;
        urls.push(u.href);
      } catch {
        /* ungültig */
      }
    }
  }
  return urls;
}

async function parallel(liste, anzahl, fn) {
  let i = 0;
  const arbeiter = Array.from({ length: Math.min(anzahl, liste.length) }, async () => {
    while (i < liste.length) {
      const eintrag = liste[i++];
      await fn(eintrag);
    }
  });
  await Promise.all(arbeiter);
}

/**
 * @param {string} phase unbekannt | laedt | fertig | teilweise | fehler | offline
 * @param {string|null} grund bei Fehlern: 'unsicher' (kein HTTPS), 'speicher' (Browser-Speicher gesperrt) oder ein Fehlertext
 */
function setzeStatus(phase, fertig = 0, gesamt = 0, grund = null) {
  zustand.karteOffline = { phase, fertig, gesamt, grund };
  melden('karteOffline');
}

/** Warum kann der Browser nichts speichern? Ohne HTTPS (oder localhost) gibt es keinen Offline-Speicher. */
export function speicherGrund() {
  if (typeof isSecureContext !== 'undefined' && !isSecureContext) return 'unsicher';
  return 'speicher';
}

let laeuft = false;

/**
 * Lädt alle Kacheln der Region (bis offlineMaxZoom), Schriften und Symbole in den Speicher.
 * Erst wenn alles vollständig ist, wird der neue Kartenstil/TileJSON als „aktiv“ übernommen.
 */
export async function regionVorladen(karte) {
  if (laeuft) return;
  const kopf = await cache(KOPF_CACHE);
  const kacheln = await cache(KARTE_CACHE);
  if (!kopf || !kacheln) {
    setzeStatus('fehler', 0, 0, speicherGrund());
    return;
  }
  if (!navigator.onLine) {
    setzeStatus(lesen('karteOffline')?.fertig ? 'fertig' : 'offline');
    return;
  }
  laeuft = true;
  try {
    // 1. Frische Kopf-Ressourcen holen (noch nicht aktivieren)
    const neuKopf = [];
    const stilAntwort = await fetch(karte.stil, { cache: 'no-cache' });
    if (!stilAntwort.ok) throw new Error(`Kartenstil: HTTP ${stilAntwort.status}`);
    const stil = await stilAntwort.clone().json();
    neuKopf.push([karte.stil, stilAntwort]);
    const quellen = [];
    for (const q of Object.values(stil.sources || {})) {
      if (!['vector', 'raster', 'raster-dem'].includes(q.type)) continue;
      let tj = q;
      if (q.url) {
        const a = await fetch(q.url, { cache: 'no-cache' });
        if (!a.ok) throw new Error(`TileJSON: HTTP ${a.status}`);
        tj = await a.clone().json();
        neuKopf.push([q.url, a]);
        kopfUrls.add(q.url);
      }
      const vorlagen = (tj.tiles || []).filter((x) => typeof x === 'string');
      if (!vorlagen.length) continue;
      const min = tj.minzoom ?? 0;
      const max = Math.min(tj.maxzoom ?? 22, karte.offlineMaxZoom ?? 14);
      quellen.push({ vorlagen, min, max, schema: tj.scheme || 'xyz' });
    }

    // 2. Liste aller benötigten Dateien
    const urls = [];
    // Gleiche Auswahl der Server-Adresse wie MapLibre: tiles[(x + y) % Anzahl]
    for (const q of quellen) {
      for (const k of kachelnFuerRegion(karte.region, q.min, q.max)) urls.push(kachelUrl(q.vorlagen[(k.x + k.y) % q.vorlagen.length], k, q.schema));
    }
    if (stil.glyphs) {
      const stapel = new Set();
      for (const ebene of stil.layers || []) {
        const f = ebene.layout?.['text-font'];
        if (Array.isArray(f) && f.length && f.every((x) => typeof x === 'string')) stapel.add(f.join(','));
      }
      for (const s of stapel) for (const b of SCHRIFT_BEREICHE) urls.push(stil.glyphs.replace('{fontstack}', s).replace('{range}', b));
    }
    urls.push(...spriteUrls(stil.sprite));

    // 3. Fehlende Dateien laden
    const fehlend = [];
    for (const u of urls) if (!(await kacheln.match(u, { ignoreVary: true }))) fehlend.push(u);
    let fertig = urls.length - fehlend.length;
    let fehler = 0;
    setzeStatus('laedt', fertig, urls.length);
    await parallel(fehlend, PARALLEL, async (u) => {
      let ok = false;
      for (let versuch = 0; versuch < 2 && !ok; versuch++) {
        try {
          const r = await fetch(u);
          if (r.ok) {
            await kacheln.put(u, r);
            ok = true;
          } else if (r.status === 404 || r.status === 204) {
            ok = true; // leere Kachel – nichts zu speichern
          }
        } catch {
          /* nochmal versuchen */
        }
      }
      if (!ok) fehler++;
      fertig++;
      if (fertig % 10 === 0 || fertig === urls.length) setzeStatus('laedt', fertig, urls.length);
    });

    if (fehler > 0) {
      setzeStatus('teilweise', urls.length - fehler, urls.length);
      return;
    }

    // 4. Neue Kopf-Ressourcen aktivieren und Kacheln alter Kartenversionen löschen
    for (const [u, a] of neuKopf) await kopf.put(u, a);
    const aktuellePraefixe = quellen.flatMap((q) => q.vorlagen.map((v) => v.slice(0, v.indexOf('{'))));
    for (const anfrage of await kacheln.keys()) {
      const u = anfrage.url;
      const istKachel = /\/\d+\/\d+\/\d+(\.\w+)?(\?.*)?$/.test(u);
      if (istKachel && u.startsWith(ursprung) && !aktuellePraefixe.some((p) => u.startsWith(p))) await kacheln.delete(anfrage);
    }
    schreiben('karteOffline', { fertig: true, anzahl: urls.length, zeit: Date.now() });
    setzeStatus('fertig', urls.length, urls.length);
    speicherDauerhaft();
  } catch (fehler) {
    console.warn('Offline-Karte:', fehler);
    if (lesen('karteOffline')?.fertig) setzeStatus('fertig');
    else setzeStatus('fehler', 0, 0, fehler?.name === 'QuotaExceededError' ? 'voll' : String(fehler?.message || fehler));
  } finally {
    laeuft = false;
  }
}

/** Gespeicherte Karte löschen und neu laden */
export async function karteNeuLaden(karte) {
  try {
    await caches.delete(KARTE_CACHE);
    await caches.delete(KOPF_CACHE);
  } catch {
    /* egal */
  }
  schreiben('karteOffline', undefined);
  await regionVorladen(karte);
}
