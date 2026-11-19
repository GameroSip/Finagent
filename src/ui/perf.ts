const FX_KEY = 'finagent.fx';
export type Fx = 'auto' | 'full' | 'low';
export const getFx = (): Fx => { try { const v = globalThis.localStorage?.getItem(FX_KEY); return v === 'full' || v === 'low' ? v : 'auto'; } catch { return 'auto'; } };
export const fxLow = (): boolean => document.documentElement.classList.contains('lowfx');
/** Elección de la persona: "Completo" fuerza todos los efectos, "Ahorro" los apaga, "Auto" mide el teléfono. */
export function setFx(v: Fx): void {
  try { if (v === 'auto') globalThis.localStorage?.removeItem(FX_KEY); else globalThis.localStorage?.setItem(FX_KEY, v); } catch { /* sin almacenamiento */ }
  document.documentElement.classList.toggle('lowfx', v === 'low');
  if (v === 'auto') autoLowFx(true);
}

// Modo ahorro automático: si el teléfono tarda en dibujar cuadros, se apaga el vidrio (clase .lowfx en <html>).
export function autoLowFx(restart = false): void {
  if (restart) document.documentElement.classList.remove('lowfx');   // volver a "Auto" empieza de cero
  const mode = getFx();
  if (mode !== 'auto') { document.documentElement.classList.toggle('lowfx', mode === 'low'); return; }
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { document.documentElement.classList.add('lowfx'); return; }
    let last = 0, n = 0, slow = 0;
    const tick = (t: number) => {
      if (last) { n++; if (t - last > 34) slow++; }
      last = t;
      if (n < 45) requestAnimationFrame(tick);
      else if (slow / n > 0.3) document.documentElement.classList.add('lowfx');
    };
    setTimeout(() => requestAnimationFrame(tick), 1500);   // después de la animación de entrada
  } catch { /* sin medición: queda el diseño completo */ }
}

/** Anima un número de 0 al valor final (solo texto; respeta reduced-motion). */
export function countUp(el: HTMLElement, to: number, fmt: (n: number) => string, ms = 650): void {
  if (!Number.isFinite(to) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = k < 1 ? fmt(to * e) : fmt(to);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
