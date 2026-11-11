// Welche Sprache zeigt die App beim ersten Öffnen?
//   • Standard ist Deutsch.
//   • Lässt sich die Systemsprache lesen, entscheidet sie: Deutsch → Deutsch, jede andere Sprache → Englisch.
//   • Nennt das Gerät mehrere Sprachen (z. B. Französisch, dann Deutsch), zählt die erste von Deutsch/Englisch.
// Eine im Menü gewählte Sprache hat immer Vorrang (siehe app/i18n.js).

/**
 * @param {string[]} systemSprachen z. B. navigator.languages (["de-AT", "en-US"])
 * @returns {'de'|'en'}
 */
export function startSprache(systemSprachen) {
  const kuerzel = (Array.isArray(systemSprachen) ? systemSprachen : [])
    .map((s) => String(s ?? '').trim().slice(0, 2).toLowerCase())
    .filter((s) => /^[a-z]{2}$/.test(s));
  if (!kuerzel.length) return 'de';
  return kuerzel.find((s) => s === 'de' || s === 'en') ?? 'en';
}
