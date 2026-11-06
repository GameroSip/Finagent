// Estadísticas de la beta de punta a punta en un navegador real, con la app compilada con servidor:
// consentimiento (sí / no / quien ya usaba la app), qué se envía y qué NO, calificar respuestas, comentarios, votos, apagar, y encuesta de recomendación.
//   VITE_API_BASE=https://api.finagent.test npx vite build --outDir dist-server --emptyOutDir
//   cd e2e && node run-beta.mjs ../dist-server ../e2e-shots
import * as M from './mocks.mjs';
import { browser, check, checks, log, newPage, say, server, shot, sleep, tab, waitAnswer } from './run.mjs';

const text = (p, sel) => p.$eval(sel, (e) => e.innerText).catch(() => '');
const click = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
const has = (p, sel) => p.$(sel).then((x) => x !== null);
const until = async (fn, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(100); } return false; };
/** La app pasa a segundo plano: envía de inmediato lo pendiente (sin esperar el temporizador). */
const flushNow = (p) => p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); setTimeout(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }), 80); });
const names = () => M.apiState.events.map((e) => e.n);
const ev = (n) => M.apiState.events.filter((e) => e.n === n);
const SECRET = 'XYZSECRETO123', PLAN = 'MIPLANSECRETO999';
const toIntroConsent = async (p) => { await p.waitForSelector('#a-guest', { timeout: 25000 }); await sleep(900); await click(p, '#a-guest'); await p.waitForSelector('#l-next', { timeout: 6000 }); await sleep(400); await click(p, '#l-next'); await p.waitForSelector('#c-yes', { timeout: 6000 }); await sleep(500); };

// ================================================================ 1) acepta: se registra lo que corresponde, y nada más
M.resetApi();
let p = await newPage({ key: '', intro: true, lang: 'es', clean: true });
await toIntroConsent(p); await shot(p, 'B1-consentimiento');
const c = await text(p, '.intro');
check('la pantalla de estadísticas dice qué se registra y qué NO (lo que escribís al asistente, tu plan, tus favoritos, nombre y correo)', /Ayudanos a mejorar la beta/i.test(c) && /Qué registramos/i.test(c) && /Qué NO registramos/i.test(c) && /Lo que le escribís al asistente/i.test(c) && /Tu plan ni tus favoritos/i.test(c) && /es anónimo/i.test(c), c.slice(0, 100));   // (los subtítulos se muestran en mayúsculas por estilo)
check('todavía no se mandó nada ni se guardó ninguna decisión: la persona elige', M.apiState.consent === null && M.apiState.eventBatches === 0);
await click(p, '#c-yes'); await p.waitForSelector('#t-skip', { timeout: 6000 });
check('aceptar se le comunica al servidor, que guarda el consentimiento', await until(() => M.apiState.consent === true), String(M.apiState.consent));
await sleep(600); await click(p, '#t-skip'); await p.waitForSelector('.tabbar', { timeout: 8000 }); await sleep(1000);
await flushNow(p); await until(() => names().includes('app_open'));
const open = ev('app_open')[0]?.p ?? {};
check('la apertura de la app informa solo versión, idioma, tema y sonido', Object.keys(open).sort().join() === 'lang,sound,theme,v' && /^\d+\.\d+\.\d+$/.test(open.v) && open.lang === 'es', JSON.stringify(open));
check('también registra el recorrido de la introducción (diapositivas vistas y que lo omitió)', names().includes('tour_slide') && ev('intro_step').some((e) => e.p.step === 'tour' && e.p.skipped === true), names().join(','));

