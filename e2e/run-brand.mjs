// La marca "FinAgent AI" de punta a punta (app con servidor): niveles de IA con nombre de FinAgent en lugar del nombre del modelo de Google,
// y siempre a la vista que corre sobre Gemini. Verifica español e inglés.
//   VITE_API_BASE=https://api.finagent.test npx vite build --outDir dist-server --emptyOutDir
//   cd e2e && node run-brand.mjs ../dist-server ../e2e-shots
import * as M from './mocks.mjs';
import { browser, check, checks, log, newPage, say, server, shot, sleep, tab, waitAnswer } from './run.mjs';

const text = (p, sel) => p.$eval(sel, (e) => e.innerText).catch(() => '');
const click = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);

for (const [lang, L] of [['es', { tier: 'Respondió FinAgent AI Rápido', vs: /IA sin herramientas/, vsNote: /Algunas IA también usan búsqueda o herramientas/, lvl: /Nivel de IA/, fast: 'FinAgent AI Rápido', adv: 'FinAgent AI Avanzado', pow: /Impulsado por Gemini de Google/, what: /Qué es FinAgent AI/i, ph: 'Preguntale algo a FinAgent AI…', eng: /Motor FinAgent v1\.0/ }], ['en', { tier: 'Answered by FinAgent AI Fast', vs: /AI without tools/, vsNote: /Some AIs also use search or tools/, lvl: /AI level/, fast: 'FinAgent AI Fast', adv: 'FinAgent AI Advanced', pow: /Powered by Google Gemini/, what: /What FinAgent AI is/i, ph: 'Ask FinAgent AI something…', eng: /Engine FinAgent v1\.0/ }]]) {
  M.resetApi();
  const p = await newPage({ key: '', intro: false, analytics: '0', lang, clean: true });
  await p.waitForSelector('.tabbar', { timeout: 20000 }); await sleep(800);
  await tab(p, 'chat'); await sleep(500);
  check(`[${lang}] el cuadro de texto del chat dice "${L.ph}"`, (await p.$eval('#c-in', (e) => e.placeholder)) === L.ph, await p.$eval('#c-in', (e) => e.placeholder));
  await say(p, 'Hola'); await waitAnswer(p, 1); await sleep(500); await shot(p, `BR-${lang}-pie-respuesta`);
  const tl = await text(p, '.m-ai .tier-line');
  check(`[${lang}] cada respuesta dice qué nivel respondió ("${L.tier}"), sin avisar de respaldo en el plan gratuito`, tl.trim() === L.tier && !(await p.$('.m-ai .tier-line.fb')), tl);
  check(`[${lang}] el pie nunca muestra el nombre del modelo de Google`, !/Gemini 3|Flash/.test(await text(p, '.m-ai')));
  await tab(p, 'settings'); await sleep(700);
  const row = await text(p, '#s-model') , setTxt = await text(p, '.view.active, body');
  check(`[${lang}] Ajustes muestra el nivel del plan con nombre de FinAgent ("${L.fast}"), no el nombre del modelo de Google`, row === L.fast && L.lvl.test(setTxt) && !/Gemini 3\.5/.test(await p.$eval('#s-model', (e) => e.closest('.set-row').innerText)), row);
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
  check(`[${lang}] la pantalla de planes muestra los niveles (${L.fast}, ${L.adv}) y NO los nombres de modelo de Google`, plans.includes(L.fast) && plans.includes(L.adv) && !/Gemini 3\.\d|Flash-Lite/.test(plans), plans.slice(0, 120));
  check(`[${lang}] la tabla comparativa tiene la fila "${L.lvl.source.replace(/\\/g, '')}" y el beneficio dice que el nivel es más potente`, L.lvl.test(await text(p, '.plans-cmp')) && /más potente|more powerful/.test(plans));
  await p.keyboard.press('Escape'); await p.evaluate(() => { const b = document.querySelector('.sheet-back'); if (b) b.click(); }); await sleep(500);
  await p.evaluate(() => document.querySelector('#s-about')?.scrollIntoView({ block: 'center' })); await sleep(300);
  await click(p, '#s-about'); await p.waitForSelector('.about-sheet', { timeout: 6000 }); await sleep(700); await shot(p, `BR-${lang}-acerca`);
  const about = await text(p, '.about-sheet');
  check(`[${lang}] "Acerca de" explica qué es FinAgent AI y dice, a la vista, que corre sobre Gemini de Google`, L.what.test(about) && L.pow.test(about) && /FinAgent AI/.test(about) && /Gemini/.test(about));
  check(`[${lang}] la comparación es con una "${L.vs.source}", reconoce que otras IA también usan herramientas y no dice "mejor que"`, L.vs.test(about) && L.vsNote.test(about) && !/mejor que|better than|melhor que/i.test(about));
  check(`[${lang}] muestra la versión del motor junto a la versión de la app`, L.eng.test(about), about.match(/Motor[^\n]*|Engine[^\n]*/)?.[0]);
  check(`[${lang}] aclara que los niveles son nombres de FinAgent para modelos Gemini de distinto tamaño, y que no se modifica el modelo de lenguaje`, /(Gemini)[^]{0,80}(tamaño|sizes)/.test(about) && /(no entrena ni ajusta el modelo|does not modify the language model)/.test(about));
  if (lang === 'en') check('[en] no quedan textos en español en lo nuevo', !/[¿¡ñ]|\b(Impulsado|Qué es|Nivel de|Rápido|Avanzado|Profundo|Motor)\b/.test(about + plans + setTxt), (about + plans).match(/[¿¡ñ]|\b(Impulsado|Qué es|Nivel de|Rápido|Avanzado|Profundo|Motor)\b/)?.[0]);
  await p.close();
}
// plan Plus: el modelo del plan es el Avanzado, pero (como pasa con la cuota gratuita de Google) contesta el Rápido: tiene que decirlo
M.resetApi(); M.apiState.plan = 'plus';
{
  const p = await newPage({ key: '', intro: false, analytics: '0', lang: 'es', clean: true });
  await p.waitForSelector('.tabbar', { timeout: 20000 }); await sleep(800); await tab(p, 'chat'); await sleep(500);
  await say(p, 'Hola'); await waitAnswer(p, 1); await sleep(500); await shot(p, 'BR-es-respaldo');
  const fb = await text(p, '.m-ai .tier-line.fb');
  check('en un plan de pago, si respondió un nivel menor, el pie lo dice: qué nivel respondió y cuál era el del plan', /Respondió FinAgent AI Rápido porque FinAgent AI Avanzado no estaba disponible en ese momento\./.test(fb), fb);
  await p.close();
}
const bad = checks.filter((x) => !x.ok);
console.log(`\nRESULTADO (marca FinAgent AI): ${checks.length - bad.length}/${checks.length} verificaciones OK`);
console.log('ERRORES DE PÁGINA:', JSON.stringify(log.errors, null, 1));
await browser.close(); server.close();
process.exit(bad.length || log.errors.length ? 1 : 0);
