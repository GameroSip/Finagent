// Primera apertura: pantalla de carga con el logo en 3D que despega → cuenta → idioma → recorrido por la app. Después, la app es tuya.
// Las aperturas siguientes solo muestran la pantalla de carga (ver main.ts).
import { TOUR, BACKING, type SlideId } from '../content/tour';
import { COMING_LANGS, getLang, LANGS, setLang, t, type UiLang } from '../i18n';
import { AccessDeniedError, busyMessage, ensureSession, fetchServerFlags, googleAvailable, GoogleError, googleMessage, ServerBusyError, signInWithGoogle } from '../server';
import { $, esc, h } from '../ui/dom';
import { icon } from '../ui/icons';
import { markSvg } from '../ui/logo';
import { mountLaunch } from './launch';

const DONE = 'finagent.intro.v1';
export const introDone = (): boolean => { try { return globalThis.localStorage?.getItem(DONE) === '1'; } catch { return false; } };
const markDone = () => { try { globalThis.localStorage?.setItem(DONE, '1'); } catch { /* sin almacenamiento */ } };

/** Motivo legible cuando falla el arranque (sirve para la pantalla de carga con y sin introducción). */
export function startupFailure(e: unknown): { text: string; retry: boolean } {
  if (e instanceof AccessDeniedError) return { text: t('Tu acceso a FinAgent fue desactivado. Si creés que es un error, escribinos.'), retry: false };
  if (e instanceof ServerBusyError) return { text: busyMessage(e), retry: true };
  return { text: t('No pude preparar tu cuenta. Revisá tu conexión e intentá de nuevo.'), retry: true };
}

/** Ilustración de cada diapositiva: líneas finas y un solo color, sin adornos. */
function art(id: SlideId): string {
  const rows = (items: Array<[string, string, string?]>) => items.map(([a, b, c]) => `<div class="a-row"><b data-notrans>${esc(a)}</b><span data-notrans>${esc(b)}</span>${c ? `<em>${c}</em>` : ''}</div>`).join('');
  switch (id) {
    case 'welcome': return `<div class="art art-welcome">${markSvg(84)}<div class="a-rule"></div></div>`;
    case 'world': return `<div class="art"><div class="a-strip" data-notrans>${['NYSE', 'NASDAQ', 'BCBA', 'LSE', 'XETRA', 'TSE', 'B3', 'HKEX'].map((x) => `<span>${x}</span>`).join('')}</div>
      <div class="a-strip dim" data-notrans>${['FX', 'CRIPTO', 'ÍNDICES', 'ORO', 'PETRÓLEO', 'ETF'].map((x) => `<span>${x}</span>`).join('')}</div></div>`;
    case 'verified': return `<div class="art"><div class="a-table">${rows([['AAPL', '+2,41%', icon('check', 14)], ['BTC-USD', '+0,87%', icon('check', 14)], ['^GSPC', '-0,32%', icon('check', 14)]])}</div><div class="a-cap">${esc(t('Cifras verificadas'))} · ${esc(t('Ejemplo'))}</div></div>`;
    case 'better': return `<div class="art"><div class="a-vs"><div><small>${esc(t('IA común'))}</small><p class="strike">${esc(t('"Creo que subió un 12%…"'))}</p><small>${esc(t('Sin fuente'))}</small></div>
      <div class="on"><small data-notrans>FinAgent</small><p>${esc(t('+12,3% (calculado)'))}</p><small>${icon('check', 12)} ${esc(t('Fuente y fecha'))}</small></div></div></div>`;
    case 'charts': return `<div class="art"><svg viewBox="0 0 280 120" width="100%" aria-hidden="true">${[[18, 70, 96, 82, 1], [40, 78, 102, 88, 0], [62, 58, 88, 66, 1], [84, 48, 74, 56, 1], [106, 54, 80, 62, 0], [128, 40, 64, 46, 1], [150, 30, 56, 36, 1], [172, 36, 62, 52, 0], [194, 24, 46, 32, 1]]
      .map(([x, hi, lo, c, up]) => `<line x1="${x}" x2="${x}" y1="${hi}" y2="${lo}" stroke="currentColor" stroke-width="1" opacity=".7"/><rect x="${x - 5}" y="${Math.min(hi + 8, c)}" width="10" height="${Math.abs(c - hi - 8) + 12}" fill="${up ? 'var(--up)' : 'var(--down)'}"/>`).join('')}
      <line x1="10" x2="270" y1="56" y2="56" stroke="var(--brand)" stroke-dasharray="3 4"/><text x="272" y="52" text-anchor="end" fill="var(--brand)" font-size="8" font-family="IBM Plex Mono">61,8%</text></svg></div>`;
    case 'backing': return `<div class="art"><div class="a-table">${rows([[BACKING.ai, 'IA'], ...BACKING.data.map((d) => [d, ''] as [string, string]), [BACKING.charts, '']])}</div></div>`;
    case 'plans': return `<div class="art"><div class="a-plans">${[['Gratis', true], ['Plus', false], ['Pro', false]].map(([n, on]) => `<div class="${on ? 'on' : ''}"><b>${esc(t(n as string))}</b><small>${on ? icon('check', 13) : esc(t('Próximamente'))}</small></div>`).join('')}</div></div>`;
  }
}

