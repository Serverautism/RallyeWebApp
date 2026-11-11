// Prüft, dass alle verwendeten Texte in beiden Sprachen vorhanden sind und die Platzhalter übereinstimmen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import de from '../src/i18n/de.js';
import en from '../src/i18n/en.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

function dateien(ordner) {
  return fs.readdirSync(ordner, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? dateien(path.join(ordner, e.name)) : e.name.endsWith('.js') ? [path.join(ordner, e.name)] : [],
  );
}

const platzhalter = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('Deutsch und Englisch haben dieselben Schlüssel und Platzhalter', () => {
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
  for (const k of Object.keys(de)) assert.deepEqual(platzhalter(de[k]), platzhalter(en[k]), k);
});

test('Alle im Code verwendeten Texte existieren', () => {
  const benutzt = new Set();
  for (const datei of dateien(SRC)) {
    const text = fs.readFileSync(datei, 'utf8');
    for (const m of text.matchAll(/\bt\('([a-z_.0-9]+)'/g)) benutzt.add(m[1]);
  }
  // dynamisch zusammengesetzte Schlüssel
  for (const s of ['gesperrt', 'laeuft', 'beendet']) benutzt.add(`status.${s}`);
  for (const w of ['fragen', 'apple', 'google']) benutzt.add(`mehr.navi_${w}`);
  for (const o of ['parkplatz', 'servicepark', 'rampe', 'info', 'wc', 'imbiss', 'sanitaeter', 'shuttle', 'sonstiges']) benutzt.add(`ort.${o}`);
  for (const n of [1, 2, 3, 4]) benutzt.add(`notfall.schritt${n}`);
  for (const s of ['gesperrt', 'umleitung', 'teilweise', 'frei']) benutzt.add(`anwohner.status_${s}`);
  for (const e of ['wp', 'zp', 'sperr', 'park', 'rallye', 'service']) benutzt.add(`ebene.${e}`);
  for (const k of ['tab.karte', 'tab.zeitplan', 'tab.planer', 'tab.starter', 'tab.mehr', 'allg.ja', 'allg.nein', 'allg.teilweise', 'mehr.datenschutz', 'mehr.impressum']) benutzt.add(k);
  const fehlend = [...benutzt].filter((k) => !(k in de));
  assert.deepEqual(fehlend, []);
});
