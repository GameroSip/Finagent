// Mi cartera, calculadora de escenarios e informes en PDF en un navegador real (modo con clave, sin servidor).
//   npm run build && cd e2e && node run-portfolio.mjs ../dist ../e2e-shots
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as M from './mocks.mjs';
import { browser, check, checks, log, newPage, shot, server, sleep, tab } from './run.mjs';

const text = (p, sel) => p.$eval(sel, (e) => e.innerText).catch(() => '');
const click = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
const fill = (p, sel, v) => p.evaluate((s, val) => { const i = document.querySelector(s); i.value = val; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }, sel, v);
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('finagent.portfolio.v1') || '[]'));
// En el navegador el PDF se "descarga" con un <a>: lo interceptamos para leer los bytes.
const capturePdf = (p) => p.evaluate(() => { window.__pdf = null; HTMLAnchorElement.prototype.click = function () { const a = this; fetch(a.href).then((r) => r.arrayBuffer()).then((b) => { window.__pdf = { name: a.download, head: new TextDecoder('latin1').decode(new Uint8Array(b).slice(0, 8)), tail: new TextDecoder('latin1').decode(new Uint8Array(b).slice(-5)), size: b.byteLength }; }); }; });
const waitPdf = async (p) => { await p.waitForFunction(() => window.__pdf, { timeout: 8000 }); return p.evaluate(() => window.__pdf); };
const addSheet = async (p, { kind, sym, qty, cost }) => {
  await click(p, '#p-add'); await p.waitForSelector('#ad-sym', { timeout: 4000 }); await sleep(300);
  if (kind === 'cash') await click(p, '#ad-kind [data-k="cash"]');
  await fill(p, '#ad-sym', sym); await fill(p, '#ad-qty', qty); if (cost) await fill(p, '#ad-cost', cost);
  await click(p, '.sheet [data-r="1"]'); await sleep(500);
};

M.resetApi?.();
const p = await newPage({ clean: true, analytics: '0' }); await sleep(800);
check('hay 5 pestañas, con "Cartera"', (await p.$$('.tabbar .tab')).length === 5 && await p.$('.tabbar .tab[data-tab="portfolio"]') !== null);
await tab(p, 'portfolio'); await sleep(600); await shot(p, 'P1-cartera-vacia');
const t0 = await text(p, '.view:not(.hide)');
check('vacía: explica que queda solo en el teléfono y ofrece cargar a mano, importar CSV y la calculadora de aportes', /solo en tu teléfono/i.test(t0) && /Cargar a mano/.test(t0) && /Importar un CSV/.test(t0) && /Calculadora de aportes/.test(t0), t0.slice(0, 200));

await addSheet(p, { kind: 'asset', sym: 'aapl', qty: '10', cost: '100' });
await addSheet(p, { kind: 'cash', sym: 'usd', qty: '500' });
await addSheet(p, { kind: 'cash', sym: 'ars', qty: '100.000' });
let s = await stored(p);
check('se guardan en el teléfono (AAPL activo con costo, USD y ARS como efectivo) con el símbolo en mayúsculas y los miles bien leídos', s.length === 3 && s[0].symbol === 'AAPL' && s[0].kind === 'asset' && s[0].cost === 100 && s[1].kind === 'cash' && s[1].symbol === 'USD' && s[2].qty === 100000, JSON.stringify(s));
await p.waitForFunction(() => /USD\s[\d.,]+/.test(document.querySelector('.view:not(.hide)')?.innerText ?? '') && document.querySelectorAll('#p-rows .wrow').length === 3, { timeout: 15000 });
await p.waitForFunction(() => document.querySelector('#p-rate')?.value, { timeout: 8000 }).catch(() => {});
const t1 = await text(p, '.view:not(.hide)');
check('muestra el total por moneda (USD y ARS), las 3 tenencias y el reparto', /USD\s/.test(t1) && /ARS\s/.test(t1) && (await p.$$('#p-rows .wrow')).length === 3 && /%/.test(t1), t1.slice(0, 300));
check('propone el dólar MEP como tipo de cambio (editable)', Number(await p.$eval('#p-rate', (e) => e.value)) > 0, await p.$eval('#p-rate', (e) => e.value));
await shot(p, 'P2-cartera');
check('lo que cargó NO sale del teléfono: ninguna petición lleva datos de la cartera', !log.requests.some((r) => /portfolio|cartera|qty=|100\.000|100000/i.test(r)));

// calculadora de escenarios
await click(p, '#p-calc'); await p.waitForSelector('#c-out', { timeout: 4000 }); await sleep(400);
const c0 = await text(p, '#c-out');
await fill(p, '#c-fx', '50'); await fill(p, '#c-as', '-20'); await sleep(200);
const c1 = await text(p, '#c-out');
check('escenario: calcula "Hoy" y "Con tus supuestos" y cambia al mover los supuestos', /Hoy/.test(c0) && /Con tus supuestos/.test(c0) && c0 !== c1 && /Dólar de .* a .* pesos/.test(c1), c1.slice(0, 200));
check('aclara que no es una predicción', /no una predicción/.test(await text(p, '.overlay .ov-body')));
await shot(p, 'P3-escenario');
await capturePdf(p); await click(p, '#c-pdf'); let pdf = await waitPdf(p);
check('el escenario se guarda en un PDF válido', pdf.head.startsWith('%PDF-1.4') && pdf.tail.includes('%%EOF') && pdf.size > 1500 && /^FinAgent_cartera_\d{4}-\d{2}-\d{2}\.pdf$/.test(pdf.name), JSON.stringify(pdf));
await click(p, '#c-mode [data-m="savings"]'); await sleep(300);
await fill(p, '#s-ini', '1000'); await fill(p, '#s-mon', '200'); await fill(p, '#s-rate', '0'); await fill(p, '#s-inf', '0'); await fill(p, '#s-yrs', '1'); await sleep(200);
const sv = await text(p, '#s-out');
check('aportes: con 0% de rentabilidad y 1 año, 1.000 + 12×200 = 3.400', /3\.400/.test(sv) && /Lo que pusiste vos/.test(sv), sv.slice(0, 160));
await shot(p, 'P4-aportes');
await click(p, '#c-back'); await sleep(500);

