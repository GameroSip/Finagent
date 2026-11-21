// Recorrido interactivo del menú de inicio: oscurece la pantalla con una máscara SVG y deja un recorte redondeado sobre cada
// tarjeta (data-tour). El recorte viaja de una tarjeta a la siguiente con una curva suave; una tarjeta explicativa se ubica
// arriba o abajo sin salirse nunca de la pantalla.
// Se muestra una sola vez (clave finagent_home_tour_v1). No se lanza solo si la URL trae ?skipTour=1 o si el navegador está
// automatizado (pruebas e2e). startHomeTour({ force: true }) lo repite desde Ajustes.
import { t } from './i18n';
import { esc } from './ui/dom';

export const TOUR_KEY = 'finagent_home_tour_v1';

/** Todos los textos del recorrido (se traducen con t()). Sin promesas de inmediatez ni de asesoramiento. */
export const TOUR_TEXTS = {
  skip: 'Saltar', prev: 'Anterior', next: 'Siguiente', start: 'Empezar', what: 'Qué podés hacer acá', label: 'Recorrido por FinAgent',
  steps: [
    { target: 'chat', title: 'Tu analista, con cifras verificadas', body: 'Escribí, dictá o adjuntá una captura. Calcula con herramientas y marca qué números pudo comprobar.',
      chips: ['Analizar una acción', 'Dictar una pregunta', 'Leer la captura de tu broker'] },
    { target: 'market', title: 'El mercado de un vistazo', body: 'Índices, dólar, cripto y titulares de fuentes públicas. Algunos datos pueden tener demora.',
      chips: ['Ver el dólar y la brecha', 'Abrir un gráfico técnico', 'Buscar cualquier activo'] },
    { target: 'radar', title: 'Termómetro de tensión', body: 'Cuenta cuántas señales de estrés se cumplen hoy en el S&P 500. No predice precios: muestra si el mercado está nervioso.',
      chips: ['Ver las cuatro señales', 'Comparar con la historia', 'Mirarlo en cada activo'] },
    { target: 'portfolio', title: 'Tu cartera, en tu teléfono', body: 'Cargala a mano, con un archivo o con una captura del broker. Los datos no salen de tu dispositivo.',
      chips: ['Importar con una captura', 'Ver la distribución', 'Exportar un informe PDF'] },
    { target: 'calc', title: 'Probá escenarios', body: '¿Y si el dólar sube un 20 %? ¿Cuánto juntás aportando todos los meses? Cuentas con tus supuestos, no predicciones.',
      chips: ['Simular una suba del dólar', 'Calcular aportes mensuales', 'Guardar el escenario en PDF'] },
  ],
} as const;
export const tourTexts = (): string[] => [TOUR_TEXTS.skip, TOUR_TEXTS.prev, TOUR_TEXTS.next, TOUR_TEXTS.start, TOUR_TEXTS.what, TOUR_TEXTS.label,
  ...TOUR_TEXTS.steps.flatMap((s) => [s.title, s.body, ...s.chips])];

// ------------------------------------------------------------------ lógica pura (con pruebas)
export interface Box { top: number; bottom: number; left: number; right: number }

/** ¿Corresponde lanzarlo solo? Nunca si ya se vio, si la URL pide saltearlo o si es un navegador automatizado. */
export function shouldAutoStart(env: { done: boolean; search: string; webdriver: boolean }): boolean {
  if (env.done || env.webdriver) return false;
  return new URLSearchParams(env.search).get('skipTour') !== '1';
}

/** Dónde va la tarjeta: abajo si entra, si no arriba, y si no entra en ningún lado, del lado con más espacio; siempre dentro de la pantalla. */
export function placeCard(target: Box, vh: number, cardH: number, safeTop: number, safeBottom: number, gap = 14): { top: number; side: 'above' | 'below' } {
  const below = vh - safeBottom - (target.bottom + gap), above = target.top - gap - safeTop;
  let side: 'above' | 'below', top: number;
  if (below >= cardH) { side = 'below'; top = target.bottom + gap; }
  else if (above >= cardH) { side = 'above'; top = target.top - gap - cardH; }
  else if (below >= above) { side = 'below'; top = target.bottom + gap; }
  else { side = 'above'; top = target.top - gap - cardH; }
  const max = vh - safeBottom - cardH;
  return { side, top: Math.round(Math.max(safeTop, Math.min(top, Math.max(safeTop, max)))) };
}

