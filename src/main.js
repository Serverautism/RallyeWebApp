// Einstieg der App: Daten laden, Ansichten anzeigen, Offline-Funktionen starten.

import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './styles.css';

import { html } from './app/html.js';
import { icon } from './app/icons.js';
import { t, feld, spracheEinrichten } from './app/i18n.js';
import { zustand, abonnieren, melden } from './app/zustand.js';
import { praefixSetzen, lesen, lesenGlobal } from './app/speicher.js';
import { manifestLaden, datenLaden, aufbereiten, aufraeumen } from './app/datenlader.js';
import { uhrEinrichten, istDemo, demoBeenden, jetzt } from './app/uhr.js';
import { zeitMitTag, datumUndZeit } from './app/format.js';
import { standortWiederherstellen } from './app/position.js';
import { hinweiseStarten } from './app/hinweise.js';
import { passStarten } from './app/pass.js';
import { einstellung } from './app/meine.js';
import { wachhalten, tonVorbereiten } from './app/geraet.js';
import { toast } from './app/toast.js';
import { navigationStarten } from './app/navigation.js';
import { regionVorladen } from './app/basemap.js';
import { karteErzeugen, auswahlSetzen, zuObjektFliegen, karteGroesseAnpassen, karteDatenAktualisieren } from './app/karte.js';
import { karteUi, karteAktionen } from './views/karte.js';
import { zuschauerpunktAnsicht } from './views/zuschauerpunkt.js';
import { zeitplanAnsicht } from './views/zeitplan.js';
import { planerAnsicht } from './views/planer.js';
import { starterAnsicht } from './views/starter.js';
import { mehrAnsicht } from './views/mehr.js';
import { notfallAnsicht } from './views/notfall.js';
import { passAnsicht, anwohnerAnsicht, regelnAnsicht, seiteAnsicht } from './views/extras.js';

const ANSICHTEN = {
  zp: zuschauerpunktAnsicht,
  zeitplan: zeitplanAnsicht,
  planer: planerAnsicht,
  starter: starterAnsicht,
  mehr: mehrAnsicht,
  notfall: notfallAnsicht,
  pass: passAnsicht,
  anwohner: anwohnerAnsicht,
  regeln: regelnAnsicht,
  seite: seiteAnsicht,
};
const KARTE_EREIGNISSE = ['karteOffline', 'ebenen', 'kartenstil', 'position', 'plan', 'grundkarte', 'minute', 'sprache', 'online'];

// Ab dieser Breite (Computer, großes Tablet quer) steht die Karte neben den Inhalten – zum Planen am Rechner
const BREIT = window.matchMedia('(min-width: 1100px)');
// Ab dieser Breite der Kartenfläche schwebt die Infokarte links statt unten über die ganze Breite
const KARTE_BREIT_PX = 760;

const el = {
  app: document.getElementById('app'),
  kopf: document.getElementById('kopfleiste'),
  kartenAnsicht: document.getElementById('karten-ansicht'),
  karte: document.getElementById('karte'),
  kartenUi: document.getElementById('karten-ui'),
  ansicht: document.getElementById('ansicht'),
  tabbar: document.getElementById('tabbar'),
};

let route = { name: 'karte', params: [] };
let navigationen = 0;
let karteBereit = false;
let karteWirdErzeugt = false;
let letzteAuswahl = null;
// Auswahl auf der Karte neben den Inhalten (geteilte Ansicht) – steht nicht in der Adresse
let nebenAuswahl = null;

const geteilt = () => BREIT.matches && route.name !== 'karte';

// ---------------------------------------------------------------------------
// Routen
// ---------------------------------------------------------------------------
function routeLesen() {
  const teile = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const name = teile[0] && (teile[0] === 'karte' || ANSICHTEN[teile[0]]) ? teile[0] : 'karte';
  return { name, params: teile.slice(1) };
}

