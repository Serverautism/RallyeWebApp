// Ansicht „Tagesplaner“: Zuschauerpunkte wählen, Machbarkeit prüfen, Kalender-Export.

import { html } from '../app/html.js';
import { icon } from '../app/icons.js';
import { t, feld } from '../app/i18n.js';
import { zustand } from '../app/zustand.js';
import { jetzt } from '../app/uhr.js';
import { zeit, wpKurz, tagName } from '../app/format.js';
import { planFuerTag, planUmschalten, planErsetzen, planLeeren, imPlan } from '../app/meine.js';
import { toast } from '../app/toast.js';
import { alternativen, durchfahrt } from '../lib/planer.js';
import { icsErzeugen } from '../lib/ics.js';
import { seitenKopf, tagReiter, standardTag, statusPlakette } from './teile.js';

function zpName(zpId) {
  const zp = zustand.daten.zp.get(zpId);
  return `${t('zp.abk')} ${zp.kurz} · ${feld(zp, 'name')}`;
}

function machbarPlakette(s, nun) {
  if (s.machbar === false) return html`<span class="plakette plakette-rot">${icon('kreuzX', 13)} ${t('planer.nicht_erreichbar')}</span>`;
  if (s.machbar === null) return html`<span class="plakette plakette-orange">${t('planer.fahrzeit_unbekannt')}</span>`;
  if (s.abfahrtSpaetestens) {
    const vorbei = s.abfahrtSpaetestens < nun;
    return html`<span class="plakette ${vorbei ? 'plakette-orange' : 'plakette-gruen'}">${icon(vorbei ? 'uhr' : 'haken', 13)} ${t('planer.losfahren_bis', { zeit: zeit(s.abfahrtSpaetestens) })}</span>`;
  }
  return html`<span class="plakette plakette-gruen">${icon('haken', 13)} ${t('planer.machbar')}</span>`;
}

function uebergang(s) {
  const u = s.uebergang;
  if (!u) return '';
  const d = zustand.daten;
  const zp = d.zp.get(s.zp);
  let text;
  if (u.gleicherParkplatz) {
    text = t('planer.uebergang_zu_fuss', { fuss: u.fussMin, p: zp.parkplatz });
  } else if (u.ankunft === null) {
    text = t('planer.uebergang_unbekannt', { frei: zeit(u.freiAb) });
  } else {
    const frei = u.freiWegen ? t('planer.frei_ab_sperrung', { zeit: zeit(u.freiAb), wp: wpKurz(d.wp.get(u.freiWegen)) }) : t('planer.frei_ab', { zeit: zeit(u.freiAb) });
    text = `${frei} · ${t('planer.weg', { fuss: u.fussMin, fahr: u.fahrMin, p: zp.parkplatz, an: zeit(u.ankunft) })}`;
    if (s.schliesstWegen) text += ` · ${t('planer.zufahrt_schliesst', { zeit: zeit(s.ankunftSpaetestens) })}`;
    if (s.machbar && u.ankunftEffektiv > u.ankunft) text += ` · ${t('planer.warten', { zeit: zeit(u.ankunftEffektiv) })}`;
  }
  const kopf =
    s.machbar === false
      ? t('planer.wechsel_nicht')
      : s.machbar === null
        ? t('planer.fahrzeit_unbekannt')
        : t('planer.wechsel_ok', { min: s.pufferMin });
  return html`<div class="uebergang ${s.machbar === false ? 'schlecht' : ''}">
    <span class="uebergang-kopf">${kopf}</span>
    <span class="uebergang-text">${text}</span>
  </div>`;
}

function schrittKarte(s, i, eintraege, nun, tagId) {
  const d = zustand.daten;
  const wp = d.wp.get(s.wp);
  let vorschlaege = '';
  if (s.machbar === false) {
    const alt = alternativen(d, eintraege, i, d.planerStart);
    vorschlaege = alt.length
      ? html`<div class="vorschlag">
          <strong>${t('planer.vorschlag')}</strong>
          ${alt.map(
            (a) => html`<div class="vorschlag-zeile">
              <span>${zpName(a.zp)} · ${wpKurz(d.wp.get(a.wp))} · ${zeit(a.erster)}</span>
              <button type="button" class="knopf-klein an" data-aktion="ersetzen" data-alt-zp="${s.zp}" data-alt-wp="${s.wp}" data-zp="${a.zp}" data-wp="${a.wp}">${t('planer.uebernehmen')}</button>
            </div>`,
          )}
        </div>`
      : html`<div class="vorschlag"><span>${t('planer.kein_vorschlag')}</span></div>`;
  }
  return html`<div class="schritt ${s.machbar === false ? 'schlecht' : ''}">
    <div class="schritt-zeit"><span class="zeit-gross ${s.machbar === false ? 'durch' : ''}">${zeit(s.erster)}</span><span class="zeit-label">${t('zeitplan.erstes_auto')}</span></div>
    <div class="schritt-inhalt">
      <a class="schritt-titel" href="#/zp/${s.zp}">${zpName(s.zp)}</a>
      <span class="zeile-unter">${wpKurz(wp)} · ${feld(wp, 'name')} · ${t('planer.letztes_ca', { zeit: zeit(s.letzter) })} ${statusPlakette(s.wp)}</span>
      <div class="chips-zeile">${machbarPlakette(s, nun)}</div>
      ${vorschlaege}
    </div>
    <button type="button" class="knopf-rund klein" data-aktion="entfernen" data-zp="${s.zp}" data-wp="${s.wp}" data-tag="${tagId}" aria-label="${t('planer.entfernen')}">${icon('kreuzX', 18)}</button>
  </div>`;
}

