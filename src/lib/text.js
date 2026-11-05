// Text-Hilfen: Suche normalisieren, einfache Markdown-Blöcke.

/** Für die Suche: Kleinbuchstaben, Umlaute/ß vereinheitlicht, "Straße/Strasse/Str." → "str" */
export function suchNormalisieren(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/strasse|str\./g, 'str')
    .replace(/[-–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Wandelt einfaches Markdown in eine sichere Blockstruktur um (kein HTML!):
 *   # Überschrift, ## Unterüberschrift, - Listenpunkt, Leerzeile = neuer Absatz.
 *   Zeilenumbrüche innerhalb eines Absatzes bleiben erhalten (z. B. für Anschriften).
 *   Inline: **fett** und [Text](https://…) bzw. (mailto:…) / (tel:…).
 * @returns {{typ:'h1'|'h2'|'p'|'liste', inhalt?: Inline[], zeilen?: Inline[][], punkte?: Inline[][]}[]}
 */
export function markdownZuBloecken(md) {
  const bloecke = [];
  let absatz = [];
  let liste = null;
  const absatzBeenden = () => {
    if (absatz.length) bloecke.push({ typ: 'p', zeilen: absatz.map(inlineParsen) });
    absatz = [];
  };
  const listeBeenden = () => {
    if (liste) bloecke.push({ typ: 'liste', punkte: liste });
    liste = null;
  };
  for (const roh of String(md ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const zeile = roh.trim();
    if (zeile === '') {
      absatzBeenden();
      listeBeenden();
      continue;
    }
    const h = /^(#{1,2})\s+(.*)$/.exec(zeile);
    if (h) {
      absatzBeenden();
      listeBeenden();
      bloecke.push({ typ: h[1].length === 1 ? 'h1' : 'h2', inhalt: inlineParsen(h[2]) });
      continue;
    }
    const l = /^[-*]\s+(.*)$/.exec(zeile);
    if (l) {
      absatzBeenden();
      if (!liste) liste = [];
      liste.push(inlineParsen(l[1]));
      continue;
    }
    listeBeenden();
    absatz.push(zeile);
  }
  absatzBeenden();
  listeBeenden();
  return bloecke;
}

/** @typedef {{t:'text'|'fett'|'link', text:string, href?:string}} Inline */
function inlineParsen(text) {
  const teile = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^)\s]+)\)/g;
  let pos = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > pos) teile.push({ t: 'text', text: text.slice(pos, m.index) });
    if (m[1] !== undefined) teile.push({ t: 'fett', text: m[1] });
    else teile.push({ t: 'link', text: m[2], href: m[3] });
    pos = re.lastIndex;
  }
  if (pos < text.length) teile.push({ t: 'text', text: text.slice(pos) });
  return teile;
}
