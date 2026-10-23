// "Acerca de FinAgent": cómo funciona, qué hay detrás, en qué se diferencia de una IA común, cobertura, privacidad y límites. Todo texto sale de ABOUT / TOUR (controlados por pruebas).
import { ABOUT } from '../about';
import { BACKING } from '../content/tour';
import { t } from '../i18n';
import { googleAvailable, isServerMode, quotaInfo } from '../server';
import { esc, h } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';
import { markSvg } from '../ui/logo';
import { openSheet } from '../ui/sheet';

export const FLOW: Array<{ ic: IconName; title: string; text: string }> = [
  { ic: 'globe', title: 'Fuentes de datos', text: 'Precios, noticias y datos macro de fuentes públicas.' },
  { ic: 'gauge', title: 'Herramientas de FinAgent', text: 'Obtienen y calculan los datos: porcentajes, indicadores y comparaciones.' },
  { ic: 'layers', title: 'IA (Gemini)', text: 'Interpreta tu pregunta y redacta la respuesta. No calcula.' },
  { ic: 'shield', title: 'Verificador de cifras', text: 'Compara cada cifra con los datos. Si no se puede respaldar, se corrige o se quita.' },
  { ic: 'badgeCheck', title: 'Tu respuesta', text: 'Con la fuente y la fecha de cada dato.' },
];
export const VS: Array<[string, string, string]> = [
  ['Datos', 'De memoria, pueden estar viejos', 'Reales y actualizados'],
  ['Cálculos', 'Aproximados', 'Exactos, con herramientas'],
  ['Fuente', 'No suele citarla', 'Fuente y fecha de cada dato'],
  ['Si no sabe', 'Puede inventar', 'Te lo dice'],
];

export function openAbout(o: { version: string; onReplayIntro?: () => void }): void {
  const server = isServerMode(), q = quotaInfo();
  const el = h('div', { class: 'about-sheet' });
  el.innerHTML = `<div class="about-hero">${markSvg(40)}<h2>FinAgent</h2><div class="about-ver" data-notrans>${esc(t('Versión'))} ${esc(o.version)}</div><p>${esc(ABOUT.what)}</p></div>
    <section class="about-sec"><h3>${icon('activity', 18)} ${esc(t('Cómo funciona'))}</h3>
      <div class="flow">${FLOW.map((f, i) => `<div class="flow-node" style="--d:${i * 0.12}s"><span class="flow-ic">${icon(f.ic, 20)}</span><div><b>${esc(t(f.title))}</b><span>${esc(t(f.text))}</span></div></div>${i < FLOW.length - 1 ? '<i class="flow-line"></i>' : ''}`).join('')}</div></section>
    <section class="about-sec"><h3>${icon('layers', 18)} ${esc(t('Qué hay detrás'))}</h3>
      <div class="back-row"><span class="back-k">${esc(t('IA'))}</span><span class="chip3" data-notrans>${esc(BACKING.ai)}</span></div>
      <div class="back-row"><span class="back-k">${esc(t('Datos'))}</span>${BACKING.data.map((d) => `<span class="chip3" data-notrans>${esc(d)}</span>`).join('')}</div>
      <div class="back-row"><span class="back-k">${esc(t('Gráficos'))}</span><span class="chip3" data-notrans>${esc(BACKING.charts)}</span></div>
      <p class="about-p">${esc(t('IA: modelos Gemini de Google, desarrollados por Google DeepMind. FinAgent es independiente de Google.'))}</p>
      <p class="about-p">${esc(t('Datos: Yahoo Finance, DolarAPI, ArgentinaDatos, Google News y alternative.me. Son fuentes públicas y gratuitas, sin acuerdos comerciales: pueden tener demora o errores.'))}</p></section>
    <section class="about-sec"><h3>${icon('scale', 18)} ${esc(t('FinAgent frente a una IA común'))}</h3>
      <table class="vs-tbl"><thead><tr><th></th><th>${esc(t('IA común'))}</th><th>FinAgent</th></tr></thead><tbody>${VS.map(([k, a, b]) => `<tr><th>${esc(t(k))}</th><td>${esc(t(a))}</td><td class="good">${esc(t(b))}</td></tr>`).join('')}</tbody></table></section>
    <section class="about-sec"><h3>${icon('globe', 18)} ${esc(t('Cobertura'))}</h3><p class="about-p">${esc(ABOUT.coverage)}</p></section>
    <section class="about-sec"><h3>${icon('lock', 18)} ${esc(t('Tu privacidad'))}</h3><p class="about-p">${esc(server ? ABOUT.privacyServer : ABOUT.privacy)}</p>
      ${server && googleAvailable() ? `<p class="about-p">${esc(ABOUT.privacyGoogle)}</p>` : ''}${server && q.tier === 'free' ? `<p class="about-p">${esc(ABOUT.freeTier)}</p>` : ''}</section>
    <section class="about-sec"><h3>${icon('warn', 18)} ${esc(t('Límites y aviso legal'))}</h3><p class="about-p">${esc(ABOUT.limits)}</p>
      <ul class="about-ul">${ABOUT.how.map((x) => `<li>${icon('check', 15)}<span>${esc(x)}</span></li>`).join('')}</ul></section>
    <p class="about-credits">${esc(ABOUT.credits)}</p>
    ${o.onReplayIntro ? `<button class="btn btn-ghost btn-block" id="ab-intro" style="margin-top:12px">${esc(t('Ver la introducción otra vez'))}</button>` : ''}`;
  const close = openSheet(el);
  el.querySelector('#ab-intro')?.addEventListener('click', () => { close(); o.onReplayIntro?.(); });
}