function gueltigeAuswahl(typ, id) {
  const d = zustand.daten;
  if (typ === 'zp' && d.zp.has(id)) return { typ, id };
  if (typ === 'ort' && d.ort.has(id)) return { typ, id };
  if (typ === 'strecke' && d.strecken.has(id)) return { typ, id };
  if (typ === 'sperrzone' && id) return { typ, id };
  return null;
}

function auswahlAusRoute() {
  const [typ, id] = route.params;
  return gueltigeAuswahl(typ, id);
}

/** Was die Infokarte über der Karte zeigt */
function blattAuswahl() {
  return route.name === 'karte' ? auswahlAusRoute() : nebenAuswahl;
}

/** Was auf der Karte hervorgehoben wird – im Steckbrief der Zuschauerpunkt selbst */
function kartenMarkierung() {
  const a = blattAuswahl();
  if (a || route.name === 'karte') return a;
  return route.name === 'zp' ? gueltigeAuswahl('zp', route.params[0]) : null;
}

function tabName() {
  return route.name === 'karte' ? 'karte' : ANSICHTEN[route.name]?.tab;
}

function tabbarZeichnen() {
  const tabs = [
    ['karte', 'karte', 'tab.karte'],
    ['zeitplan', 'uhr', 'tab.zeitplan'],
    ['planer', 'planer', 'tab.planer'],
    ['starter', 'liste', 'tab.starter'],
    ['mehr', 'mehr', 'tab.mehr'],
  ];
  const aktiv = tabName();
  el.tabbar.innerHTML = String(
    html`<img class="tab-marke" src="icons/favicon.svg" alt="" width="44" height="44">${tabs.map(
      ([id, sym, text]) => html`<a href="#/${id}" class="tab ${aktiv === id ? 'aktiv' : ''}" ${aktiv === id ? html`aria-current="page"` : ''}>${icon(sym, 22)}<span>${t(text)}</span></a>`,
    )}`,
  );
}

function kopfZeichnen() {
  const d = zustand.daten;
  const teile = [];
  if (zustand.appUpdateBereit) {
    teile.push(html`<div class="kopf-zeile kopf-update">${icon('aktualisieren', 16)} <span>${t('kopf.update')}</span> <button type="button" data-aktion="app-update">${t('kopf.update_knopf')}</button></div>`);
  }
  if (istDemo()) {
    teile.push(html`<div class="kopf-zeile kopf-demo">${icon('uhr', 16)} <span>${t('kopf.demo', { zeit: zeitMitTag(jetzt()) })}</span> <button type="button" data-aktion="demo-ende">${t('kopf.demo_ende')}</button></div>`);
  }
  if (d?.beispieldaten) teile.push(html`<div class="kopf-zeile kopf-beispiel">${icon('info', 16)} <span>${t('kopf.beispieldaten')}</span></div>`);
  if (!zustand.online) teile.push(html`<div class="kopf-zeile kopf-offline">${icon('offline', 16)} <span>${t('kopf.offline', { zeit: datumUndZeit(d?.erstellt ?? Date.now()) })}</span></div>`);
  el.kopf.innerHTML = String(html`${teile}`);
}

function karteUiZeichnen() {
  const auswahl = blattAuswahl();
  el.kartenUi.innerHTML = String(karteUi(auswahl));
  const breit = el.kartenAnsicht.clientWidth >= KARTE_BREIT_PX;
  el.kartenAnsicht.classList.toggle('flaeche-breit', breit);
  const blatt = el.kartenUi.querySelector('.blatt');
  el.kartenAnsicht.style.setProperty('--blatt-hoehe', blatt && !breit ? `${blatt.offsetHeight}px` : '0px');
}

