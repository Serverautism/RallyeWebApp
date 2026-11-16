#!/usr/bin/env node
// Daten-Build: liest daten/ (Tabellen, Karten, Texte), prüft alles gründlich
// und schreibt die fertigen JSON-Dateien für die App nach public/daten/.
//
//   npm run daten            → bauen und prüfen
//   (läuft automatisch bei "npm run dev" und "npm run build")

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as turf from '@turf/turf';
import { parseCsv, parseZahl, parseJaNein, parseListe } from '../src/lib/csv.js';
import { parseDatum, parseUhrzeit, lokalZuUtcMs, isoMitVersatz, istGueltigeZeitzone } from '../src/lib/zeit.js';
import { anzahlKacheln } from '../src/lib/kacheln.js';
import { markdownZuBloecken } from '../src/lib/text.js';
import { ankunftBeiKm } from '../src/lib/planer.js';

const PROJEKT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ORT_TYPEN = ['parkplatz', 'servicepark', 'rampe', 'info', 'wc', 'imbiss', 'sanitaeter', 'shuttle', 'sonstiges'];
const STRASSEN_STATUS = ['gesperrt', 'umleitung', 'teilweise', 'frei'];
const ZEITPLAN_TYPEN = ['abnahme', 'shakedown', 'start', 'wp', 'service', 'regrouping', 'parc_ferme', 'ziel', 'siegerehrung', 'sonstiges'];
const OPENFREEMAP_MAX_KACHELN = 3000;

// ---------------------------------------------------------------------------
// Tabellen-Schemata: Spaltenname → { pflicht, typ, standard }
// typ: text | zahl | ganzzahl | uhrzeit | janein | liste
// ---------------------------------------------------------------------------
const SCHEMATA = {
  pruefungen: {
    pflichtDatei: true,
    spalten: {
      wp: { pflicht: true },
      name_de: { pflicht: true },
      name_en: {},
      strecke: { pflicht: true },
      tag: { pflicht: true },
      erstes_auto: { pflicht: true, typ: 'uhrzeit' },
      sperrung_von: { typ: 'uhrzeit' },
      sperrung_bis: { typ: 'uhrzeit' },
      intervall_min: { typ: 'zahl', standard: 1 },
      schnitt_kmh: { typ: 'zahl', standard: 80 },
      laenge_km: { typ: 'zahl' },
    },
  },
  strecken: {
    pflichtDatei: true,
    spalten: {
      id: { pflicht: true },
      name_de: { pflicht: true },
      name_en: {},
      belag_de: {},
      belag_en: {},
      hinweis_de: {},
      hinweis_en: {},
    },
  },
  zuschauerpunkte: {
    pflichtDatei: true,
    spalten: {
      id: { pflicht: true },
      name_de: { pflicht: true },
      name_en: {},
      strecke: { pflicht: true },
      km: { typ: 'zahl' },
      parkplatz: {},
      fussweg_m: { typ: 'zahl' },
      fussweg_min: { typ: 'zahl' },
      hoehenmeter: { typ: 'zahl' },
      untergrund_de: {},
      untergrund_en: {},
      barrierefrei: { typ: 'janein' },
      kinderwagen: { typ: 'janein' },
      versorgung_de: {},
      versorgung_en: {},
      beschreibung_de: {},
      beschreibung_en: {},
      foto: {},
    },
  },
  orte: {
    pflichtDatei: true,
    spalten: {
      id: { pflicht: true },
      typ: { pflicht: true },
      name_de: { pflicht: true },
      name_en: {},
      beschreibung_de: {},
      beschreibung_en: {},
      gesperrt_mit: { typ: 'liste' },
      stempel: { typ: 'janein' },
    },
  },
  zeitplan: {
    spalten: {
      tag: { pflicht: true },
      von: { pflicht: true, typ: 'uhrzeit' },
      bis: { typ: 'uhrzeit' },
      typ: {},
      titel_de: { pflicht: true },
      titel_en: {},
      ort: {},
      ort_de: {},
      ort_en: {},
    },
  },
  fahrzeiten: {
    spalten: {
      von: { pflicht: true },
      nach: { pflicht: true },
      minuten: { pflicht: true, typ: 'zahl' },
    },
  },
  starter: {
    spalten: {
      nr: { pflicht: true, typ: 'ganzzahl' },
      fahrer: { pflicht: true },
      beifahrer: {},
      nation: {},
      klasse: { pflicht: true },
      fahrzeug: { pflicht: true },
      motor: {},
      baujahr: { typ: 'ganzzahl' },
      team: {},
      startposition: { typ: 'ganzzahl' },
    },
  },
  strassen: {
    spalten: {
      strasse: { pflicht: true },
      ort: {},
      status: { pflicht: true },
      sperrt_mit: { typ: 'liste' },
      zeiten_de: {},
      zeiten_en: {},
      hinweis_de: {},
      hinweis_en: {},
    },
  },
  regeln: {
    spalten: {
      nr: { typ: 'ganzzahl' },
      text_de: { pflicht: true },
      text_en: {},
    },
  },
  glossar: {
    spalten: {
      begriff_de: { pflicht: true },
      erklaerung_de: { pflicht: true },
      begriff_en: {},
      erklaerung_en: {},
    },
  },
};