/** cubic-bezier(0.22, 1, 0.36, 1) resuelto por Newton (para el recorrido del recorte, que se anima atributo por atributo). */
export function ease(x: number): number {
  const p1x = 0.22, p1y = 1, p2x = 0.36, p2y = 1;
  const bx = (u: number) => 3 * p1x * u * (1 - u) ** 2 + 3 * p2x * u * u * (1 - u) + u ** 3;
  const by = (u: number) => 3 * p1y * u * (1 - u) ** 2 + 3 * p2y * u * u * (1 - u) + u ** 3;
  const dx = (u: number) => 3 * p1x * (1 - u) ** 2 + 6 * (p2x - p1x) * u * (1 - u) + 3 * (1 - p2x) * u * u;
  let u = Math.min(1, Math.max(0, x));
  for (let i = 0; i < 8; i++) { const d = dx(u); if (Math.abs(d) < 1e-6) break; u = Math.min(1, Math.max(0, u - (bx(u) - x) / d)); }
  return by(u);
}

// ------------------------------------------------------------------ interfaz
let active: { close: () => void } | null = null;
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } } };

/** Para el botón "atrás" de Android: cierra el recorrido si está abierto. */
export function closeTour(): boolean { if (!active) return false; active.close(); return true; }
export const tourOpen = (): boolean => active !== null;

/** Se llama al entrar a la app. Devuelve una promesa que termina cuando el recorrido se cierra (o enseguida si no corresponde). */
export function maybeStartHomeTour(delay = 1400): Promise<void> {
  const ok = shouldAutoStart({ done: store.get(TOUR_KEY) !== null, search: location.search, webdriver: !!navigator.webdriver });
  if (!ok) return Promise.resolve();
  return new Promise((res) => setTimeout(() => { void startHomeTour().then(res); }, delay));
}

