// Ansichten: Zuschauerpass, Anwohner-Checker, Regeln & Glossar, Impressum/Datenschutz

import { html, bloeckeHtml } from '../app/html.js';
import { icon } from '../app/icons.js';
import { t, feld, aktuelleSprache } from '../app/i18n.js';
import { zustand } from '../app/zustand.js';
import { zeitMitTag, zeit, wpKurz } from '../app/format.js';
import { stempel } from '../app/meine.js';
import { stationen, aufenthalt } from '../app/pass.js';
import { standortStarten, standortLaeuft, standortVerfuegbar } from '../app/position.js';
import { suchNormalisieren } from '../lib/text.js';
import { seitenKopf, leer } from './teile.js';

// ---------------------------------------------------------------------------
// Zuschauerpass
// ---------------------------------------------------------------------------
export const passAnsicht = {
  tab: 'mehr',
  aktualisierenBei: ['stempel', 'pass', 'position', 'sprache'],
  render() {
    const d = zustand.daten;
    const st = stempel();
    const liste = stationen();
    const anzahl = liste.filter((s) => st[s.id]).length;
    const ziel = Math.min(d.pass.ziel ?? 5, liste.length);
    const geschafft = anzahl >= ziel;
    const hier = aufenthalt();
    const hierStation = hier ? liste.find((s) => s.id === hier.id) : null;
    const restMin = hier ? Math.max(0, Math.ceil((d.pass.verweildauerMin ?? 5) - hier.seitMs / 60000)) : 0;
    return html`<div class="seite">
      ${seitenKopf(t('pass.titel'), { zurueck: '#/mehr' })}
      <div class="pass-kopf">
        <div class="pass-zahl"><span>${anzahl}</span> ${t('pass.von', { gesamt: liste.length })}</div>
        <span class="pass-ziel">${geschafft ? t('pass.geschafft') : t('pass.noch', { anzahl: ziel - anzahl })}</span>
        <div class="fortschritt" role="progressbar" aria-valuemin="0" aria-valuemax="${liste.length}" aria-valuenow="${anzahl}" aria-label="${t('pass.titel')}">
          <span style="width:${liste.length ? Math.round((anzahl / liste.length) * 100) : 0}%"></span>
        </div>
        <p>${t('pass.erklaerung', { min: d.pass.verweildauerMin ?? 5 })}</p>
        ${!standortVerfuegbar()
          ? html`<p>${t('position.nicht_verfuegbar')}</p>`
          : standortLaeuft()
            ? html`<p class="pass-aktiv">${icon('pin', 16)} ${hierStation ? t('pass.hier', { name: hierStation.name, min: restMin }) : t('pass.aktiv')}</p>`
            : html`<button type="button" class="knopf knopf-akzent" data-aktion="starten">${icon('pin', 18)} ${t('pass.starten')}</button>`}
      </div>
      ${geschafft ? html`<div class="urkunde">${icon('medaille', 40)}<strong>${t('pass.urkunde_titel')}</strong><span>${t('pass.urkunde_text', { name: d.veranstaltung.kurzname, jahr: d.veranstaltung.jahr ?? '' })}</span></div>` : ''}
      <div class="stempel-raster">
        ${liste.map((s) => {
          const zeitpunkt = st[s.id];
          return html`<div class="stempel-feld">
            ${zeitpunkt
              ? html`<span class="stempel an">${icon('haken', 22)}<span>${zeitMitTag(zeitpunkt)}</span></span>`
              : html`<span class="stempel">${s.kurz}</span>`}
            <span class="stempel-name">${s.name}</span>
          </div>`;
        })}
      </div>
    </div>`;
  },
  aktionen: {
    starten: () => standortStarten(),
  },
};

// ---------------------------------------------------------------------------
// Anwohner-Checker
// ---------------------------------------------------------------------------
let strassenSuche = '';

const STATUS_PLAKETTE = { gesperrt: 'rot', umleitung: 'orange', teilweise: 'orange', frei: 'gruen' };

function strassenZeiten(s) {
  const d = zustand.daten;
  if (feld(s, 'zeiten')) return feld(s, 'zeiten');
  if (!s.sperrtMit.length) return s.status === 'frei' ? t('anwohner.nicht_betroffen') : '';
  return s.sperrtMit
    .map((id) => d.wp.get(id))
    .filter(Boolean)
    .sort((a, b) => a.sperrVon - b.sperrVon)
    .map((w) => `${zeitMitTag(w.sperrVon)}–${zeit(w.sperrBis)} (${wpKurz(w)})`)
    .join(` ${t('allg.und')} `);
}

function anwohnerErgebnis() {
  const d = zustand.daten;
  const q = suchNormalisieren(strassenSuche);
  if (q.length < 2) return html`<p class="klein">${t('anwohner.min_zeichen')}</p>`;
  const treffer = d.strassen.filter((s) => suchNormalisieren(`${s.strasse} ${s.ort ?? ''}`).includes(q));
  if (!treffer.length) return html`<div class="hinweis-karte hinweis-gruen">${icon('haken', 22)}<div><strong>${t('anwohner.keine_sperrung')}</strong><span>${t('anwohner.keine_sperrung_text')}</span></div></div>`;
  return html`<p class="klein fett">${t('anwohner.treffer', { anzahl: treffer.length })}</p>
    ${treffer.map(
      (s) => html`<div class="karte-box strasse">
        <div class="box-kopf"><div><strong>${s.strasse}</strong>${s.ort ? html`<span class="klein">${s.ort}</span>` : ''}</div>
          <span class="plakette plakette-${STATUS_PLAKETTE[s.status]}">${t(`anwohner.status_${s.status}`)}</span></div>
        ${strassenZeiten(s) ? html`<p class="fett">${strassenZeiten(s)}</p>` : ''}
        ${feld(s, 'hinweis') ? html`<p class="klein">${feld(s, 'hinweis')}</p>` : ''}
      </div>`,
    )}`;
}