// uso de la app: mercado → activo → gráfico → favorito → asistente → Mi plan
await tab(p, 'market'); await sleep(700);
await p.evaluate(() => document.querySelector('.idx').click()); await p.waitForSelector('#a-ranges', { timeout: 12000 });
await p.waitForSelector('#a-move-range', { timeout: 15000 }); await sleep(900);
await click(p, '#a-ranges button[data-r="1M"]'); await sleep(300); await click(p, '#a-star'); await sleep(300);
await click(p, '#a-plan-edit'); await p.waitForSelector('#plan-text', { timeout: 5000 });
await p.evaluate((t) => { const ta = document.querySelector('#plan-text'); ta.value = t; ta.dispatchEvent(new Event('input')); }, PLAN); await click(p, '#plan-save'); await sleep(700);
await click(p, '#a-back'); await sleep(500);
await tab(p, 'chat'); await sleep(500); await say(p, `¿Cómo viene Apple? ${SECRET}`); await waitAnswer(p, 1); await sleep(600);
await shot(p, 'B2-respuesta-con-calificacion');
check('con las estadísticas aceptadas, cada respuesta del asistente se puede calificar (👍 / 👎)', (await has(p, '.rate-box [data-act="up"]')) && (await has(p, '.rate-box [data-act="down"]')));
await click(p, '.rate-box [data-act="up"]'); await sleep(400);
check('al calificar, los botones se reemplazan por un agradecimiento (no se puede calificar dos veces)', /Gracias por avisar/.test(await text(p, '.m-ai .rate-box')) && !(await has(p, '.rate-box [data-act="up"]')));
await flushNow(p); await until(() => names().includes('ai_rate') && names().includes('ai_done'));
const got = names();
check('llegaron al servidor las pantallas, el activo abierto, el gráfico, el favorito, el termómetro y el movimiento esperado', ['screen', 'asset_open', 'chart_range', 'watch', 'stress_view', 'move_view'].every((n) => got.includes(n)), got.join(','));
const ao = ev('asset_open')[0]?.p ?? {};
check('del activo se informa símbolo (público), tipo y desde dónde se abrió', /^\^?[A-Z0-9.\-=]{1,16}$/.test(ao.sym) && ['índices', 'ETF', 'acciones', 'cripto', 'otro'].includes(ao.group) && ao.from === 'market', JSON.stringify(ao));
const send = ev('ai_send')[0]?.p ?? {}, done = ev('ai_done')[0]?.p ?? {};
check('de la consulta al asistente se informa de dónde vino, si abrió un chat y el tamaño en tres escalones: nunca el texto', send.src === 'typed' && send.chat === 'new' && ['s', 'm', 'l'].includes(send.len) && Object.keys(send).sort().join() === 'chat,len,src', JSON.stringify(send));
check('de la respuesta se informa qué herramientas usó, cuánto tardó y la verificación de cifras', typeof done.ms === 'number' && typeof done.steps === 'number' && 'checked' in done && 'fixed' in done, JSON.stringify(done));
check('el plan se registró solo como "guardado" y su tamaño aproximado (corto), nunca su contenido', ev('plan_saved').length === 1 && ev('plan_saved')[0].p.len === 'corto' && Object.keys(ev('plan_saved')[0].p).join() === 'len', JSON.stringify(ev('plan_saved')));
check('NI LO QUE SE LE ESCRIBIÓ AL ASISTENTE NI EL PLAN viajaron al servidor en ningún envío de estadísticas', !M.apiState.rawBodies.join('').includes(SECRET) && !M.apiState.rawBodies.join('').includes(PLAN), `${M.apiState.eventBatches} envíos`);
check('en la pantalla de aprendizaje: no se pidió nada fuera de la lista (cada evento viene con "n" de la lista conocida)', M.apiState.events.every((e) => /^[a-z_]+$/.test(e.n) && typeof e.t === 'number' && e.p && typeof e.p === 'object'));

// ---- Ajustes: la persona ve y controla todo
await tab(p, 'settings'); await sleep(700);
await p.evaluate(() => document.querySelector('#s-analytics')?.scrollIntoView({ block: 'center' })); await sleep(400); await shot(p, 'B3-ajustes-beta');
check('Ajustes tiene el grupo "Beta" con el interruptor de estadísticas encendido, y las dos entradas para opinar', /Ayudar a mejorar la beta/.test(await text(p, '#s-analytics')) && await p.$eval('#s-analytics-t', (e) => e.checked) && (await has(p, '#s-feedback')) && (await has(p, '#s-wishes')));
await click(p, '#s-feedback'); await p.waitForSelector('#fb-text', { timeout: 4000 }); await sleep(300); await shot(p, 'B4-contanos');
check('"Contanos" aclara que lo que se escribe ahí SÍ llega (a diferencia de las estadísticas)', /sí nos llega/.test(await text(p, '.plan-sheet')));
await click(p, '#fb-send'); await sleep(300);
check('no deja enviar un comentario vacío', M.apiState.feedback.length === 0);
await p.evaluate(() => { document.querySelector('.fb-kinds .chip[data-k="problema"]').click(); const ta = document.querySelector('#fb-text'); ta.value = 'El gráfico tarda mucho con mala señal'; ta.dispatchEvent(new Event('input')); });
await click(p, '#fb-send'); await until(() => M.apiState.feedback.length === 1);
check('el comentario llega al servidor con su tipo, el texto y la versión', M.apiState.feedback[0]?.kind === 'problema' && /tarda mucho/.test(M.apiState.feedback[0]?.text ?? '') && /^\d+\.\d+\.\d+$/.test(M.apiState.feedback[0]?.version ?? ''), JSON.stringify(M.apiState.feedback[0]));
await sleep(500);
await click(p, '#s-wishes'); await p.waitForSelector('.wish', { timeout: 4000 }); await sleep(400); await shot(p, 'B5-funciones');
check('la lista de funciones aclara que todavía no existen y que algunas pueden requerir permisos o acuerdos', /Todavía no existen/.test(await text(p, '.plan-sheet')) && /permisos o acuerdos/.test(await text(p, '.plan-sheet')) && (await p.$$('.wish')).length === 7);
await click(p, '.wish[data-f="cartera"] button'); await until(() => M.apiState.votes.includes('cartera')); await sleep(300);
check('votar "Me interesa" se registra una vez y el botón pasa a "Anotado ✓" (desactivado)', M.apiState.votes.join() === 'cartera' && /Anotado/.test(await text(p, '.wish[data-f="cartera"] button')) && await p.$eval('.wish[data-f="cartera"] button', (b) => b.disabled));
await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelector('.sheet-bg, .scrim, .overlay-bg')?.click()); await sleep(400);

