import './style.css';
import { DEFAULT_MODEL, FinancialAgent, GeminiError, MAX_STEPS } from './agent';
import { renderMarkdown } from './markdown';

interface Settings { apiKey: string; model: string; maxSteps: number; selfCorrect: boolean }
const KEY = 'finagent.settings.v1';

function loadSettings(): Settings {
  const base: Settings = { apiKey: '', model: DEFAULT_MODEL, maxSteps: MAX_STEPS, selfCorrect: true };
  try { return { ...base, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return base; }
}
let settings = loadSettings();
let agent: FinancialAgent | null = null;
let busy = false;
let statusSink: ((m: string) => void) | null = null;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const chat = $('chat'), input = $<HTMLTextAreaElement>('input'), form = $<HTMLFormElement>('form');
const dlg = $<HTMLDialogElement>('settings');

const EXAMPLES = [
  '¿Qué acciones del Merval cotizan con P/E menor a 10 y pagan dividendos?',
  'Compará KO y PEP: valuación, dividendos y deuda.',
  '¿Cuál es el estado técnico de AAPL? Mostrame RSI, medias y soportes.',
];

function empty() {
  chat.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'empty';
  d.innerHTML = '<p><strong>El modelo interpreta; las herramientas calculan.</strong><br>Cada cifra trae fuente, fórmula y fecha.</p><div class="chips"></div>';
  const chips = d.querySelector('.chips')!;
  for (const ex of EXAMPLES) {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.textContent = ex;
    b.onclick = () => { input.value = ex; form.requestSubmit(); };
    chips.appendChild(b);
  }
  chat.appendChild(d);
}

function bubble(cls: string, html = ''): HTMLElement {
  chat.querySelector('.empty')?.remove();
  const el = document.createElement('div');
  el.className = `msg ${cls}`;
  el.innerHTML = html;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}
const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function traceHtml(calls: Array<{ name: string; args: any; result: any }>): string {
  const items = calls.map((c) => {
    const meta = c.result?.meta ?? {};
    const head = c.result?.ok
      ? `<div>Fuente: ${esc(meta.source)} · dato al: ${esc(meta.as_of ?? 'n/d')} · consultado: ${esc(meta.fetched_at)}</div>` +
        (meta.notes ?? []).map((n: string) => `<div>ℹ️ ${esc(n)}</div>`).join('')
      : `<div class="err">${esc(c.result?.error)}</div>`;
    const args = Object.entries(c.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
    return `<div class="trace-item"><strong>${esc(c.name)}</strong>(${esc(args)})${head}` +
      `<details><summary>datos</summary><pre>${esc(JSON.stringify(c.result, null, 2))}</pre></details></div>`;
  });
  return `<details><summary>🔎 Trazabilidad (${calls.length} consultas)</summary>${items.join('')}</details>`;
}

function friendlyError(e: unknown): string {
  if (e instanceof GeminiError) {
    if (e.status === 429) return 'Se alcanzó el límite del nivel gratuito de Gemini (por minuto o por día). Esperá un rato y reintentá. Límites exactos: aistudio.google.com/rate-limit';
    if (e.status === 400 || e.status === 403) return `Gemini rechazó la solicitud (${e.status}): ${e.message}. Revisá la API key y el nombre del modelo en Ajustes.`;
    if (e.status === 404) return `El modelo "${settings.model}" no existe o no está disponible. Probá "gemini-flash-latest" en Ajustes.`;
    return `Error de Gemini (${e.status}): ${e.message}`;
  }
  return (e as Error)?.message ?? String(e);
}

function getAgent(): FinancialAgent {
  if (!agent) agent = new FinancialAgent({ apiKey: settings.apiKey, model: settings.model, maxSteps: settings.maxSteps, selfCorrect: settings.selfCorrect,
    onStatus: (m) => statusSink?.(m) });
  return agent;
}

async function send(q: string) {
  if (busy || !q.trim()) return;
  if (!settings.apiKey) { openSettings(); return; }
  busy = true;
  ($('btn-send') as HTMLButtonElement).disabled = true;
  bubble('user').textContent = q;
  const work = bubble('working', '<div>Investigando…</div>');
  statusSink = (m) => { const d = document.createElement('div'); d.textContent = `⏳ ${m}`; work.appendChild(d); chat.scrollTop = chat.scrollHeight; };
  try {
    const res = await getAgent().ask(q, (name, args, result) => {
      const div = document.createElement('div');
      div.textContent = `${result.ok ? '✅' : '⚠️'} ${name} ${JSON.stringify(args)}`;
      work.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    });
    work.remove();
    const v = res.verification;
    const flags = [res.corrected && '🔁 respuesta corregida tras la verificación numérica', res.truncated && '⏱️ límite de pasos: respuesta parcial'].filter(Boolean);
    const audit =
      (v.ok ? `<div class="ok">✅ ${v.checked} cifras contrastadas con resultados de herramientas</div>`
        : `<div class="warn">⚠️ Cifras que no pude rastrear a una herramienta: ${v.unverified.map((u) => `<code>${esc(u.text)}</code>`).join(', ')}. Tomalas con cautela.</div>`) +
      (flags.length ? `<div>${flags.join(' · ')}</div>` : '') + traceHtml(res.toolCalls);
    bubble('assistant', renderMarkdown(res.answer) + `<div class="audit">${audit}</div>`);
  } catch (e) {
    work.remove();
    bubble('err', esc(friendlyError(e)));
  } finally {
    statusSink = null;
    busy = false;
    ($('btn-send') as HTMLButtonElement).disabled = false;
  }
}

function openSettings() {
  $<HTMLInputElement>('cfg-key').value = settings.apiKey;
  $<HTMLInputElement>('cfg-model').value = settings.model;
  $<HTMLInputElement>('cfg-steps').value = String(settings.maxSteps);
  $<HTMLInputElement>('cfg-correct').checked = settings.selfCorrect;
  dlg.showModal();
}
$('settings-form').addEventListener('submit', (ev) => {
  const submitter = (ev as SubmitEvent).submitter as HTMLButtonElement | null;
  if (submitter?.value !== 'save') return;
  settings = {
    apiKey: $<HTMLInputElement>('cfg-key').value.trim(),
    model: $<HTMLInputElement>('cfg-model').value.trim() || DEFAULT_MODEL,
    maxSteps: Math.max(2, Math.min(10, Number($<HTMLInputElement>('cfg-steps').value) || MAX_STEPS)),
    selfCorrect: $<HTMLInputElement>('cfg-correct').checked,
  };
  localStorage.setItem(KEY, JSON.stringify(settings));
  agent = null; // se recrea con los nuevos ajustes
});

$('btn-cfg').onclick = openSettings;
$('btn-new').onclick = () => { agent?.reset(); agent = null; empty(); };
form.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value; input.value = ''; input.style.height = 'auto'; void send(q); });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; });
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });

empty();
if (!settings.apiKey) openSettings();
