// Recursos gráficos para la ficha de Google Play, generados desde la app real (con los datos simulados de las pruebas, no con cotizaciones reales).
//   (en la raíz) npm run build        → compila la app en modo desarrollo (con clave de prueba)
//   cd e2e && node make-play-assets.mjs ../dist ../play-assets
// Medidas que exige Play: capturas de teléfono con proporción de hasta 2:1 (acá 1080×2160); imagen destacada 1024×500; ícono 512×512.
import { mkdirSync, readFileSync } from 'node:fs';
import { browser, newPage, say, server, sleep, tab, waitAnswer } from './run.mjs';

const OUT = process.argv[3] ?? '../play-assets';
mkdirSync(`${OUT}/capturas`, { recursive: true });
const click = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
const p = await newPage({ lang: 'es', theme: 'dark', height: 720 });
await p.setViewport({ width: 360, height: 720, deviceScaleFactor: 3 });             // 1080×2160
await p.reload({ waitUntil: 'load' }); await p.waitForSelector('.tabbar', { timeout: 20000 }); await sleep(2500);
const snap = async (n) => { await sleep(700); await p.screenshot({ path: `${OUT}/capturas/${n}.png` }); console.log('captura', n); };

await tab(p, 'market'); await sleep(1500); await snap('01-mercados');
await p.evaluate(() => document.querySelector('.idx').click()); await p.waitForSelector('#a-ranges', { timeout: 15000 }); await p.waitForSelector('#a-move-range', { timeout: 15000 }); await sleep(1500); await snap('02-grafico-de-un-activo');
await p.evaluate(() => document.querySelector('#a-stress').scrollIntoView({ block: 'start' })); await snap('03-movimiento-esperado-y-tension');
await click(p, '#a-star'); await sleep(300); await click(p, '#a-back'); await sleep(600);
await tab(p, 'chat'); await sleep(600); await say(p, '¿Cómo viene Apple? Mostrame las cifras y de dónde salen.'); await waitAnswer(p, 1); await sleep(1500); await snap('04-asistente-con-fuentes');
await tab(p, 'watch'); await sleep(1500); await snap('05-favoritos');

// Imagen destacada 1024×500: se arma sobre la propia app para usar sus tipografías
const mark = readFileSync('../src/ui/logo.ts', 'utf8');
const path = /MARK_PATH\s*=\s*['"`]([^'"`]+)['"`]/.exec(mark)?.[1];
const f = await browser.newPage(); await f.setViewport({ width: 1024, height: 500, deviceScaleFactor: 1 });
await f.goto(`http://localhost:${server.address().port}/`); await sleep(1500);
await f.evaluate((d) => {
  document.body.innerHTML = `<div style="position:fixed;inset:0;background:#0E0E10;color:#F2EFE8;font-family:'IBM Plex Sans',system-ui,sans-serif;display:flex;align-items:center;padding:0 72px;gap:56px">
    <svg viewBox="0 0 85.2 100" width="162" height="190" style="flex:none"><path d="${d ?? ''}" fill="#D6B26A"/></svg>
    <div><div style="font-size:78px;font-weight:600;letter-spacing:-.02em;line-height:1">FinAgent</div>
    <div style="margin-top:20px;font-size:34px;line-height:1.25;color:#D6B26A">Mercados claros.<br>Cifras con fuente.</div>
    <div style="margin-top:22px;font-size:22px;color:#9b9a95">Herramienta educativa · No es asesoramiento financiero</div></div></div>`;
}, path);
await sleep(800); await f.evaluate(() => document.fonts.ready); await f.screenshot({ path: `${OUT}/imagen-destacada-1024x500.png` }); console.log('imagen destacada', path ? '(con el logo de la app)' : '(SIN logo: no encontré MARK_PATH)');
await browser.close(); server.close();
