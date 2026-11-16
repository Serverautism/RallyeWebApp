// Prüft den Daten-Build mit den Beispieldaten (test/beispiel/daten), mit absichtlich fehlerhaften
// Kopien davon und mit den echten Projektdaten (daten/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { datenBauen } from '../scripts/daten-bauen.mjs';

const PROJEKT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Fester Beispieldatensatz (fiktive Rallye 2027) – unabhängig davon, was gerade in daten/ steht
const BEISPIEL = path.join(PROJEKT, 'test', 'beispiel');

function kopie() {
  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'rallye-daten-'));
  fs.cpSync(path.join(BEISPIEL, 'daten'), path.join(ziel, 'daten'), { recursive: true });
  return ziel;
}
const datei = (w, rel) => path.join(w, 'daten', rel);
const ersetzen = (w, rel, alt, neu) => {
  const p = datei(w, rel);
  const inhalt = fs.readFileSync(p, 'utf8');
  assert.ok(inhalt.includes(alt), `„${alt}“ nicht in ${rel} gefunden`);
  fs.writeFileSync(p, inhalt.replace(alt, neu));
};
const bauen = (w) => datenBauen({ wurzel: w, schreiben: false });
const enthaelt = (liste, teil) => liste.some((x) => x.includes(teil));

test('Projektdaten (daten/) bauen fehlerfrei', () => {
  const erg = datenBauen({ wurzel: PROJEKT, schreiben: false });
  assert.deepEqual(erg.fehler, []);
  assert.equal(erg.ok, true);
  assert.ok(erg.programm.pruefungen.length > 0);
  assert.ok(erg.programm.zuschauerpunkte.length > 0);
});

test('Beispieldaten bauen fehlerfrei', () => {
  const erg = datenBauen({ wurzel: BEISPIEL, schreiben: false });
  assert.deepEqual(erg.fehler, []);
  assert.equal(erg.ok, true);
  assert.equal(erg.programm.pruefungen.length, 6);
  assert.equal(erg.programm.zuschauerpunkte.length, 6);
  // Zeiten mit Zeitzonen-Versatz
  assert.equal(erg.programm.pruefungen[0].erstesAuto, '2027-05-28T16:35:00+02:00');
  // WPs sind im Zeitplan enthalten
  assert.equal(erg.programm.zeitplan.filter((z) => z.wp).length, 6);
});

test('Ungültige Uhrzeit wird mit Datei und Zeile gemeldet', () => {
  const w = kopie();
  ersetzen(w, 'tabellen/pruefungen.csv', ';16:35;', ';16:5;');
  const erg = bauen(w);
  assert.equal(erg.ok, false);
  assert.ok(enthaelt(erg.fehler, 'pruefungen.csv, Zeile 2'), erg.fehler.join('\n'));
  assert.ok(enthaelt(erg.fehler, 'keine gültige Uhrzeit'));
});

test('Zuschauerpunkt in einer Sperrzone ist ein Fehler', () => {
  const w = kopie();
  const zp = JSON.parse(fs.readFileSync(datei(w, 'karte/zuschauerpunkte.geojson'), 'utf8'));
  const sz = JSON.parse(fs.readFileSync(datei(w, 'karte/sperrzonen.geojson'), 'utf8'));
  sz.features.push({ type: 'Feature', properties: { id: 'TEST' }, geometry: zp.features[0].geometry });
  fs.writeFileSync(datei(w, 'karte/sperrzonen.geojson'), JSON.stringify(sz));
  const erg = bauen(w);
  assert.equal(erg.ok, false);
  assert.ok(enthaelt(erg.fehler, 'überschneidet die Sperrzone „TEST“'), erg.fehler.join('\n'));
});

test('Zuschauerpunkt auf der Strecke ist ein Fehler', () => {
  const w = kopie();
  const st = JSON.parse(fs.readFileSync(datei(w, 'karte/strecken.geojson'), 'utf8'));
  const zp = JSON.parse(fs.readFileSync(datei(w, 'karte/zuschauerpunkte.geojson'), 'utf8'));
  const linie = st.features.find((f) => f.properties.id === 'HS').geometry.coordinates;
  const [a, b] = [linie[10], linie[11]];
  const d = 0.0004;
  zp.features[0].geometry.coordinates = [[[a[0] - d, a[1] - d], [b[0] + d, a[1] - d], [b[0] + d, b[1] + d], [a[0] - d, b[1] + d], [a[0] - d, a[1] - d]]];
  fs.writeFileSync(datei(w, 'karte/zuschauerpunkte.geojson'), JSON.stringify(zp));
  const erg = bauen(w);
  assert.ok(enthaelt(erg.fehler, 'berührt oder kreuzt die WP-Strecke'), erg.fehler.join('\n'));
});

