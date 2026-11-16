// Ansicht „Steckbrief Zuschauerpunkt“

import { html } from '../app/html.js';
import { icon } from '../app/icons.js';
import { t, feld } from '../app/i18n.js';
import { zustand } from '../app/zustand.js';
import { jetzt } from '../app/uhr.js';
import { zeit, zeitMitTag, wpKurz, zahl } from '../app/format.js';
import { basisUrl } from '../app/datenlader.js';
import { imPlan, planUmschalten } from '../app/meine.js';
import { toast } from '../app/toast.js';
import { durchfahrt, sperrIntervalle, spaetesteDurchfahrt } from '../lib/planer.js';
import { navigationsKnopf, statusPlakette, statusHinweis, sperrzeitText, leer } from './teile.js';

const JA_NEIN = { ja: 'allg.ja', nein: 'allg.nein', teilweise: 'allg.teilweise' };

/** Hinweis zur nächsten Durchfahrt: Wann muss man spätestens los? */
function abfahrtHinweis(zp) {
  const d = zustand.daten;
  const nun = jetzt();
  const kommende = d.strecken
    .get(zp.strecke)
    .wps.map((id) => ({ wp: d.wp.get(id), df: durchfahrt(d, zp.id, id) }))
    .filter((x) => x.df.letzter > nun)
    .sort((a, b) => a.df.erster - b.df.erster);
  const n = kommende[0];
  if (!n) return '';
  if (n.df.erster <= nun) {
    return html`<div class="hinweis-karte hinweis-gruen">${icon('stoppuhr', 22)}
      <div><strong>${t('zp.laeuft_gerade', { wp: wpKurz(n.wp) })}</strong>
      <span>${t('zp.laeuft_text', { erster: zeit(n.df.erster), letzter: zeit(n.df.letzter) })}</span></div></div>`;
  }
  const p = zp.parkplatz ? d.ort.get(zp.parkplatz) : null;
  if (!p) {
    // Ohne Parkplatz lässt sich keine Anfahrt berechnen – nur die Zeiten nennen.
    const zeilen = [];
    if (n.wp.sperrVon !== null) zeilen.push(t('zp.strassen_zu_ab', { zeit: zeitMitTag(n.wp.sperrVon) }));
    zeilen.push(t('zp.ohne_parkplatz_text'));
    return html`<div class="hinweis-karte hinweis-orange">${icon('uhr', 22)}
      <div><strong>${t('zp.erstes_auto_um', { zeit: zeitMitTag(n.df.erster) })}</strong><span>${zeilen.join(' ')}</span>
      <span class="klein">${t('zp.fuer_wp', { wp: wpKurz(n.wp) })}</span></div></div>`;
  }
  const zufahrt = sperrIntervalle(d, p.id);
  const s = spaetesteDurchfahrt(zufahrt, n.df.erster - (zp.fusswegMin || 0) * 60000);
  const start = d.ort.get(d.planerStart);
  const fahr = d.fahrzeit(d.planerStart, p.id);
  const zeilen = [];
  if (s.grund) zeilen.push(t('zp.zufahrt_schliesst', { p: p.id, zeit: zeit(s.zeit), wp: wpKurz(d.wp.get(s.grund.wp)) }));
  else if (zp.fusswegMin !== null) zeilen.push(t('zp.am_parkplatz_sein', { p: p.id, zeit: zeit(s.zeit), min: zp.fusswegMin }));
  else zeilen.push(t('zp.am_parkplatz_plus_fussweg', { p: p.id, zeit: zeit(s.zeit) }));
  if (fahr !== null && start) zeilen.push(t('zp.fahrzeit_von', { ort: feld(start, 'name'), min: fahr }));
  const titel =
    fahr !== null && start
      ? t('zp.spaetestens_los', { zeit: zeitMitTag(s.zeit - fahr * 60000) })
      : t('zp.spaetestens_da', { zeit: zeitMitTag(s.zeit), p: p.id });
  return html`<div class="hinweis-karte hinweis-orange">${icon('uhr', 22)}
    <div><strong>${titel}</strong><span>${zeilen.join(' ')}</span>
    <span class="klein">${t('zp.fuer_wp', { wp: wpKurz(n.wp) })}</span></div></div>`;
}

