// Ansicht „Mehr“: Notfall, Extras, Sprache, Einstellungen, Offline-Daten

import { html } from '../app/html.js';
import { icon } from '../app/icons.js';
import { t, aktuelleSprache, spracheSetzen } from '../app/i18n.js';
import { zustand, melden } from '../app/zustand.js';
import { datumUndZeit, zahl } from '../app/format.js';
import { stempel, einstellung, einstellungSetzen } from '../app/meine.js';
import { stationen } from '../app/pass.js';
import { standortLaeuft, standortStarten, standortStoppen, standortVerfuegbar } from '../app/position.js';
import { tonVorbereiten, signalton, wachhalten, wachhaltenVerfuegbar, speicherBelegt } from '../app/geraet.js';
import { karteNeuLaden } from '../app/basemap.js';
import { seitenKopf } from './teile.js';

let speicherText = '';

function schalter(id, an, text, unter, symbol) {
  return html`<button type="button" class="liste-zeile schalter-zeile" role="switch" aria-checked="${an ? 'true' : 'false'}" data-aktion="schalter" data-id="${id}">
    ${icon(symbol, 22, 'akzent')}
    <span class="liste-text"><span class="liste-titel">${text}</span>${unter ? html`<span class="liste-unter">${unter}</span>` : ''}</span>
    <span class="schalter ${an ? 'an' : ''}" aria-hidden="true"><span></span></span>
  </button>`;
}

function link(href, symbol, titel, unter) {
  return html`<a class="liste-zeile" href="${href}">
    ${icon(symbol, 22, 'akzent')}
    <span class="liste-text"><span class="liste-titel">${titel}</span>${unter ? html`<span class="liste-unter">${unter}</span>` : ''}</span>
    ${icon('weiter', 18, 'grau')}
  </a>`;
}

function offlineKarte() {
  const d = zustand.daten;
  const o = zustand.karteOffline;
  const kartenText =
    o.phase === 'fertig'
      ? t('mehr.karte_fertig', { anzahl: o.gesamt })
      : o.phase === 'laedt'
        ? t('mehr.karte_laedt', { fertig: o.fertig, gesamt: o.gesamt })
        : o.phase === 'teilweise'
          ? t('mehr.karte_teilweise', { fertig: o.fertig, gesamt: o.gesamt })
          : o.phase === 'offline'
            ? t('mehr.karte_offline')
            : o.phase === 'fehler'
              ? t('mehr.karte_fehler')
              : '–';
  return html`<section class="karte-box">
    <div class="box-kopf"><h2 class="abschnitt">${t('mehr.offline_daten')}</h2>
      <span class="plakette ${o.phase === 'fertig' ? 'plakette-gruen' : 'plakette-grau'}">${o.phase === 'fertig' ? t('mehr.gespeichert') : t('mehr.nicht_vollstaendig')}</span></div>
    <dl class="werte">
      <div><dt>${t('mehr.datenstand')}</dt><dd>${datumUndZeit(d.erstellt)}</dd></div>
      <div><dt>${t('mehr.grundkarte')}</dt><dd>${kartenText}</dd></div>
      ${speicherText ? html`<div><dt>${t('mehr.speicher')}</dt><dd>${speicherText}</dd></div>` : ''}
      <div><dt>${t('mehr.version')}</dt><dd>${d.version}</dd></div>
    </dl>
    <div class="knopf-spalte">
      <button type="button" class="knopf knopf-rahmen" data-aktion="pruefen">${icon('laden', 18)} ${t('mehr.neue_daten')}</button>
      <button type="button" class="knopf knopf-text" data-aktion="karte-neu">${icon('aktualisieren', 18)} ${t('mehr.karte_neu')}</button>
    </div>
  </section>`;
}

