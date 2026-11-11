// Die Karte: Grundkarte + eigene Ebenen (Strecken, Zuschauerpunkte, Sperrzonen, Orte).
// Alles wird auf dem Gerät zusammengesetzt.

import { Map as MlKarte, Marker, setWorkerUrl, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { grundkarteEinrichten, anfrageUmleiten, stilLaden, ersatzStil, stilVorladen, stilOffline } from './basemap.js';
import { zustand, melden, abonnieren } from './zustand.js';
import { lesen, schreiben, lesenGlobal, schreibenGlobal } from './speicher.js';
import { t, feld } from './i18n.js';
import { esc } from './html.js';
import { along, length, lineString } from '@turf/turf';

setWorkerUrl(workerUrl);

export const EBENEN = [
  { id: 'wp', farbe: '#18201C', text: 'ebene.wp' },
  { id: 'zp', farbe: '#1F7A3A', text: 'ebene.zp' },
  { id: 'sperr', farbe: '#B42318', text: 'ebene.sperr' },
  { id: 'park', farbe: '#1D5FA8', text: 'ebene.park' },
  { id: 'rallye', farbe: '#C2410C', text: 'ebene.rallye' },
  { id: 'service', farbe: '#5A635E', text: 'ebene.service' },
];
const STANDARD_EBENEN = { wp: true, zp: true, sperr: true, park: true, rallye: true, service: false };
const ORT_EBENE = {
  parkplatz: 'park',
  servicepark: 'rallye',
  rampe: 'rallye',
  info: 'rallye',
  wc: 'service',
  imbiss: 'service',
  sanitaeter: 'service',
  shuttle: 'service',
  sonstiges: 'service',
};
const ORT_SYMBOL = {
  parkplatz: (o) => esc(o.id),
  servicepark: () => 'S',
  rampe: () => '<span class="m-flagge"></span>',
  info: () => 'i',
  wc: () => 'WC',
  imbiss: () => '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9"/></svg>',
  sanitaeter: () => '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>',
  shuttle: () => '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="5" y="3" width="14" height="15" rx="2"/><path d="M5 11h14M8 21v-3M16 21v-3"/></svg>',
  sonstiges: () => '•',
};

let karte = null;
let aufAuswahl = () => {};
const marker = { zp: new Map(), ort: new Map(), wp: [] };
let positionMarker = null;
let ausgewaehlt = null;

export const karteObjekt = () => karte;

// ---- Kartenansichten (Stile) ------------------------------------------------------
// Die erste Ansicht aus einstellungen.json ist der Standard und wird offline gespeichert.
// Weitere OpenFreeMap-Stile nutzen dieselben Kacheln; sie werden beim ersten Auswählen gespeichert.
// Das Luftbild kommt direkt vom Landesdienst und ist nur mit Internet verfügbar.

let aktiverStilId = null;

export function kartenStile() {
  const d = zustand.daten;
  return d?.karte.stile?.length ? d.karte.stile : [{ id: 'standard', name_de: 'Standard', url: d?.karte.stil, luftbild: null }];
}

export const aktiverStil = () => kartenStile().find((s) => s.id === aktiverStilId) ?? kartenStile()[0];

/** Kann die Ansicht jetzt gezeigt werden? (offline nur gespeicherte Stile, Luftbild nie) */
export function stilVerfuegbar(stil) {
  if (stil.luftbild) return zustand.online;
  if (stil.url === zustand.daten.karte.stil) return true;
  return zustand.online || stilOffline(stil.url);
}

/** Ist die Ansicht offline nutzbar? */
export function stilOfflineNutzbar(stil) {
  if (stil.luftbild) return false;
  if (stil.url === zustand.daten.karte.stil) return zustand.karteOffline.phase === 'fertig';
  return stilOffline(stil.url);
}

/** Luftbild (WMS des Landes) mit den Beschriftungen des Standard-Stils darüber („Hybrid“) */
function luftbildStil(basis, lb) {
  const px = (globalThis.devicePixelRatio || 1) > 1 ? 512 : 256;
  const trenner = lb.wms.includes('?') ? '&' : '?';
  const url = `${lb.wms}${trenner}SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${encodeURIComponent(lb.ebene)}&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=${px}&HEIGHT=${px}&FORMAT=image/jpeg`;
  const stil = {
    version: 8,
    sources: { 'rw-luftbild': { type: 'raster', tiles: [url], tileSize: 256, maxzoom: 19, attribution: esc(lb.quelle) } },
    layers: [
      { id: 'luftbild-hintergrund', type: 'background', paint: { 'background-color': '#5b6650' } },
      { id: 'luftbild', type: 'raster', source: 'rw-luftbild' },
    ],
  };
  if (basis) {
    if (basis.glyphs) stil.glyphs = basis.glyphs;
    if (basis.sprite) stil.sprite = basis.sprite;
    for (const [id, q] of Object.entries(basis.sources || {})) if (q.type === 'vector') stil.sources[id] = q;
    for (const ebene of basis.layers || []) {
      if (ebene.type !== 'symbol' || !ebene.layout?.['text-field'] || !stil.sources[ebene.source]) continue;
      stil.layers.push({
        ...ebene,
        paint: { ...ebene.paint, 'text-color': '#ffffff', 'text-halo-color': 'rgba(0, 0, 0, 0.75)', 'text-halo-width': 1.4, 'text-halo-blur': 0.5 },
      });
    }
  }
  return stil;
}

async function stilAufbauen(stil, frisch = false) {
  const d = zustand.daten;
  if (stil.luftbild) return luftbildStil(await stilLaden(d.karte.stil), stil.luftbild);
  return stilLaden(stil.url, { frisch: frisch && stil.url !== d.karte.stil });
}

/** Andere Kartenansicht wählen. Rückgabe: true, wenn gewechselt wurde. */
export async function stilWaehlen(id) {
  const d = zustand.daten;
  const stil = kartenStile().find((s) => s.id === id);
  if (!karte || !stil || !stilVerfuegbar(stil)) return false;
  const neu = await stilAufbauen(stil, true);
  if (!neu) return false;
  karte.setStyle(neu, { diff: false });
  aktiverStilId = stil.id;
  schreibenGlobal('kartenstil', stil.id);
  zustand.grundkarte = 'ok';
  melden('grundkarte');
  melden('kartenstil');
  if (!stil.luftbild && stil.url !== d.karte.stil && !stilOffline(stil.url)) stilVorladen(stil.url, d.karte);
  return true;
}

export function ebenenZustand() {
  return { ...STANDARD_EBENEN, ...lesen('ebenen', {}) };
}

function schraffurBild() {
  const g = 8;
  const c = document.createElement('canvas');
  c.width = g;
  c.height = g;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(247, 217, 214, 0.75)';
  ctx.fillRect(0, 0, g, g);
  ctx.strokeStyle = '#B42318';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-2, g + 2);
  ctx.lineTo(g + 2, -2);
  ctx.moveTo(-2, 2);
  ctx.lineTo(2, -2);
  ctx.moveTo(g - 2, g + 2);
  ctx.lineTo(g + 2, g - 2);
  ctx.stroke();
  const d = ctx.getImageData(0, 0, g, g);
  return { width: g, height: g, data: new Uint8Array(d.data.buffer) };
}

