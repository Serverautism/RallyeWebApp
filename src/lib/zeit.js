// Zeitzonen-Hilfen ohne externe Bibliothek (nutzt Intl).
// Alle Zeiten der Veranstaltung werden lokal eingegeben (z. B. "09:12" am 29.05.2027)
// und in echte Zeitpunkte (UTC-Millisekunden) umgerechnet – inklusive Sommer-/Winterzeit.

const formatiererCache = new Map();

function teileFormatierer(zeitzone) {
  let f = formatiererCache.get(zeitzone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zeitzone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatiererCache.set(zeitzone, f);
  }
  return f;
}

/** Wandkalender-Teile eines Zeitpunkts in der Zeitzone. */
export function lokaleTeile(utcMs, zeitzone) {
  const teile = {};
  for (const p of teileFormatierer(zeitzone).formatToParts(new Date(utcMs))) teile[p.type] = p.value;
  return {
    jahr: Number(teile.year),
    monat: Number(teile.month),
    tag: Number(teile.day),
    stunde: Number(teile.hour) % 24,
    minute: Number(teile.minute),
    sekunde: Number(teile.second),
  };
}

/** Versatz der Zeitzone zu UTC in Minuten zum Zeitpunkt utcMs (z. B. +120 im Sommer). */
export function versatzMinuten(utcMs, zeitzone) {
  const t = lokaleTeile(utcMs, zeitzone);
  const alsUtc = Date.UTC(t.jahr, t.monat - 1, t.tag, t.stunde, t.minute, t.sekunde);
  return Math.round((alsUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** Prüft, ob die Zeitzone gültig ist. */
export function istGueltigeZeitzone(zeitzone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zeitzone });
    return true;
  } catch {
    return false;
  }
}

/** "2027-05-29" → {jahr, monat, tag} oder null */
export function parseDatum(datum) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(datum ?? '').trim());
  if (!m) return null;
  const jahr = Number(m[1]);
  const monat = Number(m[2]);
  const tag = Number(m[3]);
  const d = new Date(Date.UTC(jahr, monat - 1, tag));
  if (d.getUTCFullYear() !== jahr || d.getUTCMonth() !== monat - 1 || d.getUTCDate() !== tag) return null;
  return { jahr, monat, tag };
}

/** "9:05", "09:05", "09:05:00", "9.05" → {stunde, minute} oder null */
export function parseUhrzeit(wert) {
  const m = /^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/.exec(String(wert ?? '').trim());
  if (!m) return null;
  const stunde = Number(m[1]);
  const minute = Number(m[2]);
  if (stunde > 23 || minute > 59 || (m[3] !== undefined && Number(m[3]) > 59)) return null;
  return { stunde, minute };
}

/** Lokale Wandzeit (Datum + Uhrzeit in der Zeitzone) → UTC-Millisekunden. */
export function lokalZuUtcMs(datum, uhrzeit, zeitzone) {
  const d = typeof datum === 'string' ? parseDatum(datum) : datum;
  const u = typeof uhrzeit === 'string' ? parseUhrzeit(uhrzeit) : uhrzeit;
  if (!d || !u) return null;
  const naiv = Date.UTC(d.jahr, d.monat - 1, d.tag, u.stunde, u.minute);
  let v = versatzMinuten(naiv, zeitzone);
  let utc = naiv - v * 60000;
  const v2 = versatzMinuten(utc, zeitzone);
  if (v2 !== v) utc = naiv - v2 * 60000;
  return utc;
}

const zwei = (n) => String(n).padStart(2, '0');

/** UTC-Millisekunden → "2027-05-29T09:12:00+02:00" */
export function isoMitVersatz(utcMs, zeitzone) {
  const t = lokaleTeile(utcMs, zeitzone);
  const v = versatzMinuten(utcMs, zeitzone);
  const vz = v >= 0 ? '+' : '-';
  const va = Math.abs(v);
  return `${t.jahr}-${zwei(t.monat)}-${zwei(t.tag)}T${zwei(t.stunde)}:${zwei(t.minute)}:${zwei(t.sekunde)}${vz}${zwei(Math.floor(va / 60))}:${zwei(va % 60)}`;
}

/** UTC-Millisekunden → "2027-05-29" in der Zeitzone */
export function lokalesDatum(utcMs, zeitzone) {
  const t = lokaleTeile(utcMs, zeitzone);
  return `${t.jahr}-${zwei(t.monat)}-${zwei(t.tag)}`;
}

/** UTC-Millisekunden → "09:12" in der Zeitzone */
export function uhrzeitText(utcMs, zeitzone) {
  if (utcMs === null || utcMs === undefined || Number.isNaN(utcMs)) return '–';
  const t = lokaleTeile(utcMs, zeitzone);
  return `${zwei(t.stunde)}:${zwei(t.minute)}`;
}

/** Dauer in Minuten (gerundet) zwischen zwei Zeitpunkten */
export function minutenZwischen(a, b) {
  return Math.round((b - a) / 60000);
}