export interface IntroOpts {
  server: boolean;
  /** Modo desarrollo (sin servidor): al final se pide la clave de Gemini. */
  keyStep?: (done: () => void) => void;
  onDone: () => void;
}

export function mountIntro(root: HTMLElement, o: IntroOpts): void {
  const el = h('div', { class: 'intro' });
  root.append(el);
  const finish = () => { markDone(); el.classList.add('out'); setTimeout(() => { el.remove(); o.onDone(); }, 380); };
  const afterTour = () => (o.keyStep ? (el.remove(), o.keyStep(() => { markDone(); o.onDone(); })) : finish());
  /** Cambia de pantalla con una transición corta (sale la actual, entra la nueva desde abajo). */
  const show = (render: () => void) => {
    const cur = el.firstElementChild;
    if (!cur) { render(); return; }
    cur.classList.add('screen-out'); setTimeout(render, 190);
  };
  const top = () => `<div class="s-top">${markSvg(20)}<span data-notrans>FinAgent</span></div>`;

  // ---------------------------------------------------------------- 2) cuenta
  function account() {
    if (!o.server) return language();
    void fetchServerFlags().then(() => { const b = el.querySelector<HTMLButtonElement>('#a-google'); if (b && googleAvailable()) { b.disabled = false; b.querySelector('em')?.remove(); } });
    el.innerHTML = `<div class="screen screen-in">${top()}<div class="s-main"><h1>${esc(t('Entrá a FinAgent'))}</h1><p class="s-lead">${esc(t('Tu cuenta guarda tu plan y tus límites diarios.'))}</p>
      <button class="auth-btn" id="a-google" ${googleAvailable() ? '' : 'disabled'}><span class="auth-ic">G</span><span class="auth-t">${esc(t('Continuar con Google'))}</span>${googleAvailable() ? '' : `<em>${esc(t('Próximamente'))}</em>`}</button>
      <button class="auth-btn" disabled><span class="auth-ic">${icon('send', 15)}</span><span class="auth-t">${esc(t('Continuar con correo'))}</span><em>${esc(t('Próximamente'))}</em></button>
      <div class="s-or"><span>${esc(t('o'))}</span></div>
      <div id="a-err" class="error-box hide" style="margin-bottom:12px"></div>
      <button class="btn btn-primary btn-block" id="a-guest">${esc(t('Entrar como invitado'))}</button>
      <p class="s-note">${esc(t('Como invitado, tu cuenta queda en este teléfono: si desinstalás la app, perdés tu plan.'))}</p></div></div>`;
    const err = $('#a-err', el), showErr = (m: string) => { err.innerHTML = `${icon('warn', 18)}<span>${esc(m)}</span>`; err.classList.remove('hide'); };
    $('#a-guest', el).onclick = () => show(language);
    $('#a-google', el).onclick = async () => {
      err.classList.add('hide');
      try { await signInWithGoogle(); show(language); }
      catch (e) { showErr(e instanceof GoogleError ? googleMessage(e) : e instanceof AccessDeniedError ? t('Tu acceso a FinAgent fue desactivado. Si creés que es un error, escribinos.') : t('No pude iniciar sesión con Google. Intentá de nuevo en un momento.')); }
    };
  }

  // ---------------------------------------------------------------- 3) idioma
  function language(animate = true) {
    const cur = getLang();
    el.innerHTML = `<div class="screen ${animate ? 'screen-in' : ''}">${top()}<div class="s-main"><h1>${esc(t('Elegí tu idioma'))}</h1><p class="s-lead">${esc(t('Podés cambiarlo cuando quieras en Ajustes.'))}</p>
      <div class="lang-grid">${LANGS.map((l) => `<button class="lang-card ${l.id === cur ? 'on' : ''}" data-l="${l.id}" data-notrans><span>${esc(l.native)}</span><b>${l.badge}</b>${l.id === cur ? icon('check', 18) : '<i></i>'}</button>`).join('')}</div>
      <div class="lang-soon"><span>${esc(t('Próximamente'))}:</span> ${COMING_LANGS.map((x) => `<i data-notrans>${esc(x)}</i>`).join('')}</div>
      <p class="s-note">${esc(t('La IA responde en el idioma en que le escribas.'))}</p>
      <button class="btn btn-primary btn-block" id="l-next" style="margin-top:18px">${esc(t('Continuar'))}</button></div></div>`;
    el.querySelectorAll<HTMLElement>('.lang-card').forEach((b) => { b.onclick = () => { setLang(b.dataset.l as UiLang); language(false); }; });
    $('#l-next', el).onclick = () => show(() => tour(0));
  }

  // ---------------------------------------------------------------- 4) recorrido
  function tour(start: number) {
    let i = start;
    const n = TOUR.length;
    el.innerHTML = `<div class="tour screen screen-in"><div class="tour-top"><div class="tour-dots" id="t-dots">${TOUR.map((_, k) => `<i data-k="${k}"></i>`).join('')}</div><button class="tour-skip" id="t-skip">${esc(t('Omitir'))}</button></div>
      <div class="tour-view"><div class="tour-track" id="t-track">${TOUR.map((s, k) => `<section class="slide"><div class="slide-art">${art(s.id)}</div><div class="slide-n" data-notrans>${String(k + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}</div><h2>${esc(t(s.title))}</h2><p>${esc(t(s.text))}</p>
        ${s.bullets ? `<ul>${s.bullets.map((b) => `<li>${icon('check', 15)}<span>${esc(t(b))}</span></li>`).join('')}</ul>` : ''}</section>`).join('')}</div></div>
      <div class="tour-nav"><button class="btn btn-ghost" id="t-back">${esc(t('Atrás'))}</button><button class="btn btn-primary" id="t-next"></button></div></div>`;
    const track = $('#t-track', el), next = $('#t-next', el), back = $<HTMLButtonElement>('#t-back', el);
    const paint = () => {
      track.style.transform = `translateX(${-100 * i}%)`;
      el.querySelectorAll<HTMLElement>('#t-dots i').forEach((d, k) => d.classList.toggle('on', k <= i));
      el.querySelectorAll<HTMLElement>('.slide').forEach((s, k) => s.classList.toggle('active', k === i));
      back.style.visibility = i === 0 ? 'hidden' : 'visible';
      next.textContent = i === n - 1 ? t('Empezar') : t('Siguiente');
    };
    const go = (d: number) => { if (i + d >= n) return afterTour(); i = Math.max(0, i + d); paint(); };
    next.onclick = () => go(1); back.onclick = () => go(-1); $('#t-skip', el).onclick = afterTour;
    let x0: number | null = null;                                                // deslizar con el dedo
    const view = $('.tour-view', el);
    view.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    view.addEventListener('pointerup', (e) => { if (x0 !== null && Math.abs(e.clientX - x0) > 50) go(e.clientX < x0 ? 1 : -1); x0 = null; });
    paint();
  }

  // ---------------------------------------------------------------- 1) pantalla de carga: al despegar el logo aparece la cuenta
  mountLaunch(root, { run: () => (o.server ? ensureSession() : Promise.resolve()), failure: startupFailure, onReveal: account });
}
