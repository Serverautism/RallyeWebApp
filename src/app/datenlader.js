// Lädt die Veranstaltungsdaten (daten/manifest.json + versionierte Dateien),
// speichert sie für den Offline-Betrieb und bereitet sie für die App auf.

import { alleDurchfahrten } from '../lib/planer.js';
import { lesenGlobal, schreibenGlobal } from './speicher.js';

const DATEN_CACHE = 'rw-daten';

export const basisUrl = () => new URL('./', location.href);
const datenUrl = (name) => new URL(`daten/${name}`, basisUrl()).href;

async function cacheOeffnen() {
  try {
    return 'caches' in self ? await caches.open(DATEN_CACHE) : null;
  } catch {
    return null;
  }
}

export async function holenMitTimeout(url, optionen = {}, ms = 8000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...optionen, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Aktuelles Manifest aus dem Netz – oder das zuletzt gespeicherte. */
export async function manifestLaden() {
  try {
    const r = await holenMitTimeout(datenUrl('manifest.json'), { cache: 'no-store' }, 6000);
    if (r.ok) {
      const m = await r.json();
      if (m?.dateien?.programm) {
        const bisher = lesenGlobal('manifest');
        if (bisher && bisher.version !== m.version) schreibenGlobal('manifestVorher', bisher);
        schreibenGlobal('manifest', m);
        return { manifest: m, ausNetz: true };
      }
    }
  } catch {
    /* offline oder Zeitüberschreitung */
  }
  return { manifest: lesenGlobal('manifest'), ausNetz: false };
}

async function dateiLaden(cache, name) {
  const url = datenUrl(name);
  if (cache) {
    const gespeichert = await cache.match(url, { ignoreVary: true });
    if (gespeichert) return gespeichert.json();
  }
  const r = await holenMitTimeout(url, {}, 15000);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  if (cache) await cache.put(url, r.clone()).catch(() => {});
  return r.json();
}

/** Lädt alle Dateien eines Manifests (aus dem Speicher oder dem Netz). */
export async function datenLaden(manifest) {
  const cache = await cacheOeffnen();
  const d = manifest.dateien;
  const [programm, geo, starter, inhalte] = await Promise.all([
    dateiLaden(cache, d.programm),
    dateiLaden(cache, d.geo),
    dateiLaden(cache, d.starter),
    dateiLaden(cache, d.inhalte),
  ]);
  // Fotos im Hintergrund für offline speichern
  if (cache && manifest.bilder?.length) {
    for (const b of manifest.bilder) {
      const url = datenUrl(b);
      cache
        .match(url, { ignoreVary: true })
        .then((r) => r || fetch(url).then((n) => (n.ok ? cache.put(url, n) : null)))
        .catch(() => {});
    }
  }
  return { programm, geo, starter, inhalte };
}

/** Entfernt gespeicherte Daten-Dateien, die das aktuelle Manifest nicht mehr nennt. */
export async function aufraeumen(manifest) {
  const cache = await cacheOeffnen();
  if (!cache) return;
  const aktuell = new Set([...Object.values(manifest.dateien), ...(manifest.bilder || [])].map(datenUrl));
  for (const anfrage of await cache.keys()) {
    if (!aktuell.has(anfrage.url)) await cache.delete(anfrage);
  }
}

const ms = (iso) => (iso ? Date.parse(iso) : null);

/** Macht aus den JSON-Dateien die Datenstruktur der App (Maps, Zeitstempel in ms). */
export function aufbereiten(manifest, { programm: p, geo, starter, inhalte }) {
  const wp = new Map(
    p.pruefungen.map((w) => [w.id, { ...w, erstesAuto: ms(w.erstesAuto), sperrVon: ms(w.sperrVon), sperrBis: ms(w.sperrBis) }]),
  );
  const zp = new Map(p.zuschauerpunkte.map((z) => [z.id, z]));
  const ort = new Map(p.orte.map((o) => [o.id, o]));
  const strecken = new Map(p.strecken.map((s) => [s.id, s]));
  const fz = new Map();
  for (const [a, b, min] of p.fahrzeiten) {
    fz.set(`${a}>${b}`, min);
    if (!fz.has(`${b}>${a}`)) fz.set(`${b}>${a}`, min);
  }
  const fahrzeit = (a, b) => {
    if (!a || !b) return null;
    if (a === b) return 0;
    return fz.has(`${a}>${b}`) ? fz.get(`${a}>${b}`) : null;
  };
  const daten = {
    version: manifest.version,
    erstellt: Date.parse(manifest.erstellt),
    beispieldaten: p.veranstaltung.beispieldaten,
    veranstaltung: p.veranstaltung,
    tage: p.tage,
    karte: p.karte,
    planerStart: p.planer.startort,
    favoriten: p.favoriten,
    pass: p.zuschauerpass,
    statusCfg: p.status,
    kontakt: p.kontakt,
    starterAnzahl: p.starterAnzahl,
    strecken,
    wp,
    zp,
    ort,
    fahrzeit,
    zeitplan: p.zeitplan.map((z) => ({ ...z, von: ms(z.von), bis: ms(z.bis) })),
    strassen: p.strassen,
    starter: starter.starter,
    starterNachNr: new Map(starter.starter.map((s) => [s.nr, s])),
    geo,
    inhalte,
  };
  daten.durchfahrten = alleDurchfahrten(daten);
  return daten;
}
