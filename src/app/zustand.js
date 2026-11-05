// Gemeinsamer Zustand der App mit einfachem Benachrichtigungs-Mechanismus.

export const zustand = {
  daten: null, // aufbereitete Veranstaltungsdaten (siehe datenlader.js)
  manifest: null,
  status: null, // Live-Status (WP-Status, Meldungen)
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  karteOffline: { phase: 'unbekannt', fertig: 0, gesamt: 0 }, // unbekannt | laedt | fertig | teilweise | fehler | offline
  grundkarte: 'laedt', // laedt | ok | fehlt
  position: null, // { lon, lat, genauigkeit, zeit }
  positionFehler: null,
  appUpdateBereit: false,
};

const hoerer = new Set();

/** Auf Änderungen hören. Rückgabe: Funktion zum Abmelden. */
export function abonnieren(fn) {
  hoerer.add(fn);
  return () => hoerer.delete(fn);
}

/** Änderung bekannt geben, z. B. melden('status') */
export function melden(was) {
  for (const fn of [...hoerer]) {
    try {
      fn(was);
    } catch (e) {
      console.error(e);
    }
  }
}