// ---------------------------------------------------------------------------
// Meldungen
// ---------------------------------------------------------------------------
class Meldungen {
  constructor() {
    this.fehler = [];
    this.warnungen = [];
  }
  ort(datei, zeile) {
    return zeile ? `${datei}, Zeile ${zeile}` : datei;
  }
  fehlerBei(datei, zeile, text) {
    this.fehler.push(`${this.ort(datei, zeile)}: ${text}`);
  }
  warnungBei(datei, zeile, text) {
    this.warnungen.push(`${this.ort(datei, zeile)}: ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Dateien lesen
// ---------------------------------------------------------------------------
function textLesen(datei, m, anzeige) {
  const puffer = fs.readFileSync(datei);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(puffer);
  } catch {
    m.warnungBei(
      anzeige,
      null,
      'Die Datei ist nicht als UTF-8 gespeichert und wurde als Windows-1252 gelesen. Tipp: In Excel „CSV UTF-8“ wählen.',
    );
    return new TextDecoder('windows-1252').decode(puffer);
  }
}

function tabelleLesen(wurzel, name, m) {
  const schema = SCHEMATA[name];
  const rel = `daten/tabellen/${name}.csv`;
  const datei = path.join(wurzel, rel);
  if (!fs.existsSync(datei)) {
    if (schema.pflichtDatei) m.fehlerBei(rel, null, 'Datei fehlt.');
    return null;
  }
  const { kopf, zeilen } = parseCsv(textLesen(datei, m, rel));
  if (kopf.length === 0) {
    if (schema.pflichtDatei) m.fehlerBei(rel, null, 'Datei ist leer – mindestens die Kopfzeile wird benötigt.');
    return [];
  }
  for (const [spalte, def] of Object.entries(schema.spalten)) {
    if (def.pflicht && !kopf.includes(spalte)) m.fehlerBei(rel, 1, `Pflichtspalte „${spalte}“ fehlt.`);
  }
  for (const k of kopf) {
    if (k && !(k in schema.spalten)) {
      m.warnungBei(rel, 1, `Unbekannte Spalte „${k}“ wird ignoriert (Tippfehler?). Erlaubt: ${Object.keys(schema.spalten).join(', ')}.`);
    }
  }
  const ergebnis = [];
  for (const { werte, zeile, ueberzaehlig } of zeilen) {
    if (ueberzaehlig > 0) m.warnungBei(rel, zeile, `Die Zeile hat mehr Werte als die Kopfzeile Spalten – überzählige Werte werden ignoriert.`);
    const datensatz = { _zeile: zeile };
    let ok = true;
    for (const [spalte, def] of Object.entries(schema.spalten)) {
      const roh = werte[spalte] ?? '';
      if (roh === '') {
        if (def.pflicht) {
          m.fehlerBei(rel, zeile, `Spalte „${spalte}“ darf nicht leer sein.`);
          ok = false;
        }
        datensatz[spalte] = def.typ === 'liste' ? [] : (def.standard ?? null);
        continue;
      }
      switch (def.typ) {
        case 'zahl':
        case 'ganzzahl': {
          const z = parseZahl(roh);
          if (Number.isNaN(z) || (def.typ === 'ganzzahl' && !Number.isInteger(z))) {
            m.fehlerBei(rel, zeile, `Spalte „${spalte}“: „${roh}“ ist keine gültige ${def.typ === 'ganzzahl' ? 'ganze ' : ''}Zahl.`);
            ok = false;
          }
          datensatz[spalte] = z;
          break;
        }
        case 'uhrzeit': {
          const u = parseUhrzeit(roh);
          if (!u) {
            m.fehlerBei(rel, zeile, `Spalte „${spalte}“: „${roh}“ ist keine gültige Uhrzeit (erwartet z. B. 09:05).`);
            ok = false;
          }
          datensatz[spalte] = roh;
          break;
        }
        case 'janein': {
          const j = parseJaNein(roh);
          if (j === undefined) {
            m.fehlerBei(rel, zeile, `Spalte „${spalte}“: „${roh}“ – erlaubt sind ja, nein oder teilweise.`);
            ok = false;
          }
          datensatz[spalte] = j;
          break;
        }
        case 'liste':
          datensatz[spalte] = parseListe(roh);
          break;
        default:
          datensatz[spalte] = roh;
      }
    }
    // Auch fehlerhafte Zeilen behalten, damit ihre IDs bekannt sind (vermeidet Folgefehler)
    datensatz._ungueltig = !ok;
    ergebnis.push(datensatz);
  }
  return ergebnis;
}

const GEO_TYPEN = {
  strecken: ['LineString'],
  zuschauerpunkte: ['Polygon', 'MultiPolygon'],
  sperrzonen: ['Polygon', 'MultiPolygon'],
  orte: ['Point'],
};

function koordinatenPruefen(koord, tiefe) {
  if (tiefe === 0) {
    return Array.isArray(koord) && koord.length >= 2 && koord.every((z) => typeof z === 'number' && Number.isFinite(z));
  }
  return Array.isArray(koord) && koord.length > 0 && koord.every((k) => koordinatenPruefen(k, tiefe - 1));
}

const TIEFE = { Point: 0, LineString: 1, Polygon: 2, MultiPolygon: 3 };

function geoLesen(wurzel, name, m) {
  const rel = `daten/karte/${name}.geojson`;
  const datei = path.join(wurzel, rel);
  if (!fs.existsSync(datei)) {
    if (name === 'sperrzonen') {
      m.warnungBei(rel, null, 'Datei fehlt – es werden keine Sperrzonen angezeigt.');
      return [];
    }
    m.fehlerBei(rel, null, 'Datei fehlt.');
    return [];
  }
  let json;
  try {
    json = JSON.parse(textLesen(datei, m, rel));
  } catch (e) {
    m.fehlerBei(rel, null, `Kein gültiges JSON: ${e.message}`);
    return [];
  }
  if (json?.type !== 'FeatureCollection' || !Array.isArray(json.features)) {
    m.fehlerBei(rel, null, 'Erwartet wird eine GeoJSON-„FeatureCollection“ mit einer Liste „features“.');
    return [];
  }
  const ids = new Set();
  const ergebnis = [];
  json.features.forEach((f, i) => {
    const nr = `Objekt ${i + 1}`;
    const id = String(f?.properties?.id ?? f?.id ?? '').trim();
    if (!id) {
      m.fehlerBei(rel, null, `${nr} hat keine „id“ (unter „properties“ eintragen, z. B. "id": "ZP1").`);
      return;
    }
    if (ids.has(id)) {
      m.fehlerBei(rel, null, `Die id „${id}“ kommt mehrfach vor.`);
      return;
    }
    ids.add(id);
    const g = f.geometry;
    if (!g || !GEO_TYPEN[name].includes(g.type)) {
      m.fehlerBei(rel, null, `„${id}“: Geometrie muss ${GEO_TYPEN[name].join(' oder ')} sein, ist aber ${g?.type ?? 'leer'}.`);
      return;
    }
    if (!koordinatenPruefen(g.coordinates, TIEFE[g.type])) {
      m.fehlerBei(rel, null, `„${id}“: Koordinaten sind unvollständig oder keine Zahlen.`);
      return;
    }
    // Ringe von Polygonen schließen, falls nötig
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const polygone = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const poly of polygone) {
        for (const ring of poly) {
          const a = ring[0];
          const b = ring[ring.length - 1];
          if (a[0] !== b[0] || a[1] !== b[1]) ring.push([a[0], a[1]]);
          if (ring.length < 4) {
            m.fehlerBei(rel, null, `„${id}“: Eine Fläche braucht mindestens 3 Eckpunkte.`);
            return;
          }
        }
      }
    }
    if (g.type === 'LineString' && g.coordinates.length < 2) {
      m.fehlerBei(rel, null, `„${id}“: Eine Linie braucht mindestens 2 Punkte.`);
      return;
    }
    // "platzhalter": true markiert grobe Platzhalter-Geometrien (z. B. bevor die Karte digitalisiert ist)
    ergebnis.push({ id, geometry: g, platzhalter: f.properties?.platzhalter === true });
  });
  return ergebnis;
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------
const rund = (z, stellen = 5) => Math.round(z * 10 ** stellen) / 10 ** stellen;

/**
 * Lage eines Punkts auf einer Linie (km ab Start) und sein Abstand (km).
 * Fährt die Strecke an derselben Stelle mehrmals vorbei (Schleife, Runden), zählt die ERSTE
 * Durchfahrt: unter allen Abschnitten, die höchstens 30 m weiter weg liegen als der nächste,
 * gewinnt der früheste.
 */
export function ersteLageAufLinie(koordinaten, punkt) {
  const p = turf.point(punkt);
  const abschnitte = [];
  let bisher = 0;
  for (let i = 1; i < koordinaten.length; i++) {
    const a = koordinaten[i - 1].slice(0, 2);
    const b = koordinaten[i].slice(0, 2);
    const stueck = turf.lineString([a, b]);
    const n = turf.nearestPointOnLine(stueck, p, { units: 'kilometers' });
    const lage = n.properties.lineDistance ?? n.properties.location;
    const abstand = n.properties.pointDistance ?? n.properties.dist;
    abschnitte.push({ km: bisher + lage, abstand });
    bisher += turf.length(stueck, { units: 'kilometers' });
  }
  const minimum = Math.min(...abschnitte.map((x) => x.abstand));
  const erster = abschnitte.find((x) => x.abstand <= minimum + 0.03);
  return { km: erster.km, abstand: minimum };
}

function koordinatenRunden(g) {
  const r = (k) => (typeof k[0] === 'number' ? [rund(k[0]), rund(k[1])] : k.map(r));
  return { type: g.type, coordinates: r(g.coordinates) };
}

function alleKoordinaten(g) {
  const liste = [];
  const sammeln = (k) => (typeof k[0] === 'number' ? liste.push(k) : k.forEach(sammeln));
  sammeln(g.coordinates);
  return liste;
}

function inRegion([lon, lat], r) {
  return lon >= r[0] && lon <= r[2] && lat >= r[1] && lat <= r[3];
}

/**
 * Kartenansichten aus „karte.stile“ prüfen. Die erste ist der Standard und wird offline gespeichert.
 * Ältere Einstellungen mit nur „karte.stil“ (eine URL) werden weiter verstanden.
 * @returns {{id, name_de, name_en, url, luftbild}[]}
 */
function kartenStilePruefen(karte, m, rel) {
  let roh = karte.stile;
  if (roh === undefined && karte.stil) roh = [{ id: 'standard', name_de: 'Standard', name_en: 'Standard', url: karte.stil }];
  if (!Array.isArray(roh) || roh.length === 0) {
    m.fehlerBei(rel, null, '„karte.stile“ fehlt: Liste der Kartenansichten, die erste mit „url“ zum Kartenstil (z. B. https://tiles.openfreemap.org/styles/positron).');
    return [];
  }
  const ids = new Set();
  const stile = [];
  roh.forEach((s, i) => {
    const wo = `„karte.stile“, Eintrag ${i + 1}`;
    if (!s || typeof s !== 'object') {
      m.fehlerBei(rel, null, `${wo}: muss ein Objekt mit „id“, „name_de“ und „url“ sein.`);
      return;
    }
    if (!/^[a-z0-9_-]+$/.test(s.id ?? '')) m.fehlerBei(rel, null, `${wo}: „id“ fehlt oder enthält andere Zeichen als a–z, 0–9, _ und -.`);
    else if (ids.has(s.id)) m.fehlerBei(rel, null, `${wo}: „id“ „${s.id}“ ist doppelt.`);
    ids.add(s.id);
    if (!s.name_de) m.fehlerBei(rel, null, `${wo}: „name_de“ fehlt.`);
    const istLuftbild = Boolean(s.luftbild_wms);
    if (istLuftbild === Boolean(s.url)) {
      m.fehlerBei(rel, null, `${wo}: Genau eines von „url“ (Kartenstil) oder „luftbild_wms“ (Luftbild-Dienst) angeben.`);
    }
    if (s.url && !/^https:\/\//.test(s.url)) m.fehlerBei(rel, null, `${wo}: „url“ muss mit https:// beginnen.`);
    if (istLuftbild) {
      if (!/^https:\/\//.test(s.luftbild_wms)) m.fehlerBei(rel, null, `${wo}: „luftbild_wms“ muss mit https:// beginnen.`);
      if (!s.luftbild_ebene) m.fehlerBei(rel, null, `${wo}: „luftbild_ebene“ (Name der WMS-Ebene, z. B. th_dop) fehlt.`);
      if (!s.quelle) m.fehlerBei(rel, null, `${wo}: „quelle“ fehlt – Namensnennung des Luftbilds ist Pflicht (z. B. „© GDI-Th“).`);
      if (i === 0) m.fehlerBei(rel, null, '„karte.stile“: Die erste Ansicht ist der Standard und wird offline gespeichert – sie muss ein Kartenstil mit „url“ sein, kein Luftbild.');
    }
    stile.push({
      id: s.id,
      name_de: s.name_de,
      name_en: s.name_en || null,
      url: s.url || null,
      luftbild: istLuftbild ? { wms: s.luftbild_wms, ebene: s.luftbild_ebene, quelle: s.quelle || '' } : null,
    });
  });
  return stile;
}

function kurzAusId(id) {
  const m = /(\d+)\s*$/.exec(id);
  return m ? m[1] : id;
}

function hash(inhalt) {
  return crypto.createHash('sha256').update(inhalt).digest('hex').slice(0, 10);
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------
/**
 * @param {{wurzel?: string, ausgabe?: string, schreiben?: boolean}} optionen
 * @returns {{ok: boolean, fehler: string[], warnungen: string[], zusammenfassung: string[]}}
 */
export function datenBauen({ wurzel = PROJEKT, ausgabe, schreiben = true } = {}) {
  const m = new Meldungen();
  const zusammenfassung = [];
  ausgabe = ausgabe ?? path.join(wurzel, 'public', 'daten');

  // --- Einstellungen -------------------------------------------------------
  const einstRel = 'daten/einstellungen.json';
  let e = {};
  try {
    e = JSON.parse(textLesen(path.join(wurzel, einstRel), m, einstRel));
  } catch (err) {
    m.fehlerBei(einstRel, null, fs.existsSync(path.join(wurzel, einstRel)) ? `Kein gültiges JSON: ${err.message}` : 'Datei fehlt.');
    return { ok: false, fehler: m.fehler, warnungen: m.warnungen, zusammenfassung };
  }
  const v = e.veranstaltung ?? {};
  if (!v.name_de) m.fehlerBei(einstRel, null, '„veranstaltung.name_de“ fehlt.');
  const zeitzone = v.zeitzone || 'Europe/Berlin';
  if (!istGueltigeZeitzone(zeitzone)) m.fehlerBei(einstRel, null, `„veranstaltung.zeitzone“: „${zeitzone}“ ist keine gültige Zeitzone (z. B. Europe/Berlin).`);

  const tage = Array.isArray(e.tage) ? e.tage : [];
  if (tage.length === 0) m.fehlerBei(einstRel, null, '„tage“ muss mindestens einen Tag enthalten.');
  const tagIds = new Map();
  for (const t of tage) {
    if (!t.id) m.fehlerBei(einstRel, null, 'Jeder Tag braucht eine „id“ (z. B. "sa").');
    else if (tagIds.has(t.id)) m.fehlerBei(einstRel, null, `Tag-ID „${t.id}“ ist doppelt.`);
    if (!parseDatum(t.datum)) m.fehlerBei(einstRel, null, `Tag „${t.id}“: „${t.datum}“ ist kein gültiges Datum (Format JJJJ-MM-TT).`);
    if (!t.name_de) m.fehlerBei(einstRel, null, `Tag „${t.id}“: „name_de“ fehlt.`);
    tagIds.set(t.id, t);
  }

  const karte = e.karte ?? {};
  const region = karte.region;
  const regionOk =
    Array.isArray(region) &&
    region.length === 4 &&
    region.every((z) => typeof z === 'number') &&
    region[0] < region[2] &&
    region[1] < region[3];
  if (!regionOk) m.fehlerBei(einstRel, null, '„karte.region“ muss [West, Süd, Ost, Nord] in Grad sein, z. B. [10.2, 50.9, 10.5, 51.1].');
  const stile = kartenStilePruefen(karte, m, einstRel);
  const standardStil = stile[0]?.url ?? null;
  if (e.status !== undefined) {
    m.warnungBei(einstRel, null, '„status“ wird nicht mehr verwendet (es gibt keinen Live-Status, der Status kommt aus dem Zeitplan) – der Abschnitt kann gelöscht werden.');
  }
  const maxZoom = karte.offline_max_zoom ?? 14;
  if (regionOk) {
    const n = anzahlKacheln(region, 0, maxZoom);
    zusammenfassung.push(`Offline-Region: ${n} Kacheln (Zoom 0–${maxZoom})`);
    if (/openfreemap\.org/.test(standardStil ?? '') && n > OPENFREEMAP_MAX_KACHELN) {
      m.fehlerBei(einstRel, null, `Die Offline-Region umfasst ${n} Kacheln – OpenFreeMap erlaubt höchstens ${OPENFREEMAP_MAX_KACHELN} pro Download. Region verkleinern oder „offline_max_zoom“ senken.`);
    }
    if (Array.isArray(karte.mitte) && !inRegion(karte.mitte, region)) m.warnungBei(einstRel, null, '„karte.mitte“ liegt außerhalb von „karte.region“.');
  }

  // --- Tabellen und Karten lesen -----------------------------------------
  const tab = {};
  for (const name of Object.keys(SCHEMATA)) tab[name] = tabelleLesen(wurzel, name, m);
  const geo = {};
  for (const name of Object.keys(GEO_TYPEN)) geo[name] = geoLesen(wurzel, name, m);

  for (const name of ['zeitplan', 'fahrzeiten', 'starter', 'strassen', 'regeln', 'glossar']) {
    if (tab[name] === null) m.warnungBei(`daten/tabellen/${name}.csv`, null, 'Datei fehlt – der Bereich bleibt leer.');
  }

  const eindeutig = (liste, schluessel, rel) => {
    const map = new Map();
    for (const z of liste ?? []) {
      const k = z[schluessel];
      if (map.has(k)) m.fehlerBei(rel, z._zeile, `„${k}“ kommt mehrfach vor (Spalte „${schluessel}“).`);
      else map.set(k, z);
    }
    return map;
  };

  // Geometrien in Karten
  const geoMap = Object.fromEntries(Object.entries(geo).map(([k, liste]) => [k, new Map(liste.map((f) => [f.id, f]))]));

  // Region-Prüfung für alle Geometrien
  if (regionOk) {
    for (const [name, liste] of Object.entries(geo)) {
      for (const f of liste) {
        const k = alleKoordinaten(f.geometry);
        const draussen = k.filter((p) => !inRegion(p, region));
        if (draussen.length) {
          const vertauscht = draussen.every((p) => inRegion([p[1], p[0]], region));
          m.warnungBei(
            `daten/karte/${name}.geojson`,
            null,
            vertauscht
              ? `„${f.id}“: Längen- und Breitengrad scheinen vertauscht zu sein (GeoJSON erwartet [Länge, Breite]).`
              : `„${f.id}“ liegt (teilweise) außerhalb von „karte.region“ – dort ist offline keine Grundkarte verfügbar.`,
          );
        }
      }
    }
  }

  // Platzhalter-Geometrien sammeln (eine Warnung für alles)
  const platzhalterListe = Object.entries(geo)
    .map(([name, liste]) => [name, liste.filter((f) => f.platzhalter).map((f) => f.id)])
    .filter(([, ids]) => ids.length);
  if (platzhalterListe.length) {
    m.warnungBei(
      'daten/karte/',
      null,
      `Platzhalter-Geometrien („platzhalter“: true) – die Karte zeigt hier nur eine grobe Lage, Längen werden daraus nicht angezeigt: ${platzhalterListe.map(([name, ids]) => `${name}: ${ids.join(', ')}`).join('; ')}.`,
    );
  }

  // --- Strecken -----------------------------------------------------------
  const streckenRel = 'daten/tabellen/strecken.csv';
  const strecken = eindeutig(tab.strecken, 'id', streckenRel);
  const streckenLaenge = new Map();
  const platzhalterStrecken = new Set();
  for (const [id, s] of strecken) {
    const g = geoMap.strecken.get(id);
    if (!g) {
      m.fehlerBei(streckenRel, s._zeile, `Zur Strecke „${id}“ gibt es keine Linie in daten/karte/strecken.geojson.`);
      continue;
    }
    if (g.platzhalter) platzhalterStrecken.add(id);
    streckenLaenge.set(id, turf.length(turf.lineString(g.geometry.coordinates), { units: 'kilometers' }));
  }
  for (const id of geoMap.strecken.keys()) {
    if (!strecken.has(id)) m.fehlerBei('daten/karte/strecken.geojson', null, `Linie „${id}“ hat keinen Eintrag in ${streckenRel}.`);
  }

  // --- Orte --------------------------------------------------------------
  const orteRel = 'daten/tabellen/orte.csv';
  const orte = eindeutig(tab.orte, 'id', orteRel);
  for (const [id, o] of orte) {
    if (!ORT_TYPEN.includes(o.typ)) m.fehlerBei(orteRel, o._zeile, `Typ „${o.typ}“ ist unbekannt. Erlaubt: ${ORT_TYPEN.join(', ')}.`);
    if (!geoMap.orte.has(id)) m.fehlerBei(orteRel, o._zeile, `Zum Ort „${id}“ gibt es keinen Punkt in daten/karte/orte.geojson.`);
  }
  for (const id of geoMap.orte.keys()) {
    if (!orte.has(id)) m.fehlerBei('daten/karte/orte.geojson', null, `Punkt „${id}“ hat keinen Eintrag in ${orteRel}.`);
  }

  // --- Prüfungen (WPs) ----------------------------------------------------
  const wpRel = 'daten/tabellen/pruefungen.csv';
  const wps = eindeutig(tab.pruefungen, 'wp', wpRel);
  const wpAus = [];
  for (const [id, w] of wps) {
    if (w._ungueltig) continue;
    const tag = tagIds.get(w.tag);
    if (!tag) {
      m.fehlerBei(wpRel, w._zeile, `Tag „${w.tag}“ ist in einstellungen.json unter „tage“ nicht definiert.`);
      continue;
    }
    if (!strecken.has(w.strecke)) {
      m.fehlerBei(wpRel, w._zeile, `Strecke „${w.strecke}“ gibt es nicht in ${streckenRel}.`);
      continue;
    }
    if (!(w.intervall_min > 0)) m.fehlerBei(wpRel, w._zeile, '„intervall_min“ muss größer als 0 sein.');
    if (!(w.schnitt_kmh > 0 && w.schnitt_kmh < 250)) m.fehlerBei(wpRel, w._zeile, '„schnitt_kmh“ muss zwischen 0 und 250 liegen.');
    const erstes = lokalZuUtcMs(tag.datum, w.erstes_auto, zeitzone);
    if (erstes === null) continue;
    // Sperrzeiten sind optional – aber nur beide zusammen.
    const mitSperrung = w.sperrung_von !== null || w.sperrung_bis !== null;
    if (mitSperrung && (w.sperrung_von === null || w.sperrung_bis === null)) {
      m.fehlerBei(wpRel, w._zeile, 'Bitte beide Sperrzeiten eintragen (sperrung_von und sperrung_bis) oder beide leer lassen.');
      continue;
    }
    const von = mitSperrung ? lokalZuUtcMs(tag.datum, w.sperrung_von, zeitzone) : null;
    const bis = mitSperrung ? lokalZuUtcMs(tag.datum, w.sperrung_bis, zeitzone) : null;
    if (mitSperrung && (von === null || bis === null)) continue;
    if (!mitSperrung) {
      m.warnungBei(wpRel, w._zeile, `${id}: Keine Sperrzeiten eingetragen – die App zeigt „Sperrzeit nicht angegeben“, und der Tagesplaner kann gesperrte Zufahrten nicht berücksichtigen.`);
    } else {
      if (bis <= von) m.fehlerBei(wpRel, w._zeile, 'Die Sperrung muss enden, nachdem sie begonnen hat (sperrung_bis > sperrung_von).');
      if (von >= erstes) m.fehlerBei(wpRel, w._zeile, 'Die Sperrung muss vor dem ersten Auto beginnen (sperrung_von < erstes_auto).');
    }
    const laengeGeo = streckenLaenge.get(w.strecke);
    const platzhalter = platzhalterStrecken.has(w.strecke);
    if (w.laenge_km && laengeGeo && !platzhalter && Math.abs(w.laenge_km - laengeGeo) / w.laenge_km > 0.15) {
      m.warnungBei(wpRel, w._zeile, `Angegebene Länge ${w.laenge_km} km weicht stark von der Linie in der Karte ab (${laengeGeo.toFixed(2)} km).`);
    }
    wpAus.push({
      id,
      kurz: kurzAusId(id),
      name_de: w.name_de,
      name_en: w.name_en || null,
      strecke: w.strecke,
      tag: w.tag,
      erstesAuto: isoMitVersatz(erstes, zeitzone),
      sperrVon: von !== null ? isoMitVersatz(von, zeitzone) : null,
      sperrBis: bis !== null ? isoMitVersatz(bis, zeitzone) : null,
      intervallMin: w.intervall_min,
      schnittKmh: w.schnitt_kmh,
      laengeKm: rund(w.laenge_km ?? laengeGeo ?? 0, 2),
      // Länge nur aus einer Platzhalter-Linie geschätzt → in der App nicht anzeigen
      laengeUnsicher: w.laenge_km === null && platzhalter,
      _laengeAngegeben: w.laenge_km !== null,
      _ms: { erstes, von, bis },
      _zeile: w._zeile,
    });
  }
  wpAus.sort((a, b) => a._ms.erstes - b._ms.erstes);

  // --- Starter -------------------------------------------------------------
  const starterRel = 'daten/tabellen/starter.csv';
  const starter = eindeutig(tab.starter, 'nr', starterRel);
  const positionen = new Set();
  for (const s of starter.values()) {
    if (s._ungueltig) continue;
    if (s.nr <= 0) m.fehlerBei(starterRel, s._zeile, 'Startnummer muss größer als 0 sein.');
    if (s.baujahr !== null && (s.baujahr < 1900 || s.baujahr > 2100)) m.warnungBei(starterRel, s._zeile, `Baujahr ${s.baujahr} wirkt unplausibel.`);
    if (s.startposition !== null) {
      if (positionen.has(s.startposition)) m.fehlerBei(starterRel, s._zeile, `Startposition ${s.startposition} ist doppelt vergeben.`);
      positionen.add(s.startposition);
    }
  }
  const starterSortiert = [...starter.values()].sort((a, b) => a.nr - b.nr);
  const starterAus = starterSortiert.map((s, i) => ({
    nr: s.nr,
    fahrer: s.fahrer,
    beifahrer: s.beifahrer || null,
    nation: s.nation || null,
    klasse: s.klasse,
    fahrzeug: s.fahrzeug,
    motor: s.motor || null,
    baujahr: s.baujahr,
    team: s.team || null,
    position: s.startposition ?? i + 1,
  }));
  let starterAnzahl = e.starter_anzahl ?? null;
  if (starterAnzahl !== null && !(Number.isInteger(starterAnzahl) && starterAnzahl > 0)) {
    m.fehlerBei(einstRel, null, '„starter_anzahl“ muss leer (null) oder eine ganze Zahl > 0 sein.');
    starterAnzahl = null;
  }
  if (starterAnzahl === null) starterAnzahl = starterAus.length;
  if (starterAnzahl === 0) {
    m.warnungBei(starterRel, null, 'Keine Starter eingetragen – für die Zeitberechnung werden 60 Teilnehmer angenommen. Alternativ „starter_anzahl“ in den Einstellungen setzen.');
    starterAnzahl = 60;
  }
  zusammenfassung.push(`${starterAus.length} Starter (Zeitberechnung mit ${starterAnzahl} Teilnehmern)`);

  // Sperrung muss bis nach dem letzten Auto dauern
  for (const w of wpAus) {
    if (w._ms.bis === null) continue;
    const laenge = w.laengeKm || (streckenLaenge.get(w.strecke) ?? 0);
    const letztesAmZiel = ankunftBeiKm({ erstesAuto: w._ms.erstes, intervallMin: w.intervallMin, schnittKmh: w.schnittKmh }, laenge, starterAnzahl);
    if (letztesAmZiel > w._ms.bis) {
      const t = isoMitVersatz(letztesAmZiel, zeitzone).slice(11, 16);
      m.warnungBei(wpRel, w._zeile, `${w.id}: Laut Berechnung erreicht das letzte Auto das Ziel erst gegen ${t} – die Sperrung endet aber früher. Bitte Zeiten, Intervall oder Schnitt prüfen.`);
    }
  }

  // --- Orte: Sperr-Verweise ----------------------------------------------
  for (const o of orte.values()) {
    for (const wpId of o.gesperrt_mit) {
      if (!wps.has(wpId)) m.fehlerBei(orteRel, o._zeile, `„gesperrt_mit“: WP „${wpId}“ gibt es nicht in ${wpRel}.`);
    }
  }

  // --- Zuschauerpunkte ----------------------------------------------------
  const zpRel = 'daten/tabellen/zuschauerpunkte.csv';
  const zps = eindeutig(tab.zuschauerpunkte, 'id', zpRel);
  const zpAus = [];
  const bilder = [];
  const sperrPolygone = geo.sperrzonen.map((f) => ({ id: f.id, f: { type: 'Feature', properties: {}, geometry: f.geometry } }));
  for (const [id, z] of zps) {
    if (z._ungueltig) continue;
    const g = geoMap.zuschauerpunkte.get(id);
    if (!g) {
      m.fehlerBei(zpRel, z._zeile, `Zum Zuschauerpunkt „${id}“ gibt es keine Fläche in daten/karte/zuschauerpunkte.geojson.`);
      continue;
    }
    if (!strecken.has(z.strecke) || !geoMap.strecken.has(z.strecke)) {
      m.fehlerBei(zpRel, z._zeile, `Strecke „${z.strecke}“ gibt es nicht.`);
      continue;
    }
    if (z.parkplatz) {
      const p = orte.get(z.parkplatz);
      if (!p) m.fehlerBei(zpRel, z._zeile, `Parkplatz „${z.parkplatz}“ gibt es nicht in ${orteRel}.`);
      else if (p.typ !== 'parkplatz') m.warnungBei(zpRel, z._zeile, `„${z.parkplatz}“ ist kein Ort vom Typ „parkplatz“.`);
      if (z.fussweg_min === null) {
        m.warnungBei(zpRel, z._zeile, `„${id}“: „fussweg_min“ fehlt – die App zeigt den Fußweg ab ${z.parkplatz} als unbekannt, der Tagesplaner rechnet mit 0 Minuten.`);
      }
    } else {
      m.warnungBei(zpRel, z._zeile, `„${id}“: Kein Parkplatz eingetragen – die Navigation führt direkt zum Zuschauerpunkt, und der Tagesplaner kann keine Anfahrt berechnen.`);
    }
    if (z.fussweg_min !== null && z.fussweg_min < 0) m.fehlerBei(zpRel, z._zeile, '„fussweg_min“ darf nicht negativ sein.');

    const flaeche = { type: 'Feature', properties: {}, geometry: g.geometry };
    const linie = turf.lineString(geoMap.strecken.get(z.strecke).geometry.coordinates);
    const mitte = turf.centroid(flaeche).geometry.coordinates;
    const { km: kmGeo, abstand } = ersteLageAufLinie(linie.geometry.coordinates, mitte);
    if (abstand > 1) m.warnungBei(zpRel, z._zeile, `„${id}“ liegt ${abstand.toFixed(1)} km von der Strecke „${z.strecke}“ entfernt – richtige Strecke eingetragen?`);
    if (turf.booleanIntersects(flaeche, linie)) {
      m.fehlerBei(zpRel, z._zeile, `Sicherheit: Die Fläche von „${id}“ berührt oder kreuzt die WP-Strecke „${z.strecke}“.`);
    }
    for (const s of sperrPolygone) {
      if (turf.booleanIntersects(flaeche, s.f)) m.fehlerBei(zpRel, z._zeile, `Sicherheit: Die Fläche von „${id}“ überschneidet die Sperrzone „${s.id}“.`);
    }
    if (z.km !== null && Math.abs(z.km - kmGeo) > 0.5) {
      m.warnungBei(zpRel, z._zeile, `Angegebener km ${z.km} weicht von der Lage in der Karte ab (km ${kmGeo.toFixed(2)}).`);
    }
    let foto = null;
    if (z.foto) {
      const quelle = path.join(wurzel, 'daten', 'bilder', z.foto);
      if (!fs.existsSync(quelle)) {
        m.fehlerBei(zpRel, z._zeile, `Foto „${z.foto}“ fehlt in daten/bilder/.`);
      } else {
        const inhalt = fs.readFileSync(quelle);
        const ext = path.extname(z.foto).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) m.fehlerBei(zpRel, z._zeile, `Foto „${z.foto}“: erlaubt sind .jpg, .png oder .webp.`);
        if (inhalt.length > 600 * 1024) m.warnungBei(zpRel, z._zeile, `Foto „${z.foto}“ ist ${(inhalt.length / 1024).toFixed(0)} KB groß – für schnelles Laden auf unter 300 KB verkleinern.`);
        const ziel = `bilder/${path.basename(z.foto, ext).replace(/[^a-zA-Z0-9_-]/g, '_')}.${hash(inhalt)}${ext}`;
        bilder.push({ quelle, ziel });
        foto = ziel;
      }
    }
    zpAus.push({
      id,
      kurz: kurzAusId(id),
      name_de: z.name_de,
      name_en: z.name_en || null,
      strecke: z.strecke,
      km: rund(z.km ?? kmGeo, 2),
      parkplatz: z.parkplatz || null,
      fusswegM: z.fussweg_m,
      fusswegMin: z.fussweg_min,
      hoehenmeter: z.hoehenmeter,
      untergrund_de: z.untergrund_de || null,
      untergrund_en: z.untergrund_en || null,
      barrierefrei: z.barrierefrei,
      kinderwagen: z.kinderwagen,
      versorgung_de: z.versorgung_de || null,
      versorgung_en: z.versorgung_en || null,
      beschreibung_de: z.beschreibung_de || null,
      beschreibung_en: z.beschreibung_en || null,
      foto,
      mitte: [rund(mitte[0]), rund(mitte[1])],
    });
  }
  for (const id of geoMap.zuschauerpunkte.keys()) {
    if (!zps.has(id)) m.fehlerBei('daten/karte/zuschauerpunkte.geojson', null, `Fläche „${id}“ hat keinen Eintrag in ${zpRel}.`);
  }
  zpAus.sort((a, b) => a.id.localeCompare(b.id, 'de', { numeric: true }));

  // --- Zeitplan -------------------------------------------------------------
  const zpRelZeit = 'daten/tabellen/zeitplan.csv';
  const zeitplanAus = [];
  for (const z of tab.zeitplan ?? []) {
    if (z._ungueltig) continue;
    const tag = tagIds.get(z.tag);
    if (!tag) {
      m.fehlerBei(zpRelZeit, z._zeile, `Tag „${z.tag}“ ist in einstellungen.json nicht definiert.`);
      continue;
    }
    const typ = z.typ || 'sonstiges';
    if (!ZEITPLAN_TYPEN.includes(typ)) m.warnungBei(zpRelZeit, z._zeile, `Typ „${typ}“ ist unbekannt (bekannt: ${ZEITPLAN_TYPEN.join(', ')}).`);
    if (z.ort && !orte.has(z.ort)) m.fehlerBei(zpRelZeit, z._zeile, `Ort „${z.ort}“ gibt es nicht in ${orteRel}.`);
    const von = lokalZuUtcMs(tag.datum, z.von, zeitzone);
    const bis = z.bis ? lokalZuUtcMs(tag.datum, z.bis, zeitzone) : null;
    if (bis !== null && bis <= von) m.fehlerBei(zpRelZeit, z._zeile, '„bis“ muss nach „von“ liegen.');
    zeitplanAus.push({
      id: `Z${z._zeile}`,
      tag: z.tag,
      von: isoMitVersatz(von, zeitzone),
      bis: bis !== null ? isoMitVersatz(bis, zeitzone) : null,
      typ,
      titel_de: z.titel_de,
      titel_en: z.titel_en || null,
      ort: z.ort || null,
      ort_de: z.ort_de || null,
      ort_en: z.ort_en || null,
      wp: null,
      _ms: von,
    });
  }
  for (const w of wpAus) {
    zeitplanAus.push({
      id: `Z-${w.id}`,
      tag: w.tag,
      von: w.erstesAuto,
      bis: null,
      typ: 'wp',
      titel_de: null,
      titel_en: null,
      ort: null,
      ort_de: null,
      ort_en: null,
      wp: w.id,
      _ms: w._ms.erstes,
    });
  }
  zeitplanAus.sort((a, b) => a._ms - b._ms);

  // --- Fahrzeiten ------------------------------------------------------------
  const fzRel = 'daten/tabellen/fahrzeiten.csv';
  const fahrzeiten = new Map();
  for (const f of tab.fahrzeiten ?? []) {
    if (f._ungueltig) continue;
    let ok = true;
    for (const id of [f.von, f.nach]) {
      if (!orte.has(id)) {
        m.fehlerBei(fzRel, f._zeile, `Ort „${id}“ gibt es nicht in ${orteRel}.`);
        ok = false;
      }
    }
    if (!(f.minuten >= 0)) {
      m.fehlerBei(fzRel, f._zeile, '„minuten“ muss 0 oder größer sein.');
      ok = false;
    }
    if (!ok) continue;
    const schluessel = `${f.von}>${f.nach}`;
    if (fahrzeiten.has(schluessel)) m.warnungBei(fzRel, f._zeile, `Fahrzeit ${f.von} → ${f.nach} ist doppelt eingetragen.`);
    fahrzeiten.set(schluessel, f.minuten);
  }
  const startort = e.planer?.startort ?? null;
  if (startort && !orte.has(startort)) m.fehlerBei(einstRel, null, `„planer.startort“: Ort „${startort}“ gibt es nicht in ${orteRel}.`);
  const benoetigt = [...new Set([startort, ...zpAus.map((z) => z.parkplatz)].filter(Boolean))];
  const fehlend = [];
  for (let i = 0; i < benoetigt.length; i++) {
    for (let j = i + 1; j < benoetigt.length; j++) {
      const a = benoetigt[i];
      const b = benoetigt[j];
      if (!fahrzeiten.has(`${a}>${b}`) && !fahrzeiten.has(`${b}>${a}`)) fehlend.push(`${a}–${b}`);
    }
  }
  if (fehlend.length) {
    m.warnungBei(fzRel, null, `Für den Tagesplaner fehlen Fahrzeiten zwischen: ${fehlend.join(', ')}. Der Planer zeigt dort „Fahrzeit unbekannt“.`);
  }

  // --- Straßen (Anwohner-Checker) ------------------------------------------
  const strRel = 'daten/tabellen/strassen.csv';
  const strassenAus = [];
  for (const s of tab.strassen ?? []) {
    if (s._ungueltig) continue;
    if (!STRASSEN_STATUS.includes(s.status)) {
      m.fehlerBei(strRel, s._zeile, `Status „${s.status}“ ist unbekannt. Erlaubt: ${STRASSEN_STATUS.join(', ')}.`);
      continue;
    }
    for (const wpId of s.sperrt_mit) {
      if (!wps.has(wpId)) m.fehlerBei(strRel, s._zeile, `„sperrt_mit“: WP „${wpId}“ gibt es nicht.`);
    }
    if ((s.status === 'gesperrt' || s.status === 'umleitung' || s.status === 'teilweise') && s.sperrt_mit.length === 0 && !s.zeiten_de) {
      m.warnungBei(strRel, s._zeile, `„${s.strasse}“: Für den Status „${s.status}“ fehlen Zeiten („sperrt_mit“ oder „zeiten_de“).`);
    }
    strassenAus.push({
      strasse: s.strasse,
      ort: s.ort || null,
      status: s.status,
      sperrtMit: s.sperrt_mit,
      zeiten_de: s.zeiten_de || null,
      zeiten_en: s.zeiten_en || null,
      hinweis_de: s.hinweis_de || null,
      hinweis_en: s.hinweis_en || null,
    });
  }

  // --- Texte ---------------------------------------------------------------
  const seiten = {};
  for (const name of ['impressum', 'datenschutz']) {
    const de = path.join(wurzel, 'daten', 'texte', `${name}.md`);
    const en = path.join(wurzel, 'daten', 'texte', `${name}.en.md`);
    if (!fs.existsSync(de)) {
      m.warnungBei(`daten/texte/${name}.md`, null, 'Datei fehlt – die Seite bleibt leer. Impressum und Datenschutzerklärung sind vor der Veröffentlichung Pflicht.');
      seiten[name] = { de: [], en: null };
      continue;
    }
    const textDe = textLesen(de, m, `daten/texte/${name}.md`);
    if (/\[(Name|E-Mail|Straße|PLZ|Name des Hosters)[^\]]*\]/.test(textDe)) {
      m.warnungBei(`daten/texte/${name}.md`, null, 'Enthält noch Platzhalter in [eckigen Klammern] – vor der Veröffentlichung ausfüllen.');
    }
    seiten[name] = {
      de: markdownZuBloecken(textDe),
      en: fs.existsSync(en) ? markdownZuBloecken(textLesen(en, m, `daten/texte/${name}.en.md`)) : null,
    };
  }

