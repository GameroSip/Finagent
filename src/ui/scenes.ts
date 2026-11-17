// Fondos "fotográficos" de la introducción: escenas de arquitectura financiera dibujadas en SVG (propias, sin derechos de terceros ni descargas).
// Se instalan como variables CSS (--sc-columns, --sc-towers, --sc-glass, --sc-metal) y las usan las pantallas de carga e introducción.
const LIGHT = `<defs>
  <linearGradient id="lt" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".55" stop-color="#cfd6de" stop-opacity=".45"/><stop offset="1" stop-color="#8a96a3" stop-opacity=".12"/></linearGradient>
  <linearGradient id="col" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".35" stop-color="#fff" stop-opacity=".6"/><stop offset=".7" stop-color="#9aa6b2" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></linearGradient>
  <radialGradient id="glow" cx=".85" cy=".08" r=".7"><stop offset="0" stop-color="#E9D3A0" stop-opacity=".55"/><stop offset="1" stop-color="#E9D3A0" stop-opacity="0"/></radialGradient>
</defs><rect width="400" height="800" fill="#05080c"/><rect width="400" height="800" fill="url(#glow)"/>`;

const columns = () => {
  const cols = Array.from({ length: 6 }, (_, i) => `<rect x="${34 + i * 60}" y="250" width="34" height="400" fill="url(#col)"/><rect x="${28 + i * 60}" y="238" width="46" height="14" fill="url(#lt)" opacity=".7"/><rect x="${28 + i * 60}" y="648" width="46" height="12" fill="url(#lt)" opacity=".7"/>`).join('');
  return `${LIGHT}<polygon points="14,236 200,120 386,236" fill="url(#lt)" opacity=".55"/><rect x="14" y="236" width="372" height="14" fill="url(#lt)" opacity=".8"/>${cols}
  ${[0, 1, 2, 3].map((i) => `<rect x="${6 - i * 0}" y="${662 + i * 18}" width="${388 - 0}" height="14" fill="url(#lt)" opacity="${0.5 - i * 0.1}"/>`).join('')}`;
};
const towers = () => {
  const bs = [[10, 380, 58], [74, 250, 48], [128, 430, 66], [200, 190, 54], [260, 330, 60], [326, 270, 64]];
  return `${LIGHT}${bs.map(([x, y, w]) => {
    let win = ''; for (let yy = y + 14; yy < 760; yy += 18) for (let xx = x + 8; xx < x + w - 8; xx += 12) if (((xx * 7 + yy * 13) % 5) < 2) win += `<rect x="${xx}" y="${yy}" width="5" height="8" fill="#E9D3A0" opacity="${0.12 + ((xx + yy) % 4) * 0.08}"/>`;
    return `<rect x="${x}" y="${y}" width="${w}" height="${800 - y}" fill="url(#col)" opacity=".85"/>${win}`;
  }).join('')}`;
};
const glass = () => `${LIGHT}${[[0, 0, 400, 260, 0], [0, 260, 400, 560, 1], [120, 0, 400, 520, 2], [0, 520, 300, 800, 3]].map(([x1, y1, x2, y2, k]) => `<polygon points="${x1},${y1} ${x2},${y1 + (k % 2 ? 60 : 0)} ${x2 - 80},${y2} ${x1},${y2 - 40}" fill="url(#lt)" opacity="${0.22 + k * 0.06}"/>`).join('')}
  ${Array.from({ length: 10 }, (_, i) => `<line x1="${-40 + i * 50}" y1="800" x2="${160 + i * 50}" y2="0" stroke="#fff" stroke-opacity=".07"/>`).join('')}`;
const metal = () => `${LIGHT}${Array.from({ length: 80 }, (_, i) => `<line x1="0" x2="400" y1="${i * 10 + 4}" y2="${i * 10 + 4}" stroke="#fff" stroke-opacity="${0.025 + ((i * 37) % 7) * 0.012}" stroke-width="${1 + (i % 3)}"/>`).join('')}
  <rect width="400" height="800" fill="url(#lt)" opacity=".12"/>`;

const SCENES = { columns, towers, glass, metal };
export type Scene = keyof typeof SCENES;
const uri = (s: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">${s}</svg>`)}")`;

/** Define las variables CSS con cada escena (una sola vez al arrancar). */
export function installScenes(): void {
  const st = document.documentElement.style;
  (Object.keys(SCENES) as Scene[]).forEach((k) => st.setProperty(`--sc-${k}`, uri(SCENES[k]())));
}
