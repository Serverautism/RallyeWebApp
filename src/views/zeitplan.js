// Ansicht „Zeitplan“ mit Sperrzeiten und dem Stand laut Zeitplan („Jetzt“ / „Als Nächstes“)

import { html } from '../app/html.js';
import { t, feld } from '../app/i18n.js';
import { zustand } from '../app/zustand.js';
import { jetzt } from '../app/uhr.js';
import { zeit, zeitMitTag, km, wpKurz, datumUndZeit, relativ } from '../app/format.js';
import { planEintraege, planFuerTag } from '../app/meine.js';
import { seitenKopf, tagReiter, standardTag, statusPlakette, statusHinweis, wpStatus, sperrzeitText, zufahrtText, leer } from './teile.js';

// Ein Programmpunkt ohne Endzeit gilt so lange als „jetzt“
const OHNE_ENDE_MS = 30 * 60000;
// „Als Nächstes“ nur zeigen, wenn es bald so weit ist (vor der Veranstaltung genügt die Liste)
const NAECHSTES_FENSTER_MS = 12 * 3600000;

function titelVon(z) {
  const d = zustand.daten;
  if (z.wp) {
    const wp = d.wp.get(z.wp);
    return `${wpKurz(wp)} · ${feld(wp, 'name')}`;
  }
  return feld(z, 'titel');
}

/** Was läuft gerade und was kommt als Nächstes – allein aus dem Zeitplan berechnet. */
function jetztKasten(nun) {
  const d = zustand.daten;
  const laufend = [];
  let naechstes = null;
  for (const z of d.zeitplan) {
    if (z.wp) {
      const s = wpStatus(z.wp);
      if (s.status === 'laeuft') laufend.push(html`<li><strong>${titelVon(z)}</strong> ${t('zeitplan.jetzt_wp', { zeit: zeit(s.ende) })}</li>`);
    } else if (z.von <= nun && nun < (z.bis ?? z.von + OHNE_ENDE_MS)) {
      laufend.push(html`<li><strong>${titelVon(z)}</strong>${z.bis ? ` ${t('zeitplan.jetzt_bis', { zeit: zeit(z.bis) })}` : ''}</li>`);
    }
    if (z.von > nun && (!naechstes || z.von < naechstes.von)) naechstes = z;
  }
  const naechstesBald = naechstes && naechstes.von - nun <= NAECHSTES_FENSTER_MS ? naechstes : null;
  if (!laufend.length && !naechstesBald) return '';
  return html`<section class="jetzt-kasten" aria-label="${t('zeitplan.jetzt_titel')}">
    ${laufend.length
      ? html`<span class="hinweis-label">${t('zeitplan.jetzt_titel')}</span><ul class="jetzt-liste">${laufend}</ul>`
      : ''}
    ${naechstesBald
      ? html`<p class="jetzt-naechstes"><span class="hinweis-label">${t('zeitplan.als_naechstes')}</span>
          <span><strong>${zeitMitTag(naechstesBald.von)}</strong> ${titelVon(naechstesBald)} (${relativ(naechstesBald.von, nun)})</span></p>`
      : ''}
    <span class="jetzt-hinweis">${t('status.laut_zeitplan')}</span>
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
    : zp.parkplatz
      ? t('zeitplan.spaetestens_da', { zeit: zeit(n.ankunftSpaetestens), p: zp.parkplatz })
      : t('zeitplan.erstes_auto_um', { zeit: zeit(n.erster) });
  const zufahrt = !zp.parkplatz
    ? t('zeitplan.ohne_parkplatz')
    : n.schliesstWegen
      ? t('zeitplan.zufahrt_schliesst', { p: zp.parkplatz, zeit: zeit(n.ankunftSpaetestens) })
      : zufahrtText(zp.parkplatz).art === 'warnung'
        ? zufahrtText(zp.parkplatz).text
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
    const vorbei = wp.sperrBis !== null ? nun > wp.sperrBis : wpStatus(wp.id).status === 'beendet';
    return html`<div class="zeile ${vorbei ? 'vorbei' : ''} ${wpImPlan.has(wp.id) ? 'im-plan' : ''}">
      <div class="zeile-zeit"><span class="zeit-gross">${zeit(wp.erstesAuto)}</span><span class="zeit-label">${t('zeitplan.erstes_auto')}</span></div>
      <div class="zeile-inhalt">
        <div class="zeile-titel"><a href="#/karte/strecke/${s.id}">${wpKurz(wp)} · ${feld(wp, 'name')}</a> ${statusPlakette(wp.id)}
          ${wpImPlan.has(wp.id) ? html`<span class="plakette plakette-akzent">${t('zeitplan.in_plan')}</span>` : ''}</div>
        <span class="zeile-unter">${[wp.laengeUnsicher ? '' : km(wp.laengeKm), feld(s, 'belag')].filter(Boolean).join(' · ')}</span>
        <span class="zeile-sperrung">${sperrzeitText(wp, 'zeitplan.gesperrt')}</span>
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
  aktualisierenBei: ['plan', 'minute', 'sprache'],
  render([tagParam]) {
    const d = zustand.daten;
    const tagId = d.tage.some((x) => x.id === tagParam) ? tagParam : standardTag();
    const nun = jetzt();
    const wpImPlan = new Set(planEintraege().map((e) => e.wp));
    const liste = d.zeitplan.filter((z) => z.tag === tagId);
    return html`<div class="seite">
      ${seitenKopf(t('tab.zeitplan'), { unterzeile: t('allg.datenstand', { zeit: datumUndZeit(d.erstellt) }) })}
      ${tagReiter(tagId, 'zeitplan')}
      ${jetztKasten(nun)}
      ${naechsterPlanHinweis(tagId)}
      <div class="zeilen">${liste.length ? liste.map((z) => eintrag(z, wpImPlan, nun)) : leer(t('zeitplan.leer'))}</div>
    </div>`;
  },
};