  // --- Abschluss -------------------------------------------------------------
  if (v.beispieldaten) m.warnungBei(einstRel, null, `„beispieldaten“ ist true – die App zeigt den Hinweis „${v.hinweis_de || 'Beispieldaten'}“. Für echte Daten auf false setzen.`);

  zusammenfassung.unshift(
    `${wpAus.length} Wertungsprüfungen auf ${strecken.size} Strecken, ${zpAus.length} Zuschauerpunkte, ${orte.size} Orte, ${geo.sperrzonen.length} Sperrzonen`,
  );

  if (m.fehler.length) return { ok: false, fehler: m.fehler, warnungen: m.warnungen, zusammenfassung };

  const ohneIntern = (o) => {
    const { _ms, _zeile, _laengeAngegeben, ...rest } = o;
    return rest;
  };
  const programm = {
    veranstaltung: {
      name_de: v.name_de,
      name_en: v.name_en || null,
      kurzname: v.kurzname || v.name_de,
      jahr: v.jahr ?? null,
      veranstalter: v.veranstalter || null,
      zeitzone,
      beispieldaten: Boolean(v.beispieldaten),
      hinweis_de: v.hinweis_de || null,
      hinweis_en: v.hinweis_en || null,
    },
    tage: tage.map((t) => ({ id: t.id, datum: t.datum, name_de: t.name_de, name_en: t.name_en || null })),
    karte: {
      stil: standardStil,
      stile,
      mitte: karte.mitte ?? null,
      zoom: karte.zoom ?? null,
      region,
      offlineMaxZoom: maxZoom,
    },
    planer: { startort },
    favoriten: { vorwarnungMin: e.favoriten?.vorwarnung_min ?? 5 },
    zuschauerpass: {
      ziel: e.zuschauerpass?.ziel ?? 5,
      verweildauerMin: e.zuschauerpass?.verweildauer_min ?? 5,
      radiusM: e.zuschauerpass?.radius_m ?? 75,
    },
    kontakt: {
      notruf: e.kontakt?.notruf || '112',
      rallyeleitungTel: e.kontakt?.rallyeleitung_tel || null,
      rallyebueroTel: e.kontakt?.rallyebuero_tel || null,
      email: e.kontakt?.email || null,
      webseite: e.kontakt?.webseite || null,
    },
    starterAnzahl,
    strecken: [...strecken.values()].map((s) => ({
      id: s.id,
      name_de: s.name_de,
      name_en: s.name_en || null,
      belag_de: s.belag_de || null,
      belag_en: s.belag_en || null,
      hinweis_de: s.hinweis_de || null,
      hinweis_en: s.hinweis_en || null,
      // Offizielle WP-Länge (laenge_km) hat Vorrang; sonst die Linie – außer sie ist ein Platzhalter (dann null = unbekannt)
      laengeKm:
        wpAus.find((w) => w.strecke === s.id && w._laengeAngegeben)?.laengeKm ??
        (platzhalterStrecken.has(s.id) ? null : rund(streckenLaenge.get(s.id) ?? 0, 2)),
      wps: wpAus.filter((w) => w.strecke === s.id).map((w) => w.id),
    })),
    pruefungen: wpAus.map(ohneIntern),
    zuschauerpunkte: zpAus,
    orte: [...orte.values()].map((o) => ({
      id: o.id,
      typ: o.typ,
      name_de: o.name_de,
      name_en: o.name_en || null,
      beschreibung_de: o.beschreibung_de || null,
      beschreibung_en: o.beschreibung_en || null,
      gesperrtMit: o.gesperrt_mit,
      stempel: o.stempel === 'ja',
      lage: koordinatenRunden(geoMap.orte.get(o.id).geometry).coordinates,
    })),
    zeitplan: zeitplanAus.map(ohneIntern),
    fahrzeiten: [...fahrzeiten.entries()].map(([k, min]) => [...k.split('>'), min]),
    strassen: strassenAus,
  };

