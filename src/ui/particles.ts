// Partículas flotantes en un <canvas> 2D contenido dentro de un bloque (no es una capa global: así no pesa sobre las listas).
// Se detiene solo cuando el bloque no se ve, la app está en segundo plano o el modo es "Ahorro".
import { fxLow } from './perf';

interface P { x: number; y: number; r: number; vx: number; vy: number; a: number; ph: number }

export function mountParticles(host: HTMLElement, opts: { count?: number; rgb?: string; link?: boolean } = {}): () => void {
  if (fxLow()) return () => {};
  const cv = document.createElement('canvas');
  cv.className = 'fx-particles'; cv.setAttribute('aria-hidden', 'true');
  host.prepend(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) { cv.remove(); return () => {}; }
  const rgb = opts.rgb ?? '214,178,106', n = opts.count ?? 34;
  let w = 0, h = 0, ps: P[] = [], raf = 0, visible = true, dead = false;
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const size = () => { w = host.clientWidth; h = host.clientHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  const seed = () => { ps = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: 0.6 + Math.random() * 1.8, vx: (Math.random() - 0.5) * 0.18, vy: -0.05 - Math.random() * 0.22, a: 0.18 + Math.random() * 0.5, ph: Math.random() * 6.28 })); };
  const frame = (t: number) => {
    if (dead) return;
    raf = 0;
    if (!visible || document.hidden || fxLow()) return;
    ctx.clearRect(0, 0, w, h);
    for (const p of ps) {
      p.x += p.vx + Math.sin(t / 2400 + p.ph) * 0.06; p.y += p.vy;
      if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
      if (p.x < -4) p.x = w + 4; else if (p.x > w + 4) p.x = -4;
      ctx.beginPath(); ctx.fillStyle = `rgba(${rgb},${(p.a * (0.6 + 0.4 * Math.sin(t / 900 + p.ph))).toFixed(3)})`; ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
    if (opts.link) {                                                   // finas líneas entre partículas cercanas (constelación)
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        const dx = ps[i].x - ps[j].x, dy = ps[i].y - ps[j].y, d2 = dx * dx + dy * dy;
        if (d2 < 3600) { ctx.strokeStyle = `rgba(${rgb},${(0.12 * (1 - d2 / 3600)).toFixed(3)})`; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(ps[i].x, ps[i].y); ctx.lineTo(ps[j].x, ps[j].y); ctx.stroke(); }
      }
    }
    raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(frame); };
  size(); seed();
  const io = new IntersectionObserver((e) => { visible = !!e[0]?.isIntersecting; if (visible) kick(); });
  io.observe(host);
  const ro = new ResizeObserver(() => { size(); seed(); }); ro.observe(host);
  document.addEventListener('visibilitychange', kick);
  kick();
  return () => { dead = true; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', kick); cv.remove(); };
}
