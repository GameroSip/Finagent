// El isotipo de FinAgent como una moneda en 3D (CSS 3D, sin librerías): capas apiladas que dan el espesor, anillos orbitales y velas flotantes.
import { logoSvg } from './logo';

export function logo3dHtml(size = 150): string {
  // Cada capa lleva su color ya oscurecido (sin filtros de brillo: mucho más liviano de dibujar, sobre todo en equipos sin aceleración gráfica).
  const shade = (c: [number, number, number], b: number) => `rgb(${Math.round(c[0] * b)},${Math.round(c[1] * b)},${Math.round(c[2] * b)})`;
  const layers = Array.from({ length: 10 }, (_, i) => { const b = 0.45 + i * 0.05; return `<div class="l3d-layer" style="--z:${((i - 4.5) * 3.2).toFixed(1)}px;background:linear-gradient(135deg,${shade([91, 77, 224], b)},${shade([27, 168, 212], b)})"></div>`; }).join('');
  return `<div class="l3d" style="--s:${size}px" aria-hidden="true"><div class="l3d-stage">
    <div class="l3d-ring r1"></div><div class="l3d-ring r2"></div>
    <div class="l3d-coin">${layers}<div class="l3d-face front">${logoSvg(size)}</div><div class="l3d-face back">${logoSvg(size)}</div></div>
    <i class="l3d-bar b1"></i><i class="l3d-bar b2"></i><i class="l3d-bar b3"></i><i class="l3d-bar b4"></i></div></div>`;
}
