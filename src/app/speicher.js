// Speicher auf dem Gerät (localStorage), abgesichert gegen private Modi und volle Speicher.
// Werte einer Veranstaltung bekommen ein eigenes Präfix (z. B. "rw.2027."),
// damit Favoriten und Pläne nicht ins nächste Jahr übernommen werden.

let praefix = 'rw.';

export function praefixSetzen(jahr) {
  praefix = jahr ? `rw.${jahr}.` : 'rw.';
}

function lesenRoh(schluessel, standard) {
  try {
    const wert = localStorage.getItem(schluessel);
    return wert === null ? standard : JSON.parse(wert);
  } catch {
    return standard;
  }
}

function schreibenRoh(schluessel, wert) {
  try {
    if (wert === undefined) localStorage.removeItem(schluessel);
    else localStorage.setItem(schluessel, JSON.stringify(wert));
    return true;
  } catch {
    return false;
  }
}

/** Wert dieser Veranstaltung lesen */
export const lesen = (schluessel, standard = null) => lesenRoh(praefix + schluessel, standard);
/** Wert dieser Veranstaltung schreiben (undefined löscht) */
export const schreiben = (schluessel, wert) => schreibenRoh(praefix + schluessel, wert);
/** Wert unabhängig von der Veranstaltung (z. B. Sprache) */
export const lesenGlobal = (schluessel, standard = null) => lesenRoh(`rw.${schluessel}`, standard);
export const schreibenGlobal = (schluessel, wert) => schreibenRoh(`rw.${schluessel}`, wert);
