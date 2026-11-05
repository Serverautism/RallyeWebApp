// Erzeugt eine iCalendar-Datei (RFC 5545) für den Tagesplan.

const CRLF = '\r\n';

function zweistellig(n) {
  return String(n).padStart(2, '0');
}

/** ms → "20270529T071200Z" */
export function icsZeit(ms) {
  const d = new Date(ms);
  return (
    d.getUTCFullYear() +
    zweistellig(d.getUTCMonth() + 1) +
    zweistellig(d.getUTCDate()) +
    'T' +
    zweistellig(d.getUTCHours()) +
    zweistellig(d.getUTCMinutes()) +
    zweistellig(d.getUTCSeconds()) +
    'Z'
  );
}

/** Text maskieren: \ ; , und Zeilenumbrüche */
export function icsText(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Zeilen auf höchstens 75 Bytes (UTF-8) falten, ohne Mehrbyte-Zeichen zu zerteilen. */
export function icsFalten(zeile) {
  const enc = new TextEncoder();
  if (enc.encode(zeile).length <= 75) return zeile;
  const teile = [];
  let aktuell = '';
  let bytes = 0;
  let grenze = 75;
  for (const zeichen of zeile) {
    const b = enc.encode(zeichen).length;
    if (bytes + b > grenze) {
      teile.push(aktuell);
      aktuell = '';
      bytes = 0;
      grenze = 74; // Folgezeilen beginnen mit einem Leerzeichen
    }
    aktuell += zeichen;
    bytes += b;
  }
  teile.push(aktuell);
  return teile.join(CRLF + ' ');
}

/**
 * @param {{name:string, ereignisse:{uid:string,start:number,ende:number,titel:string,ort?:string,beschreibung?:string,geo?:[number,number],erinnerungMin?:number}[], jetzt?:number}} p
 */
export function icsErzeugen({ name, ereignisse, jetzt = Date.now() }) {
  const z = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rallye Zuschauer-App//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`,
  ];
  for (const e of ereignisse) {
    z.push('BEGIN:VEVENT');
    z.push(`UID:${icsText(e.uid)}`);
    z.push(`DTSTAMP:${icsZeit(jetzt)}`);
    z.push(`DTSTART:${icsZeit(e.start)}`);
    z.push(`DTEND:${icsZeit(Math.max(e.ende, e.start + 60000))}`);
    z.push(`SUMMARY:${icsText(e.titel)}`);
    if (e.ort) z.push(`LOCATION:${icsText(e.ort)}`);
    if (e.beschreibung) z.push(`DESCRIPTION:${icsText(e.beschreibung)}`);
    if (e.geo) z.push(`GEO:${e.geo[1].toFixed(6)};${e.geo[0].toFixed(6)}`);
    if (e.erinnerungMin && e.erinnerungMin > 0) {
      z.push('BEGIN:VALARM');
      z.push('ACTION:DISPLAY');
      z.push(`DESCRIPTION:${icsText(e.titel)}`);
      z.push(`TRIGGER:-PT${Math.round(e.erinnerungMin)}M`);
      z.push('END:VALARM');
    }
    z.push('END:VEVENT');
  }
  z.push('END:VCALENDAR');
  return z.map(icsFalten).join(CRLF) + CRLF;
}
