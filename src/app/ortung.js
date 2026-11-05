// Räumliche Berechnungen auf dem Gerät: Wo auf welcher WP bin ich? Welcher Zuschauerpunkt ist nah?

import { nearestPointOnLine, lineString, point, distance, booleanPointInPolygon } from '@turf/turf';

/** Nächste WP-Strecke zur Position: { strecke, km, abstandM } */
export function naechsteStrecke(daten, lon, lat) {
  const p = point([lon, lat]);
  let bestes = null;
  for (const f of daten.geo.strecken.features) {
    const n = nearestPointOnLine(lineString(f.geometry.coordinates), p, { units: 'kilometers' });
    const abstand = (n.properties.pointDistance ?? n.properties.dist) * 1000;
    const km = n.properties.lineDistance ?? n.properties.location;
    if (!bestes || abstand < bestes.abstandM) bestes = { strecke: f.properties.id, km, abstandM: abstand };
  }
  return bestes;
}

/** Zuschauerpunkt, in dessen Fläche die Position liegt (oder null). */
export function zpAnPosition(daten, lon, lat) {
  const p = point([lon, lat]);
  for (const f of daten.geo.zuschauerpunkte.features) {
    if (booleanPointInPolygon(p, f)) return f.properties.id;
  }
  return null;
}

/** Nächster Zuschauerpunkt: { zp, abstandM } (Abstand zum Mittelpunkt) */
export function naechsterZp(daten, lon, lat) {
  let bestes = null;
  for (const z of daten.zp.values()) {
    const a = distance([lon, lat], z.mitte, { units: 'meters' });
    if (!bestes || a < bestes.abstandM) bestes = { zp: z.id, abstandM: a };
  }
  return bestes;
}

/** Abstand in Metern zwischen zwei [lon, lat] */
export function abstandM(a, b) {
  return distance(a, b, { units: 'meters' });
}
