// Ansicht „Zeitplan“ mit Sperrzeiten, Live-Status und Meldungen

import { html } from '../app/html.js';
import { icon } from '../app/icons.js';
import { t, feld } from '../app/i18n.js';
import { zustand } from '../app/zustand.js';
import { jetzt } from '../app/uhr.js';
import { zeit, zeitMitTag, km, wpKurz, datumUndZeit, relativ } from '../app/format.js';
import { planEintraege, planFuerTag } from '../app/meine.js';
import { seitenKopf, tagReiter, standardTag, statusPlakette, statusHinweis, leer } from './teile.js';

function meldungen() {
  const s = zustand.status;
  if (!s) return '';
  const liste = s.meldungen || [];
  const stand = s.stand ?? s.abgerufen;
  if (!liste.length) return '';
  return html`<section class="meldungen" aria-label="${t('zeitplan.meldungen')}">
    ${liste.slice(0, 5).map(
      (m) => html`<div class="meldung ${m.wichtig ? 'wichtig' : ''}">
        ${icon(m.wichtig ? 'warnung' : 'info', 18)}
        <div><p>${feld(m, 'text')}</p>${m.zeit ? html`<span class="klein">${zeitMitTag(m.zeit)}</span>` : ''}</div>
      </div>`,
    )}
    ${stand ? html`<span class="klein stand">${t('status.stand', { zeit: datumUndZeit(stand) })}</span>` : ''}
  </section>`;
}

/** Karte „Spätestens … losfahren“ für den nächsten Punkt im Tagesplan */
function naechsterPlanHinweis(tagId) {
  const d = zustand.daten;
  const { schritte } = planFuerTag(tagId);
  const nun = jetzt();
  const n = schritte.find((s) => s.ankunftSpaetestens > nun || s.erster > nun);
  if (!n) return '';
  const zp = d.zp.get(n.zp);
  const wp = d.wp.get(n.wp);
  const titel = n.abfahrtSpaetestens
    ? t('zeitplan.spaetestens_los', { zeit: zeit(n.abfahrtSpaetestens), rel: relativ(n.abfahrtSpaetestens, nun) })
    : t('zeitplan.spaetestens_da', { zeit: zeit(n.ankunftSpaetestens), p: zp.parkplatz });
  const zufahrt = n.schliesstWegen
    ? t('zeitplan.zufahrt_schliesst', { p: zp.parkplatz, zeit: zeit(n.ankunftSpaetestens) })
    : t('zeitplan.zufahrt_frei', { p: zp.parkplatz });
  return html`<a class="hinweis-dunkel" href="#/planer/${tagId}">
    <span class="hinweis-label">${t('zeitplan.sperrhinweis')}</span>
    <span class="hinweis-titel">${titel}</span>
    <span class="hinweis-text">${t('zeitplan.naechster_punkt', { zp: `${t('zp.abk')} ${zp.kurz} · ${feld(zp, 'name')}`, wp: wpKurz(wp) })} ${zufahrt}${n.fahrMin ? ` ${t('zeitplan.fahrzeit', { min: n.fahrMin })}` : ''}</span>
    <span class="hinweis-link">${t('zeitplan.zum_plan')}</span>
  </a>`;
}

function eintrag(z, wpImPlan, nun) {
  const d = zustand.daten;
  if (z.wp) {
    const wp = d.wp.get(z.wp);
    const s = d.strecken.get(wp.strecke);
    const vorbei = nun > wp.sperrBis;
    return html`<div class="zeile ${vorbei ? 'vorbei' : ''} ${wpImPlan.has(wp.id) ? 'im-plan' : ''}">
      <div class="zeile-zeit"><span class="zeit-gross">${zeit(wp.erstesAuto)}</span><span class="zeit-label">${t('zeitplan.erstes_auto')}</span></div>
      <div class="zeile-inhalt">
        <div class="zeile-titel"><a href="#/karte/strecke/${s.id}">${wpKurz(wp)} · ${feld(wp, 'name')}</a> ${statusPlakette(wp.id)}
          ${wpImPlan.has(wp.id) ? html`<span class="plakette plakette-akzent">${t('zeitplan.in_plan')}</span>` : ''}</div>
        <span class="zeile-unter">${km(wp.laengeKm)}${feld(s, 'belag') ? ` · ${feld(s, 'belag')}` : ''}</span>
        <span class="zeile-sperrung">${t('zeitplan.gesperrt', { von: zeit(wp.sperrVon), bis: zeit(wp.sperrBis) })}</span>
        ${statusHinweis(wp.id)}
      </div>
    </div>`;
  }
  const ort = z.ort ? d.ort.get(z.ort) : null;
  const ortText = feld(z, 'ort') || (ort ? feld(ort, 'name') : '');
  const vorbei = nun > (z.bis ?? z.von + 30 * 60000);
  return html`<div class="zeile zeile-neben ${vorbei ? 'vorbei' : ''}">
    <div class="zeile-zeit"><span class="zeit-gross">${zeit(z.von)}</span><span class="zeit-label">${z.bis ? t('zeitplan.bis', { zeit: zeit(z.bis) }) : ''}</span></div>
    <div class="zeile-inhalt">
      <div class="zeile-titel">${feld(z, 'titel')}</div>
      ${ortText ? html`<span class="zeile-unter">${ort ? html`<a href="#/karte/ort/${ort.id}">${ortText}</a>` : ortText}</span>` : ''}
    </div>
  </div>`;
}

export const zeitplanAnsicht = {
  tab: 'zeitplan',
  aktualisierenBei: ['status', 'plan', 'minute', 'sprache'],
  render([tagParam]) {
    const d = zustand.daten;
    const tagId = d.tage.some((x) => x.id === tagParam) ? tagParam : standardTag();
    const nun = jetzt();
    const wpImPlan = new Set(planEintraege().map((e) => e.wp));
    const liste = d.zeitplan.filter((z) => z.tag === tagId);
    return html`<div class="seite">
      ${seitenKopf(t('tab.zeitplan'), { unterzeile: t('allg.datenstand', { zeit: datumUndZeit(d.erstellt) }) })}
      ${tagReiter(tagId, 'zeitplan')}
      ${meldungen()}
      ${naechsterPlanHinweis(tagId)}
      <div class="zeilen">${liste.length ? liste.map((z) => eintrag(z, wpImPlan, nun)) : leer(t('zeitplan.leer'))}</div>
    </div>`;
  },
};
