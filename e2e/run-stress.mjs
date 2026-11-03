// Termómetro de tensión y "Mi plan" en un navegador real.   cd e2e && node run-stress.mjs ../dist ../e2e-shots
import { browser, check, checks, log, newPage, shot, server, sleep, tab } from './run.mjs';

const text = (p, sel) => p.$eval(sel, (e) => e.innerText).catch(() => '');
const SEED = { 'finagent.watchlist.v1': JSON.stringify(['AAPL']) };
async function openFirstIndex(p) {
  await tab(p, 'market'); await sleep(800);
  await p.evaluate(() => document.querySelector('.idx').click());
  await p.waitForSelector('.asset-ov canvas', { timeout: 10000 }); await sleep(1500);
}

let p = await newPage({ extra: SEED });
await sleep(2500); await openFirstIndex(p);
await p.waitForSelector('#a-stress-level', { timeout: 12000 }).catch(() => {});
const card = await text(p, '#a-stress');
await shot(p, 'TS1-termometro');
check('aparece el termómetro de tensión con su nivel (baja, media o alta)', /term[óo]metro de tensi[óo]n/i.test(card) && /Tensión (baja|media|alta)/.test(card), card.slice(0, 120));
check('muestra las 4 condiciones y el medidor de 3 tramos', (await p.$$('.stress-cond li')).length === 4 && (await p.$$('.stress-meter i')).length === 3);
check('el medidor llena tantos tramos como el nivel (baja 1, media 2, alta 3)', await p.evaluate(() => { const lv = document.querySelector('#a-stress-level').dataset.level, on = document.querySelectorAll('.stress-meter i.on').length; return on === { baja: 1, media: 2, alta: 3 }[lv]; }));
check('muestra qué pasó después en la semana siguiente: caída y suba de 5 % con su valor habitual', /Caída de 5 % o más/.test(card) && /Suba de 5 % o más/.test(card) && /Habitual/.test(card) && (card.match(/\d+,\d %/g) ?? []).length >= 4, (card.match(/\d+,\d %/g) ?? []).join(' '));
check('dice de dónde salen los números (casos, activos, años) y qué es "habitual"', /días en este nivel/.test(card) && /\d{4}–2026/.test(card) && /Habitual = frecuencia/.test(card));
check('advierte que no predice dirección ni momento y que no es señal de compra ni de venta', /No predice la dirección ni el momento/.test(card) && /no es una señal de compra ni de venta/.test(card));
check('no usa lenguaje de recomendación, garantía ni de "seguro"', !/\b(compr(á|a|ar|e)|vend(é|e|er))\b|recomend|garantiz|sin riesgo|asegur/i.test(card.replace(/no es una señal de compra ni de venta/, '').replace(/No significa que el activo esté a salvo/, '')), card.match(/\b(compr(á|a|ar|e)|vend(é|e|er))\b|recomend|garantiz/i)?.[0]);
check('el termómetro no usa verde ni rojo (no dice si algo es bueno o malo): solo el acento de la marca', await p.evaluate(() => { const bad = (c) => { const m = /rgb\((\d+), (\d+), (\d+)/.exec(c); if (!m) return false; const [r, g, b] = m.slice(1).map(Number); return (g > r + 30 && g > b + 30) || (r > g + 60 && r > b + 60 && g < 120); }; return ![...document.querySelectorAll('#a-stress *')].some((e) => { const cs = getComputedStyle(e); return bad(cs.color) || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && bad(cs.backgroundColor)); }); }));
check('sin desborde horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

// ---- movimiento esperado de la semana
const mv = await text(p, '#a-stress');
check('aparece el bloque "Movimiento esperado de la semana" con un rango de 5 ruedas (de un % negativo a uno positivo)', /movimiento esperado de la semana/i.test(mv) && /^[−-]\d+,\d % a \+\d+,\d %$/.test(await text(p, '#a-move-range')), await text(p, '#a-move-range'));
check('el rango dice qué significa: alrededor de 9 de cada 10 semanas, y cuántas veces lo habitual es hoy', /alrededor de 9 de cada 10 semanas/.test(mv) && /^Hoy: \d+,\d veces lo habitual de este activo/.test(await text(p, '#a-move-ratio')), await text(p, '#a-move-ratio'));
check('aclara que no es un tope ni una predicción de dirección, y de dónde sale (activos del mismo tipo, backtest propio, supervivencia)', /no es un tope ni una predicción de dirección/.test(mv) && /activos del mismo tipo/.test(mv) && /backtest propio/.test(mv) && /hoy existen/.test(mv));
check('el rango es coherente: el límite inferior es negativo, el superior positivo y la caída extrema no supera -60 %', await p.evaluate(() => { const m = /([−-]\d+[.,]\d) % a \+?(\d+[.,]\d) %/.exec(document.querySelector('#a-move-range').innerText); if (!m) return false; const lo = parseFloat(m[1].replace('−', '-').replace(',', '.')), hi = parseFloat(m[2].replace(',', '.')); return lo < 0 && hi > 0 && lo > -60 && hi < 200; }));
await shot(p, 'TS1b-movimiento');

// ---- Mi plan
check('sin plan, ofrece escribirlo y aclara que queda solo en el teléfono', /Escribir mi plan para días de tensión/.test(card) && /se guarda solo en este teléfono/.test(card));
await p.evaluate(() => document.querySelector('#a-plan-edit').click()); await p.waitForSelector('#plan-text', { timeout: 4000 }); await sleep(500);
await shot(p, 'TS2-plan');
check('se abre la hoja "Mi plan" con aclaración de que la app no dice qué hacer, y sin texto de ejemplo que parezca un consejo', /FinAgent no te dice qué hacer/.test(await text(p, '.plan-sheet')) && (await p.$eval('#plan-text', (e) => e.value)) === '' && /Escribí qué vas a hacer \(o no hacer\)/.test(await p.$eval('#plan-text', (e) => e.placeholder)));
const PLAN = 'Si hay tensión alta: no vender el mismo día y revisar mi tesis.';
await p.type('#plan-text', PLAN); await sleep(150);
check('cuenta los caracteres mientras escribe', /\d+ \/ 600/.test(await text(p, '#plan-count')));
const before = log.requests.length;
await p.evaluate(() => document.querySelector('#plan-save').click()); await sleep(900);
check('al guardar, la tarjeta muestra el plan escrito por la persona', (await text(p, '#a-stress')).includes(PLAN) && /Mi plan|Tu plan, escrito por vos/.test(await text(p, '#a-stress')));
check('el plan queda en este teléfono: no sale ningún pedido de red que lo contenga', !log.requests.slice(before).some((r) => r.includes(encodeURIComponent('tesis')) || r.includes('tesis')) && (await p.evaluate(() => localStorage.getItem('finagent.plan.v1'))) === PLAN);
await p.close();

p = await newPage({ extra: SEED });                                      // reabrir la app: el plan persiste
await sleep(2500); await openFirstIndex(p); await p.waitForSelector('#a-stress-level', { timeout: 12000 }).catch(() => {});
check('al volver a abrir la app, el plan sigue ahí', (await text(p, '#a-stress')).includes(PLAN));
await p.evaluate(() => document.querySelector('#a-plan-edit').click()); await p.waitForSelector('#plan-del', { timeout: 4000 }); await sleep(400);
check('al editar aparece el plan guardado y se puede borrar', (await p.$eval('#plan-text', (e) => e.value)) === PLAN);
await p.evaluate(() => document.querySelector('#plan-del').click()); await sleep(900);
check('al borrar, se quita de la tarjeta y del teléfono', !(await text(p, '#a-stress')).includes(PLAN) && (await p.evaluate(() => localStorage.getItem('finagent.plan.v1'))) === null);

// ---- divisas: sin respaldo, no se muestra nada
await p.evaluate(() => document.querySelector('.asset-ov .ov-bar button, #a-back')?.click()); await sleep(700);
await tab(p, 'market'); await sleep(500);
await p.evaluate(() => document.querySelector('#m-seg-world [data-g="fx"]')?.click()); await sleep(1800);
await p.evaluate(() => document.querySelector('#m-world .idx')?.click()); await p.waitForSelector('.asset-ov canvas', { timeout: 10000 }); await sleep(2200);
check('en una divisa el termómetro no aparece (el backtest no la cubre)', (await text(p, '#a-stress')).trim() === '', JSON.stringify((await text(p, '#a-stress')).slice(0, 60)));
await p.close();

// ---- inglés
p = await newPage({ extra: SEED, lang: 'en' });
await sleep(2500); await openFirstIndex(p); await p.waitForSelector('#a-stress-level', { timeout: 12000 }).catch(() => {});
const en = await text(p, '#a-stress');
await shot(p, 'TS3-ingles');
check('en inglés el movimiento esperado también se traduce (rango con "to" y cuántas veces lo habitual)', /expected move this week/i.test(en) && /^[−-]\d+\.\d % to \+\d+\.\d %$/.test(await text(p, '#a-move-range')) && /^Today: \d+\.\d times this asset's usual level/.test(await text(p, '#a-move-ratio')) && /does not predict direction|not a cap/.test(en), await text(p, '#a-move-range'));
check('en inglés se traduce completo: título, nivel, condiciones, historial y advertencias', /tension gauge/i.test(en) && /(Low|Medium|High) tension/.test(en) && /What applies today/i.test(en) && /Drop of 5 % or more/.test(en) && /does not predict the direction/.test(en) && /not a buy or sell signal/.test(en), en.slice(0, 100));
check('en inglés no queda ningún texto en español en la tarjeta', !/[¿¡ñ]|\b(Tensión|Caída|Suba|Habitual|ruedas|semana|rango|habitual)\b/.test(en), en.match(/[¿¡ñ]|\b(Tensión|Caída|Suba|Habitual|ruedas|semana|rango|habitual)\b/)?.[0]);
await p.close();

const bad = checks.filter((c) => !c.ok);
console.log(`\nRESULTADO (termómetro): ${checks.length - bad.length}/${checks.length} verificaciones OK`);
console.log('ERRORES DE PÁGINA:', JSON.stringify(log.errors, null, 1));
await browser.close(); server.close();
process.exit(bad.length || log.errors.length ? 1 : 0);
