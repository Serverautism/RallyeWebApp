// Reine Berechnungslogik für Durchfahrtszeiten, Sperrungen und den Tagesplaner.
// Keine Abhängigkeit vom Browser – wird auch in den Tests verwendet.
//
// Erwartete Datenstruktur `d`:
//   d.wp:    Map<id, {id, strecke, erstesAuto, sperrVon, sperrBis, intervallMin, schnittKmh, laengeKm}>  (Zeiten in ms;
//            sperrVon/sperrBis sind null, wenn der Veranstalter keine Sperrzeiten angegeben hat)
//   d.zp:    Map<id, {id, strecke, km, parkplatz, fusswegMin}>  (parkplatz und fusswegMin können null sein)
//   d.ort:   Map<id, {id, typ, gesperrtMit: string[]}>
//   d.fahrzeit(vonId, nachId) → Minuten | null
//   d.starterAnzahl: number

const MIN = 60000;

/** Zeitpunkt, zu dem das Auto an Startposition `pos` (1 = erstes Auto) am Kilometer `km` der WP ist. */
export function ankunftBeiKm(wp, km, pos = 1) {
  const start = wp.erstesAuto + (pos - 1) * wp.intervallMin * MIN;
  return start + (km / wp.schnittKmh) * 60 * MIN;
}

/** Erstes und (geschätzt) letztes Auto an einem Zuschauerpunkt für eine WP. */
export function durchfahrt(d, zpId, wpId) {
  const zp = d.zp.get(zpId);
  const wp = d.wp.get(wpId);
  if (!zp || !wp || zp.strecke !== wp.strecke) return null;
  const erster = ankunftBeiKm(wp, zp.km, 1);
  const letzter = ankunftBeiKm(wp, zp.km, Math.max(1, d.starterAnzahl));
  return { erster, letzter };
}

/** Geschätzter Zeitpunkt, zu dem das letzte Auto das Ziel der WP erreicht. */
export function letztesAutoImZiel(wp, starterAnzahl) {
  return ankunftBeiKm(wp, wp.laengeKm || 0, Math.max(1, starterAnzahl));
}

/**
 * Status einer WP allein aus dem Zeitplan (es gibt keinen Live-Status):
 *   geplant  – vor der Straßensperrung (ohne bekannte Sperrzeiten: vor dem ersten Auto)
 *   gesperrt – Straßen gesperrt, das erste Auto ist noch nicht gestartet (nur mit bekannten Sperrzeiten)
 *   laeuft   – vom ersten Auto bis zum geschätzten letzten Auto im Ziel (spätestens Sperrende)
 *   beendet  – danach
 * @returns {{status: string, ende: number} | null}
 */
export function wpZeitStatus(d, wpId, t) {
  const wp = d.wp.get(wpId);
  if (!wp) return null;
  const mitSperrung = wp.sperrVon !== null && wp.sperrVon !== undefined && wp.sperrBis !== null && wp.sperrBis !== undefined;
  const letztes = letztesAutoImZiel(wp, d.starterAnzahl);
  const ende = mitSperrung ? Math.min(letztes, wp.sperrBis) : letztes;
  if (mitSperrung && t < wp.sperrVon) return { status: 'geplant', ende };
  if (t < wp.erstesAuto) return { status: mitSperrung ? 'gesperrt' : 'geplant', ende };
  if (t < ende) return { status: 'laeuft', ende };
  return { status: 'beendet', ende };
}

/** Alle Durchfahrten (Kombinationen Zuschauerpunkt × WP derselben Strecke), zeitlich sortiert. */
export function alleDurchfahrten(d) {
  const liste = [];
  for (const wp of d.wp.values()) {
    for (const zp of d.zp.values()) {
      if (zp.strecke !== wp.strecke) continue;
      liste.push({ zp: zp.id, wp: wp.id, ...durchfahrt(d, zp.id, wp.id) });
    }
  }
  return liste.sort((a, b) => a.erster - b.erster);
}

/** Hat die WP bekannte Sperrzeiten? */
export function hatSperrzeiten(wp) {
  return Boolean(wp) && wp.sperrVon !== null && wp.sperrVon !== undefined && wp.sperrBis !== null && wp.sperrBis !== undefined;
}

/**
 * Zeitintervalle, in denen die Zufahrt zu einem Ort (Parkplatz) gesperrt ist.
 * WPs ohne angegebene Sperrzeiten fehlen hier (siehe sperrzeitenUnbekannt).
 */
export function sperrIntervalle(d, ortId) {
  const ort = ortId ? d.ort.get(ortId) : null;
  if (!ort) return [];
  return (ort.gesperrtMit || [])
    .map((wpId) => d.wp.get(wpId))
    .filter(hatSperrzeiten)
    .map((wp) => ({ von: wp.sperrVon, bis: wp.sperrBis, wp: wp.id }))
    .sort((a, b) => a.von - b.von);
}