function ebenenHinzufuegen() {
  const d = zustand.daten;
  if (!karte || !d || karte.getSource('rw-strecken')) return;
  if (!karte.hasImage('schraffur')) karte.addImage('schraffur', schraffurBild());
  karte.addSource('rw-sperrzonen', { type: 'geojson', data: d.geo.sperrzonen });
  karte.addSource('rw-zp', { type: 'geojson', data: d.geo.zuschauerpunkte });
  karte.addSource('rw-strecken', { type: 'geojson', data: d.geo.strecken });
  karte.addLayer({ id: 'sperr-flaeche', type: 'fill', source: 'rw-sperrzonen', paint: { 'fill-pattern': 'schraffur' } });
  karte.addLayer({ id: 'sperr-linie', type: 'line', source: 'rw-sperrzonen', paint: { 'line-color': '#B42318', 'line-width': 1.5 } });
  karte.addLayer({ id: 'zp-flaeche', type: 'fill', source: 'rw-zp', paint: { 'fill-color': '#1F7A3A', 'fill-opacity': 0.28 } });
  karte.addLayer({ id: 'zp-linie', type: 'line', source: 'rw-zp', paint: { 'line-color': '#1F7A3A', 'line-width': 2 } });
  karte.addLayer({
    id: 'strecke-umriss',
    type: 'line',
    source: 'rw-strecken',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 15, 10] },
  });
  karte.addLayer({
    id: 'strecke-linie',
    type: 'line',
    source: 'rw-strecken',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#18201C', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 15, 5] },
  });
  karte.addLayer({
    id: 'strecke-klick',
    type: 'line',
    source: 'rw-strecken',
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 22 },
  });
  sichtbarkeitAnwenden();
}

