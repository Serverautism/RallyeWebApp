// Kachel-Mathematik (Web-Mercator, XYZ-Schema) für das Vorladen der Offline-Region.

export function lonZuX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

export function latZuY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

/**
 * Alle Kacheln, die ein Rechteck [minLon, minLat, maxLon, maxLat] von Zoom zMin bis zMax abdecken.
 * @returns {{z:number,x:number,y:number}[]}
 */
export function kachelnFuerRegion(region, zMin, zMax) {
  const [minLon, minLat, maxLon, maxLat] = region;
  const liste = [];
  for (let z = zMin; z <= zMax; z++) {
    const max = 2 ** z - 1;
    const x0 = Math.max(0, lonZuX(minLon, z));
    const x1 = Math.min(max, lonZuX(maxLon, z));
    const y0 = Math.max(0, latZuY(maxLat, z));
    const y1 = Math.min(max, latZuY(minLat, z));
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) liste.push({ z, x, y });
  }
  return liste;
}

export function anzahlKacheln(region, zMin, zMax) {
  return kachelnFuerRegion(region, zMin, zMax).length;
}

/** Setzt {z}/{x}/{y} in eine URL-Vorlage ein (unterstützt auch {-y} bzw. scheme "tms"). */
export function kachelUrl(vorlage, { z, x, y }, schema = 'xyz') {
  const yy = schema === 'tms' ? 2 ** z - 1 - y : y;
  return vorlage
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(yy))
    .replace('{-y}', String(2 ** z - 1 - y));
}
