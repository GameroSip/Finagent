// Notificaciones: panel de Ajustes (interruptores, horario de silencio, probar), alertas de precio desde un activo (crear, validar,
// listar, borrar) y que nada se salga de la pantalla en un teléfono chico.   cd e2e && node run-notify.mjs ../dist ../e2e-shots
import { browser, check, checks, log, newPage, shot, server, sleep, tab } from './run.mjs';

for (const [w, hh, theme] of [[412, 915, 'dark'], [320, 568, 'light']]) {
  const tag = `${w}x${hh}-${theme}`;
  const p = await newPage({ theme, height: hh, clean: true });
  await p.setViewport({ width: w, height: hh, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(2400);
  await tab(p, 'settings'); await sleep(600);
  const s = await p.evaluate(() => {
    const g = document.querySelector('#s-notify');
    g?.scrollIntoView();
    return { has: !!g, toggles: [...document.querySelectorAll('#s-notify input[data-np]')].map((i) => `${i.dataset.np}:${i.checked ? 1 : 0}${i.disabled ? 'd' : ''}`).join(','),
      quiet: document.querySelector('#s-n-quiet')?.checked, from: document.querySelector('#s-n-from')?.value, to: document.querySelector('#s-n-to')?.value,
      over: [...document.querySelectorAll('#s-notify *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 0.5 || r.left < -0.5); }).length,
      note: document.querySelector('#s-n-note')?.textContent ?? '' };
  });
  check(`${tag}: Ajustes tiene la sección de notificaciones`, s.has);
  check(`${tag}: interruptores por categoría (análisis y alertas prendidos; termómetro apagado; dólar "próximamente" sin Firebase)`, s.toggles === 'ai:1,radar:0,assets:1,digests:0d', s.toggles);
  check(`${tag}: horario de silencio por defecto 23 a 8`, s.quiet === true && s.from === '23' && s.to === '8', JSON.stringify(s));
  check(`${tag}: nada de la sección se sale de la pantalla`, s.over === 0, `${s.over} elementos`);
  check(`${tag}: en el navegador avisa que funciona en la app instalada`, /instalada/.test(s.note), s.note);
  await sleep(300); await shot(p, `N1-ajustes-${tag}`);

  // horario de silencio: se guarda
  await p.select('#s-n-from', '22'); await sleep(150);
  check(`${tag}: el horario de silencio se guarda`, await p.evaluate(() => JSON.parse(localStorage.getItem('finagent.notify.v1')).quiet.start === 22));
  await p.evaluate(() => document.querySelector('#s-n-quiet').click()); await sleep(150);
  check(`${tag}: apagar el silencio oculta las horas`, await p.evaluate(() => document.querySelector('#s-n-hours').hidden && JSON.parse(localStorage.getItem('finagent.notify.v1')).quiet.on === false));
  await p.evaluate(() => document.querySelector('#s-n-test').click()); await sleep(500);
  check(`${tag}: "Probar notificación" responde`, await p.evaluate(() => /instalada/.test(document.body.innerText)));

  // alerta desde un activo
  await tab(p, 'market'); await sleep(700);
  await p.evaluate(() => document.querySelector('.idx').click());
  await p.waitForSelector('.asset-ov #a-bell', { timeout: 10000 }); await sleep(900);
  await p.evaluate(() => document.querySelector('#a-bell').click());
  await p.waitForSelector('#na-val', { timeout: 4000 }); await sleep(1500);
  const price = await p.$eval('#na-price', (e) => e.textContent);
  check(`${tag}: la hoja de alerta muestra el precio actual`, /\d/.test(price), price);
  await p.type('#na-val', '1'); await p.evaluate(() => document.querySelector('#na-ok').click()); await sleep(300);
  const err = await p.$eval('#na-err', (e) => (e.classList.contains('hide') ? '' : e.textContent));
  check(`${tag}: "supera" con un precio menor al actual se rechaza con un motivo`, /más alto/.test(err), err);
  await p.evaluate(() => document.querySelector('#na-kind [data-k="move"]').click());
  await p.evaluate(() => { document.querySelector('#na-val').value = ''; }); await p.type('#na-val', '3,5');
  await shot(p, `N2-alerta-${tag}`);
  await p.evaluate(() => document.querySelector('#na-ok').click()); await sleep(500);
  const rules = await p.evaluate(() => JSON.parse(localStorage.getItem('finagent.alerts.v1') ?? '[]'));
  check(`${tag}: se crea la alerta "se mueve 3,5 %" (en el teléfono)`, rules.length === 1 && rules[0].kind === 'move' && rules[0].value === 3.5, JSON.stringify(rules));
  await p.evaluate(() => document.querySelector('#a-back').click()); await sleep(600);
  await tab(p, 'settings'); await sleep(500);
  check(`${tag}: Ajustes cuenta 1 alerta`, (await p.$eval('#s-n-rules .val', (e) => e.textContent)) === '1');
  await p.evaluate(() => document.querySelector('#s-n-rules').click()); await p.waitForSelector('.na-rule', { timeout: 3000 }).catch(() => {});
  await shot(p, `N3-lista-${tag}`);
  await p.evaluate(() => document.querySelector('.na-rule [data-del]').click()); await sleep(300);
  check(`${tag}: borrar la alerta`, await p.evaluate(() => JSON.parse(localStorage.getItem('finagent.alerts.v1')).length === 0 && !document.querySelector('.na-rule')));
  await p.close();
}
const bad = checks.filter((c) => !c.ok);
console.log(`\nRESULTADO (notificaciones): ${checks.length - bad.length}/${checks.length} verificaciones OK`);
console.log('ERRORES DE PÁGINA:', log.errors);
await browser.close(); server.close();
process.exit(bad.length ? 1 : 0);
