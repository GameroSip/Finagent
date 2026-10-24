// Introducción (carga 3D → cuenta → idioma → recorrido), idiomas y "Acerca de" en un navegador real, con la app compilada con servidor.
//   VITE_API_BASE=https://api.finagent.test npx vite build --outDir dist-server --emptyOutDir
//   cd e2e && node run-intro.mjs ../dist-server ../e2e-shots
import sharp from 'sharp';
import * as M from './mocks.mjs';
import { browser, check, checks, log, newPage, shot, server, sleep, tab } from './run.mjs';

M.resetApi();
const text = (p, sel) => p.$eval(sel, (e) => e.innerText).catch(() => '');
const click = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
const has = (p, sel) => p.$(sel).then((x) => x !== null);
const activeTitle = (p) => p.$eval('.slide.active h2', (e) => e.textContent).catch(() => '');

// ---- 1) pantalla de carga: logo 3D y despegue (reloj del escenario controlado para detenerlo en cada instante)
let p = await newPage({ key: '', intro: true, lang: '', motion: true });
await p.evaluateOnNewDocument(() => { window.__t = 0; window.__stageClock = () => window.__t; window.__ac = 0; const AC = window.AudioContext; window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ac++; } }; });
await p.reload({ waitUntil: 'load' });
await p.waitForSelector('.stage-canvas', { timeout: 20000 });
const frame = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const step = async (ms) => { await p.evaluate((m) => { window.__t += m; }, ms); await frame(); };
const phase = () => p.evaluate(() => document.querySelector('.launch')?.className ?? 'ninguna');
await sleep(500); await shot(p, 'T1-carga');
check('muestra la pantalla de carga con el logo 3D (WebGL), la palabra FINAGENT y una línea de progreso', await p.evaluate(() => { const c = document.querySelector('.stage-canvas'); return !!c && c.clientWidth > 200 && c.clientHeight > 300 && /FINAGENT/.test(document.querySelector('.launch-word')?.textContent ?? '') && !!document.querySelector('.launch-line i'); }));
{ // se mira una captura real: en el centro tiene que haber un objeto dorado (no un lienzo vacío) y no puede estar quemado a blanco
  const box = await p.evaluate(() => { const r = document.querySelector('.stage-canvas').getBoundingClientRect(); return { x: r.width * 0.25, y: r.height * 0.3, width: r.width * 0.5, height: r.height * 0.3 }; });
  const png = await p.screenshot({ clip: box }); const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let gold = 0, white = 0, total = data.length / 3; for (let i = 0; i < data.length; i += 3) { const [r, g, b] = [data[i], data[i + 1], data[i + 2]]; if (r > 90 && r > b * 1.35 && g > b) gold++; if (r > 235 && g > 235 && b > 225) white++; }
  check('el logo 3D se dibuja de verdad: hay metal dorado en el centro y no está quemado a blanco', gold / total > 0.04 && white / total < 0.02, `dorado ${(100 * gold / total).toFixed(1)} %, blanco ${(100 * white / total).toFixed(1)} %`); }
check('usa el idioma del dispositivo (inglés) sin preguntar', (await p.evaluate(() => document.documentElement.lang)) === 'en');
await p.waitForFunction(() => document.querySelector('.launch.going'), { timeout: 20000, polling: 40 });
check('al terminar la carga suena UN efecto de sonido (una sola vez)', (await p.evaluate(() => window.__ac)) === 1, String(await p.evaluate(() => window.__ac)));
check('la cuenta se creó de verdad durante la carga', M.apiState.deviceAuths === 1, String(M.apiState.deviceAuths));
const seen = new Set(); let steps = 0;
while ((await p.$('.launch')) && steps++ < 160) { seen.add(await phase()); if (steps === 30) await shot(p, 'T2-despegue'); await step(33); }
check('el logo despega: primero "going", luego "revealing" (la pantalla siguiente aparece mientras sube) y por último desaparece', [...seen].some((c) => /going/.test(c) && !/revealing/.test(c)) && [...seen].some((c) => /revealing/.test(c)) && !(await p.$('.launch')), JSON.stringify([...seen]));
await p.waitForSelector('#a-guest', { timeout: 8000 }); await sleep(900);
await shot(p, 'T3-cuenta');
const acc = await text(p, '.intro');
check('luego pide iniciar sesión, en inglés: Google y correo como "Coming soon" y entrar como invitado', /Sign in to FinAgent/.test(acc) && /Continue with Google/.test(acc) && /Continue with email/.test(acc) && (acc.match(/Coming soon/g) ?? []).length === 2 && /Continue as guest/.test(acc), acc.slice(0, 200));
check('los botones que todavía no existen están desactivados (no se promete lo que no anda)', await p.$$eval('.auth-btn', (b) => b.every((x) => x.disabled)));
check('la pantalla de cuenta es sobria: sin degradés ni destellos de colores', await p.evaluate(() => ![...document.querySelectorAll('.intro *')].some((e) => /gradient/.test(getComputedStyle(e).backgroundImage) && !e.closest('.a-rule'))));

