// Ansicht „Karte“: Ebenen-Schalter, Standort, Infokarte zum ausgewählten Objekt.

import { html } from '../app/html.js';
import { icon } from '../app/icons.js';
import { t, feld } from '../app/i18n.js';
import { zustand } from '../app/zustand.js';
import { zeitMitTag, zeit, km, wpKurz } from '../app/format.js';
import { EBENEN, ebenenZustand, ebeneUmschalten, zoomen, zuPositionFliegen } from '../app/karte.js';
import { standortStarten, standortLaeuft, standortVerfuegbar } from '../app/position.js';
import { durchfahrt, sperrIntervalle } from '../lib/planer.js';
import { statusPlakette, zufahrtText, navigationsLink, wpListeText } from './teile.js';

function offlinePlakette() {
  const o = zustand.karteOffline;
  if (!zustand.online) {
    return o.phase === 'fertig'
      ? html`<span class="plakette plakette-gruen">${icon('haken', 14)} ${t('offline.gespeichert_offline')}</span>`
      : html`<span class="plakette plakette-orange">${icon('offline', 14)} ${t('offline.keine_verbindung')}</span>`;
  }
  if (o.phase === 'fertig') return html`<span class="plakette plakette-gruen">${icon('haken', 14)} ${t('offline.verfuegbar')}</span>`;
  if (o.phase === 'laedt') {
    const p = o.gesamt ? Math.floor((o.fertig / o.gesamt) * 100) : 0;
    return html`<span class="plakette plakette-grau">${t('offline.laedt', { prozent: p })}</span>`;
  }
  if (o.phase === 'teilweise') return html`<span class="plakette plakette-orange">${t('offline.teilweise')}</span>`;
  if (o.phase === 'fehler') return html`<span class="plakette plakette-orange">${t('offline.fehler')}</span>`;
  return '';
}

function durchfahrtenText(zp) {
  const d = zustand.daten;
  const s = d.strecken.get(zp.strecke);
  return s.wps
    .map((id) => {
      const df = durchfahrt(d, zp.id, id);
      return `${wpKurz(d.wp.get(id))} ${zeitMitTag(df.erster)}`;
    })
    .join(' · ');
}

function blattZp(id) {
  const d = zustand.daten;
  const zp = d.zp.get(id);
  if (!zp) return '';
  const p = d.ort.get(zp.parkplatz);
  const z = zufahrtText(zp.parkplatz);
  const s = d.strecken.get(zp.strecke);
  return html`<div class="blatt-kopf">
      <span class="zp-nummer gross">${zp.kurz}</span>
      <div class="blatt-titel">
        <h2>${t('zp.abk')} ${zp.kurz} · ${feld(zp, 'name')}</h2>
        <span class="blatt-unter">${durchfahrtenText(zp)}</span>
      </div>
    </div>
    <div class="chips-zeile">
      <span class="chip-info">${icon('gehen', 15)} ${t('zp.fussweg_ab', { min: zp.fusswegMin, p: p?.id ?? '' })}</span>
      ${feld(zp, 'untergrund') ? html`<span class="chip-info">${feld(zp, 'untergrund')}</span>` : ''}
      <span class="chip-info ${z.art === 'warnung' ? 'chip-warnung' : ''}">${z.text}</span>
      ${s.wps.map((w) => statusPlakette(w))}
    </div>
    <div class="knopf-reihe">
      <a class="knopf knopf-dunkel" href="#/zp/${zp.id}">${t('zp.steckbrief')}</a>
      ${p ? html`<a class="knopf knopf-akzent" href="${navigationsLink(p.lage)}" target="_blank" rel="noopener">${t('allg.navigation_zu', { ziel: p.id })}</a>` : ''}
    </div>`;
}

function blattOrt(id) {
  const d = zustand.daten;
  const o = d.ort.get(id);
  if (!o) return '';
  const zps = [...d.zp.values()].filter((z) => z.parkplatz === o.id);
  const iv = o.typ === 'parkplatz' ? sperrIntervalle(d, o.id) : [];
  return html`<div class="blatt-kopf">
      <span class="ort-symbol ort-${o.typ}">${o.typ === 'parkplatz' ? o.id : icon(o.typ === 'sanitaeter' ? 'plus' : o.typ === 'rampe' ? 'flagge' : 'pin', 20)}</span>
      <div class="blatt-titel">
        <h2>${feld(o, 'name')}</h2>
        <span class="blatt-unter">${t(`ort.${o.typ}`)}</span>
      </div>
    </div>
    ${feld(o, 'beschreibung') ? html`<p class="blatt-text">${feld(o, 'beschreibung')}</p>` : ''}
    ${o.typ === 'parkplatz'
      ? html`<div class="chips-zeile">
          ${iv.length
            ? iv.map((x) => html`<span class="chip-info chip-warnung">${t('zufahrt.zeitraum', { wp: wpKurz(d.wp.get(x.wp)), von: zeitMitTag(x.von), bis: zeit(x.bis) })}</span>`)
            : html`<span class="chip-info">${t('zufahrt.frei', { p: o.id })}</span>`}
        </div>`
      : ''}
    ${zps.length
      ? html`<div class="chips-zeile">${zps.map((z) => html`<a class="chip-info chip-link" href="#/karte/zp/${z.id}" data-ersetzen>${t('zp.abk')} ${z.kurz} · ${feld(z, 'name')}</a>`)}</div>`
      : ''}
    <div class="knopf-reihe">
      <a class="knopf knopf-akzent" href="${navigationsLink(o.lage)}" target="_blank" rel="noopener">${t('allg.navigation')}</a>
    </div>`;
}

