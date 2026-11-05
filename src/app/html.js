// Sichere HTML-Vorlagen: Alle eingesetzten Werte werden automatisch maskiert.
// Nur Ergebnisse von html`…` oder roh(…) werden unverändert übernommen.

const ZEICHEN = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export class Roh {
  constructor(text) {
    this.text = text;
  }
  toString() {
    return this.text;
  }
}

export function roh(text) {
  return new Roh(String(text ?? ''));
}

export function esc(wert) {
  return String(wert ?? '').replace(/[&<>"']/g, (z) => ZEICHEN[z]);
}

function einsetzen(wert) {
  if (wert === null || wert === undefined || wert === false || wert === true) return '';
  if (wert instanceof Roh) return wert.text;
  if (Array.isArray(wert)) return wert.map(einsetzen).join('');
  return esc(wert);
}

export function html(teile, ...werte) {
  let aus = teile[0];
  for (let i = 0; i < werte.length; i++) aus += einsetzen(werte[i]) + teile[i + 1];
  return new Roh(aus);
}

/** Inline-Struktur aus markdownZuBloecken sicher als HTML ausgeben. */
export function inlineHtml(teile) {
  return (teile || []).map((t) => {
    if (t.t === 'fett') return html`<strong>${t.text}</strong>`;
    if (t.t === 'link') {
      const extern = /^https?:/.test(t.href);
      return extern
        ? html`<a href="${t.href}" target="_blank" rel="noopener noreferrer">${t.text}</a>`
        : html`<a href="${t.href}">${t.text}</a>`;
    }
    return esc(t.text);
  }).map((x) => (x instanceof Roh ? x : roh(x)));
}

export function bloeckeHtml(bloecke) {
  return (bloecke || []).map((b) => {
    if (b.typ === 'h1') return html`<h2 class="seite-h1">${inlineHtml(b.inhalt)}</h2>`;
    if (b.typ === 'h2') return html`<h3 class="seite-h2">${inlineHtml(b.inhalt)}</h3>`;
    if (b.typ === 'liste') return html`<ul class="seite-liste">${b.punkte.map((p) => html`<li>${inlineHtml(p)}</li>`)}</ul>`;
    return html`<p class="seite-p">${b.zeilen.map((z, i) => html`${i > 0 ? roh('<br>') : ''}${inlineHtml(z)}`)}</p>`;
  });
}
