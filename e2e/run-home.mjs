// Menú de inicio Bento + recorrido interactivo: estructura, tamaños de teléfono, que la tarjeta nunca se salga de la pantalla,
// navegación con botones, teclado y gesto, que se guarde que ya se vio y que se pueda repetir desde Ajustes.
//   node run-home.mjs ../dist ../e2e-shots
import { newPage, shot, tab, sleep, browser, log, server, check, checks } from './run.mjs';

for (const [w, hh, theme, motion] of [[412, 915, 'dark', true], [360, 740, 'light', false], [320, 568, 'dark', false]]) {
  const tag = `${w}x${hh}-${theme}`;
  const p = await newPage({ theme, height: hh, motion });
  await p.setViewport({ width: w, height: hh, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(2600);
  const b = await p.evaluate(() => ({ n: [...document.querySelectorAll('.bento [data-tour]')].map((e) => e.dataset.tour), over: [...document.querySelectorAll('.bento *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 0.5 || r.left < -0.5); }).length,
    q: document.querySelector('#bt-quotes')?.textContent ?? '', lv: document.querySelector('#bt-lv')?.textContent, port: document.querySelector('#bt-port-n')?.textContent }));
  check(`${tag}: el inicio tiene las 5 tarjetas (chat, market, radar, portfolio, calc)`, b.n.join() === 'chat,market,radar,portfolio,calc', b.n.join());
  check(`${tag}: nada del menú se sale de la pantalla`, b.over === 0, `${b.over} elementos`);
  check(`${tag}: el menú muestra cotizaciones ya cargadas`, /\d/.test(b.q), b.q);
  check(`${tag}: el termómetro calcula un nivel o avisa que no hay datos`, !!b.lv && b.lv !== 'Calculando…', b.lv);
  await shot(p, `H1-inicio-${tag}`);
  check(`${tag}: el recorrido NO se lanza solo en pruebas automatizadas`, !(await p.$('.tour')));

  await tab(p, 'settings'); await sleep(500);
  await p.evaluate(() => document.querySelector('#s-tour').click());
  await p.waitForSelector('.tour.tour-in', { timeout: 4000 }).catch(() => {});
  check(`${tag}: "Repetir recorrido" vuelve al inicio y abre el recorrido`, await p.evaluate(() => !!document.querySelector('.tour') && !document.querySelector('#view-market').classList.contains('hide')));
  for (let i = 0; i < 5; i++) {
    await sleep(motion ? 1300 : 700);
    const s = await p.evaluate(() => {
      const card = document.querySelector('.tour-card').getBoundingClientRect(), tgt = document.querySelector('.tour-active-target'), hole = document.querySelector('.tour-hole');
      const r = tgt?.getBoundingClientRect();
      const hx = +hole.getAttribute('x'), hy = +hole.getAttribute('y'), hw = +hole.getAttribute('width'), hh2 = +hole.getAttribute('height');
      return { count: document.querySelector('.tour-count').textContent, target: tgt?.dataset.tour, cardTop: card.top, cardBottom: card.bottom, vh: innerHeight,
        holeOk: !!r && Math.abs(hx - (r.left - 6)) < 2 && Math.abs(hy - (r.top - 6)) < 2 && Math.abs(hw - (r.width + 12)) < 2 && Math.abs(hh2 - (r.height + 12)) < 2,
        chips: document.querySelectorAll('.tour-chips span').length, next: document.querySelector('.tour-next').textContent, prevDis: document.querySelector('.tour-prev').disabled };
    });
    check(`${tag} paso ${i + 1}: contador ${String(i + 1).padStart(2, '0')} / 05 sobre "${s.target}"`, s.count === `${String(i + 1).padStart(2, '0')} / 05` && s.target === ['chat', 'market', 'radar', 'portfolio', 'calc'][i], `${s.count} ${s.target}`);
    check(`${tag} paso ${i + 1}: el recorte coincide con la tarjeta enfocada`, s.holeOk);
    check(`${tag} paso ${i + 1}: la explicación entra entera en la pantalla`, s.cardTop >= 0 && s.cardBottom <= s.vh, `${Math.round(s.cardTop)}..${Math.round(s.cardBottom)} de ${s.vh}`);
    check(`${tag} paso ${i + 1}: 2 o 3 cosas concretas y botones correctos`, s.chips >= 2 && s.chips <= 3 && s.prevDis === (i === 0) && s.next === (i === 4 ? 'Empezar' : 'Siguiente'), JSON.stringify(s));
    await shot(p, `H2-paso${i + 1}-${tag}`);
    if (i === 1) { // teclado: atrás y adelante
      await p.keyboard.press('ArrowLeft'); await sleep(500);
      const c = await p.evaluate(() => document.querySelector('.tour-count').textContent);
      check(`${tag}: la flecha izquierda vuelve al paso anterior`, c.startsWith('01'), c);
      await p.keyboard.press('ArrowRight'); await sleep(500);
    }
    if (i === 2) { // gesto: deslizar a la izquierda avanza
      await p.evaluate(() => { const r = document.querySelector('.tour'); const mk = (type, x) => { const t = new Touch({ identifier: 1, target: r, clientX: x, clientY: 300 }); r.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true })); }; mk('touchstart', 300); mk('touchend', 120); });
      await sleep(motion ? 1300 : 700);
      const c = await p.evaluate(() => document.querySelector('.tour-count').textContent);
      check(`${tag}: deslizar a la izquierda avanza`, c.startsWith('04'), c); i++;
      await shot(p, `H2-paso${i + 1}-${tag}`);
    }
    if (i < 4) await p.evaluate(() => document.querySelector('.tour-next').click());
  }
  await p.evaluate(() => document.querySelector('.tour-next').click()); await sleep(600);
  const end = await p.evaluate(() => ({ gone: !document.querySelector('.tour'), saved: localStorage.getItem('finagent_home_tour_v1'), active: document.querySelectorAll('.tour-active-target').length }));
  check(`${tag}: "Empezar" cierra el recorrido, limpia el resaltado y guarda que ya se vio`, end.gone && !!end.saved && end.active === 0, JSON.stringify(end));
  // Escape también cierra
  await p.evaluate(() => document.querySelector('.tab[data-tab="settings"]').click()); await sleep(300);
  await p.evaluate(() => document.querySelector('#s-tour').click()); await sleep(900);
  await p.keyboard.press('Escape'); await sleep(600);
  check(`${tag}: Escape cierra el recorrido`, !(await p.$('.tour')));
  // tocar la calculadora abre la calculadora; tocar la cartera va a Cartera
  await p.evaluate(() => document.querySelector('.bt-calc').click()); await sleep(700);
  check(`${tag}: la tarjeta Calculadora abre la calculadora`, await p.evaluate(() => !!document.querySelector('.overlay #c-panel')));
  await p.evaluate(() => document.querySelector('#c-back').click()); await sleep(500);
  await p.evaluate(() => document.querySelector('.bt-port').click()); await sleep(500);
  check(`${tag}: la tarjeta Mi cartera va a Cartera`, await p.evaluate(() => !document.querySelector('#view-portfolio')?.classList.contains('hide')));
  await tab(p, 'market'); await sleep(400);
  await p.evaluate(() => document.querySelector('.bt-chat').click()); await sleep(500);
  check(`${tag}: la tarjeta Analista va al chat con el cursor en el campo`, await p.evaluate(() => document.activeElement?.id === 'c-in'));
  await p.close();
}
// Primera vez fuera de pruebas: ?skipTour=1 lo evita; sin la marca de automatización se lanza solo y una sola vez
{
  const p = await newPage({ clean: true });   // otro teléfono: sin la marca de las vueltas anteriores
  await p.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await p.goto('http://localhost:4173/?skipTour=1', { waitUntil: 'load' }); await sleep(3500);
  check('con ?skipTour=1 no se lanza', !(await p.$('.tour')));
  await p.goto('http://localhost:4173/', { waitUntil: 'load' });
  check('sin automatización se lanza solo la primera vez', !!(await p.waitForSelector('.tour', { timeout: 9000 }).catch(() => null)));
  await sleep(800);
  await p.evaluate(() => document.querySelector('.tour-skip').click()); await sleep(500);
  await p.goto('http://localhost:4173/', { waitUntil: 'load' }); await sleep(4000);
  check('"Saltar" lo guarda: al volver a abrir no aparece', !(await p.$('.tour')));
  await p.close();
}
const bad = checks.filter((c) => !c.ok);
console.log(`\nRESULTADO (inicio y recorrido): ${checks.length - bad.length}/${checks.length} verificaciones OK`);
console.log('ERRORES DE PÁGINA:', log.errors);
await browser.close(); server.close();
process.exit(bad.length ? 1 : 0);
