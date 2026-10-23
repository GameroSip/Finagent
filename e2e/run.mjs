// Pruebas en un navegador REAL (Chromium, el mismo motor que el WebView de Android) con tamaño de teléfono.
// Simula a Gemini y a las fuentes de datos interceptando la red (ver mocks.mjs), recorre la app, verifica y saca capturas.
//   cd e2e && npm ci && node run.mjs ../dist ../e2e-shots
// No prueba lo específico de Android (plugins nativos, red nativa, botón físico "atrás"): para eso hace falta un emulador.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import * as M from './mocks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(process.argv[2] ?? join(HERE, '../dist'));
const OUT = resolve(process.argv[3] ?? join(HERE, '../e2e-shots'));
mkdirSync(OUT, { recursive: true });
const KEY = 'AIzaSyFAKE_KEY_FOR_TESTING_0123456789';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const checks = [];
export const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(ok ? '  ✔' : '  ✘', name, ok ? '' : detail); };

// ---- servidor estático de la app compilada
const server = createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const file = p === '/' ? '/index.html' : p;
  try { const body = await readFile(join(DIST, file)); res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('no'); }
}).listen(4173);

const log = { requests: [], errors: [], consoleErrors: [] };
const json = (o, status = 200) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });

async function route(req) {
  const url = req.url();
  if (url.startsWith('http://localhost:4173')) return req.continue();
  log.requests.push(`${req.method()} ${new URL(url).host}${new URL(url).pathname}`);
  const u = new URL(url);
  const delay = async (ms) => sleep(ms);
  if (u.host === 'api.finagent.test') { // servidor de FinAgent simulado (modo beta)
    await delay(url.includes('/v1/generate') ? 500 : 20);
    return req.respond(M.finagentApi(req.method(), u.pathname, req.headers(), req.postData() ? JSON.parse(req.postData()) : {}));
  }
  if (['cdn.jsdelivr.net', 'assets.coincap.io', 'www.google.com'].includes(u.host)) return req.respond(M.iconResponse(u)); // logos de activos (simulados)
  if (u.host === 'generativelanguage.googleapis.com') {
    await delay(url.includes('generateContent') ? 700 : 30);
    return req.respond(json(M.geminiReply(url, req.postData() ? JSON.parse(req.postData()) : {})));
  }
  if (u.host === 'fc.yahoo.com') return req.respond({ status: 404, headers: { 'set-cookie': 'A3=d=AQABfake&S=AQAAfake; Path=/', 'access-control-allow-origin': '*' }, body: '' });
  if (u.pathname.includes('getcrumb')) return req.respond({ status: 200, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'crumbfake' });
  if (u.host.endsWith('finance.yahoo.com')) {
    const sym = decodeURIComponent(u.pathname.split('/').pop() ?? '');
    if (u.pathname.includes('/v8/finance/chart/')) return req.respond(json(M.yahooChart(sym, u.searchParams.get('range'), u.searchParams.get('interval'))));
    if (u.pathname.includes('/quoteSummary/')) return req.respond(json(M.yahooSummary(sym)));
    if (u.pathname.includes('/v1/finance/search')) return req.respond(json(M.yahooSearch(u.searchParams.get('q') ?? '')));
    if (u.pathname.includes('screener')) return req.respond(json(M.yahooMovers(u.searchParams.get('scrIds'))));
    if (u.pathname.includes('timeseries')) return req.respond(json({ timeseries: { result: [] } }));
  }
  if (u.host === 'dolarapi.com') return req.respond(json(M.dolares()));
  if (u.host === 'api.argentinadatos.com') {
    if (u.pathname.includes('riesgo-pais')) return req.respond(json({ fecha: '2026-10-16', valor: 612 }));
    if (u.pathname.includes('inflacionInteranual')) return req.respond(json([{ fecha: '2026-08-31', valor: 31.2 }, { fecha: '2026-09-30', valor: 29.8 }]));
    return req.respond(json([{ fecha: '2026-08-31', valor: 2.1 }, { fecha: '2026-09-30', valor: 1.9 }]));
  }
  if (u.host === 'api.alternative.me') return req.respond(json({ data: [{ value: '62', value_classification: 'Greed', timestamp: String(Math.floor(Date.now() / 1000)) }] }));
  if (u.host === 'news.google.com') return req.respond({ status: 200, contentType: 'application/rss+xml', headers: { 'access-control-allow-origin': '*' }, body: M.rss() });
  return req.respond({ status: 503, body: 'sin simular', headers: { 'access-control-allow-origin': '*' } });
}