/** Erzeugt die Karte beim ersten Anzeigen; danach Größe und Hervorhebung abgleichen. */
function karteAbgleichen() {
  const markierung = kartenMarkierung();
  if (!karteBereit && !karteWirdErzeugt) {
    karteWirdErzeugt = true;
    karteErzeugen(el.karte, kartenAuswahl).then((ok) => {
      karteBereit = ok;
      karteWirdErzeugt = false;
      if (ok) {
        const a = kartenMarkierung();
        auswahlSetzen(a);
        if (a) zuObjektFliegen(a);
        letzteAuswahl = a;
        setTimeout(() => regionVorladen(zustand.daten.karte), 1500);
      }
      melden('grundkarte');
    });
  } else if (karteBereit) {
    karteGroesseAnpassen();
    if (JSON.stringify(markierung) !== JSON.stringify(letzteAuswahl)) {
      auswahlSetzen(markierung);
      if (markierung && markierung.typ !== 'sperrzone') zuObjektFliegen(markierung);
      letzteAuswahl = markierung;
    }
  }
}

/** Klick auf der Karte: als Adresse (Vollbild-Karte) oder als Auswahl neben den Inhalten */
function kartenAuswahl(a) {
  if (route.name === 'karte') {
    location.replace(a ? `#/karte/${a.typ}/${a.id}` : '#/karte');
    return;
  }
  nebenAuswahlSetzen(a);
}

function nebenAuswahlSetzen(a) {
  nebenAuswahl = a;
  if (!geteilt()) return;
  karteUiZeichnen();
  karteAbgleichen();
}

function ansichtZeichnen({ scrollBehalten = false } = {}) {
  if (!zustand.daten) return;
  const teilen = geteilt();
  el.app.classList.toggle('geteilt', teilen);
  if (route.name === 'karte') {
    el.ansicht.hidden = true;
    el.ansicht.innerHTML = '';
    el.kartenAnsicht.hidden = false;
    karteUiZeichnen();
    karteAbgleichen();
    return;
  }
  const ansicht = ANSICHTEN[route.name];
  el.kartenAnsicht.hidden = !teilen;
  el.ansicht.hidden = false;
  const scroll = scrollBehalten ? el.ansicht.scrollTop : 0;
  el.ansicht.innerHTML = String(ansicht.render(route.params));
  el.ansicht.scrollTop = scroll;
  ansicht.nachRender?.(el.ansicht, route.params);
  if (teilen) {
    karteUiZeichnen();
    karteAbgleichen();
  }
}