test('Verweise auf unbekannte IDs werden gemeldet', () => {
  const w = kopie();
  ersetzen(w, 'tabellen/zuschauerpunkte.csv', 'ZP1;Kehre Mariental;Mariental hairpin;HS;;P1;', 'ZP1;Kehre Mariental;Mariental hairpin;HS;;P99;');
  ersetzen(w, 'tabellen/orte.csv', ';WP1 WP4;', ';WP1 WP9;');
  const erg = bauen(w);
  assert.ok(enthaelt(erg.fehler, 'Parkplatz „P99“'), erg.fehler.join('\n'));
  assert.ok(enthaelt(erg.fehler, 'WP „WP9“'));
});

test('Fehlende Geometrie und fehlender Tabelleneintrag werden gemeldet', () => {
  const w = kopie();
  const zp = JSON.parse(fs.readFileSync(datei(w, 'karte/zuschauerpunkte.geojson'), 'utf8'));
  zp.features[0].properties.id = 'ZP99';
  fs.writeFileSync(datei(w, 'karte/zuschauerpunkte.geojson'), JSON.stringify(zp));
  const erg = bauen(w);
  assert.ok(enthaelt(erg.fehler, 'keine Fläche'), erg.fehler.join('\n'));
  assert.ok(enthaelt(erg.fehler, 'Fläche „ZP99“ hat keinen Eintrag'));
});

test('Komma-CSV und Windows-1252-Kodierung funktionieren', () => {
  const w = kopie();
  const text = 'nr,text_de,text_en\r\n1,"Nie in Außenkurven, am Kurvenausgang stehen.",Never stand outside.\r\n2,Müll – bitte mitnehmen,Rubbish\r\n';
  // als Windows-1252 speichern (so speichert Excel „CSV (Trennzeichen-getrennt)“ unter Windows)
  const tabelle = { 'ä': 0xe4, 'ö': 0xf6, 'ü': 0xfc, 'ß': 0xdf, '–': 0x96 };
  const bytes = [];
  for (const ch of text) bytes.push(ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : tabelle[ch]);
  fs.writeFileSync(datei(w, 'tabellen/regeln.csv'), Buffer.from(bytes));
  const erg = bauen(w);
  assert.equal(erg.ok, true, erg.fehler.join('\n'));
  assert.ok(enthaelt(erg.warnungen, 'Windows-1252'));
  assert.equal(erg.inhalte.regeln[0].text_de, 'Nie in Außenkurven, am Kurvenausgang stehen.');
  assert.equal(erg.inhalte.regeln[1].text_de, 'Müll – bitte mitnehmen');
});

test('Zu große Offline-Region wird abgelehnt', () => {
  const w = kopie();
  ersetzen(w, 'einstellungen.json', '"region": [10.225, 50.915, 10.445, 51.025]', '"region": [9.5, 50.5, 11.5, 51.5]');
  const erg = bauen(w);
  assert.ok(enthaelt(erg.fehler, 'OpenFreeMap erlaubt höchstens 3000'), erg.fehler.join('\n'));
});

test('Unbekannte Spalte erzeugt eine Warnung', () => {
  const w = kopie();
  ersetzen(w, 'tabellen/starter.csv', 'nr;fahrer;', 'nr;fahrerin;fahrer;');
  const erg = bauen(w);
  // Die Datenzeilen haben jetzt eine Spalte weniger → Fahrer landet in "fahrerin", fahrer ist leer → Fehler
  assert.ok(enthaelt(erg.warnungen, 'Unbekannte Spalte „fahrerin“'), erg.warnungen.join('\n'));
});

test('Sperrung nach dem ersten Auto ist ein Fehler', () => {
  const w = kopie();
  ersetzen(w, 'tabellen/pruefungen.csv', 'WP1;Hohe Sonne 1;Hohe Sonne 1;HS;fr;16:35;15:35;', 'WP1;Hohe Sonne 1;Hohe Sonne 1;HS;fr;16:35;16:40;');
  const erg = bauen(w);
  assert.ok(enthaelt(erg.fehler, 'vor dem ersten Auto beginnen'), erg.fehler.join('\n'));
});

test('Kartenansichten: Standard zuerst, Luftbild braucht Ebene und Quelle', () => {
  const erg = datenBauen({ wurzel: BEISPIEL, schreiben: false });
  assert.equal(erg.programm.karte.stil, 'https://tiles.openfreemap.org/styles/positron');
  assert.deepEqual(erg.programm.karte.stile.map((s) => s.id), ['schlicht', 'entdecken', 'strassen', 'luftbild']);
  assert.equal(erg.programm.karte.stile[3].luftbild.ebene, 'th_dop');

  const w = kopie();
  const p = datei(w, 'einstellungen.json');
  const e = JSON.parse(fs.readFileSync(p, 'utf8'));
  const luftbild = e.karte.stile.pop();
  delete luftbild.quelle;
  e.karte.stile.unshift(luftbild);
  e.status = { url: 'status.json' };
  fs.writeFileSync(p, JSON.stringify(e));
  const falsch = bauen(w);
  assert.equal(falsch.ok, false);
  assert.ok(enthaelt(falsch.fehler, 'muss ein Kartenstil mit „url“ sein'), falsch.fehler.join('\n'));
  assert.ok(enthaelt(falsch.fehler, '„quelle“ fehlt'), falsch.fehler.join('\n'));
  assert.ok(enthaelt(falsch.warnungen, '„status“ wird nicht mehr verwendet'), falsch.warnungen.join('\n'));
});