const browser = await puppeteer.launch({ args: [...chromium.args, '--no-sandbox', '--disable-web-security'], executablePath: process.env.CHROME_PATH || await chromium.executablePath(), headless: 'shell' });
async function newPage({ theme = 'dark', key = KEY, extra = {}, height = 915, intro = false, lang = 'es', motion = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  await page.setRequestInterception(true);
  page.on('request', (r) => route(r).catch((e) => { log.errors.push('route: ' + e.message); try { r.abort(); } catch {} }));
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') log.consoleErrors.push(m.text()); });
  page.on('response', (r) => { if (r.status() === 404 && !r.url().startsWith('data:')) log.consoleErrors.push('404 ' + r.url()); });
  await page.evaluateOnNewDocument((k, extraObj) => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      if (k) localStorage.setItem('finagent.settings.v2', JSON.stringify({ apiKey: k, theme: 'auto' }));
      for (const [kk, vv] of Object.entries(extraObj)) localStorage.setItem(kk, vv);
    }
  }, key, { ...(intro ? {} : { 'finagent.intro.v1': '1' }), ...(lang ? { 'finagent.lang.v1': lang } : {}), ...extra });   // por defecto: sin introducción y en español (las pruebas de cada función no dependen de ella)
  if (!motion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);   // salvo en las pruebas de la animación, el logo queda fijo: no depende de la velocidad de dibujo
  await page.goto('http://localhost:4173/', { waitUntil: 'load' });
  if (!intro && key) await page.waitForSelector('.tabbar', { timeout: 15000 }).catch(() => {}); // pasó el splash corto y la app está lista
  return page;
}
const shot = async (page, name, opts = {}) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`sin desborde horizontal en ${name}`, over <= 1, `sobran ${over}px`);
};
const tab = (page, id) => page.evaluate((i) => document.querySelector(`.tabbar .tab[data-tab="${i}"]`).click(), id);
const say = async (page, text) => { await page.evaluate((t) => { const i = document.querySelector('#c-in'); i.value = t; i.dispatchEvent(new Event('input')); document.querySelector('#c-form').requestSubmit(); }, text); };
const waitAnswer = (page, n = 1) => page.waitForFunction((k) => document.querySelectorAll('.m-ai:not(.working) .md').length >= k, { timeout: 20000 }, n);

export { browser, newPage, shot, tab, say, waitAnswer, sleep, log, server, OUT };