/** Wird die Zufahrt zu einem Ort durch eine WP gesperrt, deren Sperrzeiten nicht angegeben sind? */
export function sperrzeitenUnbekannt(d, ortId) {
  const ort = ortId ? d.ort.get(ortId) : null;
  if (!ort) return false;
  return (ort.gesperrtMit || []).some((wpId) => {
    const wp = d.wp.get(wpId);
    return wp && !hatSperrzeiten(wp);
  });
}

/** Intervall, das den Zeitpunkt t enthält (von ≤ t < bis), sonst null. */
export function sperrungZu(intervalle, t) {
  return intervalle.find((iv) => iv.von <= t && t < iv.bis) || null;
}

/** Nächste Sperrung, die nach t beginnt oder t enthält. */
export function naechsteSperrung(intervalle, t) {
  return intervalle.find((iv) => iv.bis > t) || null;
}

/** Frühester Zeitpunkt ≥ t, zu dem man durch die Zufahrt fahren kann (wartet Sperrungen ab). */
export function fruehesteFreigabe(intervalle, t) {
  let zeit = t;
  let grund = null;
  for (let i = 0; i < intervalle.length + 1; i++) {
    const iv = sperrungZu(intervalle, zeit);
    if (!iv) break;
    zeit = iv.bis;
    grund = iv;
  }
  return { zeit, grund };
}

/**
 * Spätester Zeitpunkt ≤ t, zu dem man noch durch die Zufahrt kommt.
 * Liegt t in einer Sperrung, ist es deren Beginn (die Zufahrt schließt dann).
 */
export function spaetesteDurchfahrt(intervalle, t) {
  let zeit = t;
  let grund = null;
  for (let i = 0; i < intervalle.length + 1; i++) {
    const iv = intervalle.find((x) => x.von <= zeit && zeit < x.bis);
    if (!iv) break;
    zeit = iv.von - 1;
    grund = iv;
  }
  return { zeit: grund ? grund.von : zeit, grund };
}

/**
 * Berechnet einen Tagesplan.
 * @param d aufbereitete Daten
 * @param eintraege [{zp, wp}] – Reihenfolge egal, wird nach Zeit sortiert
 * @param startOrt Ort-ID, von dem man zum ersten Punkt losfährt (z. B. Servicepark)
 * @returns {{schritte: object[]}}
 */
