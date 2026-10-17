// Asistente: chat con el agente. Muestra el progreso, tarjetas con gráficos y la verificación de cifras.
import type { Ctx, View } from '../ctx';
import { FinancialAgent, GeminiError, type ToolCallRecord } from '../agent';
import { modelLabel } from '../models';
import { getSettings, subscribe } from '../store';
import { $, esc, h } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';
import { renderMarkdown } from '../markdown';
import { renderRich, type Rich } from './cards';

export interface ChatView extends View { ask(prompt: string, label?: string): void }

const SUGGESTIONS: Array<{ ic: IconName; title: string; sub: string; prompt: string }> = [
  { ic: 'activity', title: 'Resumen del mercado', sub: 'Índices, movimientos y titulares', prompt: 'Hacé un resumen de cómo está el mercado hoy: índices, qué se mueve más, el contexto de Argentina y la narrativa de los medios. Terminá con 3 puntos a vigilar.' },
  { ic: 'landmark', title: 'Dólar y riesgo país', sub: 'Brecha, MEP, CCL e inflación', prompt: '¿Cómo están el dólar, la brecha y el riesgo país hoy? ¿Qué te dice eso del momento de Argentina?' },
  { ic: 'scale', title: 'Merval barato con dividendos', sub: 'Screener con motivos de exclusión', prompt: 'Buscá en los líderes del Merval acciones con P/E menor a 12 y dividend yield mayor a 2%. Mostrame las que pasan y por qué se excluyeron las demás.' },
  { ic: 'layers', title: 'Comparar KO vs PEP', sub: 'Valuación, deuda y rendimiento', prompt: 'Compará KO y PEP: valuación, dividendos, deuda y rendimiento del último año. ¿Cuál tiene mejor perfil y qué riesgos tiene cada una?' },
  { ic: 'lineChart', title: 'Técnico de AAPL', sub: 'RSI, medias y soportes', prompt: '¿Cuál es el estado técnico de AAPL? Mostrame RSI, medias móviles y qué señales hay.' },
];

const who = (bad = false) => `<div class="ai-who"><span class="ai-av ${bad ? 'bad' : ''}">${icon(bad ? 'warn' : 'sparkles', 14)}</span><b>FinAgent</b></div>`;

const LABELS: Record<string, (a: any) => string> = {
  search_ticker: (a) => `Buscando "${a.query ?? ''}"`, get_quote: (a) => `Cotización de ${a.ticker}`, get_fundamentals: (a) => `Fundamentales de ${a.ticker}`,
  get_financials: (a) => `Estados contables de ${a.ticker}`, get_technicals: (a) => `Análisis técnico de ${a.ticker}`, get_news: (a) => `Noticias de ${a.ticker}`,
  compare_assets: (a) => `Comparando ${(a.tickers ?? []).join(', ')}`, screen_assets: () => 'Filtrando activos', calculate: () => 'Calculando',
  get_market_overview: () => 'Panorama de mercado', get_movers: () => 'Rankings del día', get_argentina_macro: () => 'Dólar, brecha y riesgo país',
  get_headlines: (a) => `Titulares de medios${a.topic ? `: ${a.topic}` : ''}`,
};