// ---- 3) idioma: se cambia al instante
await click(p, '#a-guest'); await p.waitForSelector('.lang-grid', { timeout: 6000 }); await sleep(900);
check('pide elegir el idioma, con el del dispositivo ya marcado', /Choose your language/.test(await text(p, '.intro')) && await p.$eval('.lang-card.on', (e) => e.dataset.l) === 'en');
await click(p, '.lang-card[data-l="es"]'); await sleep(250);
check('al elegir Español toda la pantalla pasa a español al instante', /Elegí tu idioma/.test(await text(p, '.intro')) && /Continuar/.test(await text(p, '#l-next')));
await click(p, '.lang-card[data-l="pt"]'); await sleep(250);
check('al elegir Português pasa a portugués', /Escolha seu idioma/.test(await text(p, '.intro')) && /Continuar/.test(await text(p, '#l-next')));
check('muestra los idiomas que vienen como "próximamente" (sin prometer fechas)', /Em breve/.test(await text(p, '.lang-soon')) && (await p.$$('.lang-soon i')).length >= 4);
await shot(p, 'T3-idioma');

// ---- 4) recorrido por la app (en portugués)
await click(p, '#l-next'); await p.waitForSelector('.tour .slide.active', { timeout: 4000 }); await sleep(500);
const titles = [];
for (let i = 0; i < 7; i++) {
  await sleep(450); titles.push(await activeTitle(p));
  if (i === 3 || i === 5) await shot(p, `T4-tour-${i}`);
  if (i < 6) await click(p, '#t-next');
}
check('el recorrido tiene 7 diapositivas, todas en portugués', titles.length === 7 && titles[0] === 'Seu analista financeiro com IA' && titles[1] === 'Mercados do mundo' && titles[3] === 'Por que é melhor que uma IA comum' && titles[5] === 'O que há por trás' && titles[6] === 'Comece grátis', JSON.stringify(titles));
const last = await text(p, '.slide.active');
check('explica los planes y lo que sigue gratis, sin inventar precios', /planos Plus e Pro/.test(last) && !/\$|US\$|USD|R\$\s?\d/.test(last));
check('en la última diapositiva el botón dice "Começar"', (await text(p, '#t-next')) === 'Começar');
await click(p, '#t-back'); await sleep(450);
check('se puede volver atrás', (await activeTitle(p)) === 'O que há por trás');
const backing = await text(p, '.slide.active');
check('"Qué hay detrás" dice la verdad: IA de Google (independiente de Google) y fuentes públicas sin acuerdos comerciales', /independente do Google/.test(backing) && /sem acordos comerciais/.test(backing) && !/licen[çc]/i.test(backing), backing.slice(0, 200));
await click(p, '#t-next'); await sleep(450);
await click(p, '#t-next'); await p.waitForSelector('.tabbar', { timeout: 8000 }); await sleep(1500);
check('al terminar entra a la app, ya en portugués', (await p.evaluate(() => document.documentElement.lang)) === 'pt' && /Mercados/.test(await text(p, '.tabbar')) && /Configurações/.test(await text(p, '.tabbar')) && /Assistente/.test(await text(p, '.tabbar')), await text(p, '.tabbar'));
await shot(p, 'T5-app-pt');

