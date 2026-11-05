// Geräte-Funktionen: Signalton, Vibration, Bildschirm anlassen, Speicher dauerhaft machen.

let audio = null;

/** Muss einmal nach einer Nutzeraktion aufgerufen werden (Browser-Regel für Töne). */
export function tonVorbereiten() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audio) audio = new Ctx();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    audio = null;
  }
}

export function signalton() {
  if (!audio || audio.state !== 'running') return;
  const start = audio.currentTime;
  for (const [i, frequenz] of [880, 1175].entries()) {
    const osc = audio.createOscillator();
    const lautst = audio.createGain();
    osc.frequency.value = frequenz;
    osc.connect(lautst);
    lautst.connect(audio.destination);
    const t0 = start + i * 0.28;
    lautst.gain.setValueAtTime(0.0001, t0);
    lautst.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02);
    lautst.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
    osc.start(t0);
    osc.stop(t0 + 0.25);
  }
}

export function vibrieren() {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* nicht unterstützt */
  }
}

// ---- Bildschirm anlassen (Wake Lock) -------------------------------------------
let sperre = null;
let gewuenscht = false;

export const wachhaltenVerfuegbar = () => 'wakeLock' in navigator;

async function anfordern() {
  if (!gewuenscht || !wachhaltenVerfuegbar() || document.visibilityState !== 'visible') return;
  try {
    sperre = await navigator.wakeLock.request('screen');
    sperre.addEventListener('release', () => {
      sperre = null;
    });
  } catch {
    sperre = null;
  }
}

export function wachhalten(an) {
  gewuenscht = an;
  if (an) anfordern();
  else if (sperre) {
    sperre.release().catch(() => {});
    sperre = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && gewuenscht && !sperre) anfordern();
});

/** Bittet den Browser, die Offline-Daten nicht automatisch zu löschen. */
export async function speicherDauerhaft() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function speicherBelegt() {
  try {
    const s = await navigator.storage?.estimate?.();
    return s ? { belegt: s.usage ?? 0, frei: s.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
