// Asistente: chats guardados como en ChatGPT/Claude/Gemini. Cada chat tiene su historial, su título automático y su
// propio contexto; una respuesta en curso sigue aunque cambies de chat o de pestaña.
import { AbortedError, FinancialAgent, GeminiError, type AgentResult } from '../agent';
import { chatExists, createChat, emptyData, getMeta, loadChat, newId, renameChat, saveChat, setAutoTitle, setUnread, subscribeChats,
  traceOf, uiOf, type ChatData, type ChatMeta, type StoredMsg, type TraceItem } from '../chats';
import type { Ctx, View } from '../ctx';
import { renderMarkdown } from '../markdown';
import { modelLabel } from '../models';
import { getSettings, subscribe } from '../store';
import { aiTitle, fallbackTitle } from '../titles';
import { $, esc, h, openUrl, toast } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';
import { promptSheet } from '../ui/sheet';
import { renderRich, type Rich } from './cards';
import { openHistory } from './history';

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
const labelFor = (name: string, args: any) => (LABELS[name] ?? (() => name))(args ?? {});

function traceHtml(items: TraceItem[]): string {
  if (!items.length) return '';
  const rows = items.map((t) => {
    const body = t.ok
      ? `<div>Fuente: ${esc(t.source ?? 'n/d')}</div><div>Dato al: ${esc(t.asOf ?? 'n/d')} · consultado: ${esc(t.fetchedAt ?? '')}</div>${(t.notes ?? []).map((n) => `<div>ℹ️ ${esc(n)}</div>`).join('')}`
      : `<div class="down">${esc(t.error)}</div>`;
    return `<div class="trace-item"><b>${esc(labelFor(t.name, t.args))}</b>${body}</div>`;
  });
  return `<details class="trace"><summary>${icon('shield', 14)} Fuentes y cálculos (${items.length})</summary>${rows.join('')}</details>`;
}

async function copyText(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* sin portapapeles */ }
    ta.remove();
  }
  toast('Copiado');
}

interface Session { id: string | null; meta: ChatMeta | null; data: ChatData }
interface Step { key: string; label: string; state: 'run' | 'ok' | 'bad' }
interface Run { chatId: string; agent: FinancialAgent; steps: Step[]; status: string; el: HTMLElement | null }

