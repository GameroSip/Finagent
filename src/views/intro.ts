// Introducción de la primera apertura: carga con configuración inicial → cuenta → idioma → recorrido por la app. Después, la app es tuya.
import { TOUR, BACKING, type SlideId } from '../content/tour';
import { COMING_LANGS, getLang, LANGS, setLang, t, type UiLang } from '../i18n';
import { AccessDeniedError, busyMessage, ensureSession, fetchServerFlags, googleAvailable, GoogleError, googleMessage, hasSession, ServerBusyError, signInWithGoogle } from '../server';
import { $, esc, h } from '../ui/dom';
import { icon } from '../ui/icons';
import { logoSvg } from '../ui/logo';
import { logo3dHtml } from '../ui/logo3d';

const DONE = 'finagent.intro.v1';
export const introDone = (): boolean => { try { return globalThis.localStorage?.getItem(DONE) === '1'; } catch { return false; } };
const markDone = () => { try { globalThis.localStorage?.setItem(DONE, '1'); } catch { /* sin almacenamiento */ } };

/** Ilustración de cada diapositiva del recorrido. */
function art(id: SlideId): string {
  switch (id) {
    case 'welcome': return `<div class="art art-welcome">${logo3dHtml(112)}<i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i></div>`;
    case 'world': return `<div class="art art-world"><div class="globe"><i></i><i></i><i></i></div>${['🇺🇸', '🇪🇺', '🇯🇵', '🇧🇷', '🇦🇷', '🇬🇧'].map((f, i) => `<span class="orb" style="--a:${i * 60}deg">${f}</span>`).join('')}</div>`;
    case 'verified': return `<div class="art art-ver"><div class="vcard">${[['AAPL', '+2,41%'], ['BTC', '+0,87%'], ['S&P 500', '-0,32%']].map(([s, v], i) => `<div class="vrow" style="--d:${0.3 + i * 0.35}s"><b>${s}</b><span>${v}</span><em>${icon('check', 14)}</em></div>`).join('')}</div><div class="vbadge">${icon('shield', 16)} ${esc(t('Cifras verificadas'))}</div></div>`;
    case 'better': return `<div class="art art-vs"><div class="vs-c off"><b>${esc(t('IA común'))}</b><p>${esc(t('"Creo que subió un 12%…"'))}</p><small>${esc(t('Sin fuente'))}</small></div><div class="vs-c on"><b>FinAgent</b><p>${esc(t('+12,3% (calculado)'))}</p><small>${icon('check', 12)} ${esc(t('Fuente y fecha'))}</small></div></div>`;
    case 'charts': return `<div class="art art-chart"><svg viewBox="0 0 260 150" width="100%"><rect x="14" y="8" width="96" height="124" fill="rgba(34,211,238,.12)"/><rect x="110" y="8" width="96" height="124" fill="rgba(255,181,71,.13)"/>
      ${[[24, 70, 100, 84, 1], [44, 82, 108, 90, 0], [64, 60, 92, 70, 1], [84, 50, 78, 58, 1], [104, 56, 84, 64, 0], [124, 40, 66, 48, 1], [144, 30, 58, 36, 1], [164, 38, 64, 56, 0], [184, 26, 50, 34, 1]].map(([x, hi, lo, c, up]) => `<line x1="${x}" x2="${x}" y1="${hi}" y2="${lo}" stroke="${up ? '#1FD18B' : '#FF6B7A'}" stroke-width="1.5"/><rect x="${x - 5}" y="${Math.min(hi + 8, c)}" width="10" height="${Math.abs(c - hi - 8) + 12}" rx="2" fill="${up ? '#1FD18B' : '#FF6B7A'}"/>`).join('')}
      ${[28, 56, 84, 112].map((y, i) => `<line x1="14" x2="206" y1="${y}" y2="${y}" stroke="#FFB547" stroke-dasharray="4 4" opacity="${0.9 - i * 0.18}"/>`).join('')}<text x="18" y="25" fill="#FFB547" font-size="9" font-weight="700">61,8%</text>
      ${[8, 20, 30, 44, 34, 24, 14, 8].map((w, i) => `<rect x="${252 - w * 1.5}" y="${14 + i * 15}" width="${w * 1.5}" height="11" rx="2" fill="rgba(124,108,255,${0.35 + w / 90})"/>`).join('')}</svg></div>`;
    case 'backing': return `<div class="art art-back">${[BACKING.ai, ...BACKING.data, BACKING.charts].map((n) => `<span class="chip3" data-notrans>${esc(n)}</span>`).join('')}</div>`;
    case 'plans': return `<div class="art art-plans">${[['Gratis', 'on', ''], ['Plus', '', 'Próximamente'], ['Pro', '', 'Próximamente']].map(([n, on, soon]) => `<div class="pmini ${on}"><b>${esc(t(n))}</b>${soon ? `<small>${esc(t(soon))}</small>` : `<small>${icon('check', 12)}</small>`}</div>`).join('')}</div>`;
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
  const finish = () => { markDone(); el.classList.add('out'); setTimeout(() => { el.remove(); o.onDone(); }, 320); };
  const afterTour = () => (o.keyStep ? (el.remove(), o.keyStep(() => { markDone(); o.onDone(); })) : finish());

  // ---------------------------------------------------------------- 1) carga con configuración inicial
  function splash() {
    const items = ['Conectando con los mercados', 'Cargando herramientas de análisis', 'Preparando tu espacio'];
    el.innerHTML = `<div class="intro-center">${logo3dHtml(150)}<h1 class="intro-brand">FinAgent</h1><p class="intro-tag">${esc(t('Tu analista financiero con IA'))}</p>
      <ul class="intro-checks">${items.map((s, i) => `<li data-i="${i}"><span class="ck"></span>${esc(t(s))}</li>`).join('')}</ul>
      <div class="intro-bar"><i id="i-bar"></i></div><div id="i-err" class="error-box hide" style="margin-top:14px"></div><button class="btn btn-primary hide" id="i-retry" style="margin-top:12px">${esc(t('Reintentar'))}</button></div>`;
    const bar = $('#i-bar', el), err = $('#i-err', el), retry = $<HTMLButtonElement>('#i-retry', el);
    const run = async () => {
      err.classList.add('hide'); retry.classList.add('hide'); el.querySelectorAll('.intro-checks li').forEach((li) => li.classList.remove('ok')); bar.style.width = '4%';
      const real = o.server ? ensureSession().then(() => true) : Promise.resolve(true);
      const ticks = items.map((_, i) => new Promise<void>((r) => setTimeout(() => { el.querySelector(`.intro-checks li[data-i="${i}"]`)?.classList.add('ok'); bar.style.width = `${Math.round(((i + 1) / items.length) * 100)}%`; r(); }, 700 * (i + 1))));
      try { await Promise.all([real, ...ticks]); setTimeout(() => (o.server && !hasSession() ? splash() : account()), 350); }
      catch (e) {
        const text = e instanceof AccessDeniedError ? t('Tu acceso a FinAgent fue desactivado. Si creés que es un error, escribinos.') : e instanceof ServerBusyError ? busyMessage(e) : t('No pude preparar tu cuenta. Revisá tu conexión e intentá de nuevo.');
        err.innerHTML = `${icon('warn', 18)}<span>${esc(text)}</span>`; err.classList.remove('hide');
        if (!(e instanceof AccessDeniedError)) retry.classList.remove('hide');
      }
    };
    retry.onclick = () => void run();
    void run();
  }

  // ---------------------------------------------------------------- 2) cuenta
  function account() {
    if (!o.server) return language();
    void fetchServerFlags().then(() => { if (el.querySelector('#a-google') && googleAvailable()) { const b = $<HTMLButtonElement>('#a-google', el); b.disabled = false; b.querySelector('em')?.remove(); } });
    el.innerHTML = `<div class="intro-card"><div class="intro-top">${logoSvg(58)}</div><h2>${esc(t('Entrá a FinAgent'))}</h2><p class="intro-sub">${esc(t('Tu cuenta guarda tu plan y tus límites diarios.'))}</p>
      <button class="auth-btn" id="a-google" ${googleAvailable() ? '' : 'disabled'}><span class="auth-ic g">G</span><span class="auth-t">${esc(t('Continuar con Google'))}</span>${googleAvailable() ? '' : `<em>${esc(t('Próximamente'))}</em>`}</button>
      <button class="auth-btn" disabled><span class="auth-ic">${icon('send', 16)}</span><span class="auth-t">${esc(t('Continuar con correo'))}</span><em>${esc(t('Próximamente'))}</em></button>
      <div class="intro-or"><span>${esc(t('o'))}</span></div>
      <button class="btn btn-primary btn-block" id="a-guest">${esc(t('Entrar como invitado'))}</button>
      <div id="a-err" class="error-box hide" style="margin-top:12px"></div>
      <p class="intro-note">${esc(t('Como invitado, tu cuenta queda en este teléfono: si desinstalás la app, perdés tu plan.'))}</p></div>`;
    const err = $('#a-err', el), showErr = (m: string) => { err.innerHTML = `${icon('warn', 18)}<span>${esc(m)}</span>`; err.classList.remove('hide'); };
    $('#a-guest', el).onclick = () => language();
    $('#a-google', el).onclick = async () => {
      err.classList.add('hide');
      try { await signInWithGoogle(); language(); }
      catch (e) { showErr(e instanceof GoogleError ? googleMessage(e) : e instanceof AccessDeniedError ? t('Tu acceso a FinAgent fue desactivado. Si creés que es un error, escribinos.') : t('No pude iniciar sesión con Google. Intentá de nuevo en un momento.')); }
    };
  }

  // ---------------------------------------------------------------- 3) idioma
  function language() {
    const cur = getLang();
    el.innerHTML = `<div class="intro-card"><div class="intro-top"><span class="intro-globe">${icon('globe', 30)}</span></div><h2>${esc(t('Elegí tu idioma'))}</h2><p class="intro-sub">${esc(t('Podés cambiarlo cuando quieras en Ajustes.'))}</p>
      <div class="lang-grid">${LANGS.map((l) => `<button class="lang-card ${l.id === cur ? 'on' : ''}" data-l="${l.id}" data-notrans><b class="lang-badge">${l.badge}</b><span>${esc(l.native)}</span>${l.id === cur ? icon('check', 18) : ''}</button>`).join('')}</div>
      <div class="lang-soon"><span>${esc(t('Próximamente'))}:</span> ${COMING_LANGS.map((x) => `<i data-notrans>${esc(x)}</i>`).join('')}</div>
      <p class="intro-note">${esc(t('La IA responde en el idioma en que le escribas.'))}</p>
      <button class="btn btn-primary btn-block" id="l-next" style="margin-top:14px">${esc(t('Continuar'))}</button></div>`;
    el.querySelectorAll<HTMLElement>('.lang-card').forEach((b) => { b.onclick = () => { setLang(b.dataset.l as UiLang); language(); }; });
    $('#l-next', el).onclick = () => tour(0);
  }

  // ---------------------------------------------------------------- 4) recorrido
  function tour(start: number) {
    let i = start;
    const n = TOUR.length;
    el.innerHTML = `<div class="tour"><button class="tour-skip" id="t-skip">${esc(t('Omitir'))}</button>
      <div class="tour-view"><div class="tour-track" id="t-track">${TOUR.map((s) => `<section class="slide"><div class="slide-art">${art(s.id)}</div><h2>${esc(t(s.title))}</h2><p>${esc(t(s.text))}</p>
        ${s.bullets ? `<ul>${s.bullets.map((b) => `<li>${icon('check', 15)}<span>${esc(t(b))}</span></li>`).join('')}</ul>` : ''}</section>`).join('')}</div></div>
      <div class="tour-dots" id="t-dots">${TOUR.map((_, k) => `<i data-k="${k}"></i>`).join('')}</div>
      <div class="tour-nav"><button class="btn btn-ghost" id="t-back">${esc(t('Atrás'))}</button><button class="btn btn-primary" id="t-next"></button></div></div>`;
    const track = $('#t-track', el), next = $('#t-next', el), back = $<HTMLButtonElement>('#t-back', el);
    const paint = () => {
      track.style.transform = `translateX(${-100 * i}%)`;
      el.querySelectorAll<HTMLElement>('#t-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
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

  splash();
}
