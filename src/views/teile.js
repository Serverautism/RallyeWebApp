// Wiederverwendbare Bausteine der Ansichten.

import { html } from '../app/html.js';
import { icon } from '../app/icons.js';
import { t, feld } from '../app/i18n.js';
import { zustand } from '../app/zustand.js';
import { tagIdVon, zeit, zeitMitTag, wpKurz } from '../app/format.js';
import { jetzt } from '../app/uhr.js';
import { wpStatus } from '../app/status.js';
import { sperrIntervalle, naechsteSperrung, sperrungZu } from '../lib/planer.js';

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
  laeuft: 'gruen',
  verzoegert: 'orange',
  unterbrochen: 'rot',
  abgesagt: 'rot',
  beendet: 'grau',
};

/** Kleine Plakette mit dem Live-Status einer WP (nichts, wenn „geplant“). */
export function statusPlakette(wpId, immer = false) {
  const s = wpStatus(wpId);
  if (s.status === 'geplant' && !immer) return '';
  return html`<span class="plakette plakette-${STATUS_KLASSE[s.status] ?? 'grau'}">${t(`status.${s.status}`)}</span>`;
}

export function statusHinweis(wpId) {
  const s = wpStatus(wpId);
  const text = feld(s, 'hinweis');
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

export function navigationsLink(lage) {
  const [lon, lat] = lage;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(5)},${lon.toFixed(5)}&travelmode=driving`;
}

export function wpListeText(strecke) {
  const d = zustand.daten;
  return strecke.wps.map((id) => d.wp.get(id).kurz).join('/');
}

export function leer(text) {
  return html`<p class="leer">${text}</p>`;
}

export { wpKurz };
