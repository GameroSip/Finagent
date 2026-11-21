// Pantallas de las notificaciones: el panel de Ajustes, la hoja para crear alertas de un activo y la oferta (una sola vez) de avisar
// cuando termina un análisis. La lógica está en notifications.ts y alerts.ts.
import { addRule, ALERT_CFG, loadRules, newRule, removeRule, rulesFor, validateRule, type AlertRule, type Quote, type RuleKind } from '../alerts';
import { getLang, t } from '../i18n';
import { ensurePermission, getPrefs, permissionState, pushAvailable, setPrefs, setSoftAsk, testNotification, yahooQuotes, type NotifyPrefs } from '../notifications';
import { fmtMoney, fmtNum } from '../notifyTexts';
import { $, esc, h, toast } from '../ui/dom';
import { icon } from '../ui/icons';
import { openSheet } from '../ui/sheet';

export const NOTIFY_UI_TEXTS = [
  'Notificaciones', 'Estado del análisis', 'Te avisa cuando una respuesta está lista si saliste de la app',
  'Termómetro de tensión', 'Cuando cambia el nivel de tensión del S&P 500', 'Alertas de tus activos', 'Las alertas de precio que creaste',
  'Dólar y resumen diario', 'Movimientos fuertes del dólar y un resumen por día', 'Horas de silencio', 'No te avisamos en ese horario (salvo el análisis que pediste)',
  'Desde', 'Hasta', 'Probar notificación', 'Tus alertas de precio', 'No creaste alertas todavía. Abrí un activo y tocá la campana.',
  'Las notificaciones están bloqueadas para FinAgent. Activalas en los ajustes del teléfono: Aplicaciones → FinAgent → Notificaciones.',
  'Las notificaciones funcionan en la app instalada en el teléfono.', 'Te mandamos una notificación de prueba', 'No tengo permiso para mostrar notificaciones',
  'Alerta para {name}', 'Precio actual: {p}', 'Sin precio ahora', 'Supera', 'Baja de', 'Se mueve', 'Precio', 'Variación del día (%)',
  'Crear alerta', 'Cancelar', 'Alerta creada', 'Alerta creada. Activá las notificaciones para recibirla.', 'Llegaste al máximo de {n} alertas',
  'Alerta eliminada', 'Supera {v}', 'Baja de {v}', 'Se mueve ±{v} % en el día',
  'FinAgent revisa tus alertas cuando la app está abierta o al volver a ella. Los precios pueden tener demora.',
  '¿Te avisamos cuando esté lista?', 'Si salís de la app mientras FinAgent analiza, te mandamos un aviso cuando la respuesta esté verificada. Lo podés cambiar en Ajustes.',
  'Ahora no', 'Activar avisos', 'Eliminar alerta', 'Próximamente', 'Ver y borrar las alertas que creaste',
];

