// Introducción (carga 3D → cuenta → idioma → recorrido), idiomas y "Acerca de" en un navegador real, con la app compilada con servidor.
//   VITE_API_BASE=https://api.finagent.test npx vite build --outDir dist-server --emptyOutDir
//   cd e2e && node run-intro.mjs ../dist-server ../e2e-shots
import * as M from './mocks.mjs';
import { browser, check, checks, log, newPage, shot, server, sleep, tab } from './run.mjs';

M.resetApi();
const text = (p, sel) => p.$eval(sel, (e) => e.innerText).catch(() => '');
const click = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
const has = (p, sel) => p.$(sel).then((x) => x !== null);
const activeTitle = (p) => p.$eval('.slide.active h2', (e) => e.textContent).catch(() => '');

// ---- 1) primera apertura: el navegador de prueba está en inglés, así que la introducción arranca en inglés (idioma del dispositivo)
let p = await newPage({ key: '', intro: true, lang: '' });
await p.waitForSelector('.intro .l3d', { timeout: 8000 }); await sleep(1000);
const okMid = await p.$$eval('.intro-checks li.ok', (l) => l.length);
check('arranca con la pantalla de carga: logo de FinAgent en 3D, con animación', await p.evaluate(() => { const c = document.querySelector('.l3d-coin'); const cs = getComputedStyle(c); return cs.animationName === 'l3dSwing' && getComputedStyle(document.querySelector('.l3d-stage')).transformStyle === 'preserve-3d' && document.querySelectorAll('.l3d-layer').length >= 10; }));
check('el logo 3D tiene espesor (capas apiladas), anillos orbitales y velas flotantes', (await p.$$('.l3d-layer')).length === 10 && (await p.$$('.l3d-ring')).length === 2 && (await p.$$('.l3d-bar')).length === 4);
check('usa el idioma del dispositivo (inglés) sin preguntar', /Your AI financial analyst/.test(await text(p, '.intro')) && (await p.evaluate(() => document.documentElement.lang)) === 'en', await text(p, '.intro'));
await shot(p, 'T1-carga');
await p.waitForSelector('#a-guest', { timeout: 10000 });
check('hace un mini proceso de configuración con 3 pasos que se van tildando (y la cuenta se crea de verdad)', okMid >= 1 && M.apiState.deviceAuths === 1, `tildes a mitad: ${okMid}, cuentas: ${M.apiState.deviceAuths}`);

// ---- 2) cuenta
await sleep(300);
const acc = await text(p, '.intro');
check('luego pide iniciar sesión, en inglés: Google y correo como "Coming soon" y entrar como invitado', /Sign in to FinAgent/.test(acc) && /Continue with Google/.test(acc) && /Continue with email/.test(acc) && (acc.match(/Coming soon/g) ?? []).length === 2 && /Continue as guest/.test(acc), acc.slice(0, 200));
check('los botones que todavía no existen están desactivados (no se promete lo que no anda)', await p.$$eval('.auth-btn', (b) => b.every((x) => x.disabled)));
await shot(p, 'T2-cuenta');

// ---- 3) idioma: se cambia al instante
await click(p, '#a-guest'); await p.waitForSelector('.lang-grid', { timeout: 4000 }); await sleep(300);
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
await p.reload({ waitUntil: 'load' });
await p.waitForSelector('.tabbar', { timeout: 20000 }); await sleep(600);
check('al volver a abrir NO repite la introducción y conserva el idioma', !(await has(p, '.intro')) && (await p.evaluate(() => document.documentElement.lang)) === 'pt' && M.apiState.deviceAuths === 1, String(M.apiState.deviceAuths));

// ---- 6) cambiar de idioma desde Ajustes y "Acerca de"
await tab(p, 'settings'); await sleep(900);
check('en Ajustes está el selector de idioma con el actual', /Idioma/.test(await text(p, '#s-lang')) && /Português/.test(await text(p, '#s-lang')), await text(p, '#s-lang'));
await click(p, '#s-about'); await p.waitForSelector('.about-sheet .flow', { timeout: 4000 }); await sleep(1400);
const ab = await text(p, '.about-sheet');
check('"Acerca de" muestra cómo funciona (5 pasos), qué hay detrás, la comparación con una IA común, cobertura, privacidad y límites', (await p.$$('.flow-node')).length === 5 && /Como funciona/.test(ab) && /O que há por trás/.test(ab) && /IA comum/.test(ab) && /Cobertura/.test(ab) && /Sua privacidade/.test(ab) && /Limites e aviso legal/.test(ab), ab.slice(0, 160));
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
await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'load' });   // el almacenamiento se comparte entre pestañas: se empieza de cero
await p.waitForSelector('#a-guest', { timeout: 30000 }); await click(p, '#a-guest'); await click(p, '#l-next'); await p.waitForSelector('#t-skip', { timeout: 4000 });
await click(p, '#t-skip'); await p.waitForSelector('.tabbar', { timeout: 8000 });
check('"Omitir" salta el recorrido y entra a la app', (await has(p, '.tabbar')) && !(await has(p, '.intro')));
await p.close();

check('en toda la prueba la app nunca llamó a Gemini directamente', !log.requests.some((r) => r.includes('generativelanguage.googleapis.com')));
const bad = checks.filter((c) => !c.ok);
console.log(`\nRESULTADO (introducción e idiomas): ${checks.length - bad.length}/${checks.length} verificaciones OK`);
console.log('ERRORES DE PÁGINA:', JSON.stringify(log.errors, null, 1));
await browser.close(); server.close();
process.exit(bad.length || log.errors.length ? 1 : 0);