let auswahlOffen = false;

function auswahlListe(tagId, leer) {
  const d = zustand.daten;
  const wps = [...d.wp.values()].filter((w) => w.tag === tagId);
  return html`<details class="auswahl" ${auswahlOffen || leer ? 'open' : ''}>
    <summary>${icon('plus', 18)} ${t('planer.punkte_waehlen')}</summary>
    ${wps.map((w) => {
      const zps = [...d.zp.values()].filter((z) => z.strecke === w.strecke);
      return html`<div class="auswahl-wp">
        <h3>${wpKurz(w)} · ${feld(w, 'name')} ${statusPlakette(w.id)}</h3>
        ${zps.map((z) => {
          const df = durchfahrt(d, z.id, w.id);
          const drin = imPlan(z.id, w.id);
          return html`<div class="auswahl-zeile">
            <span>${zpName(z.id)}<span class="klein"> · ${zeit(df.erster)}</span></span>
            <button type="button" class="knopf-klein ${drin ? 'an' : ''}" data-aktion="umschalten" data-zp="${z.id}" data-wp="${w.id}" aria-pressed="${drin ? 'true' : 'false'}">${icon(drin ? 'haken' : 'plus', 16)} ${drin ? t('planer.im_plan') : t('planer.hinzufuegen')}</button>
          </div>`;
        })}
      </div>`;
    })}
  </details>`;
}

function icsHerunterladen(tagId) {
  const d = zustand.daten;
  const { schritte } = planFuerTag(tagId);
  if (!schritte.length) return;
  const ereignisse = schritte.map((s) => {
    const zp = d.zp.get(s.zp);
    const wp = d.wp.get(s.wp);
    const p = d.ort.get(zp.parkplatz);
    const zeilen = [];
    if (s.abfahrtSpaetestens) zeilen.push(t('planer.losfahren_bis', { zeit: zeit(s.abfahrtSpaetestens) }));
    zeilen.push(t('ics.parkplatz', { p: `${p.id} · ${feld(p, 'name')}`, zeit: zeit(s.ankunftSpaetestens), fuss: zp.fusswegMin }));
    zeilen.push(t('ics.letztes', { zeit: zeit(s.letzter) }));
    return {
      uid: `${d.veranstaltung.jahr}-${s.wp}-${s.zp}@rallye-zuschauer-app`,
      start: s.erster,
      ende: s.letzter + 60000,
      titel: `${zpName(s.zp)} – ${wpKurz(wp)} ${feld(wp, 'name')}`,
      ort: `${feld(zp, 'name')} (${zp.mitte[1].toFixed(5)}, ${zp.mitte[0].toFixed(5)})`,
      beschreibung: zeilen.join('\n'),
      geo: zp.mitte,
      erinnerungMin: s.abfahrtSpaetestens ? (s.erster - s.abfahrtSpaetestens) / 60000 : 60,
    };
  });
  const text = icsErzeugen({ name: `${feld(d.veranstaltung, 'name')} – ${tagName(tagId)}`, ereignisse });
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `rallye-${d.veranstaltung.jahr ?? ''}-${tagId}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast(t('planer.ics_erstellt', { anzahl: ereignisse.length }));
}

export const planerAnsicht = {
  tab: 'planer',
  aktualisierenBei: ['plan', 'minute', 'sprache'],
  render([tagParam]) {
    const d = zustand.daten;
    const tagId = d.tage.some((x) => x.id === tagParam) ? tagParam : standardTag();
    const { schritte, eintraege } = planFuerTag(tagId);
    const nun = jetzt();
    return html`<div class="seite">
      ${seitenKopf(t('planer.titel', { tag: tagName(tagId) }), { unterzeile: t('planer.unterzeile') })}
      ${tagReiter(tagId, 'planer')}
      ${schritte.length
        ? html`<div class="schritte">${schritte.map((s, i) => html`${uebergang(s)}${schrittKarte(s, i, eintraege, nun, tagId)}`)}</div>
          <div class="knopf-spalte">
            <button type="button" class="knopf knopf-akzent gross" data-aktion="ics" data-tag="${tagId}">${icon('kalender', 20)} ${t('planer.ics')}</button>
            <button type="button" class="knopf knopf-text" data-aktion="leeren" data-tag="${tagId}">${icon('muell', 18)} ${t('planer.leeren')}</button>
          </div>`
        : html`<div class="leer-karte">${icon('planer', 28)}<p>${t('planer.leer')}</p></div>`}
      ${auswahlListe(tagId, schritte.length === 0)}
      <a class="knopf knopf-rahmen gross" href="#/karte">${icon('karte', 20)} ${t('planer.auf_karte')}</a>
    </div>`;
  },
  nachRender(el) {
    el.querySelector('details.auswahl')?.addEventListener('toggle', (e) => {
      auswahlOffen = e.target.open;
    });
  },
  aktionen: {
    umschalten: (el) => {
      auswahlOffen = true;
      planUmschalten(el.dataset.zp, el.dataset.wp);
    },
    entfernen: (el) => planUmschalten(el.dataset.zp, el.dataset.wp),
    ersetzen: (el) => {
      planErsetzen({ zp: el.dataset.altZp, wp: el.dataset.altWp }, { zp: el.dataset.zp, wp: el.dataset.wp });
      toast(t('planer.ersetzt'));
    },
    ics: (el) => icsHerunterladen(el.dataset.tag),
    leeren: (el) => {
      planLeeren(el.dataset.tag);
      toast(t('planer.geleert'));
    },
  },
};
