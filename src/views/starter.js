// Ansicht „Starterliste“ mit Suche, Klassenfilter und Favoriten

import { html } from '../app/html.js';
import { icon, sternGefuellt } from '../app/icons.js';
import { t, feld } from '../app/i18n.js';
import { zustand } from '../app/zustand.js';
import { jetzt } from '../app/uhr.js';
import { zeit, wpKurz, relativ } from '../app/format.js';
import { favoriten, favoritUmschalten } from '../app/meine.js';
import { favoritenDurchfahrten } from '../app/hinweise.js';
import { suchNormalisieren } from '../lib/text.js';
import { seitenKopf, leer } from './teile.js';

let suche = '';
let filter = 'alle';

function klassen() {
  const liste = [];
  for (const s of zustand.daten.starter) if (!liste.includes(s.klasse)) liste.push(s.klasse);
  return liste;
}

function fahrzeugText(s) {
  return [s.fahrzeug, s.motor, s.baujahr].filter(Boolean).join(' · ');
}

function favoritenBanner() {
  const d = zustand.daten;
  const fav = favoriten();
  if (!fav.size) return '';
  const liste = favoritenDurchfahrten(60);
  const nun = jetzt();
  if (!liste.length) {
    return html`<div class="hinweis-karte hinweis-grau">${icon('glocke', 22)}<div><span>${t('starter.hinweis_einrichten')}</span></div></div>`;
  }
  const n = liste[0];
  const zp = d.zp.get(n.zp);
  return html`<div class="hinweis-karte hinweis-akzent" role="status">${icon('glocke', 24)}
    <div><strong>${t('starter.favorit_naht', { nr: n.nr, rel: relativ(n.zeit, nun), zp: `${t('zp.abk')} ${zp.kurz}` })}</strong>
    <span>${t('starter.favorit_details', { wp: wpKurz(d.wp.get(n.wp)), zp: feld(zp, 'name'), zeit: zeit(n.zeit) })}</span>
    ${liste.length > 1 ? html`<span class="klein">${t('starter.weitere', { anzahl: liste.length - 1 })}</span>` : ''}</div></div>`;
}

function ergebnis() {
  const d = zustand.daten;
  const fav = favoriten();
  const q = suchNormalisieren(suche);
  const naechste = new Map();
  for (const f of favoritenDurchfahrten(180)) if (!naechste.has(f.nr)) naechste.set(f.nr, f);
  const liste = d.starter.filter((s) => {
    if (filter === 'fav' && !fav.has(s.nr)) return false;
    if (filter !== 'alle' && filter !== 'fav' && s.klasse !== filter) return false;
    if (q && !suchNormalisieren(`${s.nr} ${s.fahrer} ${s.beifahrer ?? ''} ${s.fahrzeug} ${s.team ?? ''} ${s.klasse}`).includes(q)) return false;
    return true;
  });
  const anzahl = liste.length === 1 ? t('starter.ein_team') : t('starter.teams', { anzahl: liste.length });
  return html`<p class="klein fett">${anzahl} · ${t('starter.nur_geraet')}</p>
    ${liste.length
      ? html`<ul class="starter-liste">${liste.map((s) => {
          const an = fav.has(s.nr);
          const n = naechste.get(s.nr);
          return html`<li class="starter">
            <span class="startnummer">${s.nr}</span>
            <div class="starter-inhalt">
              <span class="starter-crew">${s.fahrer}${s.beifahrer ? ` / ${s.beifahrer}` : ''}</span>
              <span class="starter-auto">${fahrzeugText(s)}</span>
              <span class="starter-meta">${t('starter.klasse')} ${s.klasse}${s.team ? ` · ${s.team}` : ''}${s.nation ? ` · ${s.nation}` : ''}</span>
              ${n ? html`<span class="starter-naechste">${icon('uhr', 13)} ${t('starter.naechste', { wp: wpKurz(d.wp.get(n.wp)), zp: `${t('zp.abk')} ${d.zp.get(n.zp).kurz}`, zeit: zeit(n.zeit) })}</span>` : ''}
            </div>
            <button type="button" class="stern ${an ? 'an' : ''}" data-aktion="favorit" data-nr="${s.nr}" aria-pressed="${an ? 'true' : 'false'}" aria-label="${an ? t('starter.favorit_weg', { nr: s.nr }) : t('starter.favorit_hinzu', { nr: s.nr })}">${sternGefuellt(an)}</button>
          </li>`;
        })}</ul>`
      : leer(t('starter.keine'))}`;
}

function filterChips() {
  const optionen = [
    { id: 'alle', text: t('starter.alle') },
    { id: 'fav', text: `★ ${t('starter.favoriten')}` },
    ...klassen().map((k) => ({ id: k, text: k })),
  ];
  return html`<div class="chips" role="group" aria-label="${t('starter.filter')}">
    ${optionen.map((o) => html`<button type="button" class="chip ${filter === o.id ? 'an' : ''}" aria-pressed="${filter === o.id ? 'true' : 'false'}" data-aktion="filter" data-id="${o.id}">${o.text}</button>`)}
  </div>`;
}

export const starterAnsicht = {
  tab: 'starter',
  aktualisierenBei: ['favoriten', 'minute', 'sprache', 'plan', 'position', 'hinweise'],
  render() {
    return html`<div class="seite">
      ${seitenKopf(t('tab.starter_lang'))}
      <div id="favoriten-banner">${favoritenBanner()}</div>
      <label class="suchfeld">
        ${icon('suche', 18)}
        <span class="nur-vorleser">${t('starter.suche')}</span>
        <input type="search" data-eingabe="suche" value="${suche}" placeholder="${t('starter.suche_platzhalter')}" autocomplete="off" enterkeyhint="search">
      </label>
      <div id="filter-chips">${filterChips()}</div>
      <div id="starter-ergebnis">${ergebnis()}</div>
    </div>`;
  },
  /** Teil-Aktualisierung, damit das Suchfeld den Fokus behält */
  teilweise(el) {
    el.querySelector('#starter-ergebnis').innerHTML = String(ergebnis());
    el.querySelector('#filter-chips').innerHTML = String(filterChips());
    el.querySelector('#favoriten-banner').innerHTML = String(favoritenBanner());
  },
  eingaben: {
    suche(el, input, ansicht) {
      suche = input.value;
      ansicht.teilweise(el);
    },
  },
  aktionen: {
    filter(el, _ev, root, ansicht) {
      filter = el.dataset.id;
      ansicht.teilweise(root);
    },
    favorit(el, _ev, root, ansicht) {
      favoritUmschalten(Number(el.dataset.nr));
      ansicht.teilweise(root);
    },
  },
  teilweiseBei: ['favoriten', 'minute', 'plan', 'position', 'hinweise'],
};
