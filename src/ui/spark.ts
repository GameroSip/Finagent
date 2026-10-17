// Mini-gráficos SVG (sin librerías): línea + degradé, verde/rojo según la tendencia.
let uid = 0;

export function sparkSvg(values: number[], opts: { w?: number; h?: number; up?: boolean; stroke?: number } = {}): string {
  const w = opts.w ?? 96, h = opts.h ?? 34, sw = opts.stroke ?? 1.8;
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"></svg>`;
  const up = opts.up ?? v[v.length - 1] >= v[0];
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pad = sw + 1;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * w, pad + (1 - (x - min) / span) * (h - pad * 2)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const id = `sg${++uid}`;
  const col = up ? 'var(--up)' : 'var(--down)';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".32"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <path d="${d} L${w} ${h} L0 ${h} Z" fill="url(#${id})"/>
    <path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