test('Ältere Einstellungen mit nur „karte.stil“ funktionieren weiter', () => {
  const w = kopie();
  const p = datei(w, 'einstellungen.json');
  const e = JSON.parse(fs.readFileSync(p, 'utf8'));
  delete e.karte.stile;
  e.karte.stil = 'https://tiles.openfreemap.org/styles/positron';
  fs.writeFileSync(p, JSON.stringify(e));
  const erg = bauen(w);
  assert.deepEqual(erg.fehler, []);
  assert.equal(erg.programm.karte.stile.length, 1);
  assert.equal(erg.programm.karte.stil, e.karte.stil);
});

test('Sperrzeiten sind optional – aber nur beide zusammen', () => {
  const w = kopie();
  ersetzen(w, 'tabellen/pruefungen.csv', 'WP1;Hohe Sonne 1;Hohe Sonne 1;HS;fr;16:35;15:35;18:05;', 'WP1;Hohe Sonne 1;Hohe Sonne 1;HS;fr;16:35;;;');
  const erg = bauen(w);
  assert.deepEqual(erg.fehler, []);
  const wp1 = erg.programm.pruefungen.find((x) => x.id === 'WP1');
  assert.equal(wp1.sperrVon, null);
  assert.equal(wp1.sperrBis, null);
  assert.ok(enthaelt(erg.warnungen, 'WP1: Keine Sperrzeiten eingetragen'), erg.warnungen.join('\n'));

  const w2 = kopie();
  ersetzen(w2, 'tabellen/pruefungen.csv', 'WP1;Hohe Sonne 1;Hohe Sonne 1;HS;fr;16:35;15:35;18:05;', 'WP1;Hohe Sonne 1;Hohe Sonne 1;HS;fr;16:35;15:35;;');
  const halb = bauen(w2);
  assert.equal(halb.ok, false);
  assert.ok(enthaelt(halb.fehler, 'beide Sperrzeiten'), halb.fehler.join('\n'));
});

test('Zuschauerpunkt ohne Parkplatz und Fußweg ist erlaubt (mit Hinweis)', () => {
  const w = kopie();
  ersetzen(w, 'tabellen/zuschauerpunkte.csv', 'ZP1;Kehre Mariental;Mariental hairpin;HS;;P1;950;14;', 'ZP1;Kehre Mariental;Mariental hairpin;HS;;;;;');
  ersetzen(w, 'tabellen/zuschauerpunkte.csv', ';P2;570;9;', ';P2;570;;');
  const erg = bauen(w);
  assert.deepEqual(erg.fehler, []);
  const zp1 = erg.programm.zuschauerpunkte.find((z) => z.id === 'ZP1');
  const zp2 = erg.programm.zuschauerpunkte.find((z) => z.id === 'ZP2');
  assert.equal(zp1.parkplatz, null);
  assert.equal(zp1.fusswegMin, null);
  assert.equal(zp2.parkplatz, 'P2');
  assert.equal(zp2.fusswegMin, null);
  assert.ok(enthaelt(erg.warnungen, '„ZP1“: Kein Parkplatz eingetragen'), erg.warnungen.join('\n'));
  assert.ok(enthaelt(erg.warnungen, '„ZP2“: „fussweg_min“ fehlt'), erg.warnungen.join('\n'));
});

test('Platzhalter-Linien: Länge wird nicht als echte Angabe ausgegeben', () => {
  const w = kopie();
  const p = datei(w, 'karte/strecken.geojson');
  const st = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const f of st.features) f.properties.platzhalter = true;
  fs.writeFileSync(p, JSON.stringify(st));
  const erg = bauen(w);
  assert.deepEqual(erg.fehler, []);
  assert.ok(enthaelt(erg.warnungen, 'Platzhalter-Geometrien'), erg.warnungen.join('\n'));
  // In den Beispieldaten ist keine WP-Länge angegeben → alle Längen unsicher, Strecken ohne Länge
  assert.ok(erg.programm.pruefungen.every((x) => x.laengeUnsicher === true));
  assert.ok(erg.programm.strecken.every((s) => s.laengeKm === null));
});
