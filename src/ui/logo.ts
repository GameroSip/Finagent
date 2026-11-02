/** Isotipo de FinAgent: una "F" cuyos brazos terminan en diagonal, como un despegue. Una sola figura geométrica (se extruye tal cual en el logo 3D). */
export const MARK_PATH = 'M0 100H22V56H56L66.8 38H22V22H72L85.2 0H0Z';          // 85,2 × 100 unidades (el eje Y baja, como en SVG)
export const MARK_POINTS: Array<[number, number]> = [[0, 100], [22, 100], [22, 56], [56, 56], [66.8, 38], [22, 38], [22, 22], [72, 22], [85.2, 0], [0, 0]];
export const BRASS = '#D6B26A';

/** Solo la figura (para iconos chicos y estados de carga sin WebGL). */
export function markSvg(size = 48, color = BRASS): string {
  return `<svg width="${size}" height="${Math.round(size * 100 / 85.2)}" viewBox="0 0 85.2 100" aria-hidden="true"><path d="${MARK_PATH}" fill="${color}"/></svg>`;
}
/** La figura sobre una base grafito (el ícono de la app). */
export function logoSvg(size = 64): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 96 96" aria-hidden="true"><rect width="96" height="96" rx="20" fill="#17191D"/><rect x=".5" y=".5" width="95" height="95" rx="19.5" fill="none" stroke="rgba(255,255,255,.1)"/>
  <path transform="translate(21.6 17) scale(.62)" d="${MARK_PATH}" fill="${BRASS}"/></svg>`;
}
