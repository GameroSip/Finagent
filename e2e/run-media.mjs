// Voz, adjuntos y captura de cartera en un navegador real. Un mismo guion para los dos modos:
//   con clave:   npm run build && cd e2e && node run-media.mjs ../dist ../e2e-shots
//   con servidor: VITE_API_BASE=https://api.finagent.test npx vite build --outDir dist-server --emptyOutDir && cd e2e && node run-media.mjs ../dist-server ../e2e-shots
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as M from './mocks.mjs';
import { browser, check, checks, log, newPage, shot, server, sleep, tab, waitAnswer } from './run.mjs';

const SERVER = (process.argv[2] ?? '').includes('server');
const text = (p, sel) => p.$eval(sel, (e) => e.innerText).catch(() => '');
const click = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
const sentMedia = [];

// Micrófono y voz del teléfono simulados: el navegador de pruebas no tiene ninguno.
//   mode 'web': hay reconocedor de voz del navegador (texto en vivo); mode 'record': no hay, se graba y lo pasa a texto Gemini.
const stub = (mode) => {
  class FakeRec {
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    static isTypeSupported() { return true; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array(4000)], { type: 'audio/webm' }) }); setTimeout(() => this.onstop?.(new Event('stop')), 5); }
  }
  window.MediaRecorder = FakeRec;
  const track = { stop() {} };
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => ({ getTracks: () => [track] }) }, configurable: true });
  class FakeSR {
    start() { this.on = true; const say = (txt, fin) => this.onresult?.({ results: [Object.assign([{ transcript: txt }], { isFinal: fin })] }); setTimeout(() => this.on && say('cómo viene', false), 150); setTimeout(() => this.on && say('cómo viene el dólar hoy', false), 450); }
    stop() { this.on = false; setTimeout(() => this.onend?.(), 20); }
    abort() { this.on = false; }
  }
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: mode === 'web' ? FakeSR : undefined, configurable: true });
  Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
  window.__spoken = [];
  Object.defineProperty(window, 'speechSynthesis', { value: { speaking: false, cancel() { this.speaking = false; }, speak(u) { window.__spoken.push({ text: u.text, lang: u.lang }); }, getVoices: () => [] }, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
};
const open = async ({ sr = 'web', ...opts } = {}) => {
  const p = await newPage({ clean: true, key: SERVER ? '' : undefined, ...opts });
  await p.evaluateOnNewDocument(stub, sr); await p.reload({ waitUntil: 'load' }); await p.waitForSelector('.tabbar', { timeout: 15000 }).catch(() => {});
  p.on('request', (r) => { try { const b = JSON.parse(r.postData() ?? 'null'); if (b?.contents?.some?.((c) => c.parts?.some?.((x) => x.inlineData))) sentMedia.push(b); } catch {} });
  return p;
};
const tmp = (name, content) => { const f = join(tmpdir(), name); writeFileSync(f, content); return f; };

M.resetApi();
const p = await open();
await tab(p, 'chat'); await sleep(900);
check('el chat tiene clip y micrófono', (await p.$('#c-clip')) !== null && (await p.$('#c-mic')) !== null);

// 1) adjuntar un CSV: primero el aviso de privacidad, después el archivo queda como chip
const csv = tmp('extracto.csv', 'fecha;monto\n2026-01-02;1.234,50\n');
let [chooser] = await Promise.all([p.waitForFileChooser({ timeout: 5000 }), click(p, '#c-clip')]);
await chooser.accept([csv]);
await p.waitForSelector('#c-chip:not(.hide) .n', { timeout: 5000 });
check('el archivo queda como chip con su nombre', /extracto\.csv/.test(await text(p, '#c-chip')));
check('un texto o CSV no pide el aviso (va como texto, como cualquier mensaje)', await p.$('.sheet') === null);
await shot(p, 'MD1-chip');
await click(p, '#c-chip-x'); await sleep(200);
check('se puede quitar el adjunto', (await text(p, '#c-chip')).trim() === '' || await p.$eval('#c-chip', (e) => e.classList.contains('hide')));

// 1b) una imagen sí pide el aviso de privacidad, una sola vez
const img = tmp('foto.png', Buffer.from(M.png(64).toString('base64'), 'base64'));
[chooser] = await Promise.all([p.waitForFileChooser({ timeout: 5000 }), click(p, '#c-clip')]);
await chooser.accept([img]);
await p.waitForSelector('.sheet [data-r="1"]', { timeout: 5000 });
check('la imagen pide el aviso de que va a Google', /Google/.test(await text(p, '.sheet')));
await shot(p, 'MD1b-aviso');
await click(p, '.sheet [data-r="1"]'); await sleep(500);
check('el aviso se guardó para no repetirse', await p.evaluate(() => localStorage.getItem('finagent.media.ok.v1') === '1'));
check('la imagen queda como chip', /foto\.png/.test(await text(p, '#c-chip')));
await click(p, '#c-chip-x'); await sleep(200);

// 2) adjuntar y enviar un archivo de texto: la respuesta llega y el archivo se muestra como 📎
const txt = tmp('nota.txt', 'Saldo 1.234,50 USD');
[chooser] = await Promise.all([p.waitForFileChooser({ timeout: 5000 }), click(p, '#c-clip')]);
await chooser.accept([txt]); await sleep(900);
await click(p, '#c-send');
await waitAnswer(p, 1).catch(async () => { console.log('DEBUG', await p.evaluate(() => document.querySelector('#c-chip').innerHTML + ' | ' + (document.querySelector('.err-bubble')?.innerText ?? 'sin-err') + ' MSGS ' + document.querySelectorAll('.m-user').length), JSON.stringify(log.errors), JSON.stringify(log.consoleErrors)); throw new Error('sin respuesta'); }); await sleep(400);
check('el mensaje muestra el adjunto', /📎\s*nota\.txt/.test(await text(p, '.m-user')));
await shot(p, 'MD2-adjunto-enviado');

// 3) dictar con el reconocedor de voz del dispositivo: barra con tiempo, texto en vivo y sin gastar consultas
const used0 = M.apiState.used;
await click(p, '#c-mic');
await p.waitForSelector('#c-dict:not(.hide) .d-state', { timeout: 4000 });
check('al dictar aparece la barra "Escuchando…" con su tiempo', /Escuchando/.test(await text(p, '#c-dict .d-state')) && /^\d:\d\d$/.test((await text(p, '#c-dict .d-time')).trim()));
check('mientras se dicta, el cuadro de texto se reemplaza por la barra', await p.$eval('#c-form', (e) => getComputedStyle(e).display === 'none'));
await p.waitForFunction(() => /dólar/.test(document.querySelector('#c-dict .d-live')?.textContent ?? ''), { timeout: 4000 });
check('el texto se ve EN VIVO mientras se habla', /cómo viene el dólar hoy/.test(await text(p, '#c-dict .d-live')));
await shot(p, 'MD3-dictado');
await click(p, '#c-dict .d-ok');
await p.waitForFunction(() => document.querySelector('#c-dict').classList.contains('hide'), { timeout: 4000 });
check('al terminar, el texto queda en el cuadro para revisarlo (no se envía solo)', /dólar/.test(await p.$eval('#c-in', (e) => e.value)) && (await p.$$('.m-user')).length === 1);
check('con el reconocedor del dispositivo no se manda audio a Gemini ni se gasta una consulta', !sentMedia.some((b) => b.contents.some((c) => c.parts.some((x) => x.inlineData?.mimeType?.startsWith('audio/')))) && M.apiState.used === used0);
await p.evaluate(() => { const i = document.querySelector('#c-in'); i.value = ''; i.dispatchEvent(new Event('input')); });
// cancelar
await click(p, '#c-mic'); await p.waitForSelector('#c-dict:not(.hide) .d-x', { timeout: 4000 }); await sleep(300);
await click(p, '#c-dict .d-x'); await sleep(300);
check('cancelar cierra la barra y no deja texto', await p.$eval('#c-dict', (e) => e.classList.contains('hide')) && (await p.$eval('#c-in', (e) => e.value)) === '');
check('después de cancelar se puede volver a dictar', await p.$eval('#c-mic', (e) => !e.disabled));

// 4) escuchar la respuesta con la voz del teléfono
await p.evaluate(() => document.querySelector('[data-act="speak"]')?.click()); await sleep(300);
const spoken = await p.evaluate(() => window.__spoken);
check('"Escuchar" lee la respuesta con la voz del teléfono, en español', spoken.length === 1 && spoken[0].text.length > 10 && /^es/.test(spoken[0].lang), JSON.stringify(spoken).slice(0, 120));
check('lo que se lee no trae símbolos de markdown', !/[#*|]/.test(spoken[0]?.text ?? '#'));

// 5) cartera desde una captura de IOL: lectura estructurada, revisión editable y símbolos comprobados
await tab(p, 'portfolio'); await sleep(700);
const png = tmp('captura.png', Buffer.from(M.png(64).toString('base64'), 'base64'));
[chooser] = await Promise.all([p.waitForFileChooser({ timeout: 5000 }), click(p, '#p-shot0')]);
await chooser.accept([png]);
await p.waitForSelector('#rv-go', { timeout: 10000 }); await sleep(900);
const rv = await text(p, '.sheet');
check('muestra la lectura con el broker reconocido y 4 filas (3 activos y el efectivo)', /InvertirOnline/.test(rv) && (await p.$$('.rv-row')).length === 4, rv.slice(0, 140));
const syms = await p.$$eval('.rv-sym', (e) => e.map((x) => x.value));
check('los activos locales se pasan a símbolos de Yahoo (GGAL.BA, AAPL.BA)', syms.includes('GGAL.BA') && syms.includes('AAPL.BA'), syms.join());
check('comprueba que cada símbolo cotiza', /Cotiza/.test(await text(p, '.rv-row[data-i="0"] .rv-st')));
check('marca la fila donde cantidad × precio no coincide con la valuación', /no coincide/.test(await text(p, '.rv-row[data-i="2"] .rv-st')));
await shot(p, 'MD4-revision');
await p.evaluate(() => { const r = document.querySelector('.rv-row[data-i="2"] .rv-ck input'); r.click(); });
check('se puede destildar una fila (el botón cuenta 3)', /Agregar 3/.test(await text(p, '#rv-go')));
await p.evaluate(() => { const q = document.querySelector('.rv-row[data-i="1"] .rv-qty'); q.value = '12'; q.dispatchEvent(new Event('input', { bubbles: true })); });
await click(p, '#rv-go'); await sleep(600);
const held = await p.evaluate(() => JSON.parse(localStorage.getItem('finagent.portfolio.v1') || '[]'));
check('al confirmar se agregan las filas con lo corregido (AAPL.BA 12) y sin la destildada', held.length === 3 && held.some((h) => h.symbol === 'GGAL.BA' && h.qty === 100 && h.cost === 5230.5) && held.some((h) => h.symbol === 'AAPL.BA' && h.qty === 12) && held.some((h) => h.kind === 'cash' && h.symbol === 'ARS' && h.qty === 15000.5) && !held.some((h) => h.symbol.startsWith('AL30')), JSON.stringify(held));
await p.close();

// 5b) sin reconocedor de voz del dispositivo: se graba y Gemini lo pasa a texto, con estados claros
const r2 = await open({ sr: 'record' });
await tab(r2, 'chat'); await sleep(800);
await r2.evaluate(() => { window.__saw = new Set(); new MutationObserver(() => { const d = document.querySelector('#c-dict'); if (d && !d.classList.contains('hide')) window.__saw.add(d.classList.contains('busy') ? 'busy' : 'listen'); }).observe(document.body, { subtree: true, attributes: true, childList: true }); });
await click(r2, '#c-mic');
await r2.waitForSelector('.sheet [data-r="1"]', { timeout: 4000 });
check('sin reconocedor propio, avisa que el audio va a Google antes de grabar', /Google/.test(await text(r2, '.sheet')));
await click(r2, '.sheet [data-r="1"]');
await r2.waitForSelector('#c-dict:not(.hide) .d-ok', { timeout: 4000 }); await sleep(600);
check('graba mostrando la barra con "Escuchando…" y la ayuda', /Escuchando/.test(await text(r2, '#c-dict .d-state')) && /pausas/.test(await text(r2, '#c-dict .d-live')));
await click(r2, '#c-dict .d-ok');
await r2.waitForFunction(() => document.querySelector('#c-in').value.length > 3, { timeout: 8000 });
check('mostró "Pasando tu voz a texto…" mientras procesaba', await r2.evaluate(() => window.__saw.has('busy')));
check('el texto transcripto queda en el cuadro', /dólar/.test(await r2.$eval('#c-in', (e) => e.value)));
check('se mandó el audio con la instrucción de transcribir', sentMedia.some((b) => b.contents.some((c) => c.parts.some((x) => x.inlineData?.mimeType?.startsWith('audio/')))));
check('la transcripción va como tarea propia (no con el prompt del analista)', sentMedia.some((b) => b.task === 'transcribe') || !SERVER);
await r2.close();

// 6) traducción
for (const lang of ['en', 'pt']) {
  const q = await open({ lang });
  await tab(q, 'chat'); await sleep(700);
  const a = await q.$eval('#c-clip', (e) => e.getAttribute('aria-label')); const b = await q.$eval('#c-mic', (e) => e.getAttribute('aria-label'));
  check(`[${lang}] botones de adjuntar y dictar traducidos`, !/Adjuntar|Dictar/.test(a + b), `${a} / ${b}`);
  await q.close();
}

const bad = checks.filter((c) => !c.ok);
console.log(`\nRESULTADO (voz y adjuntos${SERVER ? ', servidor' : ''}): ${checks.length - bad.length}/${checks.length} verificaciones OK`);
console.log('ERRORES DE PÁGINA:', JSON.stringify(log.errors, null, 1));
await browser.close(); server.close();
process.exit(bad.length || log.errors.length ? 1 : 0);