function knopf(klasse, inhalt, label) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = klasse;
  el.innerHTML = inhalt;
  el.setAttribute('aria-label', label);
  return el;
}

function mitteDerLinie(koordinaten) {
  const linie = lineString(koordinaten);
  return along(linie, length(linie) / 2).geometry.coordinates;
}

function markerAnlegen() {
  const d = zustand.daten;
  for (const m of [...marker.zp.values(), ...marker.ort.values(), ...marker.wp]) m.remove();
  marker.zp.clear();
  marker.ort.clear();
  marker.wp = [];

  for (const z of d.zp.values()) {
    const el = knopf('m-zp', esc(z.kurz), `${t('zp.abk')} ${z.kurz} · ${feld(z, 'name')}`);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      aufAuswahl({ typ: 'zp', id: z.id });
    });
    marker.zp.set(z.id, new Marker({ element: el }).setLngLat(z.mitte).addTo(karte));
  }
  for (const o of d.ort.values()) {
    const el = knopf(`m-ort m-${o.typ}`, (ORT_SYMBOL[o.typ] || ORT_SYMBOL.sonstiges)(o), feld(o, 'name'));
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      aufAuswahl({ typ: 'ort', id: o.id });
    });
    marker.ort.set(o.id, new Marker({ element: el }).setLngLat(o.lage).addTo(karte));
  }
  for (const f of d.geo.strecken.features) {
    const s = d.strecken.get(f.properties.id);
    const k = f.geometry.coordinates;
    const wps = s.wps.map((id) => d.wp.get(id).kurz).join('/');
    // In der Übersicht nur „WP 1/4“, beim Hineinzoomen zusätzlich der Name (siehe .karte-weit in styles.css)
    const label = knopf(
      'm-wp-label',
      `${esc(t('wp.abk'))} ${esc(wps)}<span class="wp-name"> · ${esc(feld(s, 'name'))}</span>`,
      `${t('wp.abk')} ${wps} ${feld(s, 'name')}`,
    );
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      aufAuswahl({ typ: 'strecke', id: s.id });
    });
    const start = document.createElement('div');
    start.className = 'm-start';
    start.title = t('karte.start');
    const ziel = document.createElement('div');
    ziel.className = 'm-ziel';
    ziel.title = t('karte.ziel');
    marker.wp.push(
      new Marker({ element: start }).setLngLat(k[0]).addTo(karte),
      new Marker({ element: ziel }).setLngLat(k[k.length - 1]).addTo(karte),
      // Beschriftung in der Mitte der Strecke – dort stört sie Start, Ziel und Zuschauerpunkte am wenigsten
      new Marker({ element: label, anchor: 'left', offset: [12, 0] }).setLngLat(mitteDerLinie(k)).addTo(karte),
    );
  }
  auswahlMarkieren();
}

// Unterhalb dieser Zoomstufe werden kleine Orte (WC, Imbiss, …) ausgeblendet, damit die Übersicht lesbar bleibt
const ZOOM_DETAILS = 12;
const KLEINE_ORTE = ['wc', 'imbiss', 'sanitaeter', 'shuttle', 'sonstiges', 'info'];

function sichtbarkeitAnwenden() {
  if (!karte) return;
  const e = ebenenZustand();
  const weit = karte.getZoom() < ZOOM_DETAILS;
  karte.getContainer().classList.toggle('karte-weit', weit);
  const layer = { wp: ['strecke-umriss', 'strecke-linie', 'strecke-klick'], zp: ['zp-flaeche', 'zp-linie'], sperr: ['sperr-flaeche', 'sperr-linie'] };
  for (const [gruppe, ids] of Object.entries(layer)) {
    for (const id of ids) if (karte.getLayer(id)) karte.setLayoutProperty(id, 'visibility', e[gruppe] ? 'visible' : 'none');
  }
  for (const m of marker.zp.values()) m.getElement().hidden = !e.zp;
  for (const m of marker.wp) m.getElement().hidden = !e.wp;
  for (const [id, m] of marker.ort) {
    const o = zustand.daten.ort.get(id);
    const gewaehlt = ausgewaehlt?.typ === 'ort' && ausgewaehlt.id === id;
    const ebeneAn = e[ORT_EBENE[o.typ] || 'service'];
    m.getElement().hidden = !gewaehlt && (!ebeneAn || (weit && KLEINE_ORTE.includes(o.typ)));
  }
}

