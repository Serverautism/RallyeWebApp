# Daten der Veranstaltung

In diesem Ordner liegen **alle Inhalte** der App. Code musst du dafür nicht anfassen.
Nach jeder Änderung prüft `npm run daten` (oder automatisch `npm run dev` / `npm run build`)
alles gründlich und meldet Fehler mit **Datei und Zeile**.

> **Aktuell sind hier Beispieldaten.** Die Namen der Prüfungen (Hohe Sonne, Krauthäuser Loch,
> Flachsgrund), das Rallyezentrum an der AWE und der Ablauf sind an frühere Ausgaben der
> Rallye Wartburg angelehnt. Strecken, Zeiten, Punkte, Teilnehmer und Straßen sind **erfunden**.
> Solange `"beispieldaten": true` gesetzt ist, zeigt die App einen gelben Hinweis.

## Überblick

| Datei | Inhalt | Bearbeiten mit |
|---|---|---|
| `einstellungen.json` | Name, Tage, Kartenausschnitt, Kontakt, Status-Adresse | Texteditor |
| `karte/strecken.geojson` | WP-Strecken als Linien | geojson.io, uMap, QGIS |
| `karte/zuschauerpunkte.geojson` | Zuschauerbereiche als Flächen | geojson.io, uMap, QGIS |
| `karte/sperrzonen.geojson` | Sperrzonen als Flächen | geojson.io, uMap, QGIS |
| `karte/orte.geojson` | Parkplätze, Servicepark, WC … als Punkte | geojson.io, uMap, QGIS |
| `tabellen/*.csv` | alle Texte, Zeiten und Eigenschaften | Excel, LibreOffice, Google Tabellen |
| `texte/*.md` | Impressum und Datenschutz | Texteditor |
| `bilder/` | Fotos der Zuschauerpunkte (optional) | – |

Die **Karte** enthält nur Geometrie und eine `id`. Alles andere steht in den **Tabellen**.
Verknüpft wird über die IDs (`HS`, `WP1`, `ZP3`, `P4` …) – sie müssen in Karte und Tabelle
exakt gleich geschrieben sein.

## Tabellen (CSV)

- Trennzeichen **Semikolon, Komma oder Tabulator** – wird automatisch erkannt.
- Dezimalzahlen mit **Komma oder Punkt** (`1,5` oder `1.5`).
- Uhrzeiten als `09:05` (auch `9:05` oder `09:05:00`), immer **Ortszeit** der Veranstaltung.
  Sommer- und Winterzeit rechnet die App selbst.
- In Excel am besten **„CSV UTF-8“** speichern. Normales „CSV“ (Windows-1252) wird auch erkannt,
  der Build gibt dann einen Hinweis.
- Leere Zeilen werden ignoriert. Unbekannte Spalten erzeugen eine Warnung (Tippfehler-Schutz).
- `_en`-Spalten sind optional – fehlt die englische Fassung, zeigt die App Deutsch.

### `pruefungen.csv` – Wertungsprüfungen

| Spalte | Pflicht | Beispiel | Bedeutung |
|---|---|---|---|
| `wp` | ja | `WP3` | ID; die Zahl am Ende wird angezeigt („WP 3“) |
| `name_de` / `name_en` | ja / – | `Flachsgrund 1` | |
| `strecke` | ja | `FG` | ID aus `strecken.csv` / `strecken.geojson` |
| `tag` | ja | `sa` | ID eines Tages aus `einstellungen.json` |
| `erstes_auto` | ja | `08:35` | Start des ersten Teilnehmers in die WP |
| `sperrung_von` / `sperrung_bis` | ja | `07:35` / `10:05` | Vollsperrung laut Sicherheitskonzept |
| `intervall_min` | – | `1` | Startabstand in Minuten (Standard 1) |
| `schnitt_kmh` | – | `75` | geschätzter Schnitt für Durchfahrtszeiten (Standard 80) |
| `laenge_km` | – | `4,78` | offizielle Länge; leer = aus der Linie berechnet |

Geprüft wird u. a.: Sperrung beginnt vor dem ersten Auto und dauert (laut Berechnung) bis nach dem letzten.

### `strecken.csv`