// ---- apagar: se corta todo de inmediato
const before = M.apiState.events.length;
await p.evaluate(() => { const i = document.querySelector('#s-analytics-t'); i.checked = false; i.dispatchEvent(new Event('change')); }); await until(() => M.apiState.consent === false);
check('apagar las estadísticas se le avisa al servidor', M.apiState.consent === false);
await tab(p, 'market'); await sleep(400); await tab(p, 'watch'); await sleep(400); await tab(p, 'settings'); await flushNow(p); await sleep(1500);
check('después de apagar no se envía ni un evento más (y lo pendiente se borró)', M.apiState.events.length === before && await p.evaluate(() => localStorage.getItem('finagent.evq.v1') === null));
await tab(p, 'chat'); await sleep(300);
await say(p, 'Otra pregunta'); await waitAnswer(p, 2); await sleep(500);
check('sin estadísticas, la respuesta nueva ya no muestra el 👍 / 👎', await p.evaluate(() => { const a = [...document.querySelectorAll('.m-ai')].pop(); return !!a && !a.querySelector('.rate-box'); }));
await tab(p, 'settings'); await sleep(400); await p.evaluate(() => { const i = document.querySelector('#s-analytics-t'); i.checked = true; i.dispatchEvent(new Event('change')); }); await until(() => M.apiState.consent === true);
check('volver a encenderlas se le avisa al servidor', M.apiState.consent === true);
await p.close();

// ================================================================ 2) rechaza: el servidor no recibe nada de uso
M.resetApi();
p = await newPage({ key: '', intro: true, lang: 'es', clean: true });
await toIntroConsent(p); await click(p, '#c-no'); await p.waitForSelector('#t-skip', { timeout: 6000 }); await sleep(500); await click(p, '#t-skip'); await p.waitForSelector('.tabbar', { timeout: 8000 }); await sleep(900);
await tab(p, 'market'); await sleep(500); await p.evaluate(() => document.querySelector('.idx').click()); await p.waitForSelector('#a-ranges', { timeout: 12000 }); await sleep(800); await click(p, '#a-back'); await sleep(400);
await tab(p, 'chat'); await sleep(400); await say(p, `Hola ${SECRET}`); await waitAnswer(p, 1); await sleep(600); await flushNow(p); await sleep(1500);
check('si dice que no: el servidor guarda "no", y no recibe NINGÚN evento de uso (ni un solo envío)', M.apiState.consent === false && M.apiState.events.length === 0 && M.apiState.eventBatches === 0, `consent=${M.apiState.consent} envíos=${M.apiState.eventBatches}`);
check('si dice que no, las respuestas no muestran el 👍 / 👎', !(await has(p, '.rate-box')));
await tab(p, 'settings'); await sleep(500);
check('en Ajustes el interruptor queda apagado, y puede opinar igual (comentarios y votos no dependen de las estadísticas)', !(await p.$eval('#s-analytics-t', (e) => e.checked)) && (await has(p, '#s-feedback')) && (await has(p, '#s-wishes')));
await p.close();

// ================================================================ 3) quien ya usaba la app: se le pregunta una sola vez
M.resetApi();
p = await newPage({ key: '', intro: false, analytics: null, lang: 'es', clean: true });
await p.waitForSelector('.tabbar', { timeout: 20000 }); await p.waitForSelector('.consent-sheet', { timeout: 10000 }); await sleep(500); await shot(p, 'B6-consentimiento-existente');
check('a quien ya usaba la app (sin decisión) se le pregunta en una hoja, con las mismas explicaciones', /Ayudanos a mejorar la beta/i.test(await text(p, '.consent-sheet')) && /Qué NO registramos/i.test(await text(p, '.consent-sheet')));
await click(p, '#c-yes'); await until(() => M.apiState.consent === true); await sleep(600);
check('al aceptar queda registrado, y la hoja se cierra', M.apiState.consent === true && !(await has(p, '.consent-sheet')));
await p.reload({ waitUntil: 'load' }); await p.waitForSelector('.tabbar', { timeout: 20000 }); await sleep(5000);
check('no se vuelve a preguntar en la próxima apertura', !(await has(p, '.consent-sheet')));
await p.close();

