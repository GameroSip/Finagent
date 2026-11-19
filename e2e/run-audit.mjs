// Auditoría de diseño: recorre las pantallas en varios tamaños de teléfono y busca desbordes, textos superpuestos o tapados,
// elementos fuera de pantalla, botones demasiado chicos y errores de consola.   node run-audit.mjs ../dist ../e2e-shots
import { newPage, tab, sleep, browser, log, server } from './run.mjs';

const SIZES = [[320, 640], [360, 740], [412, 915]];
const found = new Map();
const note = (k, d) => { if (!found.has(k)) found.set(k, d); };

async function audit(page, label) {
  const r = await page.evaluate(() => {
    const out = { over: document.documentElement.scrollWidth - window.innerWidth, overlap: [], covered: [], off: [], small: [] };
    const vw = window.innerWidth, vh = window.innerHeight;
    const vis = (e) => { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; for (let p = e; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; } return true; };
    const sel = (e) => (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : e.tagName.toLowerCase());
    const txt = [...document.querySelectorAll('body *')].filter((e) => {
      if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
      if (e.closest('.hide, [hidden], script, style, svg, canvas, .tabbar')) return false;
      const r = e.getBoundingClientRect(); if (r.width < 3 || r.height < 3) return false;
      return vis(e);
    });
    const rects = txt.map((e) => ({ e, r: e.getBoundingClientRect() }));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w <= 2 || h <= 2) continue;
      const ratio = (w * h) / Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
      if (ratio > 0.3) out.overlap.push(`${sel(a.e)}("${a.e.textContent.trim().slice(0, 22)}") × ${sel(b.e)}("${b.e.textContent.trim().slice(0, 22)}")`);
    }
    const tb = document.querySelector('.tabbar')?.getBoundingClientRect(), cp = document.querySelector('.composer')?.getBoundingClientRect();
    for (const { e, r } of rects) {
      const cx = r.left + r.width / 2, cy = r.top + Math.min(r.height / 2, 14);
      if (r.right > vw + 1 || r.left < -1) out.off.push(`${sel(e)}("${e.textContent.trim().slice(0, 22)}") x=${Math.round(r.left)}..${Math.round(r.right)}`);
      if (cx < 0 || cx > vw || cy < 0 || cy > vh) continue;
      if ((tb && cy > tb.top) || (cp && cy > cp.top && cy < cp.bottom)) continue;
      const top = document.elementFromPoint(cx, cy);
      if (top && top !== e && !e.contains(top) && !top.contains(e) && !top.closest('.toast')) out.covered.push(`${sel(e)}("${e.textContent.trim().slice(0, 22)}") tapado por ${sel(top)}`);
    }
    for (const b of document.querySelectorAll('button, a, [role=button], .tab, .chip')) {
      if (!vis(b) || b.closest('.hide, .tabbar')) continue; const r = b.getBoundingClientRect();
      if (r.width && r.height && (r.height < 30 || r.width < 30) && r.top < vh && r.bottom > 0) out.small.push(`${sel(b)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  });
  if (r.over > 1) note(`${label} desborde horizontal ${r.over}px`, '');
  for (const k of ['overlap', 'covered', 'off', 'small']) for (const d of [...new Set(r[k])].slice(0, 6)) note(`${label} ${k}: ${d}`, '');
}

const SEED = { 'finagent.portfolio.v1': JSON.stringify([
  { id: 'a', kind: 'asset', symbol: 'AAPL', qty: 12, cost: 150 }, { id: 'b', kind: 'asset', symbol: 'GGAL.BA', qty: 1500.5, cost: 4200 },
  { id: 'c', kind: 'asset', symbol: 'BTC-USD', qty: 0.0345, cost: null }, { id: 'd', kind: 'cash', symbol: 'ARS', qty: 1234567.89, cost: null }]),
  'finagent.portfolio.prefs.v1': JSON.stringify({ base: 'ARS', rate: 1200 }), 'finagent.watch.v1': JSON.stringify(['AAPL', 'MSFT', 'BTC-USD', 'GGAL.BA']) };

for (const [w, h] of SIZES) for (const theme of ['dark', 'light']) {
  const tag = `${w}x${h}/${theme}`;
  const open = async (extra = {}) => { const p = await newPage({ theme, extra: { ...SEED, ...extra } }); await p.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: true, hasTouch: true }); await sleep(2200); return p; };
  let p = await open();
  await audit(p, `${tag} mercados`);
  await p.evaluate(() => document.querySelector('.view:not(.hide)')?.scrollTo?.(0, 900)); await sleep(300); await audit(p, `${tag} mercados-scroll`);
  await tab(p, 'chat'); await sleep(700); await audit(p, `${tag} chat-vacío`);
  await p.evaluate(() => { const i = document.querySelector('#c-in'); i.value = 'Dame el análisis técnico de AAPL'; i.dispatchEvent(new Event('input')); document.querySelector('#c-form').requestSubmit(); });
  await p.waitForFunction(() => document.querySelectorAll('.m-ai:not(.working) .md').length >= 1, { timeout: 20000 }).catch(() => note(`${tag} el chat no respondió`, ''));
  await sleep(1500); await audit(p, `${tag} chat-respuesta`);
  await p.evaluate(() => { const s = document.querySelector('#c-scroll'); s.scrollTop = 0; }); await sleep(300); await audit(p, `${tag} chat-respuesta-inicio`);
  await tab(p, 'watch'); await sleep(1500); await audit(p, `${tag} favoritos`);
  await tab(p, 'portfolio'); await sleep(2000); await audit(p, `${tag} cartera`);
  await tab(p, 'settings'); await sleep(700); await audit(p, `${tag} ajustes`);
  await p.evaluate(() => document.querySelector('.view:not(.hide)')?.scrollTo?.(0, 2000)); await sleep(300); await audit(p, `${tag} ajustes-fin`);
  await tab(p, 'market'); await sleep(400);
  await p.evaluate(() => document.querySelector('.idx')?.click()); await sleep(2200); await audit(p, `${tag} detalle-activo`);
  await p.close();
  p = await open({ 'finagent.intro.v1': null }); // intro y tour
  await p.close();
}
console.log('\nHALLAZGOS (' + found.size + ')'); for (const k of found.keys()) console.log(' •', k);
console.log('\nERRORES DE PÁGINA:', [...new Set(log.errors)].slice(0, 15)); console.log('ERRORES DE CONSOLA:', [...new Set(log.consoleErrors)].slice(0, 15));
await browser.close(); server.close();