function blattStrecke(id) {
  const d = zustand.daten;
  const s = d.strecken.get(id);
  if (!s) return '';
  const zps = [...d.zp.values()].filter((z) => z.strecke === s.id);
  return html`<div class="blatt-kopf">
      <span class="wp-symbol">${t('wp.abk')}</span>
      <div class="blatt-titel">
        <h2>${t('wp.abk')} ${wpListeText(s)} · ${feld(s, 'name')}</h2>
        <span class="blatt-unter">${km(s.laengeKm)}${feld(s, 'belag') ? ` · ${feld(s, 'belag')}` : ''}</span>
      </div>
    </div>
    ${feld(s, 'hinweis') ? html`<p class="blatt-text">${feld(s, 'hinweis')}</p>` : ''}
    <ul class="kompakt-liste">
      ${s.wps.map((wid) => {
        const w = d.wp.get(wid);
        return html`<li><strong>${wpKurz(w)}</strong> ${feld(w, 'name')} · ${t('zeitplan.erstes_auto')} ${zeitMitTag(w.erstesAuto)} ${statusPlakette(wid)}</li>`;
      })}
    </ul>
    <div class="chips-zeile">${zps.map((z) => html`<a class="chip-info chip-link" href="#/karte/zp/${z.id}" data-ersetzen>${t('zp.abk')} ${z.kurz} · ${feld(z, 'name')}</a>`)}</div>`;
}

function blattSperrzone() {
  return html`<div class="blatt-kopf">
      <span class="sperr-symbol">${icon('warnung', 22)}</span>
      <div class="blatt-titel">
        <h2>${t('sperrzone.titel')}</h2>
        <span class="blatt-unter">${t('sperrzone.unter')}</span>
      </div>
    </div>
    <p class="blatt-text">${t('sperrzone.text')}</p>
    <div class="knopf-reihe"><a class="knopf knopf-dunkel" href="#/regeln">${t('regeln.titel')}</a></div>`;
}

function blatt(auswahl) {
  if (!auswahl) return '';
  const inhalt =
    auswahl.typ === 'zp'
      ? blattZp(auswahl.id)
      : auswahl.typ === 'ort'
        ? blattOrt(auswahl.id)
        : auswahl.typ === 'strecke'
          ? blattStrecke(auswahl.id)
          : blattSperrzone();
  if (!inhalt) return '';
  return html`<section class="blatt" aria-label="${t('karte.auswahl')}">
    <div class="blatt-griff" aria-hidden="true"></div>
    <button type="button" class="blatt-zu" data-aktion="auswahl-weg" aria-label="${t('allg.schliessen')}">${icon('kreuzX', 20)}</button>
    ${inhalt}
  </section>`;
}

function hinweisGrundkarte() {
  if (zustand.grundkarte === 'fehlt') return html`<div class="karten-hinweis">${icon('info', 18)} ${t('karte.ohne_grundkarte')}</div>`;
  if (zustand.grundkarte === 'keinWebgl')
    return html`<div class="karten-hinweis karten-hinweis-gross">${icon('warnung', 18)} ${t('karte.kein_webgl')} <a href="#/zeitplan">${t('tab.zeitplan')}</a></div>`;
  return '';
}

export function karteUi(auswahl) {
  const d = zustand.daten;
  const e = ebenenZustand();
  const positionAktiv = standortLaeuft();
  return html`<div class="k-oben">
      <div class="k-kopf">
        <div>
          <span class="ueberzeile">${d.veranstaltung.kurzname} ${d.veranstaltung.jahr ?? ''}</span>
          <h1 class="k-titel">${t('tab.karte')}</h1>
        </div>
        ${offlinePlakette()}
      </div>
      <div class="chips" role="group" aria-label="${t('karte.ebenen')}">
        ${EBENEN.map(
          (eb) => html`<button type="button" class="chip ${e[eb.id] ? 'an' : ''}" aria-pressed="${e[eb.id] ? 'true' : 'false'}" data-aktion="ebene" data-id="${eb.id}">
            <span class="chip-punkt" style="background:${eb.farbe}"></span>${t(eb.text)}
          </button>`,
        )}
      </div>
      ${hinweisGrundkarte()}
    </div>
    <div class="k-knoepfe ${auswahl ? 'mit-blatt' : ''}">
      <button type="button" class="k-knopf" data-aktion="zoom" data-richtung="1" aria-label="${t('karte.reinzoomen')}">${icon('plus', 20)}</button>
      <button type="button" class="k-knopf" data-aktion="zoom" data-richtung="-1" aria-label="${t('karte.rauszoomen')}">${icon('minus', 20)}</button>
      ${standortVerfuegbar()
        ? html`<button type="button" class="k-knopf k-orten ${positionAktiv ? 'aktiv' : ''}" data-aktion="orten" aria-label="${t('karte.wo_bin_ich')}">${icon('orten', 22)}</button>`
        : ''}
    </div>
    ${zustand.positionFehler === 1 ? html`<div class="karten-hinweis unten">${t('position.verweigert')}</div>` : ''}
    ${blatt(auswahl)}`;
}

export const karteAktionen = {
  ebene: (el) => ebeneUmschalten(el.dataset.id),
  zoom: (el) => zoomen(Number(el.dataset.richtung)),
  orten: () => {
    if (!standortLaeuft()) standortStarten();
    zuPositionFliegen();
  },
};
