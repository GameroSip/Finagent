// Escenario de la BETA en un navegador real: la app compilada con servidor (VITE_API_BASE), sin clave de Gemini y sin código de invitación.
//   VITE_API_BASE=https://api.finagent.test npx vite build --outDir dist-server --emptyOutDir
//   cd e2e && node run-server.mjs ../dist-server ../e2e-shots
import * as M from './mocks.mjs';
import { browser, check, checks, log, newPage, say, server, shot, sleep, tab, waitAnswer } from './run.mjs';

M.resetApi();
const text = (p, sel) => p.$eval(sel, (e) => e.textContent).catch(() => '');
const chip = (p) => text(p, '#c-model .t');
const waitErr = (p, n = 1) => p.waitForFunction((k) => document.querySelectorAll('.err-bubble').length >= k, { timeout: 15000 }, n);
const activeTab = (p) => p.evaluate(() => document.querySelector('.tabbar .tab.on, .tabbar .tab.active, .tabbar .tab[aria-selected="true"]')?.getAttribute('data-tab'));
const lastErr = (p) => p.$$eval('.err-bubble', (e) => e.at(-1).textContent);

// 1) primera apertura: se entra directo, sin pedir NADA (ni clave de Gemini ni código)
let p = await newPage({ key: '' });
await p.waitForSelector('.tabbar', { timeout: 12000 }); await sleep(1500); await shot(p, 'S1-mercados');
check('abre directo en la app, sin pedir código ni clave', (await p.$('#onb-code')) === null && (await p.$('#onb-key')) === null && (await p.$('.tabbar')) !== null);
check('la cuenta se creó sola (una sola vez)', M.apiState.deviceAuths === 1, String(M.apiState.deviceAuths));

// 2) el chat dice qué plan tenés, qué modelo usa y cuántas conversaciones por día
await tab(p, 'chat'); await sleep(900);
const banner = await text(p, '#c-plan');
check('el chat explica el plan: "Plan Gratis · Gemini 3.5 Flash-Lite · 3 conversaciones por día"', /Plan Gratis · Gemini 3\.5 Flash-Lite · 3 conversaciones por día/.test(banner), banner.slice(0, 140));
check('ofrece los planes de pago como próximamente (más potentes, más conversaciones)', /planes de pago \(próximamente\)/.test(banner) && /modelos más potentes y más conversaciones/.test(banner));
check('avisa con honestidad que el nivel gratuito de Gemini puede usar las consultas', /nivel gratuito de Gemini/.test(banner) && /datos personales/.test(banner));
check('el contador del chat muestra el plan y las conversaciones que quedan', /^Plan Gratis · te quedan 3 conversaciones hoy$/.test(await chip(p)), await chip(p));
await shot(p, 'S2-chat-vacio');
await p.click('#c-plan [data-plans]'); await p.waitForSelector('.plans-sheet .plan-card', { timeout: 6000 }); await sleep(500);
const cards = await p.$$eval('.plan-card', (c) => c.map((x) => ({ n: x.querySelector('.plan-name').textContent, m: x.querySelector('.plan-mult b').textContent, t: x.textContent })));
const sheetTxt = await text(p, '.plans-sheet');
check('"Ver planes" abre la pantalla de planes (Plus y Pro)', /Llevá FinAgent al siguiente nivel/.test(sheetTxt) && cards.map((c) => c.n).join() === 'Plus,Pro', JSON.stringify(cards.map((c) => c.n)));
check('el multiplicador sale de los límites reales: Plus 3x (10 contra 3) y Pro 10x (30 contra 3)', cards[0].m === '3x' && cards[1].m === '10x', JSON.stringify(cards.map((c) => c.m)));
check('Pro ofrece análisis profundo con Gemini 3.1 Pro y Plus no (solo ventajas reales)', /Análisis profundo con Gemini 3\.1 Pro/.test(cards[1].t) && !/profundo/.test(cards[0].t));
check('explica por qué pagar: modelo más potente, respaldo automático y sin recordatorios', /Un modelo más potente: Gemini 3\.8 Flash/.test(cards[0].t) && /Respaldo automático/.test(cards[0].t) && /Sin recordatorios de planes/.test(cards[0].t));
check('destaca lo que sigue gratis y compara los planes', /Gratis para siempre/.test(sheetTxt) && /Fibonacci/.test(sheetTxt) && (await p.$('.plans-cmp')) !== null);
check('aclara con honestidad que todavía no se puede contratar ni tiene precio', /Todavía no se puede contratar ni tiene precio definido/.test(sheetTxt) && /Avisame cuando esté disponible/.test(sheetTxt));
await shot(p, 'S2b-planes');
await p.click('[data-plan="plus"]'); await sleep(700);
check('"Avisame" anota el interés en Plus y el botón queda en "Anotado ✓"', M.apiState.interest.includes('plus') && (await p.$eval('[data-plan="plus"]', (b) => b.textContent)) === 'Anotado ✓', JSON.stringify(M.apiState.interest));
await p.evaluate(() => document.querySelector('.sheet-back').click()); await sleep(450);
await tab(p, 'chat'); await sleep(400);

