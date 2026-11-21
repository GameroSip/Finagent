// Conduce la app REAL dentro del emulador Android: se conecta al WebView por el puerto de depuración (CDP), recorre las pantallas,
// saca capturas por dos vías (CDP y adb screencap, que muestra lo que realmente se compone en pantalla) y reporta desbordes,
// textos tapados y errores. Uso: node drive.mjs <carpeta-de-salida>
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import puppeteer from '../../e2e/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const OUT = process.argv[2] || 'emu-out'; fs.mkdirSync(OUT, { recursive: true });
const sh = (c, ms = 40000) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: ms, maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PKG = 'com.finagent.app';
const report = []; const say = (s) => { console.log(s); report.push(s); };

function screencap(name) { try { sh(`adb exec-out screencap -p > ${OUT}/${name}-pantalla.png`); } catch (e) { say('screencap falló: ' + e.message.slice(0, 80)); } }
function startApp() { sh(`adb shell am start -n ${PKG}/.MainActivity`); }
async function connect() {
  let last = '';
  for (let i = 0; i < 40; i++) {
    try {
      const pid = sh(`adb shell pidof ${PKG}`).trim().split(/\s+/)[0];
      const sock = sh(`adb shell cat /proc/net/unix`).split('\n').map((l) => l.match(/@(webview_devtools_remote_\d+)/)?.[1]).filter(Boolean).find((s) => !pid || s.endsWith(pid)) || '';
      if (sock) { sh(`adb forward tcp:9222 localabstract:${sock}`); const b = await Promise.race([puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null }), sleep(20000).then(() => { throw new Error('connect: tiempo agotado'); })]); return b; }
      if (i % 8 === 7) say(`(conectando… intento ${i + 1}; app viva: ${sh(`adb shell pidof ${PKG}`).trim() || 'NO'}; sockets: ${sh('adb shell cat /proc/net/unix').split('\n').filter((l) => /devtools|webview/i.test(l)).map((l) => l.split(' ').pop()).join(',') || 'ninguno'})`);
    } catch (e) { last = String(e.message || e).slice(0, 160); }
    await sleep(3000);
  }
  throw new Error('No se pudo conectar al WebView (¿la app es depurable?) último error: ' + last);
}
const page = async (b) => { for (let i = 0; i < 20; i++) { const ps = await b.pages(); const p = ps.find((x) => /localhost|capacitor/.test(x.url())) || ps[0]; if (p) return p; await sleep(500); } throw new Error('sin página'); };

async function audit(p, label) {
  const r = await p.evaluate(() => {
    const out = { over: document.documentElement.scrollWidth - window.innerWidth, off: [], covered: [], vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] };
    const vis = (e) => { for (let q = e; q && q !== document.body; q = q.parentElement) { const s = getComputedStyle(q); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; } return true; };
    const sel = (e) => (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : e.tagName.toLowerCase());
    const tb = document.querySelector('.tabbar')?.getBoundingClientRect(), cp = document.querySelector('.composer')?.getBoundingClientRect(), hd = document.querySelector('.chat-head')?.getBoundingClientRect();
    for (const e of document.querySelectorAll('body *')) {
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || e.closest('.hide,[hidden],svg,canvas,.tabbar,script,style') || !vis(e)) continue;
      const r = e.getBoundingClientRect(); if (r.width < 3 || r.height < 3) continue;
      if (r.right > innerWidth + 1 || r.left < -1) out.off.push(`${sel(e)}("${e.textContent.trim().slice(0, 20)}") x=${Math.round(r.left)}..${Math.round(r.right)}`);
      const cx = r.left + r.width / 2, cy = r.top + Math.min(r.height / 2, 12);
      if (cx < 0 || cx > innerWidth || cy < 0 || cy > innerHeight) continue;
      if ((tb && cy > tb.top) || (cp && cy > cp.top && cy < cp.bottom) || (hd && cy < hd.bottom)) continue;
      const top = document.elementFromPoint(cx, cy);
      if (top && top !== e && !e.contains(top) && !top.contains(e) && !top.closest('.toast,.sheet,.overlay,.ov')) out.covered.push(`${sel(e)}("${e.textContent.trim().slice(0, 20)}") tapado por ${sel(top)}`);
    }
    return out;
  });
  say(`[${label}] viewport ${r.vw}×${r.vh} @${r.dpr} ${r.ua || ''} | desborde horizontal: ${r.over}px | fuera de pantalla: ${r.off.length} | tapados: ${r.covered.length}`);
  for (const d of [...new Set([...r.off, ...r.covered])].slice(0, 8)) say('   · ' + d);
}
async function snap(p, name) { await sleep(900); try { await p.screenshot({ path: `${OUT}/${name}-cdp.png` }); } catch { /* */ } screencap(name); }
const tab = (p, id) => p.evaluate((i) => (document.querySelector(`[data-tab="${i}"], #tab-${i}`) || [...document.querySelectorAll('.tabbar button')].find((b) => (b.dataset.tab || b.id) === i))?.click(), id);