export const anwohnerAnsicht = {
  tab: 'mehr',
  aktualisierenBei: ['sprache'],
  render() {
    const k = zustand.daten.kontakt;
    return html`<div class="seite">
      ${seitenKopf(t('anwohner.titel'), { zurueck: '#/mehr', ueberzeile: t('anwohner.ueberzeile'), unterzeile: t('anwohner.unterzeile') })}
      <label class="suchfeld gross">
        ${icon('suche', 18)}
        <span class="nur-vorleser">${t('anwohner.strasse')}</span>
        <input type="search" data-eingabe="strasse" value="${strassenSuche}" placeholder="${t('anwohner.platzhalter')}" autocomplete="street-address" enterkeyhint="search">
      </label>
      <div id="anwohner-ergebnis">${anwohnerErgebnis()}</div>
      <p class="klein">${t('anwohner.rettung')}${k.rallyebueroTel ? ` ${t('anwohner.fragen', { tel: k.rallyebueroTel })}` : ''}</p>
    </div>`;
  },
  eingaben: {
    strasse(el, input) {
      strassenSuche = input.value;
      el.querySelector('#anwohner-ergebnis').innerHTML = String(anwohnerErgebnis());
    },
  },
};

// ---------------------------------------------------------------------------
// Regeln & Glossar
// ---------------------------------------------------------------------------
function kurvenSkizze() {
  return html`<figure class="skizze">
    <svg viewBox="0 0 358 170" role="img" aria-label="${t('regeln.skizze_alt')}">
      <rect width="358" height="170" fill="#ECEEE3"></rect>
      <path d="M60 30 C 125 0, 235 0, 300 30 L 290 50 C 230 20, 130 20, 70 50 Z" fill="#F7D9D6" stroke="#B42318" stroke-width="1.5"></path>
      <text x="180" y="32" text-anchor="middle" font-size="12" font-weight="700" fill="#A11D12">${t('regeln.gefahrenzone')}</text>
      <path d="M20 160 C 60 40, 300 40, 340 160" fill="none" stroke="#9C968A" stroke-width="26"></path>
      <path d="M20 160 C 60 40, 300 40, 340 160" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="8 8"></path>
      <path d="M120 106 L 240 106" fill="none" stroke="#C2410C" stroke-width="3" stroke-dasharray="6 4"></path>
      <text x="244" y="110" font-size="10" font-weight="600" fill="#9A3412">${t('regeln.absperrband')}</text>
      <path d="M126 115 L 234 115 L 240 152 L 120 152 Z" fill="#CFE8D6" stroke="#1F7A3A" stroke-width="1.5"></path>
      <text x="180" y="138" text-anchor="middle" font-size="12" font-weight="700" fill="#1A6B32">${t('regeln.zuschauerbereich')}</text>
    </svg>
    <figcaption>${t('regeln.skizze_text')}</figcaption>
  </figure>`;
}

export const regelnAnsicht = {
  tab: 'mehr',
  aktualisierenBei: ['sprache'],
  render([reiter]) {
    const inhalte = zustand.daten.inhalte;
    const glossar = reiter === 'glossar';
    return html`<div class="seite">
      ${seitenKopf(t('regeln.titel'), { zurueck: '#/mehr' })}
      <div class="segment" role="tablist" style="grid-template-columns: repeat(2, minmax(0, 1fr))">
        <a role="tab" class="segment-knopf ${glossar ? '' : 'aktiv'}" aria-selected="${glossar ? 'false' : 'true'}" href="#/regeln" data-ersetzen>${t('regeln.reiter_regeln')}</a>
        <a role="tab" class="segment-knopf ${glossar ? 'aktiv' : ''}" aria-selected="${glossar ? 'true' : 'false'}" href="#/regeln/glossar" data-ersetzen>${t('regeln.reiter_glossar')}</a>
      </div>
      ${glossar
        ? inhalte.glossar.length
          ? html`<dl class="glossar">${inhalte.glossar.map((g) => html`<div class="karte-box"><dt>${feld(g, 'begriff')}</dt><dd>${feld(g, 'erklaerung')}</dd></div>`)}</dl>`
          : leer(t('allg.keine_eintraege'))
        : html`${kurvenSkizze()}
          <ol class="schritte-liste">${inhalte.regeln.map((r) => html`<li><span class="schritt-nr dunkel">${r.nr}</span><span>${feld(r, 'text')}</span></li>`)}</ol>`}
    </div>`;
  },
};

// ---------------------------------------------------------------------------
// Impressum / Datenschutz
// ---------------------------------------------------------------------------
export const seiteAnsicht = {
  tab: 'mehr',
  aktualisierenBei: ['sprache'],
  render([name]) {
    const seiten = zustand.daten.inhalte.seiten;
    const s = seiten[name];
    if (!s) return html`<div class="seite">${leer(t('allg.nicht_gefunden'))}</div>`;
    let bloecke = (aktuelleSprache() === 'en' && s.en) || s.de;
    // Die Seitenüberschrift steht schon im Kopf – eine führende „# Überschrift“ nicht doppelt zeigen
    if (bloecke[0]?.typ === 'h1') bloecke = bloecke.slice(1);
    return html`<div class="seite text-seite">
      ${seitenKopf(t(`mehr.${name}`), { zurueck: '#/mehr' })}
      ${bloecke.length ? bloeckeHtml(bloecke) : leer(t('allg.keine_eintraege'))}
    </div>`;
  },
};