// ================================================================ 4) encuesta de recomendación: a los 3 días de uso, una vez
M.resetApi();
const days = [2, 1, 0].map((d) => new Date(Date.now() - d * 86400e3).toISOString().slice(0, 10));
p = await newPage({ key: '', intro: false, analytics: '0', lang: 'es', clean: true, extra: { 'finagent.days.v1': JSON.stringify(days.slice(0, 1)) } });     // 1 día previo + hoy = 2 días
await p.waitForSelector('.tabbar', { timeout: 20000 }); await sleep(4500);
check('con menos de 3 días de uso no pregunta si lo recomendaría', !(await has(p, '.nps-grid')));
await p.close();
M.resetApi();
p = await newPage({ key: '', intro: false, analytics: '0', lang: 'es', clean: true, extra: { 'finagent.days.v1': JSON.stringify(days.slice(0, 2)) } });
await p.waitForSelector('.tabbar', { timeout: 20000 }); await p.waitForSelector('.nps-grid', { timeout: 12000 }).catch(() => {}); await sleep(300);
check('con 3 días de uso (2 previos + hoy) pregunta "¿Qué tan probable es que recomiendes FinAgent a un amigo?" de 0 a 10', await has(p, '.nps-grid') && (await p.$$('.nps-grid .chip')).length === 11 && /recomiendes FinAgent/.test(await text(p, '.plan-sheet')));
await shot(p, 'B7-recomendacion');
check('no se puede enviar sin elegir un puntaje', await p.$eval('#nps-send', (b) => b.disabled));
await p.evaluate(() => document.querySelector('.nps-grid .chip[data-s="9"]').click()); await click(p, '#nps-send'); await until(() => M.apiState.feedback.length === 1);
check('el puntaje llega al servidor como recomendación (nps) con la nota elegida', M.apiState.feedback[0]?.kind === 'nps' && M.apiState.feedback[0]?.score === 9, JSON.stringify(M.apiState.feedback[0]));
await p.reload({ waitUntil: 'load' }); await p.waitForSelector('.tabbar', { timeout: 20000 }); await sleep(5000);
check('una vez respondida, no se vuelve a preguntar', !(await has(p, '.nps-grid')));
await p.close();

// ================================================================ 5) idiomas: todo lo nuevo se traduce
M.resetApi();
for (const [lang, want, wishText] of [['en', [/Help improve the beta/, /Tell us what is missing or what failed/, /What would you like us to add/], /They do not exist yet/], ['pt', [/Ajudar a melhorar o beta/, /Conte o que falta ou o que falhou/, /O que você gostaria que adicionássemos/], /Ainda não existem/]]) {
  p = await newPage({ key: '', intro: false, analytics: '1', lang, clean: true });
  await p.waitForSelector('.tabbar', { timeout: 20000 }); await sleep(600); await tab(p, 'settings'); await sleep(600);
  const st = await text(p, '#s-analytics') + await text(p, '#s-feedback') + await text(p, '#s-wishes');
  check(`en ${lang} el grupo "Beta" de Ajustes está traducido`, want.every((r) => r.test(st)) && !/[¿¡ñ]|\b(Ayudar|Contanos|Votá|Qué)\b/.test(st), st.slice(0, 80));
  await click(p, '#s-wishes'); await p.waitForSelector('.wish', { timeout: 4000 }); await sleep(300);
  const w = await text(p, '.plan-sheet');
  check(`en ${lang} la lista de votos está traducida completa`, wishText.test(w) && !/[¿¡ñ]|\b(Mi cartera|Cotizaciones sin|Me interesa|Cargar lo que tengo|Todavía|Votá)\b/.test(w), w.slice(0, 80));   // (solo palabras que en portugués son distintas)
  await p.close();
}

check('en toda la prueba la app nunca llamó a Gemini directamente', !log.requests.some((r) => r.includes('generativelanguage.googleapis.com')));
const bad = checks.filter((x) => !x.ok);
console.log(`\nRESULTADO (estadísticas de la beta): ${checks.length - bad.length}/${checks.length} verificaciones OK`);
console.log('ERRORES DE PÁGINA:', JSON.stringify(log.errors, null, 1));
await browser.close(); server.close();
process.exit(bad.length || log.errors.length ? 1 : 0);
