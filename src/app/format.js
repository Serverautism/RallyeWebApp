// Formatierung von Zeiten, Tagen, Zahlen in der Sprache der Oberfläche
// und immer in der Zeitzone der Veranstaltung (nicht der des Handys).

import { zustand } from './zustand.js';
import { gebietsschema, feld, t } from './i18n.js';
import { uhrzeitText, lokalesDatum } from '../lib/zeit.js';

const tz = () => zustand.daten?.veranstaltung.zeitzone || 'Europe/Berlin';

export const zeit = (ms) => uhrzeitText(ms, tz());

export function tagKurz(ms) {
  return new Intl.DateTimeFormat(gebietsschema(), { weekday: 'short', timeZone: tz() }).format(new Date(ms)).replace('.', '');
}

export const zeitMitTag = (ms) => `${tagKurz(ms)} ${zeit(ms)}`;

export function datum(ms) {
  return new Intl.DateTimeFormat(gebietsschema(), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: tz() }).format(new Date(ms));
}

export function datumUndZeit(ms) {
  return `${datum(ms)}, ${zeit(ms)}`;
}

/** ID des Veranstaltungstags für einen Zeitpunkt (oder null) */
export function tagIdVon(ms) {
  const d = lokalesDatum(ms, tz());
  return zustand.daten?.tage.find((x) => x.datum === d)?.id ?? null;
}

export function tagName(tagId) {
  return feld(zustand.daten?.tage.find((x) => x.id === tagId), 'name') || tagId;
}

export function zahl(wert, stellen = 1) {
  if (wert === null || wert === undefined) return '–';
  return new Intl.NumberFormat(gebietsschema(), { maximumFractionDigits: stellen, minimumFractionDigits: 0 }).format(wert);
}

export const km = (wert) => `${zahl(wert, 1)} km`;
export const minuten = (n) => `${Math.round(n)} min`;

/** "WP1" → "WP 1" (bzw. "SS 1" auf Englisch) */
export function wpKurz(wp) {
  return `${t('wp.abk')} ${wp.kurz}`;
}

export function wpVoll(wp) {
  return `${wpKurz(wp)} · ${feld(wp, 'name')}`;
}

/** "in 5 min", "vor 3 min", "jetzt" */
export function relativ(ms, jetzt) {
  const diff = Math.round((ms - jetzt) / 60000);
  if (Math.abs(diff) < 1) return t('zeit.jetzt');
  if (diff > 0) {
    if (diff >= 120) return t('zeit.in_std', { std: zahl(diff / 60, 1) });
    return t('zeit.in_min', { min: diff });
  }
  if (-diff >= 120) return t('zeit.vor_std', { std: zahl(-diff / 60, 1) });
  return t('zeit.vor_min', { min: -diff });
}