  const fc = (liste) => ({
    type: 'FeatureCollection',
    features: liste.map((f) => ({ type: 'Feature', properties: { id: f.id }, geometry: koordinatenRunden(f.geometry) })),
  });
  const geoAus = {
    strecken: fc(geo.strecken.filter((f) => strecken.has(f.id))),
    zuschauerpunkte: fc(geo.zuschauerpunkte),
    sperrzonen: fc(geo.sperrzonen),
    orte: fc(geo.orte),
  };
  const inhalte = {
    regeln: (tab.regeln ?? [])
      .map((r, i) => ({ nr: r.nr ?? i + 1, text_de: r.text_de, text_en: r.text_en || null }))
      .sort((a, b) => a.nr - b.nr),
    glossar: (tab.glossar ?? []).map((g) => ({
      begriff_de: g.begriff_de,
      erklaerung_de: g.erklaerung_de,
      begriff_en: g.begriff_en || null,
      erklaerung_en: g.erklaerung_en || null,
    })),
    seiten,
  };

  const dateien = {
    programm: JSON.stringify(programm),
    geo: JSON.stringify(geoAus),
    starter: JSON.stringify({ starter: starterAus }),
    inhalte: JSON.stringify(inhalte),
  };
  const namen = {};
  for (const [k, inhalt] of Object.entries(dateien)) namen[k] = `${k}.${hash(inhalt)}.json`;
  const version = hash(Object.values(namen).join('|') + bilder.map((b) => b.ziel).join('|'));
  const manifest = {
    version,
    erstellt: new Date().toISOString(),
    beispieldaten: Boolean(v.beispieldaten),
    dateien: namen,
    bilder: bilder.map((b) => b.ziel),
  };