// informe de la cartera
await capturePdf(p); await click(p, '#p-pdf'); pdf = await waitPdf(p);
check('el informe de la cartera se genera como PDF válido', pdf.head.startsWith('%PDF-1.4') && pdf.tail.includes('%%EOF') && pdf.size > 1500, JSON.stringify(pdf));

// importar CSV
const csv = join(tmpdir(), 'cartera-test.csv'); writeFileSync(csv, 'Ticker;Cantidad;Precio promedio\nMSFT;3;410,5\nGGAL.BA;50;\nxx yy;1;1\n');
await p.evaluate(() => document.querySelector('#p-csv').scrollIntoView({ block: 'center' })); await sleep(300);
const [chooser] = await Promise.all([p.waitForFileChooser({ timeout: 5000 }), p.click('#p-csv')]);
await chooser.accept([csv]); await p.waitForSelector('.sheet [data-r="1"]', { timeout: 4000 }); await sleep(300);
const sheetTxt = await text(p, '.sheet');
check('importar CSV: pide confirmar, cuenta 2 posiciones y avisa que saltea 1 fila', /Importar 2 posiciones/.test(sheetTxt) && /1 filas/.test(sheetTxt), sheetTxt);
await click(p, '.sheet [data-r="1"]'); await sleep(600);
s = await stored(p);
check('tras importar hay 5 posiciones, MSFT con su costo decimal a la argentina', s.length === 5 && s.find((x) => x.symbol === 'MSFT')?.cost === 410.5, JSON.stringify(s.map((x) => [x.symbol, x.cost])));

// persiste al reabrir y se puede quitar una posición
await p.reload({ waitUntil: 'load' }); await p.waitForSelector('.tabbar'); await sleep(600);
await tab(p, 'portfolio'); await sleep(900);
check('al reabrir la app la cartera sigue ahí', (await p.$$('#p-rows .wrow')).length === 5);
await p.evaluate(() => document.querySelector('#p-rows .wrow:last-child').click()); await p.waitForSelector('.act-row.danger', { timeout: 3000 });
await click(p, '.act-row.danger'); await p.waitForSelector('.sheet [data-r="1"]', { timeout: 3000 }); await click(p, '.sheet [data-r="1"]'); await sleep(600);
check('quitar una posición la saca de la lista y de lo guardado', (await p.$$('#p-rows .wrow')).length === 4 && (await stored(p)).length === 4);

// informe de un activo
await p.evaluate(() => document.querySelector('#p-rows .wrow').click()); await p.waitForSelector('.act-row', { timeout: 3000 });
await p.evaluate(() => [...document.querySelectorAll('.act-row')].find((b) => /Ver el activo/.test(b.textContent)).click()); await p.waitForSelector('#a-pdf', { timeout: 6000 }); await sleep(1500);
await capturePdf(p); await click(p, '#a-pdf'); pdf = await waitPdf(p);
check('desde un activo se guarda su informe en PDF válido, con el símbolo en el nombre', pdf.head.startsWith('%PDF-1.4') && /^FinAgent_AAPL_\d{4}-\d{2}-\d{2}\.pdf$/.test(pdf.name), JSON.stringify(pdf));
await shot(p, 'P5-activo');

// otros idiomas
for (const lang of ['en', 'pt']) {
  const q = await newPage({ clean: true, lang, analytics: '0', extra: { 'finagent.portfolio.v1': JSON.stringify([{ id: 'a', kind: 'cash', symbol: 'USD', qty: 10, cost: null }]), 'finagent.portfolio.prefs.v1': JSON.stringify({ base: 'ARS', rate: 1000 }) } });
  await sleep(700); await tab(q, 'portfolio'); await sleep(900);
  const t = await text(q, '.view:not(.hide)');
  check(`[${lang}] la pantalla de la cartera está traducida`, !/Total por moneda|Tenencias|Todo junto en|Informe en PDF|Solo en tu teléfono/.test(t) && (lang === 'pt' || !/Calculadora|Importar CSV/.test(t)) && t.length > 100, t.slice(0, 200));
  await click(q, '#p-calc'); await q.waitForSelector('#c-out', { timeout: 4000 }); await sleep(300);
  const ct = await text(q, '.overlay');
  check(`[${lang}] la calculadora está traducida`, !/Con tus supuestos|Tus activos cambian|El dólar sube|Escenario|Aportes y plazo/.test(ct) && (lang === 'pt' || !/Mi cartera|Calculadora/.test(ct)) && ct.length > 100, ct.slice(0, 200));
  await q.close();
}
await p.close();

const bad = checks.filter((c) => !c.ok);
console.log(`\nRESULTADO (cartera): ${checks.length - bad.length}/${checks.length} verificaciones OK`);
console.log('ERRORES DE PÁGINA:', JSON.stringify(log.errors, null, 1));
await browser.close(); server.close();
process.exit(bad.length || log.errors.length ? 1 : 0);