// 3) una conversación: verificada, y descuenta una
await say(p, 'Dame el análisis técnico de AAPL'); await waitAnswer(p); await sleep(1200);
const ans = await p.$$eval('.m-ai .md', (e) => e.at(-1).textContent);
check('responde con datos y sin cifras sin respaldo', /RSI de 14 períodos/.test(ans) && !ans.includes('[dato no verificado]'), ans.slice(0, 100));
check('quedan 2 conversaciones (una conversación = una, aunque use varias vueltas al modelo)', /te quedan 2 conversaciones hoy/.test(await chip(p)), await chip(p));
check('el chat tiene título provisorio (sin gastar una conversación en un título con IA)', /Dame el análisis técnico/.test(await text(p, '#c-title-t')));
await shot(p, 'S3-chat');

// 4) capacidad: explica qué pasó en vez de "Mucha demanda, reintentando…"
M.apiState.capacity = 'minute';
await say(p, 'hola'); await waitErr(p);
let e = await lastErr(p);
check('sin cupo por minuto: dice que hay mucha demanda, la causa y cuánto esperar', /Hay mucha demanda en este momento/.test(e) && /cupo gratuito compartido/.test(e) && /30 segundos/.test(e), e.slice(0, 200));
check('aclara que la conversación NO se descontó', /no se descontó/.test(e));
check('no hay ningún "reintentando" en pantalla', !/reintentando/i.test(await p.evaluate(() => document.body.innerText)));
check('quedan igual 2 conversaciones', /te quedan 2 conversaciones hoy/.test(await chip(p)), await chip(p));
M.apiState.capacity = 'day';
await say(p, 'hola'); await waitErr(p, 2);
e = await lastErr(p);
check('sin capacidad del día: lo explica y menciona que los planes de pago tendrán capacidad reservada', /Hoy se agotó la capacidad gratuita de FinAgent/.test(e) && /capacidad reservada/.test(e), e.slice(0, 200));
await shot(p, 'S4-capacidad');
M.apiState.capacity = null;

// 5) se agota el límite del plan gratis
await say(p, 'Dame el análisis técnico de AAPL'); await waitAnswer(p, 2); await sleep(700);
check('queda 1 conversación (singular)', /te queda 1 conversación hoy/.test(await chip(p)), await chip(p));
await p.waitForSelector('.upsell-card', { timeout: 6000 });
const up = await text(p, '.upsell-card');
check('con 1 conversación restante aparece UNA sugerencia de planes, con el multiplicador real (10x)', /Te queda 1 conversación hoy/.test(up) && /10x más usos/.test(up) && (await p.$$('.upsell-card')).length === 1, up.slice(0, 160));
check('la sugerencia aclara que los gráficos, los mercados y las herramientas siguen gratis', /siguen gratis/.test(up));
await shot(p, 'S5a-sugerencia-planes');
await p.click('.upsell-card [data-u="later"]'); await sleep(300);
check('"Ahora no" la quita y la silencia por 7 días', (await p.$('.upsell-card')) === null && (await p.evaluate(() => JSON.parse(localStorage.getItem('finagent.upsell.v1')).dismissedUntil > Date.now() + 6 * 864e5)));
await say(p, 'Dame el análisis técnico de AAPL'); await waitAnswer(p, 3); await sleep(700);
check('llegó a 0', /te quedan 0 conversaciones hoy/.test(await chip(p)), await chip(p));
await say(p, 'Dame el análisis técnico de AAPL'); await waitErr(p, 3);
e = await lastErr(p);
check('al pasarse del límite: dice cuál es, cuándo vuelve y ofrece los planes de pago', /Usaste las 3 conversaciones de hoy de tu plan Gratis/.test(e) && /Se reinician/.test(e) && /planes de pago \(próximamente\)/.test(e), e.slice(0, 220));
check('ofrece "Ver mercados" y "Ver planes"', (await p.$('.err-bubble [data-go="market"]')) !== null && (await p.$('.err-bubble [data-plans]')) !== null);
await shot(p, 'S5-limite');
await p.click('.err-bubble [data-go="market"]'); await sleep(500);
check('"Ver mercados" lleva a Mercados', (await activeTab(p)) === 'market', String(await activeTab(p)));

// 6) Ajustes: plan, modelo fijo y planes de pago con "Avisame"
await tab(p, 'settings'); await sleep(1200);
let st = await p.evaluate(() => document.body.innerText);
check('Ajustes muestra el plan, el modelo fijo y las conversaciones', /Plan Gratis/.test(st) && /0 de 3 conversaciones hoy/.test(st) && /Gemini 3\.5 Flash-Lite/.test(st), st.match(/Tu plan[^]{0,200}/)?.[0]);
check('muestra el aviso del nivel gratuito de Gemini', /Por ahora FinAgent usa el nivel gratuito de Gemini/.test(st));
check('Ajustes invita a ver los planes (Plus y Pro, próximamente)', /Plus y Pro\s*Próximamente/.test(st) && (await p.$('#s-plans-open')) !== null, st.match(/Planes de pago[^]{0,200}/)?.[0]);
check('NO hay ninguna clave de Gemini en Ajustes', (await p.$('#s-key')) === null && !/Clave de Gemini/.test(st));
await shot(p, 'S6-ajustes-plan');
await p.click('#s-plans-open'); await p.waitForSelector('.plans-sheet .plan-card', { timeout: 6000 }); await sleep(500);
check('desde Ajustes también se abre la pantalla de planes, y recuerda que ya te anotaste en Plus', (await p.$eval('[data-plan="plus"]', (b) => b.textContent)) === 'Anotado ✓');
await p.evaluate(() => document.querySelector('.sheet-back').click()); await sleep(450);