  if (schreiben) {
    if (path.basename(ausgabe) !== 'daten') throw new Error(`Ausgabeordner muss „daten“ heißen: ${ausgabe}`);
    fs.rmSync(ausgabe, { recursive: true, force: true });
    fs.mkdirSync(path.join(ausgabe, 'bilder'), { recursive: true });
    for (const [k, inhalt] of Object.entries(dateien)) fs.writeFileSync(path.join(ausgabe, namen[k]), inhalt);
    for (const b of bilder) fs.copyFileSync(b.quelle, path.join(ausgabe, b.ziel));
    fs.writeFileSync(path.join(ausgabe, 'manifest.json'), JSON.stringify(manifest, null, 2));
  }
  zusammenfassung.push(`Datenversion ${version}`);
  return { ok: true, fehler: [], warnungen: m.warnungen, zusammenfassung, manifest, programm, inhalte };
}

/** Gibt das Ergebnis lesbar auf der Konsole aus. */
export function ergebnisAusgeben(erg, log = console.log) {
  for (const z of erg.zusammenfassung) log(`  • ${z}`);
  if (erg.warnungen.length) {
    log(`\n  ⚠ ${erg.warnungen.length} Hinweis(e):`);
    for (const w of erg.warnungen) log(`    – ${w}`);
  }
  if (erg.fehler.length) {
    log(`\n  ✖ ${erg.fehler.length} Fehler – die Daten wurden NICHT übernommen:`);
    for (const f of erg.fehler) log(`    – ${f}`);
  } else {
    log('\n  ✔ Daten geprüft und nach public/daten/ geschrieben.');
  }
}

// Direkt aufgerufen: node scripts/daten-bauen.mjs
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log('Rallye-Daten werden gebaut …\n');
  const erg = datenBauen();
  ergebnisAusgeben(erg);
  process.exitCode = erg.ok ? 0 : 1;
}