export function ebeneUmschalten(id) {
  const e = ebenenZustand();
  e[id] = !e[id];
  schreiben('ebenen', e);
  sichtbarkeitAnwenden();
  melden('ebenen');
}

function auswahlMarkieren() {
  for (const [id, m] of marker.zp) m.getElement().classList.toggle('ausgewaehlt', ausgewaehlt?.typ === 'zp' && ausgewaehlt.id === id);
  for (const [id, m] of marker.ort) m.getElement().classList.toggle('ausgewaehlt', ausgewaehlt?.typ === 'ort' && ausgewaehlt.id === id);
  if (karte?.getLayer('strecke-linie')) {
    const sid = ausgewaehlt?.typ === 'strecke' ? ausgewaehlt.id : '';
    karte.setPaintProperty('strecke-linie', 'line-color', ['case', ['==', ['get', 'id'], sid], '#C2410C', '#18201C']);
  }
  sichtbarkeitAnwenden();
}

/** Markiert ein Objekt (oder null) auf der Karte. */
export function auswahlSetzen(auswahl) {
  ausgewaehlt = auswahl;
  if (karte) auswahlMarkieren();
}

function positionAnzeigen() {
  if (!karte) return;
  const p = zustand.position;
  if (!p) {
    positionMarker?.remove();
    positionMarker = null;
    return;
  }
  if (!positionMarker) {
    const el = document.createElement('div');
    el.className = 'm-position';
    el.setAttribute('aria-label', t('karte.du'));
    positionMarker = new Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(karte);
  } else {
    positionMarker.setLngLat([p.lon, p.lat]);
  }
}

let fliegenSobaldPosition = false;

/** Fliegt zur eigenen Position – oder sobald sie bekannt ist. */
export function zuPositionFliegen() {
  const p = zustand.position;
  if (karte && p) {
    fliegenSobaldPosition = false;
    karte.flyTo({ center: [p.lon, p.lat], zoom: Math.max(karte.getZoom(), 14) });
  } else {
    fliegenSobaldPosition = true;
  }
}

/** Freiraum für die Infokarte: unten (Handy) oder links schwebend (breite Kartenfläche, siehe main.js) */
function blattRand() {
  const breit = karte.getContainer().clientWidth >= 760;
  // Alle vier Seiten angeben: flyTo merkt sich den Rand für spätere Kamerabewegungen
  return breit
    ? { punkt: { top: 120, bottom: 0, left: 400, right: 0 }, flaeche: { top: 140, bottom: 40, left: 420, right: 72 } }
    : { punkt: { top: 0, bottom: 260, left: 0, right: 0 }, flaeche: { top: 120, bottom: 280, left: 40, right: 40 } };
}

export function zuObjektFliegen(auswahl) {
  const d = zustand.daten;
  if (!karte || !d || !auswahl) return;
  const rand = blattRand();
  if (auswahl.typ === 'zp') karte.flyTo({ center: d.zp.get(auswahl.id).mitte, zoom: Math.max(karte.getZoom(), 14.5), padding: rand.punkt });
  if (auswahl.typ === 'ort') karte.flyTo({ center: d.ort.get(auswahl.id).lage, zoom: Math.max(karte.getZoom(), 14), padding: rand.punkt });
  if (auswahl.typ === 'strecke') {
    const f = d.geo.strecken.features.find((x) => x.properties.id === auswahl.id);
    const b = new LngLatBounds();
    for (const k of f.geometry.coordinates) b.extend(k);
    karte.fitBounds(b, { padding: rand.flaeche, maxZoom: 14 });
  }
}

export function zoomen(richtung) {
  if (karte) karte.easeTo({ zoom: karte.getZoom() + richtung });
}

export function karteGroesseAnpassen() {
  karte?.resize();
}

function datenUmfang(d) {
  const b = new LngLatBounds();
  const sammeln = (k) => (typeof k[0] === 'number' ? b.extend(k) : k.forEach(sammeln));
  for (const fc of [d.geo.strecken, d.geo.zuschauerpunkte]) for (const f of fc.features) sammeln(f.geometry.coordinates);
  for (const o of d.ort.values()) b.extend(o.lage);
  return b.isEmpty() ? d.karte.region : b.toArray().flat();
}

/**
 * Erzeugt die Karte einmalig.
 * @param {HTMLElement} container
 * @param {(auswahl: {typ:string,id:string}|null) => void} beiAuswahl
 */