function traceHtml(calls: ToolCallRecord[]): string {
  const items = calls.map((c) => {
    const meta = (c.result as any)?.meta ?? {};
    const head = c.result?.ok
      ? `<div>Fuente: ${esc(meta.source)}</div><div>Dato al: ${esc(meta.as_of ?? 'n/d')} · consultado: ${esc(meta.fetched_at)}</div>${(meta.notes ?? []).map((n: string) => `<div>ℹ️ ${esc(n)}</div>`).join('')}`
      : `<div class="down">${esc(c.result?.error)}</div>`;
    const args = Object.entries(c.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
    return `<div class="trace-item"><b>${esc(c.name)}</b>(${esc(args)})${head}<details><summary>datos</summary><pre>${esc(JSON.stringify(c.result, null, 2))}</pre></details></div>`;
  });
  return `<details class="trace"><summary>${icon('shield', 14)} Fuentes y cálculos (${calls.length})</summary>${items.join('')}</details>`;
}

export function createChatView(ctx: Ctx): ChatView {
  const el = h('div', { class: 'view chat-view' });
  el.innerHTML = `
    <div class="chat-head">
      <div><h1 class="title-l" style="display:flex;align-items:center;gap:8px">Asistente</h1><div class="model-chip" id="c-model">${icon('sparkles', 12)}<span class="t">Gemini · automático</span></div></div>
      <button class="icon-btn" id="c-new" aria-label="Nueva conversación">${icon('plus', 20)}</button>
    </div>
    <div class="chat-scroll" id="c-scroll"></div>
    <form class="composer" id="c-form" autocomplete="off">
      <textarea id="c-in" rows="1" placeholder="Preguntale algo a tu analista…" enterkeyhint="send"></textarea>
      <button class="send" id="c-send" type="submit" aria-label="Enviar" disabled>${icon('arrowUp', 20)}</button>
    </form>`;
  const scroll = $('#c-scroll', el), input = $<HTMLTextAreaElement>('#c-in', el), send = $<HTMLButtonElement>('#c-send', el), form = $<HTMLFormElement>('#c-form', el);
  let agent: FinancialAgent | null = null;
  let agentKey = '';
  let busy = false;
  let riches: Rich[] = [];

  const toBottom = () => requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; });
  const updateSend = () => { send.disabled = busy || !input.value.trim(); };

  function getAgent(): FinancialAgent {
    const key = getSettings().apiKey;
    if (!agent || agentKey !== key) { agent = new FinancialAgent({ apiKey: key, models: ctx.models }); agentKey = key; }
    return agent;
  }
  const setModelChip = () => {
    const id = ctx.models.active ?? ctx.models.pick();
    $('#c-model .t', el).textContent = id ? `${modelLabel(id)} · automático` : 'Gemini · automático';
  };

  function showEmpty() {
    riches.forEach((r) => r.destroy?.()); riches = [];
    scroll.innerHTML = '';
    const e = h('div', { class: 'chat-empty' });
    e.innerHTML = `<div class="orb"><div class="orb-core">${icon('sparkles', 34)}</div></div>
      <h2 style="font-size:24px;font-weight:760;letter-spacing:-.03em;margin-top:18px">¿Qué querés saber<br>del mercado?</h2>
      <p class="muted" style="margin-top:8px;max-width:290px">Pregunto a los datos reales, verifico cada cifra y te muestro de dónde salió.</p>
      <div class="sugg">${SUGGESTIONS.map((s, i) => `<button class="sug" data-i="${i}"><span class="sug-ic">${icon(s.ic, 18)}</span><span style="flex:1;text-align:left"><b>${esc(s.title)}</b><span class="muted">${esc(s.sub)}</span></span>${icon('arrowUpRight', 15)}</button>`).join('')}</div>`;
    e.addEventListener('click', (ev) => { const b = (ev.target as HTMLElement).closest<HTMLElement>('.sug'); if (b) { const s = SUGGESTIONS[Number(b.dataset.i)]; void ask(s.prompt, true, s.title); } });
    scroll.append(e);
  }

  function addUser(text: string) {
    scroll.querySelector('.chat-empty')?.remove();
    scroll.append(h('div', { class: 'm-user' }, h('div', { class: 'bubble', text })));
    toBottom();
  }

  function addWorking() {
    const w = h('div', { class: 'm-ai working' });
    w.innerHTML = `${who()}<div class="ai-body"><div class="think"><span class="dots"><i></i><i></i><i></i></span><span id="w-title">Analizando…</span></div><div class="steps"></div></div>`;
    scroll.append(w); toBottom();
    const steps = $('.steps', w), title = $('#w-title', w);
    const rows = new Map<string, HTMLElement>();
    return {
      el: w,
      start(name: string, args: any) {
        const label = (LABELS[name] ?? (() => name))(args);
        const row = h('div', { class: 'step', html: `<span class="sp"></span><span>${esc(label)}</span>` });
        rows.set(name + JSON.stringify(args), row); steps.append(row); toBottom();
      },
      done(name: string, args: any, ok: boolean) {
        const row = rows.get(name + JSON.stringify(args));
        if (row) { row.classList.add(ok ? 'ok' : 'bad'); row.querySelector('.sp')!.outerHTML = `<span class="sd">${icon(ok ? 'check' : 'warn', 13)}</span>`; }
      },
      status(msg: string) { title.textContent = msg; },
    };
  }

  function addAnswer(res: Awaited<ReturnType<FinancialAgent['ask']>>) {
    const m = h('div', { class: 'm-ai' });
    m.innerHTML = `${who()}<div class="ai-body"></div>`;
    const body = $('.ai-body', m);
    const seen = new Set<string>();
    const mounts: Rich[] = [];
    for (const c of res.toolCalls) {
      if (!c.ui) continue;
      const key = c.ui.kind + (c.ui.symbol ?? c.ui.title ?? '') + (c.ui.period ?? '');
      if (seen.has(key)) continue;
      seen.add(key);
      const r = renderRich(c.ui, ctx);
      if (r) { body.append(r.el); mounts.push(r); }
    }
    body.append(h('div', { class: 'md', html: renderMarkdown(res.answer) }));
    const v = res.verification;
    let foot = '';
    if (v.checked > 0) foot += v.ok ? `<span class="vpill ok">${icon('shield', 13)} ${v.checked} cifras verificadas con datos</span>`
      : `<span class="vpill warn">${icon('warn', 13)} Sin respaldo en los datos: ${v.unverified.map((u) => `<code>${esc(u.text)}</code>`).join(' ')}</span>`;
    if (res.corrected) foot += `<span class="vpill">${icon('check', 13)} corregida tras verificar</span>`;
    if (res.truncated) foot += `<span class="vpill warn">${icon('clock', 13)} respuesta parcial</span>`;
    body.append(h('div', { class: 'ai-foot', html: `<div class="vrow">${foot}</div>${res.toolCalls.length ? traceHtml(res.toolCalls) : ''}<div class="disc">Contenido informativo. No es asesoramiento financiero.</div>` }));
    scroll.append(m);
    riches.push(...mounts);
    requestAnimationFrame(() => mounts.forEach((r) => r.mount?.()));
    toBottom();
  }

  function addError(e: unknown, retry: string) {
    let msg = (e as Error)?.message ?? String(e);
    let action = '';
    if (e instanceof GeminiError) {
      if (e.kind === 'invalid_key') { msg = 'Tu clave de Gemini no es válida o fue revocada.'; action = `<button class="btn btn-ghost btn-sm" data-go="settings">Cambiar clave</button>`; }
      else if (e.kind === 'busy') { msg = 'Gemini está saturado o llegaste al límite del nivel gratuito. Esperá un momento y reintentá.'; action = `<button class="btn btn-ghost btn-sm" data-retry="1">Reintentar</button>`; }
      else if (e.kind === 'unavailable') msg = 'No hay ningún modelo disponible para tu clave en este momento.';
      else msg = `Gemini respondió con un error: ${e.message}`;
    }
    const box = h('div', { class: 'm-ai' });
    box.innerHTML = `${who(true)}<div class="ai-body"><div class="err-bubble">${esc(msg)}${action ? `<div style="margin-top:10px">${action}</div>` : ''}</div></div>`;
    box.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest('[data-go]')) ctx.go('settings');
      if (t.closest('[data-retry]')) { box.remove(); void ask(retry, false); }
    });
    scroll.append(box); toBottom();
  }

  async function ask(text: string, echo = true, label?: string) {
    text = text.trim();
    if (busy || !text) return;
    busy = true; updateSend();
    if (echo) addUser(label ?? text);
    const w = addWorking();
    try {
      const res = await getAgent().ask(text, {
        onToolStart: (n, a) => w.start(n, a),
        onTool: (n, a, r) => w.done(n, a, !!r.ok),
        onStatus: (m) => w.status(m),
      });
      w.el.remove();
      addAnswer(res);
      setModelChip();
    } catch (e) {
      w.el.remove();
      addError(e, text);
    } finally { busy = false; updateSend(); }
  }

  // ---- eventos
  form.addEventListener('submit', (e) => { e.preventDefault(); const t = input.value; input.value = ''; input.style.height = 'auto'; updateSend(); void ask(t); });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 130) + 'px'; updateSend(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  const app = () => document.querySelector('.app');
  input.addEventListener('focus', () => { app()?.classList.add('kb-open'); setTimeout(toBottom, 250); });
  input.addEventListener('blur', () => app()?.classList.remove('kb-open'));
  $('#c-new', el).onclick = () => { if (busy) return; agent?.reset(); showEmpty(); };
  subscribe(() => { if (getSettings().apiKey !== agentKey) { agent = null; showEmpty(); } });

  showEmpty();
  return { el, ask: (p, label) => void ask(p, true, label), onShow: setModelChip };
}
