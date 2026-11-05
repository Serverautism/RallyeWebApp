import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, erkenneTrennzeichen, parseZahl, parseJaNein, parseListe } from '../src/lib/csv.js';
import { lokalZuUtcMs, isoMitVersatz, uhrzeitText, parseUhrzeit, parseDatum, versatzMinuten } from '../src/lib/zeit.js';
import { kachelnFuerRegion, kachelUrl, lonZuX, latZuY } from '../src/lib/kacheln.js';
import { suchNormalisieren, markdownZuBloecken } from '../src/lib/text.js';
import { icsErzeugen, icsFalten, icsText } from '../src/lib/ics.js';
import {
  planBerechnen,
  alternativen,
  durchfahrt,
  fruehesteFreigabe,
  spaetesteDurchfahrt,
  sperrIntervalle,
} from '../src/lib/planer.js';

const TZ = 'Europe/Berlin';

test('CSV: Semikolon, BOM, Anführungszeichen, Zeilenumbruch im Feld', () => {
  const text = '﻿id;name;text\r\nA;"Mit ""Zitat""";"zwei\r\nZeilen"\r\n\r\nB; Leerzeichen ;x\r\n';
  const { kopf, zeilen, trennzeichen } = parseCsv(text);
  assert.equal(trennzeichen, ';');
  assert.deepEqual(kopf, ['id', 'name', 'text']);
  assert.equal(zeilen.length, 2);
  assert.equal(zeilen[0].werte.name, 'Mit "Zitat"');
  assert.equal(zeilen[0].werte.text, 'zwei\r\nZeilen');
  assert.equal(zeilen[1].werte.name, 'Leerzeichen');
  assert.equal(zeilen[1].zeile, 5);
});

test('CSV: Komma und Tabulator werden erkannt', () => {
  assert.equal(erkenneTrennzeichen('a,b,c\n1,2,3'), ',');
  assert.equal(erkenneTrennzeichen('a\tb\tc\n1\t2\t3'), '\t');
  assert.equal(erkenneTrennzeichen('"a;b",c,d\n'), ',');
  const { zeilen } = parseCsv('Nr,Name\n1,"Müller, Hans"\n');
  assert.equal(zeilen[0].werte.name, 'Müller, Hans');
});

test('CSV: Zahlen, ja/nein, Listen', () => {
  assert.equal(parseZahl('1,5'), 1.5);
  assert.equal(parseZahl(' 12 '), 12);
  assert.equal(parseZahl(''), null);
  assert.ok(Number.isNaN(parseZahl('abc')));
  assert.ok(Number.isNaN(parseZahl('1.234,5')));
  assert.equal(parseJaNein('Ja'), 'ja');
  assert.equal(parseJaNein('nein'), 'nein');
  assert.equal(parseJaNein('teilweise'), 'teilweise');
  assert.equal(parseJaNein('vielleicht'), undefined);
  assert.deepEqual(parseListe('WP1 WP4'), ['WP1', 'WP4']);
  assert.deepEqual(parseListe('WP1, WP4;WP6'), ['WP1', 'WP4', 'WP6']);
});

test('Zeit: Sommerzeit (+02:00) und Winterzeit (+01:00)', () => {
  const sommer = lokalZuUtcMs('2027-05-29', '09:12', TZ);
  assert.equal(new Date(sommer).toISOString(), '2027-05-29T07:12:00.000Z');
  assert.equal(isoMitVersatz(sommer, TZ), '2027-05-29T09:12:00+02:00');
  const winter = lokalZuUtcMs('2027-11-06', '09:12', TZ);
  assert.equal(new Date(winter).toISOString(), '2027-11-06T08:12:00.000Z');
  assert.equal(isoMitVersatz(winter, TZ), '2027-11-06T09:12:00+01:00');
  assert.equal(uhrzeitText(sommer, TZ), '09:12');
  assert.equal(versatzMinuten(sommer, TZ), 120);
});