export function createChatView(ctx: Ctx): ChatView {
  const el = h('div', { class: 'view chat-view' });
  el.innerHTML = `
    <div class="chat-head">
      <button class="icon-btn" id="c-hist" aria-label="Historial de chats">${icon('menu', 20)}</button>
      <button class="chat-title" id="c-title" aria-label="Renombrar chat"><span class="t" id="c-title-t">Nuevo chat</span>
        <span class="model-chip" id="c-model">${icon('sparkles', 12)}<span class="t">Gemini · automático</span></span></button>
      <button class="icon-btn" id="c-new" aria-label="Nuevo chat">${icon('squarePen', 20)}</button>
    </div>
    <div class="chat-scroll" id="c-scroll"></div>
    <form class="composer" id="c-form" autocomplete="off">
      <textarea id="c-in" rows="1" placeholder="Preguntale algo a tu analista…" enterkeyhint="send"></textarea>
      <button class="send" id="c-send" type="submit" aria-label="Enviar" disabled>${icon('arrowUp', 20)}</button>
    </form>`;
  const scroll = $('#c-scroll', el), input = $<HTMLTextAreaElement>('#c-in', el), send = $<HTMLButtonElement>('#c-send', el), form = $<HTMLFormElement>('#c-form', el);
  const titleBtn = $('#c-title', el), titleText = $('#c-title-t', el);

  const fresh = (): Session => ({ id: null, meta: null, data: emptyData() });
  let cur: Session = fresh();
  const agents = new Map<string, FinancialAgent>();   // un agente (con su contexto) por chat
  const runs = new Map<string, Run>();                // respuestas en curso, por chat
  let riches: Rich[] = [];
  let lastKey = getSettings().apiKey;

  const isCurrent = (id: string) => cur.id === id;
  const running = () => !!cur.id && runs.has(cur.id);
  const toBottom = () => requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; });
  const dataOf = (id: string): ChatData => (isCurrent(id) ? cur.data : loadChat(id) ?? emptyData());

  function updateSend() {
    const r = running();
    send.classList.toggle('stop', r);
    send.setAttribute('aria-label', r ? 'Detener' : 'Enviar');
    send.innerHTML = icon(r ? 'square' : 'arrowUp', r ? 16 : 20, r);
    send.disabled = !r && !input.value.trim();
  }
  const setModelChip = () => {
    const id = ctx.models.active ?? ctx.models.pick();
    $('#c-model .t', el).textContent = id ? `${modelLabel(id)} · automático` : 'Gemini · automático';
  };
  function refreshHeader() {
    cur.meta = cur.id ? getMeta(cur.id) : null;
    const t = cur.meta?.title ?? 'Nuevo chat';
    if (titleText.textContent !== t) { titleText.textContent = t; titleBtn.classList.remove('flash'); void titleBtn.offsetWidth; titleBtn.classList.add('flash'); }
    titleBtn.toggleAttribute('disabled', !cur.id);
  }

  function agentFor(chatId: string): FinancialAgent {
    let a = agents.get(chatId);
    if (!a) {
      a = new FinancialAgent({ apiKey: getSettings().apiKey, models: ctx.models });
      const d = dataOf(chatId);
      a.restore(d.history, d.numbers);
      agents.set(chatId, a);
    }
    return a;
  }

  // ------------------------------------------------------------ dibujo de mensajes
  const destroyRiches = () => { riches.forEach((r) => r.destroy?.()); riches = []; };

  function showEmpty() {
    destroyRiches();
    scroll.innerHTML = '';
    const e = h('div', { class: 'chat-empty' });
    e.innerHTML = `<div class="orb"><div class="orb-core">${icon('sparkles', 34)}</div></div>
      <h2 style="font-size:24px;font-weight:760;letter-spacing:-.03em;margin-top:18px">¿Qué querés saber<br>del mercado?</h2>
      <p class="muted" style="margin-top:8px;max-width:290px">Pregunto a los datos reales, verifico cada cifra y te muestro de dónde salió.</p>
      <div class="sugg">${SUGGESTIONS.map((s, i) => `<button class="sug" data-i="${i}"><span class="sug-ic">${icon(s.ic, 18)}</span><span style="flex:1;text-align:left"><b>${esc(s.title)}</b><span class="muted">${esc(s.sub)}</span></span>${icon('arrowUpRight', 15)}</button>`).join('')}</div>`;
    scroll.append(e);
  }

  const userEl = (m: StoredMsg) => h('div', { class: 'm-user', attrs: { 'data-mid': m.id } }, h('div', { class: 'bubble', text: m.text }));

  function aiEl(m: StoredMsg): HTMLElement {
    const box = h('div', { class: 'm-ai', attrs: { 'data-mid': m.id } });
    box.innerHTML = `${who()}<div class="ai-body"></div>`;
    const body = $('.ai-body', box);
    for (const ui of m.ui ?? []) { const r = renderRich(ui, ctx); if (r) { body.append(r.el); riches.push(r); } }
    body.append(h('div', { class: 'md', html: renderMarkdown(m.text) }));
    const v = m.verification;
    let pills = '';
    if (v && v.checked > 0) pills += v.ok ? `<span class="vpill ok">${icon('shield', 13)} ${v.checked} cifras verificadas con datos</span>`
      : `<span class="vpill warn">${icon('warn', 13)} Sin respaldo en los datos: ${v.unverified.map((u) => `<code>${esc(u)}</code>`).join(' ')}</span>`;
    if (m.flags?.corrected) pills += `<span class="vpill">${icon('check', 13)} corregida tras verificar</span>`;
    if (m.flags?.truncated) pills += `<span class="vpill warn">${icon('clock', 13)} respuesta parcial</span>`;
    body.append(h('div', { class: 'ai-foot', html: `<div class="vrow">${pills}</div>
      <div class="msg-actions"><button class="act-btn" data-act="copy" aria-label="Copiar respuesta">${icon('copy', 15)}<span>Copiar</span></button>
        <button class="act-btn regen hide" data-act="regen" aria-label="Regenerar respuesta">${icon('rotateCcw', 15)}<span>Regenerar</span></button></div>
      ${traceHtml(m.trace ?? [])}<div class="disc">Contenido informativo. No es asesoramiento financiero.</div>` }));
    return box;
  }

  function errEl(m: StoredMsg): HTMLElement {
    const box = h('div', { class: 'm-ai', attrs: { 'data-mid': m.id } });
    const action = m.errKind === 'invalid_key' ? `<button class="btn btn-ghost btn-sm" data-go="settings">Cambiar clave</button>`
      : m.retry && m.errKind !== 'unavailable' ? `<button class="btn btn-ghost btn-sm" data-retry="1">Reintentar</button>` : '';
    box.innerHTML = `${who(m.errKind !== 'stopped')}<div class="ai-body"><div class="err-bubble${m.errKind === 'stopped' ? ' soft' : ''}">${esc(m.text)}${action ? `<div style="margin-top:10px">${action}</div>` : ''}</div></div>`;
    return box;
  }

  function appendMsg(m: StoredMsg) {
    scroll.querySelector('.chat-empty')?.remove();
    const node = m.role === 'user' ? userEl(m) : m.role === 'ai' ? aiEl(m) : errEl(m);
    scroll.append(node);
    if (m.role === 'ai') requestAnimationFrame(() => riches.forEach((r) => r.mount?.()));
  }

  /** "Regenerar" solo en la última respuesta, y solo si no hay otra en curso. */
  function refreshActions() {
    scroll.querySelectorAll('.regen').forEach((b) => b.classList.add('hide'));
    const last = cur.data.messages[cur.data.messages.length - 1];
    if (last?.role === 'ai' && !running()) scroll.querySelector(`[data-mid="${last.id}"] .regen`)?.classList.remove('hide');
  }

  function paintWorking(run: Run) {
    if (!run.el) return;
    run.el.innerHTML = `${who()}<div class="ai-body"><div class="think"><span class="dots"><i></i><i></i><i></i></span><span>${esc(run.status)}</span></div>
      <div class="steps">${run.steps.map((s) => `<div class="step ${s.state === 'run' ? '' : s.state}">${s.state === 'run' ? '<span class="sp"></span>' : `<span class="sd">${icon(s.state === 'ok' ? 'check' : 'warn', 13)}</span>`}<span>${esc(s.label)}</span></div>`).join('')}</div></div>`;
    if (isCurrent(run.chatId)) toBottom();
  }
  function mountWorking(run: Run) {
    run.el = h('div', { class: 'm-ai working' });
    scroll.append(run.el);
    paintWorking(run);
  }

  function renderChat() {
    destroyRiches();
    scroll.innerHTML = '';
    if (!cur.data.messages.length && !running()) { showEmpty(); }
    else {
      cur.data.messages.forEach(appendMsg);
      const run = cur.id ? runs.get(cur.id) : undefined;
      if (run) mountWorking(run);
    }
    refreshActions();
    toBottom();
  }

  // ------------------------------------------------------------ chats: nuevo / abrir / eliminar
  function newChat() {
    cur = fresh();
    renderChat(); refreshHeader(); updateSend();
  }
  function openChat(id: string) {
    const meta = getMeta(id);
    if (!meta) { newChat(); return; }
    cur = { id, meta, data: loadChat(id) ?? emptyData() };
    setUnread(id, false);
    renderChat(); refreshHeader(); updateSend();
  }
  function onDeleted(id: string) {
    agents.get(id)?.abort();
    agents.delete(id); runs.delete(id);
    if (isCurrent(id)) newChat();
  }
  function ensureChat(prompt: string): string {
    if (cur.id) return cur.id;
    const meta = createChat(fallbackTitle(prompt)); // título provisorio; la IA lo reemplaza tras la primera respuesta
    cur = { id: meta.id, meta, data: emptyData() };
    refreshHeader();
    return meta.id;
  }

  // ------------------------------------------------------------ enviar
  async function send_(text: string, label?: string, opts: { echo?: boolean } = {}): Promise<void> {
    const prompt = text.trim();
    if (!prompt) return;
    if (!getSettings().apiKey) { toast('Primero cargá tu clave de Gemini en Ajustes'); ctx.go('settings'); return; }
    if (running()) return;

    const chatId = ensureChat(prompt);
    const agent = agentFor(chatId);
    if (opts.echo !== false) {
      const um: StoredMsg = { id: newId(), role: 'user', at: Date.now(), text: label ?? prompt, ...(label && label !== prompt ? { prompt } : {}) };
      cur.data.messages.push(um);
      if (!saveChat(chatId, cur.data)) toast('No hay espacio para guardar este chat');
      appendMsg(um);
    }
    const run: Run = { chatId, agent, steps: [], status: 'Analizando…', el: null };
    runs.set(chatId, run);
    mountWorking(run); updateSend(); refreshActions(); toBottom();

    try {
      const res = await agent.ask(prompt, {
        onToolStart: (n, a) => { run.steps.push({ key: n + JSON.stringify(a), label: labelFor(n, a), state: 'run' }); paintWorking(run); },
        onTool: (n, a, r) => { const s = run.steps.find((x) => x.key === n + JSON.stringify(a) && x.state === 'run'); if (s) s.state = r.ok ? 'ok' : 'bad'; paintWorking(run); },
        onStatus: (m) => { run.status = m; paintWorking(run); },
      });
      finishOk(run, prompt, res);
    } catch (e) {
      finishError(run, prompt, e);
    } finally {
      run.el?.remove(); run.el = null;
      if (runs.get(chatId) === run) runs.delete(chatId);
      updateSend(); refreshActions();
    }
  }

  function finishOk(run: Run, prompt: string, res: AgentResult) {
    const chatId = run.chatId;
    if (!chatExists(chatId)) return; // el chat se eliminó mientras se respondía
    const data = dataOf(chatId);
    const am: StoredMsg = {
      id: newId(), role: 'ai', at: Date.now(), text: res.answer, model: res.model,
      verification: { checked: res.verification.checked, ok: res.verification.ok, unverified: res.verification.unverified.map((u) => u.text) },
      flags: { ...(res.corrected ? { corrected: true } : {}), ...(res.truncated ? { truncated: true } : {}) },
      trace: traceOf(res.toolCalls), ui: uiOf(res.toolCalls),
    };
    data.messages.push(am);
    data.history = run.agent.history; data.numbers = run.agent.priorNumbers;
    if (!saveChat(chatId, data)) toast('No hay espacio para guardar este chat');
    if (isCurrent(chatId)) { run.el?.remove(); run.el = null; appendMsg(am); setModelChip(); toBottom(); }
    else { setUnread(chatId, true); toast(`Respuesta lista: ${getMeta(chatId)?.title ?? 'chat'}`); }
    const meta = getMeta(chatId);
    if (meta?.titleAuto && data.history.length === 1) void autoTitle(chatId, prompt, res.answer);
  }

  function finishError(run: Run, prompt: string, e: unknown) {
    const chatId = run.chatId;
    if (!chatExists(chatId)) return;
    let kind: NonNullable<StoredMsg['errKind']> = 'other';
    let msg = (e as Error)?.message ?? String(e);
    if (e instanceof AbortedError) { kind = 'stopped'; msg = 'Detuviste la respuesta.'; }
    else if (e instanceof GeminiError) {
      kind = e.kind;
      msg = e.kind === 'invalid_key' ? 'Tu clave de Gemini no es válida o fue revocada.'
        : e.kind === 'busy' ? 'Gemini está saturado o llegaste al límite del nivel gratuito. Esperá un momento y reintentá.'
        : e.kind === 'unavailable' ? 'No hay ningún modelo disponible para tu clave en este momento.'
        : `Gemini respondió con un error: ${e.message}`;
    }
    const data = dataOf(chatId);
    const em: StoredMsg = { id: newId(), role: 'error', at: Date.now(), text: msg, errKind: kind, retry: prompt };
    data.messages.push(em);
    saveChat(chatId, data);
    run.el?.remove(); run.el = null;
    if (isCurrent(chatId)) { appendMsg(em); toBottom(); }
    else setUnread(chatId, true);
  }

  async function autoTitle(chatId: string, q: string, a: string) {
    const t = await aiTitle(ctx.models, getSettings().apiKey, q, a);
    if (t && chatExists(chatId)) setAutoTitle(chatId, t);
  }

  // ------------------------------------------------------------ acciones sobre mensajes
  function retry(msgId: string) {
    if (!cur.id || running()) return;
    const i = cur.data.messages.findIndex((m) => m.id === msgId);
    const m = cur.data.messages[i];
    if (!m?.retry) return;
    cur.data.messages.splice(i, 1);
    scroll.querySelector(`[data-mid="${msgId}"]`)?.remove();
    saveChat(cur.id, cur.data);
    void send_(m.retry, undefined, { echo: false });
  }

  function regenerate() {
    if (!cur.id || running()) return;
    const msgs = cur.data.messages;
    const last = msgs[msgs.length - 1];
    const asked = [...msgs].reverse().find((m) => m.role === 'user');
    if (last?.role !== 'ai' || !asked) return;
    const agent = agentFor(cur.id);
    agent.popTurn();
    msgs.pop();
    cur.data.history = agent.history;
    scroll.querySelector(`[data-mid="${last.id}"]`)?.remove();
    saveChat(cur.id, cur.data);
    void send_(asked.prompt ?? asked.text, undefined, { echo: false });
  }

  // ------------------------------------------------------------ eventos
  scroll.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const sug = t.closest<HTMLElement>('.sug');
    if (sug) { const s = SUGGESTIONS[Number(sug.dataset.i)]; void send_(s.prompt, s.title); return; }
    const link = t.closest<HTMLAnchorElement>('a.mdlink');
    if (link) { ev.preventDefault(); openUrl(link.href); return; }
    if (t.closest('[data-go]')) { ctx.go('settings'); return; }
    const msgEl = t.closest<HTMLElement>('[data-mid]');
    if (t.closest('[data-retry]') && msgEl) { retry(msgEl.dataset.mid!); return; }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'copy' && msgEl) { const m = cur.data.messages.find((x) => x.id === msgEl.dataset.mid); if (m) void copyText(m.text); }
    if (act === 'regen') regenerate();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (running()) return;
    const t = input.value;
    input.value = ''; input.style.height = 'auto'; updateSend();
    void send_(t);
  });
  send.addEventListener('click', (e) => { // con una respuesta en curso, el botón detiene
    const run = cur.id ? runs.get(cur.id) : undefined;
    if (!run) return;
    e.preventDefault();
    run.agent.abort(); run.status = 'Deteniendo…'; paintWorking(run);
  });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 130) + 'px'; updateSend(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  const app = () => document.querySelector('.app');
  input.addEventListener('focus', () => { app()?.classList.add('kb-open'); setTimeout(toBottom, 250); });
  input.addEventListener('blur', () => app()?.classList.remove('kb-open'));

  $('#c-new', el).onclick = () => newChat();
  $('#c-hist', el).onclick = () => ctx.layer((done) => openHistory({ currentId: cur.id, busy: () => new Set(runs.keys()), onSelect: openChat, onNew: newChat, onDeleted: onDeleted, onClosed: done }));
  titleBtn.onclick = async () => {
    if (!cur.id) return;
    const id = cur.id;
    const t = await promptSheet({ title: 'Renombrar chat', value: cur.meta?.title ?? '', placeholder: 'Título del chat' });
    if (t && chatExists(id)) renameChat(id, t);
  };
  // Si el chat abierto desaparece (borrado desde el historial o desde Ajustes), se pasa a un chat nuevo.
  subscribeChats(() => { if (cur.id && !chatExists(cur.id)) { agents.delete(cur.id); newChat(); return; } refreshHeader(); });
  subscribe(() => { const k = getSettings().apiKey; if (k !== lastKey) { lastKey = k; agents.clear(); } }); // clave nueva: los chats se conservan

  showEmpty(); refreshHeader(); updateSend();
  return {
    el,
    ask: (prompt, label) => { newChat(); void send_(prompt, label); }, // "Analizar con IA" desde otra pantalla abre un chat nuevo
    onShow: () => { setModelChip(); refreshHeader(); },
  };
}
