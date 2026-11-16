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
const stub = () => {
  class FakeRec {
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    static isTypeSupported() { return true; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array(4000)], { type: 'audio/webm' }) }); setTimeout(() => this.onstop?.(new Event('stop')), 5); }
  }
  window.MediaRecorder = FakeRec;
  const track = { stop() {} };
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => ({ getTracks: () => [track] }) }, configurable: true });
  window.__spoken = [];
  Object.defineProperty(window, 'speechSynthesis', { value: { speaking: false, cancel() { this.speaking = false; }, speak(u) { window.__spoken.push({ text: u.text, lang: u.lang }); }, getVoices: () => [] }, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
};
const open = async (opts = {}) => {
  const p = await newPage({ clean: true, key: SERVER ? '' : undefined, ...opts });
  await p.evaluateOnNewDocument(stub); await p.reload({ waitUntil: 'load' }); await p.waitForSelector('.tabbar', { timeout: 15000 }).catch(() => {});
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

// 3) dictar: grabar, terminar, el texto aparece para revisarlo (no se envía solo)
await click(p, '#c-mic'); await sleep(300);
check('mientras graba, el botón lo indica', await p.$eval('#c-mic', (e) => e.classList.contains('rec')));
await click(p, '#c-mic');
await p.waitForFunction(() => document.querySelector('#c-in').value.length > 3, { timeout: 8000 });
check('lo dictado queda en el cuadro, sin enviarse', /dólar/.test(await p.$eval('#c-in', (e) => e.value)) && (await p.$$('.m-user')).length === 1);
check('se mandó audio a Gemini', sentMedia.some((b) => b.contents.some((c) => c.parts.some((x) => x.inlineData?.mimeType?.startsWith('audio/')))));
await shot(p, 'MD3-dictado');
if (SERVER) {
  const used = M.apiState.used;
  await click(p, '#c-send'); await waitAnswer(p, 2); await sleep(400);
  check('dictar y enviar cuesta UNA sola conversación (el audio comparte el turno)', M.apiState.used === used || M.apiState.used === used + 1, `${used} -> ${M.apiState.used}`);
}

// 4) escuchar la respuesta con la voz del teléfono
await p.evaluate(() => document.querySelector('[data-act="speak"]')?.click()); await sleep(300);
const spoken = await p.evaluate(() => window.__spoken);
check('"Escuchar" lee la respuesta con la voz del teléfono, en español', spoken.length === 1 && spoken[0].text.length > 10 && /^es/.test(spoken[0].lang), JSON.stringify(spoken).slice(0, 120));
check('lo que se lee no trae símbolos de markdown', !/[#*|]/.test(spoken[0]?.text ?? '#'));

// 5) cartera desde una captura: se revisa antes de agregar
await tab(p, 'portfolio'); await sleep(700);
const png = tmp('captura.png', Buffer.from(M.png(64).toString('base64'), 'base64'));
[chooser] = await Promise.all([p.waitForFileChooser({ timeout: 5000 }), click(p, '#p-shot0')]);
await chooser.accept([png]);
await p.waitForSelector('.sheet [data-r="1"]', { timeout: 10000 }); await sleep(300);
const rv = await text(p, '.sheet');
check('muestra lo leído para confirmar (AAPL 10 y USD 300)', /AAPL/.test(rv) && /USD/.test(rv) && /Agregar 2/.test(rv), rv.slice(0, 160));
check('avisa que la lectura puede equivocarse', /puede equivocarse/.test(rv));
await shot(p, 'MD4-revision');
await click(p, '.sheet [data-r="1"]'); await sleep(500);
const held = await p.evaluate(() => JSON.parse(localStorage.getItem('finagent.portfolio.v1') || '[]'));
check('al confirmar se agregan las posiciones', held.length === 2 && held.some((h) => h.symbol === 'AAPL' && h.qty === 10 && h.cost === 150.5), JSON.stringify(held));
await p.close();

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
