// Live-Status: fragt regelmäßig eine kleine Datei ab (JSON oder CSV, z. B. eine
// als CSV veröffentlichte Google-Tabelle). Offline wird der letzte Stand mit Zeitstempel gezeigt.

import { zustand, melden } from './zustand.js';
import { lesen, schreiben } from './speicher.js';
import { basisUrl, holenMitTimeout } from './datenlader.js';
import { parseCsv } from '../lib/csv.js';

export const WP_STATUS = ['geplant', 'laeuft', 'verzoegert', 'unterbrochen', 'abgesagt', 'beendet'];

let timer = null;
let url = null;

function normalisieren(roh) {
  const wp = {};
  for (const [id, w] of Object.entries(roh?.wp || {})) {
    const status = WP_STATUS.includes(w?.status) ? w.status : 'geplant';
    wp[id] = { status, hinweis_de: w?.hinweis_de || '', hinweis_en: w?.hinweis_en || '' };
  }
  const meldungen = (Array.isArray(roh?.meldungen) ? roh.meldungen : [])
    .filter((x) => x && (x.text_de || x.text_en))
    .map((x) => ({
      zeit: x.zeit ? Date.parse(x.zeit) : null,
      text_de: x.text_de || '',
      text_en: x.text_en || '',
      wichtig: Boolean(x.wichtig),
    }))
    .sort((a, b) => (b.zeit ?? 0) - (a.zeit ?? 0));
  return { stand: roh?.stand ? Date.parse(roh.stand) : null, wp, meldungen };
}

/** CSV-Variante: Spalten wp;status;hinweis_de;hinweis_en – Zeilen mit wp = MELDUNG sind Meldungen. */
export function statusAusCsv(text) {
  const { zeilen } = parseCsv(text);
  const roh = { wp: {}, meldungen: [] };
  for (const { werte } of zeilen) {
    const id = (werte.wp || '').trim();
    if (!id || id.toUpperCase() === 'MELDUNG') {
      if (werte.hinweis_de || werte.hinweis_en) roh.meldungen.push({ text_de: werte.hinweis_de, text_en: werte.hinweis_en, wichtig: /^(ja|x|1)$/i.test(werte.wichtig || '') });
    } else {
      roh.wp[id] = { status: (werte.status || '').trim().toLowerCase(), hinweis_de: werte.hinweis_de, hinweis_en: werte.hinweis_en };
    }
  }
  return roh;
}

async function abrufen() {
  if (!url) return;
  try {
    const r = await holenMitTimeout(url, { cache: 'no-store' }, 10000);
    if (!r.ok) return;
    const text = await r.text();
    const istCsv = /csv/i.test(r.headers.get('content-type') || '') || /\.csv($|\?)|output=csv/i.test(url);
    const s = normalisieren(istCsv ? statusAusCsv(text) : JSON.parse(text));
    s.abgerufen = Date.now();
    zustand.status = s;
    schreiben('status', s);
    melden('status');
  } catch {
    /* Netz nicht verfügbar – letzter Stand bleibt */
  }
}

export function statusStarten(daten) {
  url = new URL(daten.statusCfg.url || 'status.json', basisUrl()).href;
  const gespeichert = lesen('status');
  if (gespeichert) zustand.status = gespeichert;
  abrufen();
  clearInterval(timer);
  timer = setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) abrufen();
  }, Math.max(15, daten.statusCfg.abfrageS || 60) * 1000);
}

export function statusJetztAbrufen() {
  return abrufen();
}

/** Status einer WP (oder 'geplant', wenn nichts gemeldet ist) */
export function wpStatus(wpId) {
  return zustand.status?.wp?.[wpId] ?? { status: 'geplant', hinweis_de: '', hinweis_en: '' };
}
