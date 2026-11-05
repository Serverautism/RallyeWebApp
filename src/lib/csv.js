// Kleiner, robuster CSV-Parser nach RFC 4180.
// - erkennt das Trennzeichen automatisch (Semikolon, Komma oder Tabulator)
// - versteht Felder in Anführungszeichen (auch mit Zeilenumbrüchen und "" als Escape)
// - entfernt ein UTF-8-BOM am Anfang
// - Spaltennamen werden getrimmt und kleingeschrieben
// Wird vom Daten-Build (Node) und von der App (Live-Status als CSV) genutzt.

const KANDIDATEN = [';', ',', '\t'];

/** Ermittelt das Trennzeichen anhand der ersten nicht-leeren Zeile (außerhalb von Anführungszeichen). */
export function erkenneTrennzeichen(text) {
  const zaehler = { ';': 0, ',': 0, '\t': 0 };
  let inAnfuehrung = false;
  let zeichenInZeile = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inAnfuehrung = !inAnfuehrung;
      zeichenInZeile++;
      continue;
    }
    if (!inAnfuehrung && (ch === '\n' || ch === '\r')) {
      if (zeichenInZeile > 0) break;
      continue;
    }
    if (!inAnfuehrung && ch in zaehler) zaehler[ch]++;
    if (ch.trim() !== '') zeichenInZeile++;
  }
  let bestes = ';';
  for (const k of KANDIDATEN) if (zaehler[k] > zaehler[bestes]) bestes = k;
  return bestes;
}

/**
 * Zerlegt CSV-Text in Datensätze.
 * @returns {{kopf: string[], zeilen: {werte: Record<string,string>, zeile: number}[], trennzeichen: string}}
 *   `zeile` ist die (1-basierte) Zeilennummer in der Datei, in der der Datensatz beginnt.
 */
export function parseCsv(text, trennzeichen) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const tz = trennzeichen || erkenneTrennzeichen(text);
  const datensaetze = []; // {felder: string[], zeile: number}
  let felder = [];
  let feld = '';
  let inAnfuehrung = false;
  let warAnfuehrung = false;
  let zeile = 1;
  let startZeile = 1;

  const feldAbschliessen = () => {
    felder.push(warAnfuehrung ? feld : feld.trim());
    feld = '';
    warAnfuehrung = false;
  };
  const datensatzAbschliessen = () => {
    feldAbschliessen();
    if (felder.some((f) => f !== '')) datensaetze.push({ felder, zeile: startZeile });
    felder = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inAnfuehrung) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          feld += '"';
          i++;
        } else {
          inAnfuehrung = false;
        }
      } else {
        if (ch === '\n') zeile++;
        if (ch === '\r' && text[i + 1] !== '\n') zeile++;
        feld += ch;
      }
      continue;
    }
    if (ch === '"' && feld.trim() === '') {
      inAnfuehrung = true;
      warAnfuehrung = true;
      feld = '';
      continue;
    }
    if (ch === tz) {
      feldAbschliessen();
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      datensatzAbschliessen();
      zeile++;
      startZeile = zeile;
      continue;
    }
    feld += ch;
  }
  if (feld !== '' || felder.length > 0) datensatzAbschliessen();

  if (datensaetze.length === 0) return { kopf: [], zeilen: [], trennzeichen: tz };
  const kopf = datensaetze[0].felder.map((k) => k.trim().toLowerCase());
  const zeilen = datensaetze.slice(1).map(({ felder: f, zeile: z }) => {
    const werte = {};
    kopf.forEach((k, idx) => {
      if (k) werte[k] = (f[idx] ?? '').trim();
    });
    return { werte, zeile: z, ueberzaehlig: f.slice(kopf.length).filter((x) => x !== '').length };
  });
  return { kopf, zeilen, trennzeichen: tz };
}

/** Wandelt "1,5" oder "1.5" in 1.5 um. Leere Werte → null, ungültige → NaN. */
export function parseZahl(wert) {
  if (wert === undefined || wert === null) return null;
  const s = String(wert).trim().replace(/\s/g, '');
  if (s === '') return null;
  if (!/^[-+]?(\d+([.,]\d*)?|[.,]\d+)$/.test(s)) return NaN;
  return Number(s.replace(',', '.'));
}

/** ja/nein/teilweise → normalisierter Wert oder null. */
export function parseJaNein(wert) {
  const s = String(wert ?? '').trim().toLowerCase();
  if (s === '') return null;
  if (['ja', 'j', 'yes', 'y', 'x', '1', 'true', 'wahr'].includes(s)) return 'ja';
  if (['nein', 'n', 'no', '0', 'false', 'falsch'].includes(s)) return 'nein';
  if (['teilweise', 'teils', 'eingeschränkt', 'eingeschraenkt', 'partly'].includes(s)) return 'teilweise';
  return undefined;
}

/** "WP1 WP4", "WP1,WP4", "WP1; WP4" → ["WP1","WP4"] */
export function parseListe(wert) {
  return String(wert ?? '')
    .split(/[\s,;|/]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}
