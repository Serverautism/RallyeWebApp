// Mehrsprachigkeit: Oberflächentexte aus src/i18n/*.js, Datentexte aus Feldern mit _de/_en.

import de from '../i18n/de.js';
import en from '../i18n/en.js';
import { lesenGlobal, schreibenGlobal } from './speicher.js';
import { startSprache } from '../lib/sprache.js';

export const SPRACHEN = { de, en };
let sprache = 'de';

/** Gespeicherte Wahl – sonst nach Systemsprache (Deutsch → Deutsch, andere → Englisch, unbekannt → Deutsch). */
export function spracheEinrichten() {
  const gespeichert = lesenGlobal('sprache');
  const system = navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean);
  sprache = gespeichert && SPRACHEN[gespeichert] ? gespeichert : startSprache(system);
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
