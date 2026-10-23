// Genera el ícono y el splash (PNG) a partir de SVG. Uso: node scripts/make-assets.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('assets', { recursive: true });
const BRASS = '#D6B26A', INK = '#121316';
// La "F" de FinAgent (misma figura que src/ui/logo.ts), centrada en un lienzo de 1024.
const mark = (scale) => `<g transform="translate(512 512) scale(${scale}) translate(-42.6 -50)"><path d="M0 100H22V56H56L66.8 38H22V22H72L85.2 0H0Z" fill="${BRASS}"/></g>`;
const svg = (size, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`);

const jobs = {
  'icon-only.png': svg(1024, `<rect width="1024" height="1024" fill="${INK}"/>${mark(5.2)}`),
  'icon-background.png': svg(1024, `<rect width="1024" height="1024" fill="${INK}"/>`),
  'icon-foreground.png': svg(1024, mark(4.4)),
  // splash: fondo grafito liso y la figura centrada (sin resplandores)
  'splash.png': svg(2732, `<rect width="2732" height="2732" fill="${INK}"/><g transform="translate(1366 1366)"><g transform="translate(-512 -512)">${mark(10.4)}</g></g>`),
};
jobs['splash-dark.png'] = jobs['splash.png'];
for (const [name, buf] of Object.entries(jobs)) { await sharp(buf).png().toFile(`assets/${name}`); console.log('ok', name); }