`id; name_de; name_en; belag_de; belag_en; hinweis_de; hinweis_en` – eine Zeile je Linie in `strecken.geojson`.
Eine Strecke kann mehrere WPs haben (z. B. WP 1 und WP 4 auf „Hohe Sonne“).

### `zuschauerpunkte.csv`

| Spalte | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | z. B. `ZP3`; die Zahl am Ende erscheint im Kreis auf der Karte |
| `name_de` / `name_en` | ja / – | |
| `strecke` | ja | an welcher Strecke der Punkt liegt |
| `km` | – | Lage auf der Strecke; **leer lassen** = wird aus der Karte berechnet |
| `parkplatz` | ja | ID eines Orts vom Typ `parkplatz` |
| `fussweg_m`, `fussweg_min` | –, ja | Fußweg vom Parkplatz |
| `hoehenmeter` | – | |
| `untergrund_de/_en`, `versorgung_de/_en`, `beschreibung_de/_en` | – | freie Texte |
| `barrierefrei`, `kinderwagen` | – | `ja`, `nein` oder `teilweise` |
| `foto` | – | Dateiname in `daten/bilder/` (jpg, png, webp; möglichst < 300 KB) |

**Sicherheitsprüfung:** Eine Zuschauerfläche darf weder die Strecke noch eine Sperrzone berühren –
sonst bricht der Build mit Fehler ab.

### `orte.csv`

`id; typ; name_de; name_en; beschreibung_de; beschreibung_en; gesperrt_mit; stempel`

- `typ`: `parkplatz`, `servicepark`, `rampe`, `info`, `wc`, `imbiss`, `sanitaeter`, `shuttle`, `sonstiges`
- `gesperrt_mit`: WPs, während deren Sperrzeit die **Zufahrt** gesperrt ist, z. B. `WP1 WP4`.
  Daraus berechnet die App „Zufahrt zu ab …“ und den Tagesplaner.
- `stempel`: `ja` = Station im Zuschauerpass (Zuschauerpunkte sind es immer).

### `zeitplan.csv`

`tag; von; bis; typ; titel_de; titel_en; ort; ort_de; ort_en` – alles **außer** den WPs
(die kommen automatisch aus `pruefungen.csv`). `typ`: `abnahme`, `shakedown`, `start`, `service`,
`regrouping`, `parc_ferme`, `ziel`, `siegerehrung`, `sonstiges`. `ort` = ID aus `orte.csv` (verlinkt auf die Karte).

### `fahrzeiten.csv` – für den Tagesplaner

`von; nach; minuten` – Fahrzeit mit dem Auto zwischen Parkplätzen (und vom Startort aus
`einstellungen.json → planer.startort`). Eine Zeile gilt für beide Richtungen, außer die
Gegenrichtung ist extra eingetragen. **Wichtig:** Fahrzeiten mit Umfahrung der Sperrungen angeben.
Fehlende Paare meldet der Build als Hinweis. Tipp: vorab mit OSRM/GraphHopper berechnen und von Hand prüfen.

### `starter.csv`

`nr; fahrer; beifahrer; nation; klasse; fahrzeug; motor; baujahr; team; startposition`

- `fahrzeug` z. B. `Ford Fiesta ST (Mk6)`, `motor` z. B. `2,0 l Vierzylinder`, `baujahr` z. B. `2006`
- `startposition`: optional; leer = Reihenfolge der Startnummern. Daraus berechnet die App,
  wann ein Favorit an einem Zuschauerpunkt vorbeikommt.

### `strassen.csv` – Anwohner-Checker

`strasse; ort; status; sperrt_mit; zeiten_de; zeiten_en; hinweis_de; hinweis_en`

- `status`: `gesperrt`, `umleitung`, `teilweise`, `frei`
- `sperrt_mit`: WPs → die Zeiten werden automatisch aus den Sperrzeiten berechnet.
  Für Sperrungen ohne WP (z. B. Rampe) stattdessen `zeiten_de` als Text ausfüllen.

### `regeln.csv` und `glossar.csv`

`nr; text_de; text_en` bzw. `begriff_de; erklaerung_de; begriff_en; erklaerung_en`.

## Karten (GeoJSON)

- Format: GeoJSON `FeatureCollection`, Koordinaten in **[Länge, Breite]** (WGS84).
  Vertauschte Koordinaten erkennt der Build und meldet sie.