test('Zeit: Tag der Zeitumstellung (31.10.2027)', () => {
  // 01:30 liegt vor der Umstellung (Sommerzeit), 04:00 danach (Winterzeit)
  assert.equal(new Date(lokalZuUtcMs('2027-10-31', '01:30', TZ)).toISOString(), '2027-10-30T23:30:00.000Z');
  assert.equal(new Date(lokalZuUtcMs('2027-10-31', '04:00', TZ)).toISOString(), '2027-10-31T03:00:00.000Z');
});

test('Zeit: Eingabeformate', () => {
  assert.deepEqual(parseUhrzeit('9:05'), { stunde: 9, minute: 5 });
  assert.deepEqual(parseUhrzeit('09:05:00'), { stunde: 9, minute: 5 });
  assert.deepEqual(parseUhrzeit('9.05'), { stunde: 9, minute: 5 });
  assert.equal(parseUhrzeit('24:00'), null);
  assert.equal(parseUhrzeit('9:5'), null);
  assert.equal(parseDatum('2027-02-30'), null);
  assert.deepEqual(parseDatum('2027-05-29'), { jahr: 2027, monat: 5, tag: 29 });
});

test('Kacheln: Region um Eisenach', () => {
  assert.equal(lonZuX(10.32, 14), 8661);
  assert.equal(latZuY(50.975, 14), 5486); // von Hand nachgerechnet: (1 − ln(tan φ + sec φ)/π)/2 · 2¹⁴ = 5486,8
  const k = kachelnFuerRegion([10.225, 50.915, 10.445, 51.025], 0, 14);
  assert.equal(k.filter((t) => t.z === 0).length, 1);
  assert.ok(k.length > 100 && k.length < 400);
  assert.equal(kachelUrl('https://a/{z}/{x}/{y}.pbf', { z: 3, x: 4, y: 2 }), 'https://a/3/4/2.pbf');
  assert.equal(kachelUrl('https://a/{z}/{x}/{y}.pbf', { z: 3, x: 4, y: 2 }, 'tms'), 'https://a/3/4/5.pbf');
});

test('Text: Suche normalisieren', () => {
  assert.equal(suchNormalisieren('Hauptstraße'), suchNormalisieren('hauptstrasse'));
  assert.equal(suchNormalisieren('Hauptstr.'), suchNormalisieren('Hauptstraße'));
  assert.equal(suchNormalisieren('Mühlweg'), 'muehlweg');
});

test('Text: Markdown-Blöcke ohne HTML', () => {
  const b = markdownZuBloecken('# Titel\n\nZeile 1\nZeile 2\n\n- **fett** [Link](https://x.de)\n- <script>');
  assert.equal(b[0].typ, 'h1');
  assert.equal(b[1].typ, 'p');
  assert.equal(b[1].zeilen.length, 2);
  assert.equal(b[2].typ, 'liste');
  assert.deepEqual(b[2].punkte[0][0], { t: 'fett', text: 'fett' });
  assert.equal(b[2].punkte[0][2].href, 'https://x.de');
  assert.deepEqual(b[2].punkte[1], [{ t: 'text', text: '<script>' }]);
  // javascript:-Links werden nicht als Link erkannt
  const j = markdownZuBloecken('[x](javascript:alert(1))');
  assert.equal(j[0].zeilen[0][0].t, 'text');
});

test('ICS: Format, Maskierung und Zeilenfaltung', () => {
  const ics = icsErzeugen({
    name: 'Plan',
    jetzt: Date.UTC(2027, 4, 1),
    ereignisse: [
      {
        uid: 'a@b',
        start: Date.UTC(2027, 4, 29, 7, 12),
        ende: Date.UTC(2027, 4, 29, 7, 40),
        titel: 'ZP 3; Kehre, Hohe Sonne',
        beschreibung: 'Zeile1\nZeile2 ' + 'ä'.repeat(60),
        geo: [10.3, 50.9],
        erinnerungMin: 45,
      },
    ],
  });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART:20270529T071200Z'));
  assert.ok(ics.includes('SUMMARY:ZP 3\\; Kehre\\, Hohe Sonne'));
  assert.ok(ics.includes('TRIGGER:-PT45M'));
  assert.ok(ics.includes('GEO:50.900000;10.300000'));
  const enc = new TextEncoder();
  for (const zeile of ics.split('\r\n')) assert.ok(enc.encode(zeile).length <= 75, zeile);
  assert.equal(icsText('a\\b'), 'a\\\\b');
  assert.equal(icsFalten('x'.repeat(80)).split('\r\n ').join(''), 'x'.repeat(80));
});

