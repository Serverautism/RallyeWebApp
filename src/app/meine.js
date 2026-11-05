// Persönliche Daten auf dem Gerät: Tagesplan, Favoriten, Stempel, Einstellungen.

import { lesen, schreiben } from './speicher.js';
import { zustand, melden } from './zustand.js';
import { planBerechnen } from '../lib/planer.js';

// ---- Tagesplan --------------------------------------------------------------
export function planEintraege() {
  const d = zustand.daten;
  const roh = lesen('plan', []);
  if (!d) return roh;
  // Nur gültige Einträge (z. B. nach einer Datenänderung)
  return roh.filter((e) => d.zp.has(e.zp) && d.wp.has(e.wp) && d.zp.get(e.zp).strecke === d.wp.get(e.wp).strecke);
}

export function imPlan(zp, wp) {
  return planEintraege().some((e) => e.zp === zp && e.wp === wp);
}

export function planUmschalten(zp, wp) {
  const liste = planEintraege();
  const i = liste.findIndex((e) => e.zp === zp && e.wp === wp);
  if (i >= 0) liste.splice(i, 1);
  else {
    // Pro WP nur ein Zuschauerpunkt – man kann nicht an zwei Stellen gleichzeitig sein
    const j = liste.findIndex((e) => e.wp === wp);
    if (j >= 0) liste.splice(j, 1);
    liste.push({ zp, wp });
  }
  schreiben('plan', liste);
  melden('plan');
  return i < 0;
}

export function planErsetzen(alt, neu) {
  const liste = planEintraege().filter((e) => !(e.zp === alt.zp && e.wp === alt.wp) && e.wp !== neu.wp);
  liste.push({ zp: neu.zp, wp: neu.wp });
  schreiben('plan', liste);
  melden('plan');
}

export function planLeeren(tagId) {
  const d = zustand.daten;
  schreiben('plan', planEintraege().filter((e) => tagId && d.wp.get(e.wp).tag !== tagId));
  melden('plan');
}

/** Plan eines Tages berechnet (Schritte mit Zeiten, Machbarkeit, Übergängen) */
export function planFuerTag(tagId) {
  const d = zustand.daten;
  const eintraege = planEintraege().filter((e) => d.wp.get(e.wp).tag === tagId);
  return { eintraege, ...planBerechnen(d, eintraege, d.planerStart) };
}

// ---- Favoriten -----------------------------------------------------------------
export function favoriten() {
  return new Set(lesen('favoriten', []));
}

export function istFavorit(nr) {
  return favoriten().has(nr);
}

export function favoritUmschalten(nr) {
  const f = favoriten();
  if (f.has(nr)) f.delete(nr);
  else f.add(nr);
  schreiben('favoriten', [...f]);
  melden('favoriten');
  return f.has(nr);
}

// ---- Zuschauerpass ---------------------------------------------------------------
export function stempel() {
  return lesen('stempel', {});
}

export function stempelSetzen(id, zeitpunkt) {
  const s = stempel();
  if (s[id]) return false;
  s[id] = zeitpunkt;
  schreiben('stempel', s);
  melden('stempel');
  return true;
}

// ---- Einstellungen -----------------------------------------------------------------
export function einstellung(name, standard) {
  return lesen(`einstellung.${name}`, standard);
}

export function einstellungSetzen(name, wert) {
  schreiben(`einstellung.${name}`, wert);
  melden('einstellungen');
}