export async function karteErzeugen(container, beiAuswahl) {
  const d = zustand.daten;
  aufAuswahl = beiAuswahl;
  grundkarteEinrichten(d.karte.stil);
  // Zuletzt gewählte Ansicht – wenn sie gerade verfügbar ist, sonst der Standard
  const gewaehlt = kartenStile().find((s) => s.id === lesenGlobal('kartenstil'));
  let stil = null;
  if (gewaehlt && gewaehlt.url !== d.karte.stil && stilVerfuegbar(gewaehlt)) {
    stil = await stilAufbauen(gewaehlt);
    if (stil) aktiverStilId = gewaehlt.id;
  }
  if (!stil) {
    stil = await stilLaden(d.karte.stil);
    aktiverStilId = kartenStile()[0].id;
  }
  zustand.grundkarte = stil ? 'ok' : 'fehlt';
  melden('grundkarte');
  const optionen = {
    container,
    style: stil || ersatzStil(),
    transformRequest: anfrageUmleiten,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    maxZoom: 18,
  };
  if (d.karte.mitte && d.karte.zoom) {
    optionen.center = d.karte.mitte;
    optionen.zoom = d.karte.zoom;
  } else {
    // Standard: alle Strecken, Zuschauerpunkte und Orte passend ins Bild
    optionen.bounds = datenUmfang(d);
    optionen.fitBoundsOptions = { padding: { top: 150, bottom: 30, left: 24, right: 64 } };
  }
  try {
    karte = new MlKarte(optionen);
  } catch (e) {
    console.error(e);
    zustand.grundkarte = 'keinWebgl';
    melden('grundkarte');
    return false;
  }
  karte.touchZoomRotate.disableRotation();
  karte.on('zoomend', sichtbarkeitAnwenden);
  karte.on('style.load', () => {
    ebenenHinzufuegen();
    auswahlMarkieren();
  });
  karte.on('error', (e) => {
    // Fehlende Kacheln offline sind normal – nur in der Konsole melden
    if (import.meta.env.DEV) console.debug('Karte:', e?.error?.message);
  });
  const klickAuf = (layer, fn) => {
    karte.on('click', layer, fn);
    karte.on('mouseenter', layer, () => (karte.getCanvas().style.cursor = 'pointer'));
    karte.on('mouseleave', layer, () => (karte.getCanvas().style.cursor = ''));
  };
  let ebenenKlick = false;
  klickAuf('zp-flaeche', (e) => {
    ebenenKlick = true;
    aufAuswahl({ typ: 'zp', id: e.features[0].properties.id });
  });
  klickAuf('strecke-klick', (e) => {
    if (ebenenKlick) return;
    ebenenKlick = true;
    aufAuswahl({ typ: 'strecke', id: e.features[0].properties.id });
  });
  klickAuf('sperr-flaeche', (e) => {
    if (ebenenKlick) return;
    ebenenKlick = true;
    aufAuswahl({ typ: 'sperrzone', id: e.features[0].properties.id });
  });
  karte.on('click', () => {
    // Läuft nach den Ebenen-Klicks: Klick ins Leere hebt die Auswahl auf
    if (!ebenenKlick) aufAuswahl(null);
    ebenenKlick = false;
  });
  markerAnlegen();
  positionAnzeigen();
  abonnieren((was) => {
    if (was === 'position') {
      positionAnzeigen();
      if (fliegenSobaldPosition && zustand.position) zuPositionFliegen();
    }
    if (was === 'sprache') markerAnlegen();
  });
  // Grundkarte nachladen, sobald wieder Netz da ist
  window.addEventListener('online', async () => {
    if (zustand.grundkarte !== 'fehlt') return;
    const neu = await stilAufbauen(aktiverStil());
    if (neu) {
      zustand.grundkarte = 'ok';
      karte.setStyle(neu, { diff: false });
      melden('grundkarte');
    }
  });
  // Gewählte weitere Ansicht im Hintergrund für offline speichern (bzw. auffrischen)
  const a = aktiverStil();
  if (!a.luftbild && a.url !== d.karte.stil && navigator.onLine) setTimeout(() => stilVorladen(a.url, d.karte), 3000);
  return true;
}

/** Nach einem Daten-Update: Ebenen und Marker neu aufbauen */
export function karteDatenAktualisieren() {
  if (!karte) return;
  const d = zustand.daten;
  if (karte.getSource('rw-strecken')) {
    karte.getSource('rw-sperrzonen').setData(d.geo.sperrzonen);
    karte.getSource('rw-zp').setData(d.geo.zuschauerpunkte);
    karte.getSource('rw-strecken').setData(d.geo.strecken);
  }
  markerAnlegen();
}