export function planBerechnen(d, eintraege, startOrt) {
  const gueltig = eintraege
    .map((e) => ({ ...e, df: durchfahrt(d, e.zp, e.wp) }))
    .filter((e) => e.df)
    .sort((a, b) => a.df.erster - b.df.erster);

  const schritte = [];
  let vorher = null;

  for (const e of gueltig) {
    const zp = d.zp.get(e.zp);
    const wp = d.wp.get(e.wp);
    const parkplatz = zp.parkplatz;
    const zufahrt = sperrIntervalle(d, parkplatz);
    const fussweg = zp.fusswegMin || 0;

    // Spätester Zeitpunkt am Parkplatz: rechtzeitig zu Fuß zum Punkt UND bevor die Zufahrt schließt.
    const zuFussSpaetestens = e.df.erster - fussweg * MIN;
    const spaet = spaetesteDurchfahrt(zufahrt, zuFussSpaetestens);
    const ankunftSpaetestens = spaet.zeit;

    const schritt = {
      zp: e.zp,
      wp: e.wp,
      erster: e.df.erster,
      letzter: e.df.letzter,
      parkplatz,
      fusswegMin: fussweg,
      ankunftSpaetestens,
      schliesstWegen: spaet.grund ? spaet.grund.wp : null,
      abfahrtSpaetestens: null,
      fahrMin: null,
      machbar: true,
      grund: null,
      pufferMin: null,
      uebergang: null,
    };

    if (!vorher) {
      const fahr = parkplatz ? d.fahrzeit(startOrt, parkplatz) : null;
      schritt.fahrMin = fahr;
      if (fahr !== null && fahr !== undefined) schritt.abfahrtSpaetestens = ankunftSpaetestens - fahr * MIN;
    } else if (vorher.zp === e.zp) {
      // Derselbe Zuschauerpunkt: einfach stehen bleiben – auch wenn sich die Durchfahrten überschneiden.
      schritt.fahrMin = 0;
      schritt.uebergang = {
        freiAb: vorher.letzter,
        freiWegen: null,
        fussMin: 0,
        fahrMin: 0,
        ankunft: vorher.letzter,
        ankunftEffektiv: vorher.letzter,
        gleicherParkplatz: false,
        gleicherPunkt: true,
      };
      schritt.pufferMin = Math.max(0, Math.floor((e.df.erster - vorher.letzter) / MIN));
    } else {
      // Man schaut bis zum letzten Auto, geht zum Parkplatz zurück und fährt los, sobald die Zufahrt frei ist.
      const zurueckAmParkplatz = vorher.letzter + (vorher.fusswegMin || 0) * MIN;
      const gleicherParkplatz = Boolean(parkplatz) && vorher.parkplatz === parkplatz;
      let freiAb;
      let freiWegen = null;
      let fahr;
      let ankunft;
      if (gleicherParkplatz) {
        freiAb = zurueckAmParkplatz;
        fahr = 0;
        ankunft = zurueckAmParkplatz;
      } else {
        const frei = fruehesteFreigabe(sperrIntervalle(d, vorher.parkplatz), zurueckAmParkplatz);
        freiAb = frei.zeit;
        freiWegen = frei.grund ? frei.grund.wp : null;
        fahr = parkplatz && vorher.parkplatz ? d.fahrzeit(vorher.parkplatz, parkplatz) : null;
        ankunft = fahr === null || fahr === undefined ? null : freiAb + fahr * MIN;
      }
      schritt.fahrMin = fahr;
      schritt.uebergang = {
        freiAb,
        freiWegen,
        fussMin: vorher.fusswegMin,
        fahrMin: fahr,
        ankunft,
        gleicherParkplatz,
      };
      if (fahr !== null && fahr !== undefined) {
        schritt.abfahrtSpaetestens = gleicherParkplatz ? null : ankunftSpaetestens - fahr * MIN;
      }
      if (ankunft === null && e.df.erster < vorher.letzter) {
        // Überschneidung ist auch ohne Fahrzeit klar: das erste Auto kommt, bevor das letzte am vorigen Punkt durch ist.
        schritt.machbar = false;
        schritt.grund = 'ueberschneidung';
      } else if (ankunft === null) {
        schritt.machbar = null;
        schritt.grund = 'fahrzeit-unbekannt';
      } else {
        // Kommt man an, während die Zufahrt gesperrt ist, muss man bis zur Freigabe warten.
        let effektiv = ankunft;
        if (!gleicherParkplatz) {
          const iv = sperrungZu(zufahrt, ankunft);
          if (iv) effektiv = iv.bis;
        }
        const ankunftAmPunkt = effektiv + fussweg * MIN;
        const zielZeit = gleicherParkplatz ? e.df.erster : ankunftSpaetestens;
        const vergleich = gleicherParkplatz ? ankunftAmPunkt : effektiv;
        schritt.uebergang.ankunftEffektiv = effektiv;
        schritt.pufferMin = Math.floor((zielZeit - vergleich) / MIN);
        if (vergleich > zielZeit) {
          schritt.machbar = false;
          schritt.grund = e.df.erster < vorher.letzter ? 'ueberschneidung' : 'zu-spaet';
        }
      }
    }
    schritte.push(schritt);
    vorher = schritt;
  }
  return { schritte };
}

/**
 * Schlägt Ersatz für einen nicht machbaren Schritt vor: andere Durchfahrten im selben Zeitfenster,
 * bei denen der neue Schritt und der Folgeschritt machbar sind.
 */
export function alternativen(d, eintraege, index, startOrt, maxAnzahl = 2) {
  const plan = planBerechnen(d, eintraege, startOrt).schritte;
  const ziel = plan[index];
  if (!ziel) return [];
  const vor = plan[index - 1] || null;
  const nach = plan[index + 1] || null;
  // WPs der übrigen Schritte sind belegt; dieselbe WP an einem anderen Punkt ist erlaubt.
  const belegt = new Set(plan.filter((_, i) => i !== index).map((s) => s.wp));
  const kandidaten = alleDurchfahrten(d).filter(
    (k) =>
      !belegt.has(k.wp) &&
      !(k.zp === ziel.zp && k.wp === ziel.wp) &&
      (!vor || k.erster > vor.letzter) &&
      (!nach || k.letzter < nach.erster),
  );
  const ergebnisse = [];
  for (const k of kandidaten) {
    const rest = plan.filter((_, i) => i !== index).map((s) => ({ zp: s.zp, wp: s.wp }));
    const neu = planBerechnen(d, [...rest, { zp: k.zp, wp: k.wp }], startOrt).schritte;
    const i = neu.findIndex((s) => s.zp === k.zp && s.wp === k.wp);
    const ok = neu[i]?.machbar === true && (!neu[i + 1] || neu[i + 1].machbar === true);
    if (ok) ergebnisse.push({ zp: k.zp, wp: k.wp, erster: k.erster, pufferMin: neu[i].pufferMin });
  }
  ergebnisse.sort((a, b) => Math.abs(a.erster - ziel.erster) - Math.abs(b.erster - ziel.erster));
  return ergebnisse.slice(0, maxAnzahl);
}
