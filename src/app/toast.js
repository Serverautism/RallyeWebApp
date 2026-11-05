// Kurze Meldungen am unteren Bildschirmrand.

import { html } from './html.js';
import { t } from './i18n.js';

/**
 * @param {string} text
 * @param {{dauer?: number, aktion?: {text: string, fn: () => void}, art?: 'info'|'wichtig'}} optionen
 */
export function toast(text, { dauer = 5000, aktion = null, art = 'info' } = {}) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast toast-${art}`;
  el.setAttribute('role', art === 'wichtig' ? 'alert' : 'status');
  el.innerHTML = String(html`<span class="toast-text">${text}</span>${aktion ? html`<button type="button" class="toast-aktion">${aktion.text}</button>` : ''}<button type="button" class="toast-zu" aria-label="${t('allg.schliessen')}">×</button>`);
  const weg = () => {
    el.classList.add('toast-weg');
    setTimeout(() => el.remove(), 250);
  };
  el.querySelector('.toast-zu').addEventListener('click', weg);
  if (aktion) {
    el.querySelector('.toast-aktion').addEventListener('click', () => {
      aktion.fn();
      weg();
    });
  }
  box.appendChild(el);
  if (dauer > 0) setTimeout(weg, dauer);
}