// ---------------------------------------------------------------------------
// Planer
// ---------------------------------------------------------------------------
const t = (hhmm) => lokalZuUtcMs('2027-05-29', hhmm, TZ);
function testDaten() {
  const wp = new Map([
    ['WP3', { id: 'WP3', strecke: 'FG', erstesAuto: t('08:35'), sperrVon: t('07:35'), sperrBis: t('10:05'), intervallMin: 1, schnittKmh: 75 }],
    ['WP4', { id: 'WP4', strecke: 'HS', erstesAuto: t('09:15'), sperrVon: t('08:15'), sperrBis: t('10:45'), intervallMin: 1, schnittKmh: 85 }],
    ['WP6', { id: 'WP6', strecke: 'KL', erstesAuto: t('12:05'), sperrVon: t('11:05'), sperrBis: t('13:35'), intervallMin: 1, schnittKmh: 80 }],
  ]);
  const zp = new Map([
    ['ZP2', { id: 'ZP2', strecke: 'HS', km: 6.2, parkplatz: 'P2', fusswegMin: 9 }],
    ['ZP1', { id: 'ZP1', strecke: 'HS', km: 1.5, parkplatz: 'P1', fusswegMin: 14 }],
    ['ZP3', { id: 'ZP3', strecke: 'KL', km: 1.8, parkplatz: 'P3', fusswegMin: 13 }],
    ['ZP5', { id: 'ZP5', strecke: 'FG', km: 1.6, parkplatz: 'P5', fusswegMin: 13 }],
    ['ZP6', { id: 'ZP6', strecke: 'FG', km: 3.9, parkplatz: 'P6', fusswegMin: 4 }],
  ]);
  const ort = new Map([
    ['S1', { id: 'S1', gesperrtMit: [] }],
    ['P1', { id: 'P1', gesperrtMit: [] }],
    ['P2', { id: 'P2', gesperrtMit: ['WP4'] }],
    ['P3', { id: 'P3', gesperrtMit: [] }],
    ['P5', { id: 'P5', gesperrtMit: [] }],
    ['P6', { id: 'P6', gesperrtMit: ['WP3'] }],
  ]);
  const fz = { 'S1-P2': 14, 'S1-P5': 17, 'S1-P6': 21, 'P2-P3': 26, 'P5-P2': 13, 'P5-P1': 19, 'P6-P3': 35, 'P1-P3': 17, 'P5-P3': 30 };
  const fahrzeit = (a, b) => (a === b ? 0 : (fz[`${a}-${b}`] ?? fz[`${b}-${a}`] ?? null));
  return { wp, zp, ort, fahrzeit, starterAnzahl: 28 };
}

test('Planer: Durchfahrtszeiten am Zuschauerpunkt', () => {
  const d = testDaten();
  const df = durchfahrt(d, 'ZP2', 'WP4');
  // 6,2 km bei 85 km/h ≈ 4,376 min nach dem Start
  assert.equal(Math.round((df.erster - t('09:15')) / 1000), Math.round((6.2 / 85) * 3600));
  assert.equal((df.letzter - df.erster) / 60000, 27);
  assert.equal(durchfahrt(d, 'ZP2', 'WP3'), null); // falsche Strecke
});

