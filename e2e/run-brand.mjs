// La marca "FinAgent AI" de punta a punta (app con servidor): UN solo asistente para todos los planes (sin niveles ni nombres de modelo a la vista),
// con lo que incluye cada plan HOY separado de lo que viene ("Próximamente"), y siempre a la vista que corre sobre Gemini. Verifica español e inglés.
//   VITE_API_BASE=https://api.finagent.test npx vite build --outDir dist-server --emptyOutDir
//   cd e2e && node run-brand.mjs ../dist-server ../e2e-shots
import * as M from './mocks.mjs';
import { browser, check, checks, log, newPage, say, server, shot, sleep, tab, waitAnswer } from './run.mjs';

const text = (p, sel) => p.$eval(sel, (e) => e.innerText).catch(() => '');
const click = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);

for (const [lang, L] of [['es', { soonH: 'Próximamente (todavía no existen)', cartera: /Mi cartera/, pdf: /Informe de un activo en PDF/, cmp: /Mi cartera y calculadora/, vs: /IA sin herramientas/, vsNote: /Algunas IA también usan búsqueda o herramientas/, lvl: /Nivel de IA/, fast: 'FinAgent AI Rápido', adv: 'FinAgent AI Avanzado', pow: /Impulsado por Gemini de Google/, what: /Qué es FinAgent AI/i, ph: 'Preguntale algo a FinAgent AI…', eng: /Motor FinAgent v1\.0/ }], ['en', { soonH: 'Coming soon (they do not exist yet)', cartera: /My portfolio/, pdf: /One-asset PDF report/, cmp: /My portfolio and calculator/, vs: /AI without tools/, vsNote: /Some AIs also use search or tools/, lvl: /AI level/, fast: 'FinAgent AI Fast', adv: 'FinAgent AI Advanced', pow: /Powered by Google Gemini/, what: /What FinAgent AI is/i, ph: 'Ask FinAgent AI something…', eng: /Engine FinAgent v1\.0/ }]]) {
  M.resetApi();
  const p = await newPage({ key: '', intro: false, analytics: '0', lang, clean: true });
  await p.waitForSelector('.tabbar', { timeout: 20000 }); await sleep(800);
  await tab(p, 'chat'); await sleep(500);
  check(`[${lang}] el cuadro de texto del chat dice "${L.ph}"`, (await p.$eval('#c-in', (e) => e.placeholder)) === L.ph, await p.$eval('#c-in', (e) => e.placeholder));
  await say(p, 'Hola'); await waitAnswer(p, 1); await sleep(500); await shot(p, `BR-${lang}-pie-respuesta`);
  check(`[${lang}] las respuestas NO muestran nivel ni nombre de modelo de Google (hay un solo FinAgent AI)`, !(await p.$('.m-ai .tier-line')) && !/Respondió|Answered by|Gemini 3|Flash|Rápido|Fast\b/.test(await text(p, '.m-ai')), await text(p, '.m-ai'));
  await tab(p, 'settings'); await sleep(700);
  const setTxt = await text(p, '.view.active, body');
  check(`[${lang}] Ajustes ya no muestra "Nivel de IA" ni nombres de modelo (muestra el plan y las conversaciones)`, !(await p.$('#s-model')) && !/Nivel de IA|AI level|FinAgent AI (Rápido|Fast|Avanzado|Advanced)|Gemini 3\.\d/.test((setTxt.match(/(Tu plan|Your plan)[^]{0,260}/) ?? [''])[0]), (setTxt.match(/(Tu plan|Your plan)[^]{0,160}/) ?? [''])[0]);
  // Estado de las fuentes: con servidor se chequea el servidor de FinAgent (antes daba un falso "Permission denied" de Google porque el teléfono no tiene la clave de Gemini)
  await p.evaluate(() => document.querySelector('#s-probe')?.scrollIntoView({ block: 'center' })); await sleep(300);
  await click(p, '#s-probe'); await p.waitForFunction(() => [...document.querySelectorAll('#s-sources .src')].every((r) => r.querySelector('.sdot.ok, .sdot.bad, .sdot.err, .sdot.fail')), { timeout: 15000 }).catch(() => {}); await sleep(500); await shot(p, `BR-${lang}-estado-fuentes`);
  const rows = await p.evaluate(() => [...document.querySelectorAll('#s-sources .src')].map((r) => ({ t: r.innerText.replace(/\s+/g, ' ').trim(), ok: !!r.querySelector('.sdot.ok') })));
  const srv = rows.find((r) => /FinAgent AI · (servidor|server)/.test(r.t));
  check(`[${lang}] el estado de las fuentes incluye el servidor de FinAgent AI, en verde`, !!srv && srv.ok, JSON.stringify(srv));
  check(`[${lang}] y ya no muestra "Google Gemini · modelos" (con servidor la clave la tiene el servidor, no el teléfono)`, !rows.some((r) => /Gemini · (modelos|models)/.test(r.t)), rows.map((r) => r.t.slice(0, 30)).join(' | '));
  await p.evaluate(() => document.querySelector('#s-plans-open')?.scrollIntoView({ block: 'center' })); await sleep(300);
  await click(p, '#s-plans-open'); await p.waitForSelector('.plans-sheet .plan-card', { timeout: 6000 }); await sleep(600); await shot(p, `BR-${lang}-planes`);
  const plans = await text(p, '.plans-sheet');
  check(`[${lang}] las tarjetas de planes NO muestran niveles ni nombres de modelo, ni prometen "más potente" ni análisis profundo`, !/Gemini|Flash|Rápido|Avanzado|Profundo|\bFast\b|Advanced|Deep analysis|Análisis profundo|más potente|more powerful|AI level|Nivel de IA/.test(plans), plans.slice(0, 160));
  const cmpRow = (await p.$$eval('.plans-cmp tbody tr', (rs) => rs.map((r) => ({ th: r.querySelector('th')?.textContent?.trim() ?? '', cells: [...r.querySelectorAll('td')].map((c) => c.textContent?.trim() ?? '') })))).find((r) => L.cmp.test(r.th));   // fila de la tabla comparativa: gratis '—', Plus y Pro 'Próximamente'
  const soon = await p.$$eval('.plan-card', (cs) => cs.map((c) => ({ h: c.querySelector('.plan-soon-h')?.innerText.trim(), n: c.querySelectorAll('.plan-soon li').length, inc: c.querySelectorAll('.plan-ul:not(.soon) li').length })));
  check(`[${lang}] lo planeado va aparte bajo "${L.soonH}" (Plus 3, Pro 5) y lo incluido son 2 puntos por plan (cupo y sin recordatorios)`, soon.length === 2 && soon.every((x) => x.h?.toLowerCase() === L.soonH.toLowerCase() && x.inc === 2) && soon.map((x) => x.n).join() === '3,5', JSON.stringify(soon));
  check(`[${lang}] las funciones planeadas están en las tarjetas (cartera, PDF) y la tabla comparativa las marca como "Próximamente", no como incluidas`, L.cartera.test(plans) && L.pdf.test(plans) && cmpRow !== undefined && cmpRow.cells[0] === '—' && cmpRow.cells.slice(1).every((c) => /Próximamente|Coming soon/i.test(c)), JSON.stringify(cmpRow));
  await p.keyboard.press('Escape'); await p.evaluate(() => { const b = document.querySelector('.sheet-back'); if (b) b.click(); }); await sleep(500);
  await p.evaluate(() => document.querySelector('#s-about')?.scrollIntoView({ block: 'center' })); await sleep(300);
  await click(p, '#s-about'); await p.waitForSelector('.about-sheet', { timeout: 6000 }); await sleep(700); await shot(p, `BR-${lang}-acerca`);
  const about = await text(p, '.about-sheet');
  check(`[${lang}] "Acerca de" explica qué es FinAgent AI y dice, a la vista, que corre sobre Gemini de Google`, L.what.test(about) && L.pow.test(about) && /FinAgent AI/.test(about) && /Gemini/.test(about));
  check(`[${lang}] la comparación es con una "${L.vs.source}", reconoce que otras IA también usan herramientas y no dice "mejor que"`, L.vs.test(about) && L.vsNote.test(about) && !/mejor que|better than|melhor que/i.test(about));
  check(`[${lang}] muestra la versión del motor junto a la versión de la app`, L.eng.test(about), about.match(/Motor[^\n]*|Engine[^\n]*/)?.[0]);
  check(`[${lang}] aclara que no se modifica el modelo de lenguaje y ya no habla de niveles`, /(no entrena ni ajusta el modelo|does not modify the language model)/.test(about) && !/Rápido, Avanzado|Fast, Advanced|nivel de tu plan|your plan's level/.test(about));
  if (lang === 'en') check('[en] no quedan textos en español en lo nuevo', !/[¿¡ñ]|\b(Impulsado|Qué es|Próximamente|cartera|escenarios|semanal|Motor|conversaciones)\b/.test(about + plans + setTxt), (about + plans + setTxt).match(/[¿¡ñ]|\b(Impulsado|Qué es|Próximamente|cartera|escenarios|semanal|Motor|conversaciones)\b/)?.[0]);
  await p.close();
}
// plan Plus: usa el mismo asistente que el gratuito, sin nivel ni aviso de respaldo (hoy todos los planes usan un solo modelo)
M.resetApi(); M.apiState.plan = 'plus';
{
  const p = await newPage({ key: '', intro: false, analytics: '0', lang: 'es', clean: true });
  await p.waitForSelector('.tabbar', { timeout: 20000 }); await sleep(800); await tab(p, 'chat'); await sleep(500);
  await say(p, 'Hola'); await waitAnswer(p, 1); await sleep(500); await shot(p, 'BR-es-plus-respuesta');
  check('en el plan Plus la respuesta tampoco muestra niveles ni avisos de "no estaba disponible"', !(await p.$('.m-ai .tier-line')) && !/no estaba disponible|Respondió/.test(await text(p, '.m-ai')), await text(p, '.m-ai'));
  await p.close();
}
const bad = checks.filter((x) => !x.ok);
console.log(`\nRESULTADO (marca FinAgent AI): ${checks.length - bad.length}/${checks.length} verificaciones OK`);
console.log('ERRORES DE PÁGINA:', JSON.stringify(log.errors, null, 1));
await browser.close(); server.close();
process.exit(bad.length || log.errors.length ? 1 : 0);
