// Herramientas del gráfico en un navegador real: se activan, se dibujan sobre el gráfico y se recuerdan.
//   npm run build && cd e2e && node run-charts.mjs ../dist ../e2e-shots
import * as M from './mocks.mjs';
import { browser, check, checks, log, newPage, shot, server, sleep, tab } from './run.mjs';

M.setMockNow(Date.parse('2026-10-20T20:00:00Z') / 1000);     // martes 20:00 UTC: abiertas Londres y Nueva York; el rango 1S incluye también Asia
const text = (p, sel) => p.$eval(sel, (e) => e.textContent).catch(() => '');
const overlayPixels = (p) => p.evaluate(() => { const c = document.querySelector('.chart-overlay'); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
const toggle = (p, ids) => p.evaluate((l) => { for (const id of l) document.querySelector(`.tgl[data-t="${id}"]`).click(); }, ids);
const closeSheet = async (p) => { await p.evaluate(() => document.querySelector('.sheet-back').click()); await sleep(450); };
const chartH = (p) => p.$eval('#a-chart', (e) => parseInt(e.style.height));
const openAsset = async (p) => { await p.evaluate(() => document.querySelector('.idx').click()); await p.waitForSelector('.asset-ov canvas', { timeout: 8000 }); await sleep(1400); };

let p = await newPage({ height: 1150 }); await sleep(1800); await openAsset(p);
check('el gráfico tiene el botón "Herramientas" (con el volumen activado por defecto)', /Herramientas/.test(await text(p, '#a-tools')) && /· 1/.test(await text(p, '#a-tools-n')), await text(p, '#a-tools'));

// 1) el menú: 12 herramientas, cada una explicada, y las de intradía bloqueadas en el rango de 6 meses
await p.click('#a-tools'); await p.waitForSelector('.tools-sheet', { timeout: 4000 }); await sleep(300);
const rows = await p.$$eval('.tool-row', (r) => r.map((x) => ({ n: x.querySelector('b').textContent, off: x.classList.contains('off'), d: x.querySelector('small').textContent.length })));
check('el menú lista las 12 herramientas, todas con una explicación', rows.length === 12 && rows.every((r) => r.d > 40), JSON.stringify(rows.map((r) => r.n)));
check('VWAP y Sesiones de mercado están bloqueadas en 6M y dicen por qué', rows.filter((r) => r.off).map((r) => r.n).sort().join() === 'Sesiones de mercado,VWAP' && /Solo en los rangos 1D y 1S/.test(await text(p, '.tool-row.off .tool-why')));
await shot(p, 'C0-menu-herramientas');

// 2) se activan las herramientas sobre el gráfico diario
await toggle(p, ['ema50', 'bollinger', 'fib', 'pivots', 'profile', 'rsi', 'macd']); await sleep(900);
await closeSheet(p); await sleep(700);
check('el contador del botón muestra las 8 herramientas activas', /· 8/.test(await text(p, '#a-tools-n')), await text(p, '#a-tools-n'));
check('el gráfico crece para alojar los paneles de RSI y MACD (250 + 2 × 92 px)', (await chartH(p)) === 434, String(await chartH(p)));
check('el perfil de volumen se dibuja sobre el gráfico (capa propia con píxeles)', (await overlayPixels(p)) > 300, String(await overlayPixels(p)));
check('no apareció ningún aviso de herramienta que no se pueda dibujar', !(await p.$('.toast.show')) || !/necesita|No hay|solo se muestra/i.test(await text(p, '.toast')), await text(p, '.toast'));
await shot(p, 'C1-diario-herramientas');

// 3) con velas
await p.click('#a-mode [data-m="candles"]'); await sleep(1200);
check('con velas siguen dibujándose las herramientas', (await overlayPixels(p)) > 300 && (await chartH(p)) === 434);
await shot(p, 'C2-velas-herramientas');

// 4) intradía: ahora VWAP y sesiones se pueden usar
await p.click('#a-ranges [data-r="1D"]'); await sleep(1600);
await p.click('#a-tools'); await p.waitForSelector('.tools-sheet', { timeout: 4000 }); await sleep(300);
check('en 1D se habilitan VWAP y Sesiones', (await p.$$eval('.tool-row.off', (r) => r.length)) === 0);
await toggle(p, ['vwap', 'sessions']); await sleep(900); await closeSheet(p); await sleep(900);
const px1d = await overlayPixels(p);
check('en 1D se sombrean las sesiones (Londres y Nueva York) sobre el gráfico', px1d > 3000, String(px1d));
await shot(p, 'C3-1D-sesiones-vwap');
// pivotes: en 1D no hay "día anterior" -> avisa en vez de inventar
await p.click('#a-tools'); await p.waitForSelector('.tools-sheet', { timeout: 4000 }); await sleep(300);
await toggle(p, ['pivots']); await sleep(300); await toggle(p, ['pivots']); await sleep(1000); await closeSheet(p);
check('los pivotes en 1D avisan que faltan datos del día anterior (no inventan niveles)', /día anterior/.test(await text(p, '.toast')), await text(p, '.toast'));

// 5) una semana: se ven las tres sesiones
await p.click('#a-ranges [data-r="1S"]'); await sleep(1800);
check('en 1S el gráfico sigue con sus herramientas', (await overlayPixels(p)) > 3000, String(await overlayPixels(p)));
await shot(p, 'C4-1S-tres-sesiones');
await p.close();

// 6) las herramientas elegidas se recuerdan al volver a abrir
p = await newPage({ height: 1150 }); await sleep(1800); await openAsset(p);
check('al reabrir la app se recuerdan las herramientas elegidas', /· 10/.test(await text(p, '#a-tools-n')) || /· 9/.test(await text(p, '#a-tools-n')) || /· 8/.test(await text(p, '#a-tools-n')), await text(p, '#a-tools-n'));
await p.close();

const bad = checks.filter((c) => !c.ok);
console.log(`\nRESULTADO (herramientas del gráfico): ${checks.length - bad.length}/${checks.length} verificaciones OK`);
console.log('ERRORES DE PÁGINA:', JSON.stringify(log.errors, null, 1));
await browser.close(); server.close();
process.exit(bad.length || log.errors.length ? 1 : 0);