// ---- 5) las siguientes aperturas: splash corto y directo a la app (sin repetir la introducción), en el idioma elegido
await p.close();
p = await newPage({ key: '', lang: '' });                  // reabrir la app (con movimiento reducido: el reloj del escenario de arriba ya no aplica)
await p.waitForSelector('.tabbar', { timeout: 20000 }); await sleep(600);
check('al volver a abrir NO repite la introducción y conserva el idioma', !(await has(p, '.intro')) && (await p.evaluate(() => document.documentElement.lang)) === 'pt' && M.apiState.deviceAuths === 1, String(M.apiState.deviceAuths));

// ---- 6) cambiar de idioma desde Ajustes y "Acerca de"
await tab(p, 'settings'); await sleep(900);
check('en Ajustes está el selector de idioma con el actual', /Idioma/.test(await text(p, '#s-lang')) && /Português/.test(await text(p, '#s-lang')), await text(p, '#s-lang'));
await click(p, '#s-about'); await p.waitForSelector('.about-sheet .flow', { timeout: 4000 }); await sleep(1400);
const ab = await text(p, '.about-sheet');
check('"Acerca de" muestra cómo funciona (5 pasos), qué hay detrás, la comparación con una IA común, cobertura, privacidad y límites', (await p.$$('.flow-node')).length === 5 && /como funciona/i.test(ab) && /o que há por trás/i.test(ab) && /ia comum/i.test(ab) && /cobertura/i.test(ab) && /sua privacidade/i.test(ab) && /limites e aviso legal/i.test(ab), ab.slice(0, 160));
check('"Acerca de" no promete licencias, respaldo de Google ni tiempo real', !/licen[çc]|respaldad|avalizad|tempo real|todos os mercados/i.test(ab) && /independente do Google/.test(ab));
await shot(p, 'T6-acerca-de');
await p.evaluate(() => document.querySelector('.sheet-back').click()); await sleep(450);
await click(p, '#s-lang'); await sleep(500);
await p.evaluate(() => [...document.querySelectorAll('.sheet .act-row')].find((b) => /English/.test(b.textContent))?.click());
await p.waitForFunction(() => document.querySelector('.tabbar') && document.documentElement.lang === 'en', { timeout: 60000 });   // sobrevive al reinicio de la página
check('cambiar el idioma desde Ajustes reinicia la app en el idioma elegido (inglés)', (await p.evaluate(() => document.documentElement.lang)) === 'en' && /Markets/.test(await text(p, '.tabbar')) && /Settings/.test(await text(p, '.tabbar')), await text(p, '.tabbar'));
await p.close();

// ---- 7) "Omitir" lleva directo a la app
p = await newPage({ key: '', intro: true, lang: 'es' });
await p.evaluateOnNewDocument(() => { window.__ac = 0; const AC = window.AudioContext; window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ac++; } }; });
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('finagent.sound.v1', '0'); }); await p.reload({ waitUntil: 'load' });   // el almacenamiento se comparte entre pestañas: se empieza de cero (y con el sonido apagado)
await p.waitForSelector('#a-guest', { timeout: 30000 }); await click(p, '#a-guest'); await p.waitForSelector('#l-next', { timeout: 5000 }); await sleep(300); await click(p, '#l-next'); await p.waitForSelector('#t-skip', { timeout: 5000 });
await click(p, '#t-skip'); await p.waitForSelector('.tabbar', { timeout: 8000 });
check('"Omitir" salta el recorrido y entra a la app', (await has(p, '.tabbar')) && !(await has(p, '.intro')));
check('con el sonido apagado en Ajustes no suena nada al abrir la app', (await p.evaluate(() => window.__ac)) === 0, String(await p.evaluate(() => window.__ac)));
await p.close();

check('en toda la prueba la app nunca llamó a Gemini directamente', !log.requests.some((r) => r.includes('generativelanguage.googleapis.com')));
const bad = checks.filter((c) => !c.ok);
console.log(`\nRESULTADO (introducción e idiomas): ${checks.length - bad.length}/${checks.length} verificaciones OK`);
console.log('ERRORES DE PÁGINA:', JSON.stringify(log.errors, null, 1));
await browser.close(); server.close();
process.exit(bad.length || log.errors.length ? 1 : 0);
