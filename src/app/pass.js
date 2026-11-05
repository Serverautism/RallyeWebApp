// Zuschauerpass: Stempel per GPS, wenn man einige Minuten an einem Punkt war.
// Gespeichert nur auf diesem Gerät.

import { zustand, abonnieren, melden } from './zustand.js';
import { stempel, stempelSetzen } from './meine.js';
import { zpAnPosition, abstandM } from './ortung.js';
import { jetzt } from './uhr.js';
import { t, feld } from './i18n.js';
import { toast } from './toast.js';

/** Alle Stempel-Stationen: Zuschauerpunkte + Orte mit stempel = ja */
export function stationen() {
  const d = zustand.daten;
  if (!d) return [];
  return [
    ...[...d.zp.values()].map((z) => ({ id: z.id, art: 'zp', kurz: z.kurz, name: feld(z, 'name') })),
    ...[...d.ort.values()]
      .filter((o) => o.stempel)
      .map((o) => ({ id: o.id, art: 'ort', kurz: o.id.slice(0, 2), name: feld(o, 'name') })),
  ];
}

// Seit wann ist man an welcher Station? (nur im Arbeitsspeicher)
const seit = new Map();

export function aufenthalt() {
  const [id, start] = [...seit.entries()][0] || [];
  return id ? { id, seitMs: Date.now() - start } : null;
}

function pruefen() {
  const d = zustand.daten;
  const p = zustand.position;
  if (!d || !p) {
    seit.clear();
    return;
  }
  const vorhanden = stempel();
  let hier = zpAnPosition(d, p.lon, p.lat);
  if (!hier) {
    for (const o of d.ort.values()) {
      if (o.stempel && abstandM([p.lon, p.lat], o.lage) <= (d.pass.radiusM ?? 75)) {
        hier = o.id;
        break;
      }
    }
  }
  for (const id of [...seit.keys()]) if (id !== hier) seit.delete(id);
  if (!hier || vorhanden[hier]) return;
  if (!seit.has(hier)) {
    seit.set(hier, Date.now());
    melden('pass');
    return;
  }
  const minuten = (Date.now() - seit.get(hier)) / 60000;
  if (minuten >= (d.pass.verweildauerMin ?? 5)) {
    if (stempelSetzen(hier, jetzt())) {
      const st = stationen().find((s) => s.id === hier);
      toast(t('pass.gestempelt', { name: st?.name ?? hier }), { dauer: 8000 });
    }
    seit.delete(hier);
  }
  melden('pass');
}

export function passStarten() {
  abonnieren((was) => {
    if (was === 'position') pruefen();
  });
  setInterval(pruefen, 20000);
}