export const mehrAnsicht = {
  tab: 'mehr',
  aktualisierenBei: ['karteOffline', 'stempel', 'einstellungen', 'position', 'sprache', 'speicher'],
  render() {
    const d = zustand.daten;
    const st = stempel();
    const anzahlStempel = stationen().filter((s) => st[s.id]).length;
    const sprache = aktuelleSprache();
    const k = d.kontakt;
    return html`<div class="seite">
      ${seitenKopf(t('tab.mehr'))}
      <a class="notfall-kachel" href="#/notfall">
        <span class="notfall-symbol">${icon('telefon', 24)}</span>
        <span class="liste-text"><span class="notfall-titel">${t('notfall.kachel', { nr: k.notruf })}</span><span class="notfall-unter">${t('notfall.kachel_unter')}</span></span>
        ${icon('weiter', 20)}
      </a>
      <div class="liste-box">
        ${link('#/pass', 'medaille', t('pass.titel'), t('pass.stand', { anzahl: anzahlStempel, gesamt: stationen().length }))}
        ${link('#/anwohner', 'haus', t('anwohner.titel_kurz'), t('anwohner.unter'))}
        ${link('#/regeln', 'buch', t('regeln.titel'), t('regeln.unter'))}
      </div>
      <div class="liste-box">
        <div class="liste-zeile">
          ${icon('globus', 22, 'akzent')}
          <span class="liste-text"><span class="liste-titel">${t('mehr.sprache')}</span></span>
          <div class="segment mini" role="group" aria-label="${t('mehr.sprache')}">
            <button type="button" class="segment-knopf ${sprache === 'de' ? 'aktiv' : ''}" aria-pressed="${sprache === 'de' ? 'true' : 'false'}" data-aktion="sprache" data-id="de">DE</button>
            <button type="button" class="segment-knopf ${sprache === 'en' ? 'aktiv' : ''}" aria-pressed="${sprache === 'en' ? 'true' : 'false'}" data-aktion="sprache" data-id="en">EN</button>
          </div>
        </div>
        ${standortVerfuegbar() ? schalter('standort', standortLaeuft(), t('mehr.standort'), t('mehr.standort_unter'), 'pin') : ''}
        ${schalter('ton', einstellung('ton', false), t('mehr.ton'), t('mehr.ton_unter'), 'ton')}
        ${wachhaltenVerfuegbar() ? schalter('wach', einstellung('wach', false), t('mehr.wach'), t('mehr.wach_unter'), 'bildschirm') : ''}
      </div>
      ${offlineKarte()}
      ${k.rallyeleitungTel || k.rallyebueroTel || k.email || k.webseite
        ? html`<section class="karte-box"><h2 class="abschnitt">${t('mehr.kontakt')}</h2><dl class="werte">
            ${k.rallyebueroTel ? html`<div><dt>${t('mehr.rallyebuero')}</dt><dd><a href="tel:${k.rallyebueroTel.replace(/\s/g, '')}">${k.rallyebueroTel}</a></dd></div>` : ''}
            ${k.rallyeleitungTel ? html`<div><dt>${t('mehr.rallyeleitung')}</dt><dd><a href="tel:${k.rallyeleitungTel.replace(/\s/g, '')}">${k.rallyeleitungTel}</a></dd></div>` : ''}
            ${k.email ? html`<div><dt>E-Mail</dt><dd><a href="mailto:${k.email}">${k.email}</a></dd></div>` : ''}
            ${k.webseite ? html`<div><dt>Web</dt><dd><a href="${k.webseite}" target="_blank" rel="noopener">${k.webseite.replace(/^https?:\/\//, '')}</a></dd></div>` : ''}
          </dl></section>`
        : ''}
      <nav class="fuss-links" aria-label="${t('mehr.rechtliches')}">
        <a href="#/seite/datenschutz">${t('mehr.datenschutz')}</a>
        <a href="#/seite/impressum">${t('mehr.impressum')}</a>
      </nav>
      <p class="klein mittig">${t('mehr.kartendaten')}</p>
    </div>`;
  },
  nachRender() {
    speicherBelegt().then((s) => {
      if (!s) return;
      const neu = t('mehr.speicher_wert', { mb: zahl(s.belegt / 1048576, 1) });
      if (neu !== speicherText) {
        speicherText = neu;
        melden('speicher');
      }
    });
  },
  aktionen: {
    sprache(el) {
      spracheSetzen(el.dataset.id);
      melden('sprache');
    },
    schalter(el) {
      const id = el.dataset.id;
      if (id === 'standort') {
        if (standortLaeuft()) standortStoppen();
        else standortStarten();
      } else if (id === 'ton') {
        const an = !einstellung('ton', false);
        if (an) {
          tonVorbereiten();
          signalton();
        }
        einstellungSetzen('ton', an);
      } else if (id === 'wach') {
        const an = !einstellung('wach', false);
        wachhalten(an);
        einstellungSetzen('wach', an);
      }
    },
    pruefen() {
      window.dispatchEvent(new CustomEvent('rw-pruefen', { detail: { manuell: true } }));
    },
    'karte-neu'() {
      karteNeuLaden(zustand.daten.karte);
    },
  },
};
