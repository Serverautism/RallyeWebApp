// Links für die Zielführung (Auto) zu einer Koordinate – ohne Abhängigkeit vom Browser, auch für Tests.
// lage = [Längengrad, Breitengrad]

const ziel = ([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`;

export function googleMapsUrl(lage) {
  return `https://www.google.com/maps/dir/?api=1&destination=${ziel(lage)}&travelmode=driving`;
}

/**
 * Apple Karten. Seit iOS/iPadOS/macOS 18.4 gibt es „Unified Maps URLs“ (…/directions?destination=…);
 * ältere Geräte verstehen nur das alte Format (?daddr=…&dirflg=d).
 */
export function appleKartenUrl(lage, neuesFormat = true) {
  return neuesFormat
    ? `https://maps.apple.com/directions?destination=${ziel(lage)}&mode=driving`
    : `https://maps.apple.com/?daddr=${ziel(lage)}&dirflg=d`;
}

const mindestens = (major, minor, wunschMajor, wunschMinor) => major > wunschMajor || (major === wunschMajor && minor >= wunschMinor);

/** Versteht das Gerät die neuen Apple-Karten-Links (Version 18.4 oder neuer)? */
export function appleNeuesFormat(ua) {
  // Safari nennt seine Version („Version/18.4“, ab iOS 26 „Version/26.0“) – sie passt zur Betriebssystem-Version
  const safari = /Version\/(\d+)\.(\d+)/.exec(ua);
  if (safari) return mindestens(Number(safari[1]), Number(safari[2]), 18, 4);
  // Andere Browser auf iPhone/iPad (z. B. Chrome) nennen die iOS-Version
  const ios = /(?:iPhone|CPU) OS (\d+)_(\d+)/.exec(ua);
  if (ios) return mindestens(Number(ios[1]), Number(ios[2]), 18, 4);
  return true;
}

/** iPhone, iPad oder Mac? (iPads melden sich teils als „Macintosh“ mit Touchscreen) */
export function istAppleGeraet(ua, plattform = '', beruehrungspunkte = 0) {
  return /iPhone|iPad|iPod|Macintosh/.test(ua) || (plattform === 'MacIntel' && beruehrungspunkte > 1);
}