try {
  say(`Dispositivo: ${sh('adb shell getprop ro.product.model').trim()} · Android ${sh('adb shell getprop ro.build.version.release').trim()} · ${sh('adb shell wm size').trim()} · ${sh('adb shell wm density').trim()}`);
  startApp(); await sleep(4000); screencap('00-arranque-4s'); await sleep(8000); screencap('01-arranque-12s');
  let b = await connect(); let p = await page(b);
  const errs = []; p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)); });
  await snap(p, '02-primera-apertura'); await audit(p, 'primera apertura');
  // Recorrido de la introducción real tocando botones (idioma → recorrido → cuenta)
  for (const [i, ids] of [['03-idioma', ['#l-next']], ['04-recorrido-1', ['#t-next']], ['05-recorrido-2', ['#t-next']], ['06-recorrido-3', ['#t-next']]]) {
    await p.evaluate((q) => document.querySelector(q.find((s) => document.querySelector(s)) || 'x')?.click(), ids).catch(() => {}); await sleep(1200); await snap(p, i);
  }
  await audit(p, 'introducción');

  // Semilla: ya pasó la introducción, tiene clave y cartera → recorrer la app como un usuario habitual
  await p.evaluate(() => {
    localStorage.setItem('finagent.intro.v1', '1'); localStorage.setItem('finagent.lang.v1', 'es'); localStorage.setItem('finagent_home_tour_v1', '1'); localStorage.setItem('finagent.analytics.v1', '0');
    localStorage.setItem('finagent.settings.v2', JSON.stringify({ apiKey: 'AIzaFAKE_KEY_FOR_LAYOUT_ONLY_0000000000000', theme: 'auto' }));
    localStorage.setItem('finagent.portfolio.v1', JSON.stringify([{ id: 'a', kind: 'asset', symbol: 'AAPL', qty: 12, cost: 150 }, { id: 'b', kind: 'asset', symbol: 'GGAL.BA', qty: 1500.5, cost: 4200 }, { id: 'c', kind: 'asset', symbol: 'BTC-USD', qty: 0.0345, cost: null }, { id: 'd', kind: 'cash', symbol: 'ARS', qty: 1234567.89, cost: null }]));
    localStorage.setItem('finagent.watch.v1', JSON.stringify(['AAPL', 'MSFT', 'BTC-USD', 'GGAL.BA']));
  });
  await p.reload({ waitUntil: 'load' }).catch(() => {}); await sleep(5000);
  for (const [id, nombre] of [['market', 'mercados'], ['chat', 'chat'], ['watch', 'favoritos'], ['portfolio', 'cartera'], ['settings', 'ajustes']]) {
    await tab(p, id); await sleep(1800); await snap(p, `10-${nombre}`); await audit(p, nombre);
    if (id === 'market' || id === 'settings') { // scroll real y captura: aquí se vería el GUI "copiado"
      for (const y of [500, 1200]) { await p.evaluate((yy) => { const v = document.querySelector('.view:not(.hide)') || document.scrollingElement; v.scrollTo?.(0, yy); }, y); await sleep(700); await snap(p, `11-${nombre}-scroll${y}`); }
    }
  }
  // Modos de efectos: el usuario reportó superposición; se compara "Completo" y "Ahorro"
  for (const fx of ['full', 'low']) {
    await p.evaluate((f) => { localStorage.setItem('finagent.fx', f); }, fx); await p.reload({ waitUntil: 'load' }).catch(() => {}); await sleep(4500);
    await tab(p, 'market'); await sleep(1500); await snap(p, `20-fx-${fx}-mercados`); await tab(p, 'chat'); await sleep(1500); await snap(p, `21-fx-${fx}-chat`);
    await tab(p, 'market'); await sleep(500); await tab(p, 'portfolio'); await sleep(1200); await tab(p, 'chat'); await sleep(1200); await snap(p, `22-fx-${fx}-tras-cambiar-pestañas`);
  }
  // Tecla "atrás" y rotación no deben romper el estado
  sh('adb shell input keyevent KEYCODE_BACK'); await sleep(1200); screencap('30-tras-atras');
  say('\nErrores de página/consola (' + errs.length + '):'); for (const e of [...new Set(errs)].slice(0, 20)) say('   · ' + e);
  const crash = sh(`adb logcat -d -b crash`).trim(); if (crash) say('\nCRASH NATIVO:\n' + crash.slice(0, 1500));
  b.disconnect();
} catch (e) { say('FALLÓ EL RECORRIDO: ' + e.message); try { screencap('99-fallo'); } catch { /* */ } }
fs.writeFileSync(`${OUT}/informe.txt`, report.join('\n'));
try { fs.writeFileSync(`${OUT}/logcat.txt`, sh(`adb logcat -d -t 4000`)); } catch { /* */ }
