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
import { statusStarten, statusJetztAbrufen } from './app/status.js';
import { standortWiederherstellen } from './app/position.js';
import { hinweiseStarten } from './app/hinweise.js';
import { passStarten } from './app/pass.js';
import { einstellung } from './app/meine.js';
import { wachhalten, tonVorbereiten } from './app/geraet.js';
import { toast } from './app/toast.js';
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
const KARTE_EREIGNISSE = ['karteOffline', 'ebenen', 'position', 'status', 'plan', 'grundkarte', 'minute', 'sprache', 'online'];

const el = {
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

// ---------------------------------------------------------------------------
// Routen
// ---------------------------------------------------------------------------
function routeLesen() {
  const teile = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const name = teile[0] && (teile[0] === 'karte' || ANSICHTEN[teile[0]]) ? teile[0] : 'karte';
  return { name, params: teile.slice(1) };
}

function auswahlAusRoute() {
  const [typ, id] = route.params;
  const d = zustand.daten;
  if (typ === 'zp' && d.zp.has(id)) return { typ, id };
  if (typ === 'ort' && d.ort.has(id)) return { typ, id };
  if (typ === 'strecke' && d.strecken.has(id)) return { typ, id };
  if (typ === 'sperrzone' && id) return { typ, id };
  return null;
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
    html`${tabs.map(
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

function ansichtZeichnen({ scrollBehalten = false } = {}) {
  if (!zustand.daten) return;
  if (route.name === 'karte') {
    el.ansicht.hidden = true;
    el.ansicht.innerHTML = '';
    el.kartenAnsicht.hidden = false;
    const auswahl = auswahlAusRoute();
    el.kartenUi.innerHTML = String(karteUi(auswahl));
    const blatt = el.kartenUi.querySelector('.blatt');
    el.kartenAnsicht.style.setProperty('--blatt-hoehe', blatt ? `${blatt.offsetHeight}px` : '0px');
    if (!karteBereit && !karteWirdErzeugt) {
      karteWirdErzeugt = true;
      karteErzeugen(el.karte, (a) => location.replace(a ? `#/karte/${a.typ}/${a.id}` : '#/karte')).then((ok) => {
        karteBereit = ok;
        karteWirdErzeugt = false;
        if (ok) {
          auswahlSetzen(auswahl);
          if (auswahl) zuObjektFliegen(auswahl);
          letzteAuswahl = auswahl;
          setTimeout(() => regionVorladen(zustand.daten.karte), 1500);
        }
        melden('grundkarte');
      });
    } else if (karteBereit) {
      karteGroesseAnpassen();
      const neu = JSON.stringify(auswahl);
      if (neu !== JSON.stringify(letzteAuswahl)) {
        auswahlSetzen(auswahl);
        if (auswahl && auswahl.typ !== 'sperrzone') zuObjektFliegen(auswahl);
        letzteAuswahl = auswahl;
      }
    }
    return;
  }
  const ansicht = ANSICHTEN[route.name];
  el.kartenAnsicht.hidden = true;
  el.ansicht.hidden = false;
  const scroll = scrollBehalten ? el.ansicht.scrollTop : 0;
  el.ansicht.innerHTML = String(ansicht.render(route.params));
  el.ansicht.scrollTop = scroll;
  ansicht.nachRender?.(el.ansicht, route.params);
}

function routeWechseln() {
  const neu = routeLesen();
  const gleicheSeite = neu.name === route.name && JSON.stringify(neu.params) === JSON.stringify(route.params);
  route = neu;
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
    location.replace('#/karte');
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
  const ziel = ev.target.closest('[data-aktion], a[data-ersetzen]');
  if (!ziel) return;
  if (ziel.matches('a[data-ersetzen]') && !ziel.dataset.aktion) {
    ev.preventDefault();
    location.replace(ziel.getAttribute('href'));
    return;
  }
  const name = ziel.dataset.aktion;
  const ansicht = route.name === 'karte' ? null : ANSICHTEN[route.name];
  const fn = ansicht?.aktionen?.[name] ?? (route.name === 'karte' ? karteAktionen[name] : null) ?? GLOBALE_AKTIONEN[name];
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
  statusJetztAbrufen();
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

  kopfZeichnen();
  routeWechseln();
  statusStarten(d);
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
