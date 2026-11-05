// Standort des Geräts (nur auf Wunsch). Die Position bleibt auf dem Gerät.

import { zustand, melden } from './zustand.js';
import { lesen, schreiben } from './speicher.js';

let watchId = null;

export const standortVerfuegbar = () => typeof navigator !== 'undefined' && 'geolocation' in navigator;
export const standortLaeuft = () => watchId !== null;

export function standortStarten() {
  if (!standortVerfuegbar() || watchId !== null) return;
  zustand.positionFehler = null;
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      zustand.position = {
        lon: p.coords.longitude,
        lat: p.coords.latitude,
        genauigkeit: p.coords.accuracy,
        zeit: p.timestamp,
      };
      zustand.positionFehler = null;
      melden('position');
    },
    (fehler) => {
      zustand.positionFehler = fehler.code; // 1 = verweigert, 2 = nicht verfügbar, 3 = Zeitüberschreitung
      if (fehler.code === 1) standortStoppen(false);
      melden('position');
    },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 },
  );
  schreiben('standortAktiv', true);
  melden('position');
}

export function standortStoppen(merken = true) {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  zustand.position = null;
  if (merken) schreiben('standortAktiv', false);
  melden('position');
}

/** Startet den Standort wieder, wenn er zuletzt aktiv war und die Erlaubnis noch besteht. */
export async function standortWiederherstellen() {
  if (!lesen('standortAktiv', false) || !standortVerfuegbar()) return;
  try {
    const erlaubnis = await navigator.permissions?.query({ name: 'geolocation' });
    if (erlaubnis?.state === 'granted') standortStarten();
  } catch {
    /* Permissions-API nicht verfügbar */
  }
}