const parseNum = (s: string): number => { const v = s.trim().replace(/\s/g, ''); return Number(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v); };
export function ruleLabel(r: AlertRule): string {
  const lang = getLang();
  return r.kind === 'move' ? t('Se mueve ±{v} % en el día', { v: fmtNum(lang, r.value, r.value % 1 ? 1 : 0) }) : t(r.kind === 'above' ? 'Supera {v}' : 'Baja de {v}', { v: fmtMoney(lang, r.value, r.currency) });
}
const hourOpts = (sel: number) => Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${String(i).padStart(2, '0')}:00</option>`).join('');

// ---------------------------------------------------------------- Ajustes
export function notifySettingsHtml(): string {
  const p = getPrefs(), n = loadRules().length, push = pushAvailable();
  const row = (k: keyof NotifyPrefs, ic: Parameters<typeof icon>[0], main: string, sub: string, disabled = false) =>
    `<label class="set-row"><span class="set-ic">${icon(ic, 18)}</span><div style="flex:1;text-align:left"><div class="set-main">${esc(t(main))}${disabled ? ` <span class="chip-soon">${esc(t('Próximamente'))}</span>` : ''}</div><div class="set-sub">${esc(t(sub))}</div></div><input type="checkbox" class="tgl" data-np="${k}" ${p[k] && !disabled ? 'checked' : ''} ${disabled ? 'disabled' : ''}></label>`;
  return `<div class="set-group" id="s-notify"><div class="set-title">${esc(t('Notificaciones'))}</div><div class="card set-card">
      <div class="set-note" id="s-n-note" hidden></div>
      ${row('ai', 'sparkles', 'Estado del análisis', 'Te avisa cuando una respuesta está lista si saliste de la app')}
      ${row('radar', 'gauge', 'Termómetro de tensión', 'Cuando cambia el nivel de tensión del S&P 500')}
      ${row('assets', 'bellRing', 'Alertas de tus activos', 'Las alertas de precio que creaste')}
      ${row('digests', 'dollar', 'Dólar y resumen diario', 'Movimientos fuertes del dólar y un resumen por día', !push)}
      <label class="set-row"><span class="set-ic">${icon('moonStar', 18)}</span><div style="flex:1;text-align:left"><div class="set-main">${esc(t('Horas de silencio'))}</div><div class="set-sub">${esc(t('No te avisamos en ese horario (salvo el análisis que pediste)'))}</div></div><input type="checkbox" class="tgl" id="s-n-quiet" ${p.quiet.on ? 'checked' : ''}></label>
      <div class="set-row nq-hours" id="s-n-hours" ${p.quiet.on ? '' : 'hidden'}><span class="set-ic"></span><label class="nq-sel">${esc(t('Desde'))} <select id="s-n-from" class="set-input">${hourOpts(p.quiet.start)}</select></label><label class="nq-sel">${esc(t('Hasta'))} <select id="s-n-to" class="set-input">${hourOpts(p.quiet.end)}</select></label></div>
      <button class="set-row" id="s-n-rules"><span class="set-ic">${icon('bell', 18)}</span><div style="flex:1;text-align:left"><div class="set-main">${esc(t('Tus alertas de precio'))}</div><div class="set-sub">${esc(t('Ver y borrar las alertas que creaste'))}</div></div><span class="val">${n}</span></button>
      <button class="btn btn-ghost btn-block" id="s-n-test" style="margin:6px 0 4px">${icon('bell', 16)} ${esc(t('Probar notificación'))}</button>
    </div></div>`;
}

export function bindNotifySettings(el: HTMLElement, rerender: () => void): void {
  const note = el.querySelector<HTMLElement>('#s-n-note');
  const say = (msg: string | null) => { if (!note) return; note.hidden = !msg; note.textContent = msg ?? ''; };
  void permissionState().then((s) => say(s === 'denied' ? t('Las notificaciones están bloqueadas para FinAgent. Activalas en los ajustes del teléfono: Aplicaciones → FinAgent → Notificaciones.') : s === 'unsupported' ? t('Las notificaciones funcionan en la app instalada en el teléfono.') : null));
  el.querySelectorAll<HTMLInputElement>('input[data-np]').forEach((inp) => {
    inp.onchange = async () => {
      const k = inp.dataset.np as 'ai' | 'radar' | 'assets' | 'digests';
      if (inp.checked && !(await ensurePermission()) && (await permissionState()) !== 'unsupported') { inp.checked = false; say(t('Las notificaciones están bloqueadas para FinAgent. Activalas en los ajustes del teléfono: Aplicaciones → FinAgent → Notificaciones.')); return; }
      setPrefs({ [k]: inp.checked, ...(k === 'ai' ? { askedAi: true } : {}) });
    };
  });
  const quiet = el.querySelector<HTMLInputElement>('#s-n-quiet'), hours = el.querySelector<HTMLElement>('#s-n-hours');
  const saveQuiet = () => setPrefs({ quiet: { on: !!quiet?.checked, start: Number($<HTMLSelectElement>('#s-n-from', el).value), end: Number($<HTMLSelectElement>('#s-n-to', el).value) } });
  if (quiet) quiet.onchange = () => { if (hours) hours.hidden = !quiet.checked; saveQuiet(); };
  el.querySelectorAll<HTMLSelectElement>('#s-n-from, #s-n-to').forEach((s) => { s.onchange = saveQuiet; });
  const rules = el.querySelector<HTMLElement>('#s-n-rules');
  if (rules) rules.onclick = () => openRulesSheet(rerender);
  const test = el.querySelector<HTMLButtonElement>('#s-n-test');
  if (test) test.onclick = async () => {
    test.disabled = true;
    const r = await testNotification();
    test.disabled = false;
    if (r === 'ok') toast(t('Te mandamos una notificación de prueba'));
    else if (r === 'denied') { toast(t('No tengo permiso para mostrar notificaciones')); say(t('Las notificaciones están bloqueadas para FinAgent. Activalas en los ajustes del teléfono: Aplicaciones → FinAgent → Notificaciones.')); }
    else toast(t('Las notificaciones funcionan en la app instalada en el teléfono.'));
  };
}

function rulesListHtml(rules: AlertRule[], showName: boolean): string {
  if (!rules.length) return `<p class="muted sheet-text">${esc(t('No creaste alertas todavía. Abrí un activo y tocá la campana.'))}</p>`;
  return `<div class="na-list">${rules.map((r) => `<div class="na-rule"><div style="flex:1;min-width:0">${showName ? `<div class="na-sym">${esc(r.symbol)}</div>` : ''}<div class="na-txt">${esc(ruleLabel(r))}</div></div><button class="icon-btn" data-del="${esc(r.id)}" aria-label="${esc(t('Eliminar alerta'))}">${icon('trash', 17)}</button></div>`).join('')}</div>`;
}
function openRulesSheet(onChange: () => void): void {
  const c = h('div');
  const draw = () => { c.innerHTML = `<h3 class="sheet-title">${esc(t('Tus alertas de precio'))}</h3>${rulesListHtml(loadRules(), true)}<p class="muted na-foot">${esc(t('FinAgent revisa tus alertas cuando la app está abierta o al volver a ella. Los precios pueden tener demora.'))}</p>`; };
  draw();
  openSheet(c, onChange);
  c.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-del]'); if (b) { removeRule(b.dataset.del!); toast(t('Alerta eliminada')); draw(); } });
}

// ---------------------------------------------------------------- crear una alerta desde un activo
export function openAlertSheet(symbol: string, name: string): void {
  const c = h('div');
  let kind: RuleKind = 'above', quote: Quote | null = null;
  c.innerHTML = `<h3 class="sheet-title">${esc(t('Alerta para {name}', { name: name || symbol }))}</h3>
    <p class="muted sheet-text" id="na-price">…</p>
    <div class="seg na-kinds" id="na-kind"><button data-k="above" class="on">${esc(t('Supera'))}</button><button data-k="below">${esc(t('Baja de'))}</button><button data-k="move">${esc(t('Se mueve'))}</button></div>
    <div class="onb-field" style="margin-top:12px"><input id="na-val" type="text" inputmode="decimal" autocomplete="off" placeholder="${esc(t('Precio'))}" /></div>
    <div id="na-err" class="error-box hide" style="margin-top:10px"></div>
    <div class="sheet-actions"><button class="btn btn-ghost" id="na-cancel">${esc(t('Cancelar'))}</button><button class="btn btn-primary" id="na-ok">${esc(t('Crear alerta'))}</button></div>
    <div id="na-existing"></div>
    <p class="muted na-foot">${esc(t('FinAgent revisa tus alertas cuando la app está abierta o al volver a ella. Los precios pueden tener demora.'))}</p>`;
  const close = openSheet(c);
  const input = $<HTMLInputElement>('#na-val', c), err = $('#na-err', c);
  const drawExisting = () => { const r = rulesFor(symbol); $('#na-existing', c).innerHTML = r.length ? rulesListHtml(r, false) : ''; };
  drawExisting();
  input.addEventListener('input', () => err.classList.add('hide'));
  void yahooQuotes.quotes([symbol.toUpperCase()]).then((q) => {
    quote = q[symbol.toUpperCase()] ?? null;
    $('#na-price', c).textContent = quote ? t('Precio actual: {p}', { p: fmtMoney(getLang(), quote.price, quote.currency) }) : t('Sin precio ahora');
  });
  $('#na-kind', c).addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-k]'); if (!b) return;
    kind = b.dataset.k as RuleKind; err.classList.add('hide');
    $('#na-kind', c).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    input.placeholder = t(kind === 'move' ? 'Variación del día (%)' : 'Precio');
  });
  $('#na-existing', c).addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-del]'); if (b) { removeRule(b.dataset.del!); toast(t('Alerta eliminada')); drawExisting(); } });
  $('#na-cancel', c).onclick = close;
  $('#na-ok', c).onclick = async () => {
    const value = parseNum(input.value), problem = validateRule(kind, value, quote?.price ?? null);
    if (problem) { err.textContent = t(problem); err.classList.remove('hide'); return; }
    if (!addRule(newRule({ symbol, name: name || symbol, kind, value, currency: quote?.currency }, quote))) { err.textContent = t('Llegaste al máximo de {n} alertas', { n: ALERT_CFG.maxRules }); err.classList.remove('hide'); return; }
    const ok = await ensurePermission();   // el permiso se pide acá: la persona acaba de pedir que le avisemos
    if (ok && !getPrefs().assets) setPrefs({ assets: true });
    close();
    toast(ok ? t('Alerta creada') : t('Alerta creada. Activá las notificaciones para recibirla.'));
  };
  setTimeout(() => input.focus(), 280);
}

// ---------------------------------------------------------------- oferta contextual (primera consulta larga)
export function installNotifySoftAsk(): void {
  setSoftAsk(() => {
    setPrefs({ askedAi: true });
    const c = h('div');
    c.innerHTML = `<h3 class="sheet-title">${esc(t('¿Te avisamos cuando esté lista?'))}</h3><p class="muted sheet-text">${esc(t('Si salís de la app mientras FinAgent analiza, te mandamos un aviso cuando la respuesta esté verificada. Lo podés cambiar en Ajustes.'))}</p>
      <div class="sheet-actions"><button class="btn btn-ghost" data-r="0">${esc(t('Ahora no'))}</button><button class="btn btn-primary" data-r="1">${esc(t('Activar avisos'))}</button></div>`;
    const close = openSheet(c);
    c.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-r]'); if (!b) return;
      close();
      if (b.dataset.r === '1') { if (!(await ensurePermission())) setPrefs({ ai: false }); }
      else setPrefs({ ai: false });
    });
  });
}