function routeWechseln() {
  const neu = routeLesen();
  const gleicheSeite = neu.name === route.name && JSON.stringify(neu.params) === JSON.stringify(route.params);
  route = neu;
  if (!gleicheSeite) nebenAuswahl = null;
  tabbarZeichnen();
  ansichtZeichnen({ scrollBehalten: gleicheSeite });
  if (!gleicheSeite && route.name !== 'karte') el.ansicht.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Ereignisse (Klicks und Eingaben in allen Ansichten)
// ---------------------------------------------------------------------------
let swRegistrierung = null;
let aktualisierungAngefordert = false;

const GLOBALE_AKTIONEN = {
  zurueck(ziel, ev) {
    ev.preventDefault();
    if (navigationen > 0) history.back();
    else location.hash = ziel.getAttribute('href') || '#/karte';
  },
  'auswahl-weg'() {
    if (route.name === 'karte') location.replace('#/karte');
    else nebenAuswahlSetzen(null);
  },
  navigation(ziel) {
    navigationStarten([Number(ziel.dataset.lon), Number(ziel.dataset.lat)], ziel.dataset.ziel || '');
  },
  'demo-ende'() {
    demoBeenden();
  },
  'app-update'() {
    if (swRegistrierung?.waiting) {
      aktualisierungAngefordert = true;
      swRegistrierung.waiting.postMessage('jetzt-aktualisieren');
    } else {
      location.reload();
    }
  },
};

document.addEventListener('click', (ev) => {
  tonVorbereiten();
  // Geteilte Ansicht: Links „auf der Karte zeigen“ wählen das Objekt auf der Karte daneben aus
  const kartenLink = ev.target.closest('a[href^="#/karte/"]:not([data-aktion])');
  if (kartenLink && geteilt()) {
    const [typ, id] = kartenLink.getAttribute('href').split('/').slice(2).map(decodeURIComponent);
    const a = gueltigeAuswahl(typ, id);
    if (a) {
      ev.preventDefault();
      nebenAuswahlSetzen(a);
      return;
    }
  }
  const ziel = ev.target.closest('[data-aktion], a[data-ersetzen]');
  if (!ziel) return;
  if (ziel.matches('a[data-ersetzen]') && !ziel.dataset.aktion) {
    ev.preventDefault();
    location.replace(ziel.getAttribute('href'));
    return;
  }
  const name = ziel.dataset.aktion;
  const inKarte = route.name === 'karte' || el.kartenUi.contains(ziel);
  const ansicht = inKarte ? null : ANSICHTEN[route.name];
  const fn = (inKarte ? karteAktionen[name] : ansicht?.aktionen?.[name]) ?? GLOBALE_AKTIONEN[name];
  if (!fn) return;
  if (ziel.tagName === 'A' && name !== 'zurueck') ev.preventDefault();
  fn(ziel, ev, el.ansicht, ansicht);
});

document.addEventListener('input', (ev) => {
  const name = ev.target?.dataset?.eingabe;
  const ansicht = ANSICHTEN[route.name];
  if (name && ansicht?.eingaben?.[name]) ansicht.eingaben[name](el.ansicht, ev.target, ansicht);
});

abonnieren((was) => {
  if (!zustand.daten) return;
  if (['sprache', 'appUpdate', 'online', 'minute', 'daten'].includes(was)) kopfZeichnen();
  if (was === 'sprache' || was === 'daten') {
    tabbarZeichnen();
    document.title = `${feld(zustand.daten.veranstaltung, 'name')} – ${t('start.titel_zusatz')}`;
  }
  if (was === 'daten') {
    karteDatenAktualisieren();
    ansichtZeichnen({ scrollBehalten: true });
    return;
  }
  if (route.name === 'karte') {
    if (KARTE_EREIGNISSE.includes(was)) ansichtZeichnen();
    return;
  }
  if (geteilt() && KARTE_EREIGNISSE.includes(was)) karteUiZeichnen();
  const ansicht = ANSICHTEN[route.name];
  if (ansicht.teilweiseBei?.includes(was)) ansicht.teilweise(el.ansicht, ansicht);
  else if (ansicht.aktualisierenBei?.includes(was)) ansichtZeichnen({ scrollBehalten: true });
});

// ---------------------------------------------------------------------------
// Daten-Updates und Service Worker
// ---------------------------------------------------------------------------
let letztePruefung = Date.now();

async function aufUpdatesPruefen(manuell = false) {
  letztePruefung = Date.now();
  swRegistrierung?.update().catch(() => {});
  const { manifest, ausNetz } = await manifestLaden();
  if (!ausNetz) {
    if (manuell) toast(t('update.offline'));
    return;
  }
  if (manifest.version === zustand.daten.version) {
    if (manuell) toast(t('update.aktuell'));
    return;
  }
  try {
    const roh = await datenLaden(manifest);
    zustand.daten = aufbereiten(manifest, roh);
    zustand.manifest = manifest;
    aufraeumen(manifest);
    melden('daten');
    toast(t('update.neu', { zeit: datumUndZeit(zustand.daten.erstellt) }));
  } catch {
    if (manuell) toast(t('update.fehler'));
  }
}

async function serviceWorkerRegistrieren() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  try {
    swRegistrierung = await navigator.serviceWorker.register('./sw.js');
  } catch {
    return;
  }
  const wartendPruefen = () => {
    if (swRegistrierung.waiting && navigator.serviceWorker.controller) {
      zustand.appUpdateBereit = true;
      melden('appUpdate');
    }
  };
  wartendPruefen();
  swRegistrierung.addEventListener('updatefound', () => {
    const neu = swRegistrierung.installing;
    neu?.addEventListener('statechange', () => {
      if (neu.state === 'installed') wartendPruefen();
    });
  });
  let neuGeladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (aktualisierungAngefordert && !neuGeladen) {
      neuGeladen = true;
      location.reload();
    }
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
function fehlerSeite(titel, text) {
  el.kartenAnsicht.hidden = true;
  el.ansicht.hidden = false;
  el.ansicht.innerHTML = String(html`<div class="seite start-fehler">${icon('offline', 40)}<h1 class="seiten-titel">${titel}</h1><p>${text}</p>
    <button type="button" class="knopf knopf-dunkel" onclick="location.reload()">${t('start.nochmal')}</button></div>`);
}

async function starten() {
  spracheEinrichten();
  el.ansicht.innerHTML = String(html`<div class="lade">${t('start.laedt')}</div>`);

  const { manifest } = await manifestLaden();
  if (!manifest) {
    fehlerSeite(t('start.keine_daten'), t('start.keine_daten_text'));
    return;
  }
  let aktiv = manifest;
  let roh;
  try {
    roh = await datenLaden(manifest);
  } catch {
    const vorher = lesenGlobal('manifestVorher');
    try {
      if (!vorher) throw new Error('kein Ersatz');
      roh = await datenLaden(vorher);
      aktiv = vorher;
    } catch {
      fehlerSeite(t('start.keine_daten'), t('start.keine_daten_text'));
      return;
    }
  }
  zustand.daten = aufbereiten(aktiv, roh);
  zustand.manifest = aktiv;
  const d = zustand.daten;
  praefixSetzen(d.veranstaltung.jahr);
  uhrEinrichten(d.veranstaltung.zeitzone);
  const offlineKarte = lesen('karteOffline');
  if (offlineKarte?.fertig) zustand.karteOffline = { phase: 'fertig', fertig: offlineKarte.anzahl, gesamt: offlineKarte.anzahl };
  document.title = `${feld(d.veranstaltung, 'name')} – ${t('start.titel_zusatz')}`;
  aufraeumen(aktiv);

  window.addEventListener('hashchange', () => {
    navigationen++;
    routeWechseln();
  });
  window.addEventListener('online', () => {
    zustand.online = true;
    melden('online');
    regionVorladen(zustand.daten.karte);
    aufUpdatesPruefen();
  });
  window.addEventListener('offline', () => {
    zustand.online = false;
    melden('online');
  });
  window.addEventListener('rw-pruefen', (e) => aufUpdatesPruefen(Boolean(e.detail?.manuell)));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - letztePruefung > 15 * 60000) aufUpdatesPruefen();
  });
  setInterval(() => melden('minute'), 30000);
  // Fensterbreite: geteilte Ansicht an/aus, Infokarte unten oder schwebend
  BREIT.addEventListener('change', () => ansichtZeichnen({ scrollBehalten: true }));
  let groesseGeplant = false;
  window.addEventListener('resize', () => {
    if (groesseGeplant || el.kartenAnsicht.hidden) return;
    groesseGeplant = true;
    requestAnimationFrame(() => {
      groesseGeplant = false;
      const breit = el.kartenAnsicht.clientWidth >= KARTE_BREIT_PX;
      if (breit !== el.kartenAnsicht.classList.contains('flaeche-breit')) karteUiZeichnen();
    });
  });

  kopfZeichnen();
  routeWechseln();
  hinweiseStarten();
  passStarten();
  standortWiederherstellen();
  if (einstellung('wach', false)) wachhalten(true);
  serviceWorkerRegistrieren();
  // Falls die App nicht mit der Karte startet, die Offline-Karte trotzdem im Hintergrund laden
  setTimeout(() => {
    if (!karteBereit) regionVorladen(zustand.daten.karte);
  }, 4000);
}

starten();
