// Íconos de los activos en un navegador real: logo cuando hay uno bueno, bandera/emoji, y monograma cuando no.
//   npm run build && cd e2e && node run-icons.mjs ../dist ../e2e-shots
import * as M from './mocks.mjs';
import { browser, check, checks, log, newPage, shot, server, sleep, tab } from './run.mjs';

const SYMS = ['AAPL', 'BTC-USD', 'MSFT', 'ZZZZ', 'DOGE-USD', '^GSPC', 'EURUSD=X', 'GC=F'];
const p = await newPage({ height: 1000, extra: { 'finagent.watchlist.v1': JSON.stringify(SYMS) } }); await sleep(1500);
await tab(p, 'watch'); await sleep(3500);
const info = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.aico')].map((e) => { const i = e.querySelector('img'); return [e.dataset.sym, { img: !!i, ok: !!i?.classList.contains('ok'), w: i?.naturalWidth ?? 0, t: e.querySelector('.aico-t')?.textContent }]; })));
let ic = await info();

check('una acción conocida (AAPL) muestra su logo cargado', ic.AAPL?.ok && ic.AAPL.w === 128, JSON.stringify(ic.AAPL));
check('una cripto (BTC-USD) muestra su ícono desde la biblioteca pública', ic['BTC-USD']?.ok && ic['BTC-USD'].w === 128, JSON.stringify(ic['BTC-USD']));
check('una miniatura borrosa (MSFT: 16 px) se rechaza y queda el monograma', ic.MSFT && !ic.MSFT.img && ic.MSFT.t === 'MSF', JSON.stringify(ic.MSFT));
check('un ticker sin empresa conocida (ZZZZ) muestra el monograma y no pide ningún logo a ningún servicio de imágenes', ic.ZZZZ && !ic.ZZZZ.img && ic.ZZZZ.t === 'ZZZ' && !log.requests.some((r) => /(jsdelivr|coincap|google\.com\/s2).*zzzz/i.test(r)), JSON.stringify(ic.ZZZZ));
check('una cripto sin ícono (DOGE-USD) prueba las dos fuentes y se queda con el monograma', ic['DOGE-USD'] && !ic['DOGE-USD'].img && log.requests.some((r) => /cdn\.jsdelivr\.net.*doge\.png/.test(r)) && log.requests.some((r) => /coincap\.io.*doge@2x\.png/.test(r)), JSON.stringify(ic['DOGE-USD']));
check('índice, divisa y materia prima usan bandera/emoji (sin red)', ic['^GSPC']?.t === '🇺🇸' && ic['EURUSD=X']?.t === '🇪🇺' && ic['GC=F']?.t === '🥇' && !ic['^GSPC'].img, JSON.stringify([ic['^GSPC'], ic['EURUSD=X'], ic['GC=F']]));
await shot(p, 'I1-favoritos-iconos');

// memoria: lo que funcionó se recuerda y lo que falló no se reintenta enseguida
const mem = await p.evaluate(() => ({ ok: JSON.parse(localStorage.getItem('finagent.icon.ok.v1') || '{}'), miss: JSON.parse(localStorage.getItem('finagent.icon.miss.v1') || '{}') }));
check('se recuerdan los logos que funcionaron (AAPL, BTC-USD)', !!mem.ok.AAPL && !!mem.ok['BTC-USD'], JSON.stringify(Object.keys(mem.ok)));
check('se recuerdan los que fallaron (DOGE-USD, MSFT) para no volver a pedirlos', !!mem.miss['DOGE-USD'] && !!mem.miss.MSFT, JSON.stringify(Object.keys(mem.miss)));
const before = log.requests.filter((r) => /doge|microsoft\.com/.test(r)).length;
await tab(p, 'market'); await sleep(600); await tab(p, 'watch'); await sleep(1500);
check('al volver a la lista NO se repiten los pedidos de los logos que ya fallaron', log.requests.filter((r) => /doge|microsoft\.com/.test(r)).length === before, `${before} → ${log.requests.filter((r) => /doge|microsoft\.com/.test(r)).length}`);
ic = await info();
check('y los que funcionaron siguen mostrándose', ic.AAPL?.ok && ic['BTC-USD']?.ok);

// Mercados: las tarjetas de índices y la sección "Mercados del mundo" llevan ícono
await tab(p, 'market'); await sleep(2500);
const idx = await p.$$eval('#m-indices .aico', (e) => e.map((x) => x.dataset.sym + ':' + x.querySelector('.aico-t')?.textContent));
check('las tarjetas de índices muestran su bandera (S&P 500 y Nasdaq: EE.UU.; Merval: Argentina)', idx.some((t) => t === '^GSPC:🇺🇸') && idx.some((t) => t === '^MERV:🇦🇷'), JSON.stringify(idx));
const wIdx = await p.$$eval('#m-world .aico', (e) => e.map((x) => x.dataset.sym));
check('"Mercados del mundo" abre con índices de Europa, Asia y América', ['^FTSE', '^GDAXI', '^N225', '^HSI', '^BVSP'].every((s) => wIdx.includes(s)), JSON.stringify(wIdx));
await p.evaluate(() => document.querySelector('#m-seg-world [data-g="crypto"]').click()); await sleep(2500);
const cr = await p.$$eval('#m-world .aico', (e) => e.map((x) => ({ s: x.dataset.sym, ok: !!x.querySelector('img.ok') })));
check('en Cripto aparecen Bitcoin y Ethereum con su ícono cargado', cr.some((c) => c.s === 'BTC-USD' && c.ok) && cr.some((c) => c.s === 'ETH-USD' && c.ok), JSON.stringify(cr));
await p.evaluate(() => document.querySelector('#m-seg-world [data-g="fx"]').click()); await sleep(2200);
const fx = await p.$$eval('#m-world .aico', (e) => e.map((x) => x.dataset.sym + ':' + x.querySelector('.aico-t')?.textContent));
check('en Divisas cada par muestra la bandera de su moneda', fx.some((t) => t === 'EURUSD=X:🇪🇺') && fx.some((t) => t === 'GBPUSD=X:🇬🇧'), JSON.stringify(fx));
await p.evaluate(() => document.querySelector('#m-seg-world [data-g="commodities"]').click()); await sleep(2200);
const cm = await p.$$eval('#m-world .aico', (e) => e.map((x) => x.dataset.sym + ':' + x.querySelector('.aico-t')?.textContent));
check('en Materias primas, el oro y el petróleo con su emoji', cm.some((t) => t === 'GC=F:🥇') && cm.some((t) => t === 'CL=F:🛢️'), JSON.stringify(cm));
await p.evaluate(() => window.scrollTo(0, 0));
await shot(p, 'I2-mercados-mundo', { fullPage: false });
await p.close();

const bad = checks.filter((c) => !c.ok);
console.log(`\nRESULTADO (íconos): ${checks.length - bad.length}/${checks.length} verificaciones OK`);
console.log('ERRORES DE PÁGINA:', JSON.stringify(log.errors, null, 1));
await browser.close(); server.close();
process.exit(bad.length || log.errors.length ? 1 : 0);