export function startHomeTour(opts: { force?: boolean } = {}): Promise<void> {
  if (active) return Promise.resolve();
  if (!opts.force && store.get(TOUR_KEY) !== null) return Promise.resolve();
  // el menú está arriba de Mercados: se va ahí si hace falta
  const marketView = document.querySelector<HTMLElement>('#view-market');
  if (marketView?.classList.contains('hide')) document.querySelector<HTMLButtonElement>('.tab[data-tab="market"]')?.click();
  const steps = TOUR_TEXTS.steps.filter((s) => document.querySelector(`[data-tour="${s.target}"]`));
  if (!steps.length) return Promise.resolve();

  return new Promise((resolve) => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('lowfx');
    const root = document.createElement('div');
    root.className = 'tour';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', t(TOUR_TEXTS.label));
    root.innerHTML = `<svg class="tour-mask" aria-hidden="true"><defs><mask id="tour-m" maskUnits="userSpaceOnUse"><rect x="0" y="0" width="100%" height="100%" fill="#fff"/><rect class="tour-hole" fill="#000"/></mask></defs><rect class="tour-dim" x="0" y="0" width="100%" height="100%" mask="url(#tour-m)"/></svg>
      <div class="tour-ring" aria-hidden="true"></div>
      <div class="tour-card" aria-live="polite"><div class="tour-prog"></div><div class="tour-body"></div>
        <div class="tour-nav"><button class="tour-skip" type="button">${esc(t(TOUR_TEXTS.skip))}</button><span style="flex:1"></span><button class="tour-prev" type="button">${esc(t(TOUR_TEXTS.prev))}</button><button class="tour-next" type="button"></button></div></div>`;
    document.body.append(root);
    const hole = root.querySelector<SVGRectElement>('.tour-hole')!, ring = root.querySelector<HTMLElement>('.tour-ring')!, card = root.querySelector<HTMLElement>('.tour-card')!;
    const prevBtn = root.querySelector<HTMLButtonElement>('.tour-prev')!, nextBtn = root.querySelector<HTMLButtonElement>('.tour-next')!;
    const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;top:0;height:var(--st,0px);bottom:auto;visibility:hidden'; root.append(probe);
    const probe2 = document.createElement('div'); probe2.style.cssText = 'position:fixed;top:0;height:var(--sb,0px);visibility:hidden'; root.append(probe2);
    const safeTop = () => probe.offsetHeight + 10, safeBottom = () => probe2.offsetHeight + 12;

    let i = 0, target: HTMLElement | null = null, cur = { x: 0, y: 0, w: innerWidth, h: innerHeight, r: 0 }, raf = 0, timer = 0, closed = false;
    const PAD = 6;

    const drawHole = (b: typeof cur) => {
      hole.setAttribute('x', b.x.toFixed(1)); hole.setAttribute('y', b.y.toFixed(1)); hole.setAttribute('width', Math.max(0, b.w).toFixed(1));
      hole.setAttribute('height', Math.max(0, b.h).toFixed(1)); hole.setAttribute('rx', b.r.toFixed(1)); hole.setAttribute('ry', b.r.toFixed(1));
      ring.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px)`; ring.style.width = `${b.w.toFixed(1)}px`; ring.style.height = `${b.h.toFixed(1)}px`; ring.style.borderRadius = `${b.r}px`;
    };
    const boxOf = (el: HTMLElement) => {
      const r = el.getBoundingClientRect(), rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 20;
      return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2, r: rad + PAD };
    };
    const moveTo = (to: typeof cur, animate: boolean) => {
      cancelAnimationFrame(raf); raf = 0;
      if (!animate || reduced) { cur = to; drawHole(cur); return; }
      const from = { ...cur }, t0 = performance.now(), dur = 520;
      const tick = (now: number) => {
        const k = ease(Math.min(1, (now - t0) / dur));
        cur = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, w: from.w + (to.w - from.w) * k, h: from.h + (to.h - from.h) * k, r: from.r + (to.r - from.r) * k };
        drawHole(cur);
        if (k < 1) raf = requestAnimationFrame(tick); else raf = 0;
      };
      raf = requestAnimationFrame(tick);
    };
    const placeCardNow = () => {
      if (!target) return;
      const b = boxOf(target);
      const pos = placeCard({ top: b.y, bottom: b.y + b.h, left: b.x, right: b.x + b.w }, innerHeight, card.offsetHeight, safeTop(), safeBottom());
      card.style.transform = `translateY(${pos.top}px)`;
      card.dataset.side = pos.side;
    };
    const render = () => {
      const s = steps[i], n = steps.length;
      root.querySelector('.tour-prog')!.innerHTML = `<div class="tour-seg">${steps.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('')}</div><span class="tour-count num">${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}</span>`;
      root.querySelector('.tour-body')!.innerHTML = `<h2 class="tour-t">${esc(t(s.title))}</h2><p class="tour-p">${esc(t(s.body))}</p>
        <div class="tour-what">${esc(t(TOUR_TEXTS.what))}</div><div class="tour-chips">${s.chips.map((c) => `<span>${esc(t(c))}</span>`).join('')}</div>`;
      prevBtn.disabled = i === 0;
      nextBtn.textContent = t(i === n - 1 ? TOUR_TEXTS.start : TOUR_TEXTS.next);
      card.classList.remove('tour-swap'); void card.offsetWidth; card.classList.add('tour-swap');
    };
    const focusStep = () => {
      target?.classList.remove('tour-active-target');
      target = document.querySelector<HTMLElement>(`[data-tour="${steps[i].target}"]`);
      render();
      if (!target) return;
      target.classList.add('tour-active-target');
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      // se espera a que el desplazamiento termine (la posición deja de cambiar) antes de mover el recorte
      clearTimeout(timer);
      let last = -1, stable = 0, tries = 0;
      const settle = () => {
        if (closed || !target) return;
        const y = target.getBoundingClientRect().top;
        stable = Math.abs(y - last) < 0.5 ? stable + 1 : 0; last = y;
        if (stable >= 2 || ++tries > 40) { moveTo(boxOf(target), true); placeCardNow(); return; }
        timer = window.setTimeout(settle, 40);
      };
      settle();
    };
    const go = (d: number) => { const j = i + d; if (j < 0) return; if (j >= steps.length) { finish(); return; } i = j; focusStep(); };
    const finish = () => {
      if (closed) return; closed = true;
      store.set(TOUR_KEY, String(Date.now()));
      cancelAnimationFrame(raf); clearTimeout(timer);
      target?.classList.remove('tour-active-target');
      removeEventListener('resize', onResize); document.removeEventListener('keydown', onKey); document.querySelector('.view:not(.hide)')?.removeEventListener('scroll', onScroll);
      root.classList.add('tour-out');
      setTimeout(() => { root.remove(); active = null; resolve(); }, reduced ? 0 : 260);
    };
    const onResize = () => { if (target) { moveTo(boxOf(target), false); placeCardNow(); } };
    const onScroll = () => { if (target && !raf) { moveTo(boxOf(target), false); placeCardNow(); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'Escape') finish(); };
    let sx = 0, sy = 0;
    root.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    root.addEventListener('touchend', (e) => { const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1); }, { passive: true });
    root.querySelector<HTMLButtonElement>('.tour-skip')!.onclick = finish;
    prevBtn.onclick = () => go(-1); nextBtn.onclick = () => go(1);
    addEventListener('resize', onResize); document.addEventListener('keydown', onKey);
    document.querySelector('.view:not(.hide)')?.addEventListener('scroll', onScroll, { passive: true });
    active = { close: finish };
    requestAnimationFrame(() => { root.classList.add('tour-in'); drawHole(cur); focusStep(); nextBtn.focus({ preventScroll: true }); });
  });
}
