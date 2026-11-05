// Uhr der App. Mit ?demozeit=2027-05-29T09:30 in der Adresse läuft die App ab dieser
// (Veranstaltungs-)Zeit – praktisch zum Testen von Planer, Hinweisen und Favoriten.

import { lokalZuUtcMs } from '../lib/zeit.js';

let versatz = 0;
let demo = false;

export function uhrEinrichten(zeitzone) {
  const wert = new URLSearchParams(location.search).get('demozeit');
  if (!wert) return;
  const [datum, uhrzeit] = wert.split('T');
  const ms = lokalZuUtcMs(datum, (uhrzeit || '').slice(0, 5), zeitzone);
  if (ms === null) return;
  versatz = ms - Date.now();
  demo = true;
}

export const jetzt = () => Date.now() + versatz;
export const istDemo = () => demo;

export function demoBeenden() {
  const url = new URL(location.href);
  url.searchParams.delete('demozeit');
  location.href = url.toString();
}
