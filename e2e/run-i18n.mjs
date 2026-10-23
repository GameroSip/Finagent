// Recorre las pantallas de la app en inglés y en portugués y busca CUALQUIER palabra en español que haya quedado sin traducir.
//   VITE_API_BASE=https://api.finagent.test npx vite build --outDir dist-server --emptyOutDir
//   cd e2e && node run-i18n.mjs ../dist-server ../e2e-shots
import * as M from './mocks.mjs';
import { browser, check, checks, log, newPage, say, server, sleep, tab, waitAnswer } from './run.mjs';

const SEED = { 'finagent.watchlist.v1': JSON.stringify(['AAPL', 'BTC-USD', '^GSPC']) };
// Señales de español que NO existen en inglés ni en portugués (el portugués comparte "para", "que", "por", "mais", los acentos…).
const SPANISH = String.raw`[¿¡ñ]|\b(el|los|las|del|una|con|tus|sin|hoy|ayer|mañana|cuál|cómo|dónde|más|también|está|están|tenés|podés|querés|elegí|mirá|probá|pegá|cargá)\b`;
const leftovers = (p, where) => p.evaluate((re, where) => {
  const rx = new RegExp(re, 'i'), skip = '[data-notrans], .md, .m-user, script, style, input, textarea';
  const out = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t && !n.parentElement?.closest(skip) && rx.test(t)) out.add(`${where}: «${t.slice(0, 90)}»`); }
  for (const el of document.querySelectorAll('[placeholder],[aria-label],[title]')) if (!el.closest(skip)) for (const a of ['placeholder', 'aria-label', 'title']) { const t = el.getAttribute(a); if (t && rx.test(t)) out.add(`${where} [${a}]: «${t.slice(0, 90)}»`); }
  return [...out];
}, SPANISH, where);
const closeSheet = (p) => p.evaluate(() => document.querySelector('.sheet-back')?.click()).then(() => sleep(450));

async function scan(lang) {
  M.resetApi();
  const found = [];
  const grab = async (p, where) => { found.push(...await leftovers(p, `${lang} · ${where}`)); };
  const p = await newPage({ key: '', lang, extra: SEED, height: 1900 });
  await p.waitForSelector('.tabbar', { timeout: 12000 }); await sleep(3500);
  await grab(p, 'Mercados');
  for (const g of ['fx', 'crypto', 'commodities']) { await p.evaluate((x) => document.querySelector(`#m-seg-world [data-g="${x}"]`).click(), g); await sleep(1800); await grab(p, `Mercados/${g}`); }
  await tab(p, 'watch'); await sleep(2200); await grab(p, 'Favoritos');
  await tab(p, 'chat'); await sleep(900); await grab(p, 'Asistente (vacío)');
  await say(p, 'Dame el análisis técnico de AAPL'); await waitAnswer(p); await sleep(900); await grab(p, 'Asistente (respuesta)');
  await p.evaluate(() => document.querySelector('.trace summary')?.click()); await sleep(300); await grab(p, 'Asistente (fuentes)');
  await tab(p, 'settings'); await sleep(1100); await grab(p, 'Ajustes');
  await p.evaluate(() => document.querySelector('#s-about').click()); await p.waitForSelector('.about-sheet', { timeout: 4000 }); await sleep(1200); await grab(p, 'Acerca de'); await closeSheet(p);
  await p.evaluate(() => document.querySelector('#s-plans-open').click()); await p.waitForSelector('.plans-sheet .plan-card', { timeout: 5000 }); await sleep(600); await grab(p, 'Planes'); await closeSheet(p);
  await tab(p, 'market'); await sleep(600);
  await p.evaluate(() => document.querySelector('.idx').click()); await p.waitForSelector('.asset-ov canvas', { timeout: 8000 }); await sleep(2200); await grab(p, 'Activo');
  await p.evaluate(() => document.querySelector('#a-tools').click()); await p.waitForSelector('.tools-sheet', { timeout: 4000 }); await sleep(500); await grab(p, 'Herramientas del gráfico'); await closeSheet(p);
  await p.close();
  return [...new Set(found)];
}
for (const lang of ['en', 'pt']) {
  const found = await scan(lang);
  check(`en ${lang === 'en' ? 'inglés' : 'portugués'} no queda ningún texto en español en las pantallas principales`, found.length === 0, `\n    ${found.join('\n    ')}`);
}
const bad = checks.filter((c) => !c.ok);
console.log(`\nRESULTADO (idiomas): ${checks.length - bad.length}/${checks.length} verificaciones OK`);
console.log('ERRORES DE PÁGINA:', JSON.stringify(log.errors, null, 1));
await browser.close(); server.close();
process.exit(bad.length || log.errors.length ? 1 : 0);
