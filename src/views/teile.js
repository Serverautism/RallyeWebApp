// Wiederverwendbare Bausteine der Ansichten.

import { html } from '../app/html.js';
import { icon } from '../app/icons.js';
import { t, feld } from '../app/i18n.js';
import { zustand } from '../app/zustand.js';
import { tagIdVon, zeit, zeitMitTag, wpKurz, relativ } from '../app/format.js';
import { jetzt } from '../app/uhr.js';
import { sperrIntervalle, naechsteSperrung, sperrungZu, wpZeitStatus } from '../lib/planer.js';
import { navigationsHref } from '../app/navigation.js';

export function seitenKopf(titel, { ueberzeile = null, zurueck = null, unterzeile = null } = {}) {
  const d = zustand.daten;
  return html`<header class="seiten-kopf">
    ${zurueck ? html`<a class="knopf-rund zurueck" href="${zurueck}" data-aktion="zurueck" aria-label="${t('allg.zurueck')}">${icon('zurueck', 24)}</a>` : ''}
    <span class="ueberzeile">${ueberzeile ?? `${d?.veranstaltung.kurzname ?? ''} ${d?.veranstaltung.jahr ?? ''}`.trim()}</span>
    <h1 class="seiten-titel">${titel}</h1>
    ${unterzeile ? html`<p class="seiten-unterzeile">${unterzeile}</p>` : ''}
  </header>`;
}

/** Tag, der standardmäßig gezeigt wird: heute (wenn Veranstaltungstag), sonst der erste Tag. */
export function standardTag() {
  const d = zustand.daten;
  return tagIdVon(jetzt()) ?? d.tage[0]?.id;
}

export function tagReiter(aktiv, basis) {
  const d = zustand.daten;
  if (d.tage.length < 2) return '';
  return html`<div class="segment" role="tablist" aria-label="${t('allg.tag')}" style="grid-template-columns: repeat(${d.tage.length}, minmax(0, 1fr))">
    ${d.tage.map(
      (tag) => html`<a role="tab" class="segment-knopf ${tag.id === aktiv ? 'aktiv' : ''}" aria-selected="${tag.id === aktiv ? 'true' : 'false'}" href="#/${basis}/${tag.id}" data-ersetzen>${feld(tag, 'name')}</a>`,
    )}
  </div>`;
}

const STATUS_KLASSE = {
  gesperrt: 'orange',
  laeuft: 'gruen',
  beendet: 'grau',
};

/** Status einer WP laut Zeitplan, bezogen auf jetzt (siehe wpZeitStatus). */
export function wpStatus(wpId) {
  return wpZeitStatus(zustand.daten, wpId, jetzt()) ?? { status: 'geplant', ende: null };
}

/**
 * Kleine Plakette mit dem Status einer WP laut Zeitplan (nichts, wenn „geplant“).
 * @param {{mitWp?: boolean, ohneBeendet?: boolean}} optionen mitWp: „WP 4 · …“ voranstellen (wenn der Zusammenhang fehlt)
 */
export function statusPlakette(wpId, { mitWp = false, ohneBeendet = false } = {}) {
  const s = wpStatus(wpId);
  if (s.status === 'geplant' || (ohneBeendet && s.status === 'beendet')) return '';
  const text = t(`status.${s.status}`);
  return html`<span class="plakette plakette-${STATUS_KLASSE[s.status]}" title="${t('status.laut_zeitplan')}">${mitWp ? `${wpKurz(zustand.daten.wp.get(wpId))} · ${text}` : text}</span>`;
}

/** Ergänzung zum Status: wann es losgeht, wann das letzte Auto durch ist, wie lange noch gesperrt ist. */
export function statusHinweis(wpId) {
  const d = zustand.daten;
  const wp = d.wp.get(wpId);
  const s = wpStatus(wpId);
  const nun = jetzt();
  let text = '';
  if (s.status === 'gesperrt') text = t('status.hinweis_gesperrt', { rel: relativ(wp.erstesAuto, nun) });
  else if (s.status === 'laeuft') text = t('status.hinweis_laeuft', { zeit: zeit(s.ende) });
  else if (s.status === 'beendet' && nun < wp.sperrBis) text = t('status.hinweis_beendet', { zeit: zeit(wp.sperrBis) });
  return text ? html`<span class="status-hinweis">${text}</span>` : '';
}

/** Text zur Zufahrt eines Parkplatzes, bezogen auf jetzt */
export function zufahrtText(ortId) {
  const d = zustand.daten;
  const ort = d.ort.get(ortId);
  const iv = sperrIntervalle(d, ortId);
  if (!iv.length) return { text: t('zufahrt.frei', { p: ort?.id ?? ortId }), art: 'neutral' };
  const nun = jetzt();
  const aktuell = sperrungZu(iv, nun);
  if (aktuell) return { text: t('zufahrt.gesperrt_bis', { p: ortId, zeit: zeit(aktuell.bis) }), art: 'warnung' };
  const naechste = naechsteSperrung(iv, nun);
  if (naechste) return { text: t('zufahrt.gesperrt_ab', { p: ortId, zeit: zeitMitTag(naechste.von) }), art: 'warnung' };
  return { text: t('zufahrt.keine_mehr', { p: ortId }), art: 'neutral' };
}

/**
 * Knopf „Navigation …“. Der Klick läuft über die Aktion „navigation“ (Apple Karten oder Google Maps,
 * siehe app/navigation.js); href bleibt für lange Drücken / Link kopieren.
 */
export function navigationsKnopf(lage, ziel, inhalt, klasse = 'knopf knopf-akzent') {
  return html`<a class="${klasse}" href="${navigationsHref(lage)}" target="_blank" rel="noopener" data-aktion="navigation" data-lon="${lage[0]}" data-lat="${lage[1]}" data-ziel="${ziel}">${inhalt}</a>`;
}

export function wpListeText(strecke) {
  const d = zustand.daten;
  return strecke.wps.map((id) => d.wp.get(id).kurz).join('/');
}

export function leer(text) {
  return html`<p class="leer">${text}</p>`;
}

export { wpKurz };