if (import.meta.url === `file://${process.argv[1]}`) {
  // 1) onboarding (sin clave)
  let p = await newPage({ key: '' }); await sleep(900); await shot(p, '01-onboarding'); await p.close();

  // 2) mercados con datos (viewport alto para ver todo)
  p = await newPage({ height: 1900 }); await sleep(2500); await shot(p, '02-mercados'); await p.close();

  // 3) detalle de un activo con su gráfico real (canvas)
  p = await newPage(); await sleep(1800);
  await p.evaluate(() => document.querySelector('.idx').click()); await p.waitForSelector('.asset-ov canvas', { timeout: 8000 }); await sleep(1500);
  check('el gráfico del activo se dibuja (canvas con tamaño real)', await p.evaluate(() => { const c = [...document.querySelectorAll('.asset-ov canvas')].find((x) => x.width > 250); return c && c.width > 250 && c.height > 150; }));
  await shot(p, '03-detalle'); await p.close();

  // 4-6) chat: vacío, trabajando y con respuesta (cards, markdown, pills)
  p = await newPage(); await sleep(1200); await tab(p, 'chat'); await sleep(600); await shot(p, '04-chat-vacio');
  // Regresión (v0.6.0): un logo flotante se colaba en el medio del chat vacío y tapaba las sugerencias. Nada puede quedar encima de ninguna sugerencia.
  check('en el chat vacío ninguna sugerencia está tapada por otro elemento', await p.evaluate(() => { const bs = [...document.querySelectorAll('.sug')]; return bs.length >= 4 && bs.every((b) => { const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && b.contains(top); }); }));
  check('el chat vacío no tiene logos grandes sueltos ni destellos de IA', await p.evaluate(() => ![...document.querySelectorAll('.chat-empty svg, .chat-empty img, .chat-empty canvas')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 40 && r.height > 40 && !e.closest('button'); })));
  await say(p, 'Dame el análisis técnico de AAPL'); await sleep(450); await shot(p, '05-chat-trabajando');
  await waitAnswer(p); await sleep(1500); await shot(p, '06-chat-respuesta-fin');
  const ans = await p.evaluate(() => [...document.querySelectorAll('.m-ai:not(.working)')].at(-1).innerText);
  check('respuesta con datos correctos: no pierde cifras (incluidas las negativas)', !ans.includes('[dato no verificado]') && !ans.includes('Quité'), ans.match(/.{30}\[dato no verificado\]/)?.[0] ?? 'aparece "Quité"');
  check('muestra "cifras verificadas con datos"', /\d+ cifras verificadas/.test(ans));
  check('el gráfico técnico del chat se dibuja', await p.evaluate(() => [...document.querySelectorAll('.m-ai canvas')].some((c) => c.width > 250 && c.height > 150)));
  check('el título automático reemplazó al provisorio', (await p.$eval('#c-title-t', (e) => e.textContent)) === 'Análisis técnico de AAPL');
  await p.evaluate(() => { const s = document.querySelector('#c-scroll'); s.scrollTop = 0; }); await sleep(400); await shot(p, '06b-chat-respuesta-inicio');

  // 7) cifras inventadas: la pantalla no debe mostrarlas
  await p.evaluate(() => document.querySelector('#c-new').click()); await sleep(300);
  await say(p, 'inventá un rendimiento'); await waitAnswer(p, 1); await sleep(900); await shot(p, '07-chat-cifra-inventada');
  const inv = await p.evaluate(() => document.querySelector('#c-scroll').innerText);
  check('una cifra inventada NO aparece en pantalla', !/24[.,]572|21[.,]512|0[.,]775/.test(inv), inv.slice(0, 120));
  check('se avisa cuántas cifras se quitaron', /Quité 3 cifras/.test(inv));

  // 8) historial
  await p.evaluate(() => document.querySelector('#c-hist').click()); await sleep(700); await shot(p, '08-historial');
  check('el buscador del historial tiene tamaño normal (no se estira)', await p.evaluate(() => document.querySelector('.drawer .search-field').getBoundingClientRect().height < 80));
  check('el historial lista los chats guardados', (await p.$$eval('.chat-item', (e) => e.length)) === 2);
  await p.evaluate(() => document.querySelector('#d-close').click()); await sleep(400);

  // 9) ajustes
  await tab(p, 'settings'); await sleep(600); await shot(p, '09-ajustes');
  await p.close();

  // 10) tema claro
  p = await newPage({ theme: 'light', extra: { 'finagent.settings.v2': JSON.stringify({ apiKey: KEY, theme: 'light' }) } }); await sleep(2200); await shot(p, '10-claro-mercados');
  await tab(p, 'chat'); await sleep(400); await say(p, 'Dame el análisis técnico de AAPL'); await waitAnswer(p); await sleep(1500);
  await p.evaluate(() => { document.querySelector('#c-scroll').scrollTop = 0; }); await sleep(300); await shot(p, '11-claro-chat');
  await p.close();

  const bad = checks.filter((c) => !c.ok);
  console.log(`\nRESULTADO: ${checks.length - bad.length}/${checks.length} verificaciones OK`);
  console.log('\nERRORES DE PÁGINA:', JSON.stringify(log.errors, null, 1));
  console.log('ERRORES DE CONSOLA:', JSON.stringify([...new Set(log.consoleErrors)].slice(0, 8), null, 1));
  await browser.close(); server.close();
  process.exit(bad.length || log.errors.length ? 1 : 0);
}
