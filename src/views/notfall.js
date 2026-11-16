// Ansicht „Notfall“: 112, eigene Position als WP-Kilometer (offline berechnet)

import { html } from '../app/html.js';
import { icon } from '../app/icons.js';
import { t, feld } from '../app/i18n.js';
import { zustand } from '../app/zustand.js';
import { jetzt } from '../app/uhr.js';
import { zahl } from '../app/format.js';
import { wpZeitStatus } from '../lib/planer.js';
import { naechsteStrecke, naechsterZp } from '../app/ortung.js';
import { standortStarten, standortLaeuft, standortVerfuegbar } from '../app/position.js';
import { toast } from '../app/toast.js';

const AUF_STRECKE_M = 300;

function positionBeschreiben() {
  const d = zustand.daten;
  const p = zustand.position;
  if (!p) return null;
  const s = naechsteStrecke(d, p.lon, p.lat);
  const z = naechsterZp(d, p.lon, p.lat);
  const zp = z ? d.zp.get(z.zp) : null;
  let strecke = null;
  if (s && s.abstandM <= AUF_STRECKE_M) {
    const st = d.strecken.get(s.strecke);
    const nun = jetzt();
    const laufend = st.wps
      .map((id) => d.wp.get(id))
      .find((w) => ['gesperrt', 'laeuft'].includes(wpZeitStatus(d, w.id, nun)?.status));
    const nummern = laufend ? laufend.kurz : st.wps.map((id) => d.wp.get(id).kurz).join('/');
    strecke = {
      text: `${t('wp.abk')} ${nummern} ${feld(st, 'name')}`,
      gesprochen: `${t('notfall.wp_lang', { nr: nummern })} ${feld(st, 'name')}`,
      km: s.km,
    };
  }
  return { p, strecke, zp, zpAbstand: z?.abstandM ?? null };
}

export const notfallAnsicht = {
  tab: 'mehr',
  aktualisierenBei: ['position', 'sprache', 'minute'],
  render() {
    const d = zustand.daten;
    const nr = d.kontakt.notruf || '112';
    const info = positionBeschreiben();
    let positionHtml;
    if (info) {
      const { p, strecke, zp, zpAbstand } = info;
      const ortText = strecke ? t('notfall.auf_strecke', { strecke: strecke.text, km: zahl(strecke.km, 1) }) : t('notfall.nicht_auf_strecke');
      const zpText = zp ? t('notfall.naechster_zp', { zp: `${t('zp.abk')} ${zp.kurz} · ${feld(zp, 'name')}`, m: Math.round(zpAbstand) }) : '';
      const koord = `${Math.abs(p.lat).toFixed(5)}° ${p.lat >= 0 ? 'N' : 'S'}, ${Math.abs(p.lon).toFixed(5)}° ${p.lon >= 0 ? 'E' : 'W'}`;
      const satz = strecke
        ? t('notfall.satz_strecke', { name: d.veranstaltung.kurzname, strecke: strecke.gesprochen, km: zahl(strecke.km, 1), zp: zp && zpAbstand < 500 ? t('notfall.satz_zp', { zp: `${zp.kurz}` }) : '' })
        : t('notfall.satz_koordinaten', { name: d.veranstaltung.kurzname, koord });
      positionHtml = html`<div class="karte-box">
        <span class="kachel-label">${t('notfall.deine_position')}</span>
        <p class="position-gross">${ortText}</p>
        <p class="klein">${zpText}</p>
        <p class="klein mono">${koord} · ${t('notfall.genauigkeit', { m: Math.round(p.genauigkeit) })}</p>
        <button type="button" class="knopf knopf-text" data-aktion="kopieren" data-text="${koord}">${icon('kopieren', 18)} ${t('notfall.kopieren')}</button>
        <div class="vorlesen">
          <span class="kachel-label">${t('notfall.am_telefon')}</span>
          <p>„${satz}“</p>
        </div>
      </div>`;
    } else if (zustand.positionFehler === 1) {
      positionHtml = html`<div class="karte-box"><p>${t('position.verweigert')}</p></div>`;
    } else if (!standortVerfuegbar()) {
      positionHtml = html`<div class="karte-box"><p>${t('position.nicht_verfuegbar')}</p></div>`;
    } else {
      positionHtml = html`<div class="karte-box">
        <p>${standortLaeuft() ? t('notfall.suche_position') : t('notfall.position_tipp')}</p>
        ${standortLaeuft() ? '' : html`<button type="button" class="knopf knopf-dunkel" data-aktion="orten">${icon('orten', 18)} ${t('notfall.position_ermitteln')}</button>`}
      </div>`;
    }
    return html`<div class="notfall">
      <header class="notfall-kopf">
        <a class="knopf-rund hell" href="#/mehr" data-aktion="zurueck" aria-label="${t('allg.zurueck')}">${icon('zurueck', 24)}</a>
        <h1>${t('notfall.titel')}</h1>
        <p>${t('notfall.unter')}</p>
      </header>
      <div class="seite">
        <a class="notruf-knopf" href="tel:${nr}">${icon('telefon', 30)}<span>${t('notfall.anrufen', { nr })}</span></a>
        ${positionHtml}
        <section>
          <h2 class="abschnitt">${t('notfall.bei_unfall')}</h2>
          <ol class="schritte-liste">
            ${['1', '2', '3', '4'].map((n) => html`<li><span class="schritt-nr">${n}</span><span>${t(`notfall.schritt${n}`)}</span></li>`)}
          </ol>
        </section>
      </div>
    </div>`;
  },
  nachRender() {
    if (standortVerfuegbar() && !standortLaeuft() && zustand.positionFehler !== 1) standortStarten();
  },
  aktionen: {
    orten: () => standortStarten(),
    kopieren: async (el) => {
      try {
        await navigator.clipboard.writeText(el.dataset.text);
        toast(t('notfall.kopiert'));
      } catch {
        toast(el.dataset.text, { dauer: 10000 });
      }
    },
  },
};
