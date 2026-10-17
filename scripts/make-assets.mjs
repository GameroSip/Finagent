// Genera el ícono y el splash (PNG) a partir de SVG. Uso: node scripts/make-assets.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('assets', { recursive: true });
const GRAD = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C6CFF"/><stop offset=".55" stop-color="#4F8CFF"/><stop offset="1" stop-color="#22D3EE"/></linearGradient>`;
const mark = (scale) => `<g transform="translate(512 512) scale(${scale}) translate(-52 -42)">
  <path d="M20 66 L38 48 L50 58 L72 32" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M72 18 L75 27 L84 30 L75 33 L72 42 L69 33 L60 30 L69 27 Z" fill="#fff"/></g>`;
const svg = (size, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`);

const jobs = {
  'icon-only.png': svg(1024, `<defs>${GRAD}</defs><rect width="1024" height="1024" fill="url(#g)"/>${mark(8.6)}`),
  'icon-background.png': svg(1024, `<defs>${GRAD}</defs><rect width="1024" height="1024" fill="url(#g)"/>`),
  'icon-foreground.png': svg(1024, mark(7.6)),
  // splash: fondo oscuro con un resplandor suave y el isotipo centrado
  'splash.png': svg(2732, `<defs>${GRAD}<radialGradient id="a" cx=".3" cy=".25" r=".6"><stop offset="0" stop-color="#7C6CFF" stop-opacity=".30"/><stop offset="1" stop-color="#7C6CFF" stop-opacity="0"/></radialGradient>
    <radialGradient id="b" cx=".8" cy=".2" r=".5"><stop offset="0" stop-color="#22D3EE" stop-opacity=".18"/><stop offset="1" stop-color="#22D3EE" stop-opacity="0"/></radialGradient></defs>
    <rect width="2732" height="2732" fill="#05070C"/><rect width="2732" height="2732" fill="url(#a)"/><rect width="2732" height="2732" fill="url(#b)"/>
    <g transform="translate(1366 1366)"><rect x="-300" y="-300" width="600" height="600" rx="164" fill="url(#g)"/>
    <g transform="scale(1.0) translate(-512 -512)">${mark(5.6)}</g></g>`),
};
jobs['splash-dark.png'] = jobs['splash.png'];
for (const [name, buf] of Object.entries(jobs)) { await sharp(buf).png().toFile(`assets/${name}`); console.log('ok', name); }
