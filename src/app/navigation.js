// Zielführung starten. Auf Apple-Geräten (iPhone, iPad, Mac) wählt man zwischen Apple Karten und
// Google Maps – jedes Mal oder fest über „Mehr → Navigation mit“. Andere Geräte öffnen Google Maps.

import { html } from './html.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { einstellung } from './meine.js';
import { googleMapsUrl, appleKartenUrl, appleNeuesFormat, istAppleGeraet } from '../lib/navi.js';

export const NAVI_WAHL = ['fragen', 'apple', 'google'];

export const appleGeraet = () =>
  typeof navigator !== 'undefined' && istAppleGeraet(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);

const appleUrl = (lage) => appleKartenUrl(lage, appleNeuesFormat(navigator.userAgent));

function oeffnen(url) {
  window.open(url, '_blank', 'noopener');
}

let offen = null;

function schliessen() {
  if (!offen) return;
  const { el, vorher } = offen;
  offen = null;
  el.remove();
  document.removeEventListener('keydown', taste);
  vorher?.focus?.({ preventScroll: true });
}

function taste(ev) {
  if (ev.key === 'Escape') schliessen();
}

function auswahlZeigen(lage, ziel) {
  schliessen();
  const el = document.createElement('div');
  el.className = 'navi-wahl';
  el.innerHTML = String(html`<div class="navi-karte" role="dialog" aria-modal="true" aria-labelledby="navi-titel">
    <h2 id="navi-titel" class="abschnitt">${t('navi.titel')}</h2>
    ${ziel ? html`<p class="klein">${t('navi.ziel', { ziel })}</p>` : ''}
    <a class="knopf knopf-dunkel gross" href="${appleUrl(lage)}" target="_blank" rel="noopener" data-navi="apple">${icon('navi', 20)} ${t('navi.apple')}</a>
    <a class="knopf knopf-rahmen gross" href="${googleMapsUrl(lage)}" target="_blank" rel="noopener" data-navi="google">${icon('navi', 20)} ${t('navi.google')}</a>
    <p class="klein mittig">${t('navi.merken_hinweis')}</p>
    <button type="button" class="knopf knopf-text" data-navi="abbrechen">${t('navi.abbrechen')}</button>
  </div>`);
  el.addEventListener('click', (ev) => {
    // Links öffnen sich selbst (wichtig für iOS: so startet direkt die Karten-App); danach schließen
    if (ev.target.closest('[data-navi]') || ev.target === el) schliessen();
  });
  (document.getElementById('app') || document.body).appendChild(el);
  offen = { el, vorher: document.activeElement };
  document.addEventListener('keydown', taste);
  el.querySelector('[data-navi="apple"]').focus({ preventScroll: true });
}

/**
 * @param {[number, number]} lage [Längengrad, Breitengrad]
 * @param {string} ziel Name des Ziels (für die Auswahl)
 */
export function navigationStarten(lage, ziel = '') {
  if (!appleGeraet()) return oeffnen(googleMapsUrl(lage));
  const wahl = einstellung('navi', 'fragen');
  if (wahl === 'apple') return oeffnen(appleUrl(lage));
  if (wahl === 'google') return oeffnen(googleMapsUrl(lage));
  auswahlZeigen(lage, ziel);
}

/** Für den Link selbst (lange drücken, Kopieren): passend zur Einstellung */
export function navigationsHref(lage) {
  return appleGeraet() && einstellung('navi', 'fragen') === 'apple' ? appleUrl(lage) : googleMapsUrl(lage);
}
