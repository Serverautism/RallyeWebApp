// Mehrsprachigkeit: Oberflächentexte aus src/i18n/*.js, Datentexte aus Feldern mit _de/_en.

import de from '../i18n/de.js';
import en from '../i18n/en.js';
import { lesenGlobal, schreibenGlobal } from './speicher.js';

export const SPRACHEN = { de, en };
let sprache = 'de';

export function spracheEinrichten() {
  const gespeichert = lesenGlobal('sprache');
  const browser = (navigator.language || 'de').slice(0, 2).toLowerCase();
  sprache = gespeichert && SPRACHEN[gespeichert] ? gespeichert : SPRACHEN[browser] ? browser : 'de';
  document.documentElement.lang = sprache;
}

export function spracheSetzen(neu) {
  if (!SPRACHEN[neu]) return;
  sprache = neu;
  schreibenGlobal('sprache', neu);
  document.documentElement.lang = neu;
}

export const aktuelleSprache = () => sprache;
export const gebietsschema = () => (sprache === 'de' ? 'de-DE' : 'en-GB');

/** Oberflächentext mit Platzhaltern: t('planer.puffer', { min: 5 }) */
export function t(schluessel, werte) {
  let text = SPRACHEN[sprache][schluessel] ?? SPRACHEN.de[schluessel];
  if (text === undefined) {
    if (import.meta.env?.DEV) console.warn(`Fehlender Text: ${schluessel}`);
    text = schluessel;
  }
  if (werte) text = text.replace(/\{(\w+)\}/g, (_, k) => (werte[k] ?? '').toString());
  return text;
}

/** Datentext in der aktuellen Sprache, sonst Deutsch: feld(zp, 'name') */
export function feld(objekt, name) {
  if (!objekt) return '';
  return objekt[`${name}_${sprache}`] || objekt[`${name}_de`] || '';
}
