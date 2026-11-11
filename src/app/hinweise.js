// Hinweise in der App, solange sie geöffnet ist (ohne Server-Push):
// „Dein Favorit kommt gleich an deinem Zuschauerpunkt vorbei“.

import { zustand, melden } from './zustand.js';
import { planEintraege, favoriten, einstellung } from './meine.js';
import { ankunftBeiKm } from '../lib/planer.js';
import { naechsterZp } from './ortung.js';
import { jetzt } from './uhr.js';
import { t, feld } from './i18n.js';
import { wpKurz, zeit } from './format.js';
import { toast } from './toast.js';
import { signalton, vibrieren } from './geraet.js';

const NAH_M = 400; // so nah muss man an einem Zuschauerpunkt sein, damit er ohne Plan zählt

/** Zuschauerpunkt-Durchfahrten, für die Hinweise sinnvoll sind: Tagesplan + Punkt in der Nähe. */
export function relevanteDurchfahrten() {
  const d = zustand.daten;
  if (!d) return [];
  const liste = planEintraege().map((e) => ({ ...e, quelle: 'plan' }));
  const p = zustand.position;
  if (p) {
    const n = naechsterZp(d, p.lon, p.lat);
    if (n && n.abstandM <= NAH_M) {
      const zp = d.zp.get(n.zp);
      for (const wp of d.wp.values()) {
        if (wp.strecke === zp.strecke && !liste.some((e) => e.zp === zp.id && e.wp === wp.id)) {
          liste.push({ zp: zp.id, wp: wp.id, quelle: 'nah' });
        }
      }
    }
  }
  return liste;
}

/**
 * Kommende Durchfahrten der Favoriten an relevanten Punkten.
 * @returns {{nr:number, starter:object, zp:string, wp:string, zeit:number}[]}
 */
export function favoritenDurchfahrten(fensterMin = 60) {
  const d = zustand.daten;
  if (!d) return [];
  const fav = favoriten();
  if (fav.size === 0) return [];
  const nun = jetzt();
  const ergebnis = [];
  for (const e of relevanteDurchfahrten()) {
    const wp = d.wp.get(e.wp);
    const zp = d.zp.get(e.zp);
    for (const nr of fav) {
      const s = d.starterNachNr.get(nr);
      if (!s) continue;
      const zeitpunkt = ankunftBeiKm(wp, zp.km, s.position);
      if (zeitpunkt >= nun - 60000 && zeitpunkt <= nun + fensterMin * 60000) {
        ergebnis.push({ nr, starter: s, zp: zp.id, wp: wp.id, zeit: zeitpunkt });
      }
    }
  }
  return ergebnis.sort((a, b) => a.zeit - b.zeit);
}

// Bereits gemeldete Durchfahrten (pro Browser-Sitzung), damit nichts doppelt kommt
function gemeldetLesen() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem('rw.gemeldet') || '[]'));
  } catch {
    return new Set();
  }
}
function gemeldetSchreiben(menge) {
  try {
    sessionStorage.setItem('rw.gemeldet', JSON.stringify([...menge]));
  } catch {
    /* Speicher nicht verfügbar */
  }
}
const gemeldet = gemeldetLesen();

function pruefen() {
  const d = zustand.daten;
  if (!d) return;
  const vorwarnung = d.favoriten.vorwarnungMin ?? 5;
  const nun = jetzt();
  for (const f of favoritenDurchfahrten(vorwarnung)) {
    if (f.zeit < nun) continue;
    const schluessel = `${f.nr}|${f.wp}|${f.zp}`;
    if (gemeldet.has(schluessel)) continue;
    gemeldet.add(schluessel);
    gemeldetSchreiben(gemeldet);
    const minuten = Math.max(1, Math.round((f.zeit - nun) / 60000));
    const zp = d.zp.get(f.zp);
    toast(
      t('hinweis.favorit', {
        nr: f.nr,
        min: minuten,
        zp: `${t('zp.abk')} ${zp.kurz} · ${feld(zp, 'name')}`,
        wp: wpKurz(d.wp.get(f.wp)),
        zeit: zeit(f.zeit),
      }),
      { dauer: 20000, art: 'wichtig' },
    );
    if (einstellung('ton', false)) signalton();
    vibrieren();
  }
  melden('hinweise');
}

let timer = null;
export function hinweiseStarten() {
  clearInterval(timer);
  timer = setInterval(pruefen, 15000);
  pruefen();
}
