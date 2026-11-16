# Rallye Wartburg – Zuschauer-App

Offline-fähige Web-App für Rallye-Zuschauer: Karte mit WPs, Zuschauerpunkten, Sperrzonen und
Parkplätzen (umschaltbar: Schlicht, Entdecken, Straßen, Luftbild), Zeitplan mit Sperrzeiten und
Status laut Zeitplan, Tagesplaner, Starterliste mit Favoriten, Notfall-Anzeige, Zuschauerpass,
Anwohner-Checker sowie Regeln und Glossar – auf Deutsch und Englisch.

Läuft auf Handy, Tablet und Computer: Ab 1100 px Breite steht die Karte neben Zeitplan, Planer
und Starterliste – praktisch zum Planen vor der Veranstaltung. Die Sprache folgt beim ersten Öffnen
der Systemsprache (Deutsch → Deutsch, andere → Englisch, unbekannt → Deutsch). Auf iPhone, iPad
und Mac wählt man bei der Navigation zwischen Apple Karten und Google Maps.

**Ohne Backend:** Die App besteht nur aus statischen Dateien. Alles wird auf dem Gerät berechnet.
Die Grundkarte kommt direkt von [OpenFreeMap](https://openfreemap.org), die eigenen Ebenen
(Strecken, Zonen, Punkte) vom eigenen Webspace – zusammengesetzt wird auf dem Handy.

> In `daten/` stehen zurzeit **Testdaten der Rallye 2026** aus dem Programmheft – die Karte ist noch
> ein Platzhalter (siehe [`daten/LIESMICH.md`](daten/LIESMICH.md)). Der erfundene Beispieldatensatz
> liegt unter `test/beispiel/daten/`.

## Schnellstart

Voraussetzung: [Node.js](https://nodejs.org) 20.19 oder neuer (LTS empfohlen).

```bash
npm install        # einmalig
npm run dev        # Entwicklungsserver: http://localhost:5173
```

Änderungen in `daten/` werden sofort geprüft und im Browser neu geladen.
Fehler in den Daten erscheinen im Terminal und als Hinweis im Browser.

> **Offline-Modus nur über HTTPS:** Browser erlauben Offline-Speicher und Service Worker nur auf
> `https://…` oder `http://localhost`. Über die WLAN-Adresse (`http://192.168.…:5173`) läuft die App
> auf dem Handy zwar, speichert aber nichts – die App zeigt dann „Offline nur über HTTPS“.
> Offline auf dem Handy also über die veröffentlichte `https://`-Adresse testen.

> `index.html` **nicht per Doppelklick** öffnen – die App braucht einen Webserver
> (`npm run dev`, `npm run preview` oder das Hosting). Besucher brauchen dagegen nichts
> außer einem Browser.


| Befehl | Wirkung |
|---|---|
| `npm run dev` | Entwicklungsserver (auch im WLAN erreichbar → mit dem Handy testen, aber ohne Offline-Modus, siehe unten) |
| `npm run daten` | nur die Daten prüfen und bauen |
| `npm test` | automatische Tests (Zeitzonen, CSV, Planer, Kalender, Daten-Prüfungen, Übersetzungen) |
| `npm run build` | fertige App nach `dist/` (bricht bei Datenfehlern ab) |
| `npm run preview` | gebaute App lokal ansehen – **nur hier** läuft der Offline-Modus (Service Worker) |

### Testen mit Demo-Zeit

Mit `?demozeit=` in der Adresse läuft die App ab einer beliebigen Zeit der Veranstaltung,
z. B. <http://localhost:5173/?demozeit=2027-05-29T09:10>. So lassen sich Sperrzeiten-Hinweise,
Tagesplaner und Favoriten-Hinweise ausprobieren. Ein blauer Balken zeigt die Demo-Zeit an.

## Daten austauschen

Alles Inhaltliche liegt in **`daten/`**: Tabellen (CSV), Karten (GeoJSON), Einstellungen und Texte.
Die genaue Beschreibung jeder Datei und Spalte steht in [`daten/LIESMICH.md`](daten/LIESMICH.md).

Ablauf für echte Daten:

1. Strecken (GPX/GeoJSON vom Veranstalter), Zuschauerpunkte, Sperrzonen und Orte in `daten/karte/` einpflegen.
2. Tabellen in `daten/tabellen/` ersetzen (Excel/LibreOffice, als CSV speichern).
3. `daten/einstellungen.json`: Tage, Region, Kontakt, `"beispieldaten": false`.
4. `daten/texte/impressum.md` und `datenschutz.md` ausfüllen.
5. `npm run daten` – so lange korrigieren, bis keine Fehler mehr kommen.

Der Build prüft u. a.: alle Verweise zwischen Tabellen und Karte, Uhrzeiten, Sperrzeiten gegen
Durchfahrtszeiten, **Zuschauerflächen dürfen weder Strecke noch Sperrzonen berühren**, Größe der
Offline-Region, fehlende Fahrzeiten, Platzhalter in Impressum/Datenschutz.

## Veröffentlichen

### GitHub Pages (Entwicklung/Test)

1. Repository auf GitHub anlegen und pushen (`git remote add origin …`, `git push -u origin main`).
2. Auf GitHub: **Settings → Pages → Source: „GitHub Actions“**.
3. Jeder Push auf `main` testet, baut und veröffentlicht automatisch
   (`.github/workflows/github-pages.yml`). Den Fortschritt siehst du unter „Actions“.
4. Die App ist dann unter `https://<benutzername>.github.io/RallyeWebApp/` erreichbar –
   ganz normal im Browser, ohne Befehle oder Installation.

**Eigene Domain:** unter Settings → Pages → „Custom domain“ eintragen, beim Domain-Anbieter einen
CNAME (`www` → `<benutzername>.github.io`) bzw. die A-Records von GitHub setzen und danach
**„Enforce HTTPS“** aktivieren – ohne HTTPS gibt es keinen Offline-Modus.

GitHub Pages ist für **öffentliche** Repositories kostenlos. Für private Repositories braucht
man GitHub Pro (für Studierende im GitHub Student Developer Pack enthalten).

### Eigener Webspace (z. B. Strato)

1. `npm run build`
2. Den **Inhalt** von `dist/` per SFTP (z. B. FileZilla) in den Webspace-Ordner laden –
   inklusive der versteckten Datei `.htaccess` (Cache-Regeln für Apache).
3. Die App funktioniert in jedem Unterordner, weil alle Pfade relativ sind.

Wichtig: **HTTPS** ist Pflicht (sonst kein Offline-Modus). Eine eigene Domain hält Links und
QR-Codes stabil, auch wenn du den Hoster wechselst.

## Wie die Offline-Funktion arbeitet

- **App-Dateien:** Der Service Worker (`src/sw.js`, beim Build befüllt) speichert alle Dateien.
  Neustarts kosten danach praktisch keinen Datenverkehr.
- **Daten:** `daten/manifest.json` nennt die aktuellen Dateien (mit Versionskennung im Namen).
  Beim Start wird nur das kleine Manifest geprüft; geänderte Dateien werden nachgeladen.
- **Grundkarte:** Im Hintergrund wird die Region aus `einstellungen.json` bis Zoom 14 direkt von
  OpenFreeMap gespeichert (≈ 500 Dateien bei der Region 2026, höchstens 4 gleichzeitig).
  Neue Kartenversionen werden erst übernommen, wenn sie vollständig gespeichert sind.
- **Weitere Kartenansichten** (Entdecken, Straßen) nutzen dieselben Kacheln; gespeichert wird beim
  ersten Auswählen nur ihre Stil-Datei. Das **Luftbild** kommt direkt vom Landesdienst und ist nur
  online verfügbar.
- **Ohne Grundkarte** (erstes Öffnen offline, Anbieter gestört) zeigt die Karte trotzdem Strecken,
  Zuschauerpunkte, Sperrzonen und den eigenen Standort.

## Vor dem Livegang

- [ ] Echte Daten eingepflegt, `"beispieldaten": false`, `npm run daten` ohne Fehler
- [ ] Zuschauerpunkte und Sperrzonen mit dem Veranstalter/Sicherheitskonzept abgestimmt
- [ ] Impressum und Datenschutzerklärung vollständig (Hoster eintragen)
- [ ] OpenFreeMap-Betreiber über das Projekt informieren (Offline-Downloads: max. 3000 Kacheln,
      max. 4 parallele Anfragen; ein eigener User-Agent ist im Browser nicht möglich) – Spende erwägen
- [ ] Zeiten im Zeitplan geprüft – der WP-Status („Läuft“, „Beendet“) wird daraus berechnet
- [ ] Auf echten Handys getestet (Android/Chrome und iPhone/Safari, auch „Zum Home-Bildschirm“)

## Aufbau

```
daten/            Inhalte (Tabellen, Karten, Einstellungen, Texte) → siehe daten/LIESMICH.md
scripts/          daten-bauen.mjs: prüft daten/ und erzeugt public/daten/
public/           statische Dateien (Icons, Web-App-Manifest, .htaccess)
src/main.js       Start, Navigation, Updates
src/app/          Logik: Karte, Offline-Speicher, Navigation, Standort, Hinweise, Zuschauerpass …
src/views/        Ansichten (Karte, Steckbrief, Zeitplan, Planer, Starter, Mehr, Notfall, Extras)
src/lib/          reine Berechnungen (Zeitzonen, CSV, Planer, Status, Kalender, Kacheln, Sprache, Navi-Links) – auch für Tests
src/i18n/         Oberflächentexte Deutsch/Englisch
test/             automatische Tests (node --test)
```

Verwendete Bibliotheken: [MapLibre GL JS](https://maplibre.org) (Karte), [Turf](https://turfjs.org)
(Geometrie), [Fontsource Barlow](https://fontsource.org) (Schrift, lokal eingebunden), [Vite](https://vite.dev) (Build).

Kartendaten: © [OpenFreeMap](https://openfreemap.org), © [OpenMapTiles](https://www.openmaptiles.org/),
Daten von © [OpenStreetMap-Mitwirkende](https://www.openstreetmap.org/copyright).
Luftbild: Digitale Orthophotos © [GDI-Th](https://www.geoportal-th.de), Lizenz CC BY 4.0.
