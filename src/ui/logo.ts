/** Isotipo de FinAgent: tendencia ascendente con destello (misma figura que el ícono de la app). */
export function logoSvg(size = 64): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 96 96" aria-hidden="true">
  <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C6CFF"/><stop offset=".55" stop-color="#4F8CFF"/><stop offset="1" stop-color="#22D3EE"/></linearGradient></defs>
  <rect width="96" height="96" rx="26" fill="url(#lg)"/>
  <path d="M20 66 L38 48 L50 58 L72 32" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M72 18 L75 27 L84 30 L75 33 L72 42 L69 33 L60 30 L69 27 Z" fill="#fff"/></svg>`;
}