- Jedes Objekt braucht unter `properties` eine `"id"`, z. B. `{"id": "ZP3"}`.
- Typen: Strecken = `LineString` (in Fahrtrichtung zeichnen: erster Punkt = Start),
  Zuschauerpunkte und Sperrzonen = `Polygon`, Orte = `Point`.
- **GPX vom Veranstalter** umwandeln: z. B. auf geojson.io öffnen und als GeoJSON speichern,
  oder `ogr2ogr -f GeoJSON strecken.geojson strecke.gpx tracks`. Danach `id` ergänzen.
- 5 Nachkommastellen reichen (≈ 1 m); der Build rundet automatisch.

### Zeichnen mit geojson.io

1. Datei (z. B. `zuschauerpunkte.geojson`) auf <https://geojson.io> ziehen.
2. Fläche/Linie/Punkt zeichnen, in der Tabelle rechts `id` eintragen.
3. „Save → GeoJSON“ und die Datei hier überschreiben.

## einstellungen.json

| Schlüssel | Bedeutung |
|---|---|
| `veranstaltung.name_de/_en`, `kurzname`, `jahr`, `veranstalter` | Anzeige; `jahr` trennt Favoriten/Pläne verschiedener Jahre |
| `veranstaltung.zeitzone` | `Europe/Berlin` |
| `veranstaltung.beispieldaten` | `true` zeigt den gelben Hinweis – für echte Daten `false` |
| `tage` | Liste mit `id`, `datum` (JJJJ-MM-TT), `name_de`, `name_en` |
| `karte.stil` | Kartenstil, Standard: OpenFreeMap „positron“ |
| `karte.region` | [West, Süd, Ost, Nord] – dieser Ausschnitt wird **offline gespeichert** |
| `karte.offline_max_zoom` | höchste gespeicherte Zoomstufe (14 = Maximum der Vektorkacheln) |
| `karte.mitte`, `karte.zoom` | optional feste Startansicht; `null` = alles automatisch ins Bild |
| `planer.startort` | Ort-ID, von dem der Tagesplaner losfahren lässt (z. B. Servicepark) |
| `favoriten.vorwarnung_min` | wie viele Minuten vorher ein Favorit gemeldet wird |
| `zuschauerpass.ziel`, `verweildauer_min`, `radius_m` | Stempel-Regeln |
| `status.url`, `status.abfrage_s` | Adresse des Live-Status und Abfrage-Intervall |
| `kontakt` | `notruf`, `rallyeleitung_tel`, `rallyebuero_tel`, `email`, `webseite` |
| `starter_anzahl` | `null` = Anzahl aus `starter.csv`; sonst feste Zahl (wenn die Liste noch fehlt) |

Die Offline-Region darf bei OpenFreeMap höchstens **3000 Kacheln** umfassen – der Build prüft das.

## Live-Status (während der Rallye)

Der Status steht **nicht** in diesem Ordner, sondern in einer eigenen kleinen Datei
(Standard: `public/status.json`, Adresse in `einstellungen.json → status.url`). So kann sie
im Rallyebüro geändert werden, ohne die App neu zu bauen.

```json
{
  "stand": "2027-05-29T10:42:00+02:00",
  "meldungen": [{ "zeit": "2027-05-29T10:40:00+02:00", "text_de": "WP 4 startet 15 min später.", "text_en": "SS 4 starts 15 min late.", "wichtig": true }],
  "wp": { "WP4": { "status": "verzoegert", "hinweis_de": "Neuer Start 09:30", "hinweis_en": "New start 09:30" } }
}
```

`status`: `geplant`, `laeuft`, `verzoegert`, `unterbrochen`, `abgesagt`, `beendet`.

Alternativ eine **Google-Tabelle** mit den Spalten `wp; status; hinweis_de; hinweis_en; wichtig`
über „Datei → Freigeben → Im Web veröffentlichen → CSV“ veröffentlichen und deren Adresse als
`status.url` eintragen. Zeilen mit `wp` = `MELDUNG` werden als Meldung angezeigt.

> GitHub Pages speichert Dateien bis zu 10 Minuten zwischen. Für einen schnellen Status die Datei
> daher bei einem Hoster ablegen, bei dem du die Cache-Zeit einstellen kannst (siehe `public/.htaccess`),
> oder die Google-Tabelle nutzen.