export const zuschauerpunktAnsicht = {
  tab: 'karte',
  aktualisierenBei: ['plan', 'minute', 'sprache'],
  render([id]) {
    const d = zustand.daten;
    const zp = d.zp.get(id);
    if (!zp) return html`<div class="seite">${leer(t('allg.nicht_gefunden'))}<a class="knopf knopf-dunkel" href="#/karte">${t('tab.karte')}</a></div>`;
    const s = d.strecken.get(zp.strecke);
    const p = zp.parkplatz ? d.ort.get(zp.parkplatz) : null;
    const blockiert = p ? sperrIntervalle(d, p.id).length > 0 : false;
    const zpZiel = `${t('zp.abk')} ${zp.kurz} · ${feld(zp, 'name')}`;
    return html`<div class="steckbrief">
      <div class="foto ${zp.foto ? '' : 'foto-platzhalter'}">
        ${zp.foto ? html`<img src="${new URL(`daten/${zp.foto}`, basisUrl()).href}" alt="${feld(zp, 'name')}" loading="lazy">` : html`<span>${t('zp.kein_foto')}</span>`}
        <a class="knopf-rund schwebend" href="#/karte/zp/${zp.id}" data-aktion="zurueck" aria-label="${t('allg.zurueck')}">${icon('zurueck', 24)}</a>
      </div>
      <div class="seite">
        <div class="titel-mit-nummer">
          <span class="zp-nummer gross">${zp.kurz}</span>
          <div>
            <h1 class="seiten-titel">${feld(zp, 'name')}</h1>
            <span class="seiten-unterzeile">${t('zp.voll')} ${zp.kurz} · ${t('wp.abk')} ${s.wps.map((w) => d.wp.get(w).kurz).join('/')} ${feld(s, 'name')}</span>
          </div>
        </div>
        ${abfahrtHinweis(zp)}
        <div class="raster-2">
          <div class="kachel"><span class="kachel-label">${p ? t('zp.fussweg_ab_label', { p: p.id }) : t('zp.fussweg')}</span>
            <span class="kachel-wert">${p && (zp.fusswegM || zp.fusswegMin !== null)
              ? `${zp.fusswegM ? `${zahl(zp.fusswegM / 1000, 1)} km` : ''}${zp.fusswegM && zp.fusswegMin !== null ? ' · ' : ''}${zp.fusswegMin !== null ? `${zp.fusswegMin} min` : ''}`
              : '–'}</span>
            ${p ? '' : html`<span class="kachel-unter">${t('zp.kein_parkplatz')}</span>`}
            ${zp.hoehenmeter ? html`<span class="kachel-unter">+${zp.hoehenmeter} ${t('zp.hoehenmeter')}</span>` : ''}</div>
          <div class="kachel"><span class="kachel-label">${t('zp.untergrund')}</span><span class="kachel-wert">${feld(zp, 'untergrund') || '–'}</span></div>
          <div class="kachel"><span class="kachel-label">${t('zp.barrierefrei')}</span>
            <span class="kachel-wert ${zp.barrierefrei === 'nein' ? 'text-rot' : ''}">${zp.barrierefrei ? t(JA_NEIN[zp.barrierefrei]) : '–'}</span>
            ${zp.kinderwagen ? html`<span class="kachel-unter">${t('zp.kinderwagen')}: ${t(JA_NEIN[zp.kinderwagen])}</span>` : ''}</div>
          <div class="kachel"><span class="kachel-label">${t('zp.versorgung')}</span><span class="kachel-wert klein-wert">${feld(zp, 'versorgung') || '–'}</span></div>
        </div>
        ${feld(zp, 'beschreibung') ? html`<section><h2 class="abschnitt">${t('zp.was_siehst_du')}</h2><p class="fliesstext">${feld(zp, 'beschreibung')}</p></section>` : ''}
        <section>
          <h2 class="abschnitt">${t('zp.durchfahrten')}</h2>
          <div class="tabelle">
            ${s.wps.map((wid) => {
              const w = d.wp.get(wid);
              const df = durchfahrt(d, zp.id, wid);
              const drin = imPlan(zp.id, wid);
              return html`<div class="tabelle-zeile">
                <div class="tabelle-haupt">
                  <span class="tabelle-titel"><strong>${wpKurz(w)}</strong> ${statusPlakette(wid)}</span>
                  <span>${t('zp.erstes_auto_um', { zeit: zeitMitTag(df.erster) })}</span>
                  <span class="klein">${t('zp.letztes_auto_um', { zeit: zeit(df.letzter) })} · ${sperrzeitText(w)}</span>
                  ${statusHinweis(wid)}
                </div>
                <button type="button" class="knopf-klein ${drin ? 'an' : ''}" data-aktion="plan" data-zp="${zp.id}" data-wp="${wid}" aria-pressed="${drin ? 'true' : 'false'}">
                  ${icon(drin ? 'haken' : 'plus', 16)} ${drin ? t('planer.im_plan') : t('planer.hinzufuegen')}
                </button>
              </div>`;
            })}
          </div>
          ${blockiert ? html`<p class="klein">${t('zp.parkplatz_blockiert', { p: p.id })}</p>` : ''}
        </section>
        <div class="knopf-spalte">
          ${p
            ? navigationsKnopf(p.lage, `${p.id} · ${feld(p, 'name')}`, html`${icon('navi', 20)} ${t('allg.navigation_zu', { ziel: `${p.id} · ${feld(p, 'name')}` })}`, 'knopf knopf-akzent gross')
            : navigationsKnopf(zp.mitte, zpZiel, html`${icon('navi', 20)} ${t('allg.navigation_zu', { ziel: zpZiel })}`, 'knopf knopf-akzent gross')}
          <a class="knopf knopf-rahmen gross" href="#/karte/zp/${zp.id}">${icon('karte', 20)} ${t('zp.auf_karte')}</a>
        </div>
      </div>
    </div>`;
  },
  aktionen: {
    plan(el) {
      const hinzu = planUmschalten(el.dataset.zp, el.dataset.wp);
      const tag = zustand.daten.wp.get(el.dataset.wp).tag;
      toast(hinzu ? t('planer.hinzugefuegt') : t('planer.entfernt'), {
        dauer: 3000,
        aktion: hinzu ? { text: t('tab.planer'), fn: () => (location.hash = `#/planer/${tag}`) } : null,
      });
    },
  },
};