// 7) un código de plan (para testers) desbloquea un plan más potente
await p.type('#s-code', 'fatest2222'); await p.click('#s-redeem'); await sleep(1500);
st = await p.evaluate(() => document.body.innerText);
check('el código desbloquea el plan Plus con su modelo más potente', /Plan Plus/.test(st) && /Gemini 3\.8 Flash/.test(st), st.match(/Tu plan[^]{0,160}/)?.[0]);
await tab(p, 'chat'); await sleep(500);
check('y el chat lo refleja: Plan Plus con 7 conversaciones (10 - 3 ya usadas)', /^Plan Plus · te quedan 7 conversaciones hoy$/.test(await chip(p)), await chip(p));
await shot(p, 'S7-plan-plus');

// 8) la sesión se conserva al cerrar y reabrir (no se crea otra cuenta)
await p.reload({ waitUntil: 'load' }); await p.waitForSelector('.tabbar', { timeout: 12000 }); await sleep(800);
check('al reabrir entra directo y NO crea otra cuenta', M.apiState.deviceAuths === 1, String(M.apiState.deviceAuths));

// 9) sesión vencida en el servidor: se renueva sola, sin que la persona se entere
M.apiState.tokens.clear();
const nAns = () => p.$$eval('.m-ai .md', (x) => x.length);
await tab(p, 'chat'); await sleep(400);
const before = await nAns();
await say(p, 'Dame el análisis técnico de AAPL'); await waitAnswer(p, before + 1); await sleep(500);
check('si la sesión venció, se renueva sola y la conversación sale igual', M.apiState.deviceAuths === 2 && (await nAns()) === before + 1, `cuentas creadas: ${M.apiState.deviceAuths}`);

// 10) acceso desactivado: aviso claro (y la app no crea otra cuenta a escondidas)
M.apiState.tokens.clear(); M.apiState.banned = true;
const errs = await p.$$eval('.err-bubble', (x) => x.length);
await say(p, 'hola'); await waitErr(p, errs + 1);
e = await lastErr(p);
check('si desactivan el acceso, lo dice claramente', /Tu acceso a FinAgent fue desactivado/.test(e), e.slice(0, 120));
await p.close();

// 12) recordatorio semanal en Mercados: solo plan gratis, solo si ya usó la app, y una sola vez
const seed = { 'finagent.upsell.v1': JSON.stringify({ answers: 6, lastShown: Date.now() - 9 * 864e5, dismissedUntil: 0, shownAt: [] }) };
M.resetApi();
let w = await newPage({ key: '', extra: seed }); await w.waitForSelector('.tabbar', { timeout: 12000 }); await sleep(3500);
check('en Mercados aparece el recordatorio semanal (plan gratis, ya usó la app, pasó una semana)', (await w.$('#m-upsell .upsell-card')) !== null && /Más usos, un modelo más potente/.test(await text(w, '#m-upsell')), await text(w, '#m-upsell'));
await shot(w, 'S8-recordatorio-semanal');
await w.reload({ waitUntil: 'load' }); await w.waitForSelector('.tabbar', { timeout: 12000 }); await sleep(3000);
check('al volver no se repite (como máximo uno cada 24 horas)', (await w.$('#m-upsell .upsell-card')) === null);
await w.close();
M.resetApi(); M.apiState.plan = 'plus';
w = await newPage({ key: '', extra: seed }); await w.waitForSelector('.tabbar', { timeout: 12000 }); await sleep(3500);
check('quien ya tiene un plan de pago NO recibe recordatorios', (await w.$('.upsell-card')) === null);
await w.close();

// 11) lo más importante: en TODA la sesión la app nunca habló con Google ni usó una clave
check('la app jamás llamó a Gemini directamente (todo pasó por el servidor de FinAgent)', !log.requests.some((r) => r.includes('generativelanguage.googleapis.com')), log.requests.filter((r) => r.includes('googleapis')).join(' | '));
check('usó el servidor de FinAgent', log.requests.some((r) => r.includes('api.finagent.test/v1/generate')));

const bad = checks.filter((c) => !c.ok);
console.log(`\nRESULTADO (modo servidor): ${checks.length - bad.length}/${checks.length} verificaciones OK`);
console.log('ERRORES DE PÁGINA:', JSON.stringify(log.errors, null, 1));
console.log('ERRORES DE CONSOLA:', JSON.stringify([...new Set(log.consoleErrors)].slice(0, 8), null, 1));
await browser.close(); server.close();
process.exit(bad.length || log.errors.length ? 1 : 0);