test('Planer: Sperrzeiten-Logik', () => {
  const iv = [
    { von: t('08:00'), bis: t('10:00'), wp: 'A' },
    { von: t('09:30'), bis: t('11:00'), wp: 'B' },
  ];
  assert.equal(fruehesteFreigabe(iv, t('08:30')).zeit, t('11:00'));
  assert.equal(fruehesteFreigabe(iv, t('11:30')).zeit, t('11:30'));
  assert.equal(spaetesteDurchfahrt(iv, t('10:30')).zeit, t('08:00'));
  assert.equal(spaetesteDurchfahrt(iv, t('07:30')).zeit, t('07:30'));
  assert.equal(spaetesteDurchfahrt(iv, t('07:30')).grund, null);
  const d = testDaten();
  assert.deepEqual(sperrIntervalle(d, 'P2').map((x) => x.wp), ['WP4']);
});

test('Planer: erster Punkt – Losfahren bis', () => {
  const d = testDaten();
  const { schritte } = planBerechnen(d, [{ zp: 'ZP2', wp: 'WP4' }], 'S1');
  const s = schritte[0];
  assert.equal(s.machbar, true);
  // P2 wird mit WP4 um 08:15 gesperrt → spätestens 08:15 am Parkplatz, 14 min Fahrt → 08:01 losfahren
  assert.equal(s.ankunftSpaetestens, t('08:15'));
  assert.equal(s.schliesstWegen, 'WP4');
  assert.equal(s.abfahrtSpaetestens, t('08:01'));
});

test('Planer: machbarer Wechsel nach Sperrende', () => {
  const d = testDaten();
  const { schritte } = planBerechnen(d, [{ zp: 'ZP3', wp: 'WP6' }, { zp: 'ZP2', wp: 'WP4' }], 'S1');
  assert.deepEqual(schritte.map((s) => s.zp), ['ZP2', 'ZP3']); // sortiert nach Zeit
  const b = schritte[1];
  // P2 ist bis 10:45 gesperrt, dann 26 min nach P3 → 11:11; P3 ist frei, erstes Auto ~12:06 minus 13 min Fußweg
  assert.equal(b.uebergang.freiAb, t('10:45'));
  assert.equal(b.uebergang.freiWegen, 'WP4');
  assert.equal(b.uebergang.ankunft, t('11:11'));
  assert.equal(b.machbar, true);
  assert.ok(b.pufferMin > 30 && b.pufferMin < 60, String(b.pufferMin));
});

test('Planer: nicht machbar, wenn die Zufahrt schon gesperrt ist', () => {
  const d = testDaten();
  const { schritte } = planBerechnen(d, [{ zp: 'ZP5', wp: 'WP3' }, { zp: 'ZP2', wp: 'WP4' }], 'S1');
  // Letztes Auto an ZP5 ≈ 09:03, 13 min zurück → 09:16, 13 min Fahrt → 09:29; P2 ist seit 08:15 gesperrt
  assert.equal(schritte[1].machbar, false);
  assert.equal(schritte[1].grund, 'zu-spaet');
  const alt = alternativen(d, [{ zp: 'ZP5', wp: 'WP3' }, { zp: 'ZP2', wp: 'WP4' }], 1, 'S1');
  for (const a of alt) assert.ok(!(a.zp === 'ZP2' && a.wp === 'WP4'));
});

test('Planer: gleicher Parkplatz → kein Fahren nötig, unbekannte Fahrzeit', () => {
  const d = testDaten();
  d.zp.set('ZP7', { id: 'ZP7', strecke: 'KL', km: 0.5, parkplatz: 'P2', fusswegMin: 5 });
  const r = planBerechnen(d, [{ zp: 'ZP2', wp: 'WP4' }, { zp: 'ZP7', wp: 'WP6' }], 'S1').schritte;
  assert.equal(r[1].uebergang.gleicherParkplatz, true);
  assert.equal(r[1].machbar, true);
  d.zp.set('ZP8', { id: 'ZP8', strecke: 'KL', km: 0.5, parkplatz: 'P9', fusswegMin: 5 });
  d.ort.set('P9', { id: 'P9', gesperrtMit: [] });
  const u = planBerechnen(d, [{ zp: 'ZP2', wp: 'WP4' }, { zp: 'ZP8', wp: 'WP6' }], 'S1').schritte;
  assert.equal(u[1].machbar, null);
  assert.equal(u[1].grund, 'fahrzeit-unbekannt');
});
