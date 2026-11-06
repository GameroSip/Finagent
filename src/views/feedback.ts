// Interfaz de la beta: consentimiento de estadísticas, formulario "Contanos", votos de funciones y encuesta de recomendación.
// Todo lo que acá se escribe a propósito (comentarios) llega al servidor; las estadísticas, en cambio, nunca llevan texto (ver src/telemetry.ts).
import { setAnalytics, track } from '../analytics';
import { t } from '../i18n';
import { isServerMode, sendFeatureVote, sendFeedback } from '../server';
import { KIND_LABELS, VOTE_LABELS, WISHES } from '../betaTexts';
import { FEATURES } from '../telemetry';
import { VERSION } from '../version';
import { esc, h, toast } from '../ui/dom';
import { icon } from '../ui/icons';
import { openSheet } from '../ui/sheet';

const read = <T,>(k: string, d: T): T => { try { const v = globalThis.localStorage?.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { globalThis.localStorage?.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

// ------------------------------------------------------------------ consentimiento de estadísticas
/** Qué se mide y qué no, en lenguaje simple. Lo usan la pantalla de la introducción y la hoja que se muestra a quienes ya usaban la app. */
export function consentBody(): string {
  return `<h1 class="c-h">${esc(t('Ayudanos a mejorar la beta'))}</h1><p class="s-lead">${esc(t('Si querés, FinAgent registra cómo usás la app para saber qué mejorar.'))}</p>
    <div class="c-sub">${esc(t('Qué registramos'))}</div>
    <ul class="c-list"><li>${icon('check', 15)}<span>${esc(t('Qué pantallas y funciones usás, y qué activos abrís.'))}</span></li>
      <li>${icon('check', 15)}<span>${esc(t('Qué herramientas usó el asistente y si la respuesta te sirvió.'))}</span></li>
      <li>${icon('check', 15)}<span>${esc(t('Las búsquedas que no encontraron resultado, para saber qué activos faltan.'))}</span></li></ul>
    <div class="c-sub">${esc(t('Qué NO registramos'))}</div>
    <ul class="c-list no"><li>${icon('x', 15)}<span>${esc(t('Lo que le escribís al asistente.'))}</span></li><li>${icon('x', 15)}<span>${esc(t('Tu plan ni tus favoritos.'))}</span></li><li>${icon('x', 15)}<span>${esc(t('Tu nombre o tu correo: es anónimo.'))}</span></li></ul>
    <p class="s-note">${esc(t('Podés cambiarlo cuando quieras en Ajustes.'))}</p>`;
}
/** Para quienes ya usaban la app antes de que existieran las estadísticas: se pregunta una sola vez. */
export function openConsentSheet(onDone?: () => void): void {
  const el = h('div', { class: 'consent-sheet' });
  el.innerHTML = `${consentBody()}<button class="btn btn-primary btn-block" id="c-yes" style="margin-top:14px">${esc(t('Sí, ayudar'))}</button><button class="btn btn-ghost btn-block" id="c-no" style="margin-top:8px">${esc(t('No, gracias'))}</button>`;
  const close = openSheet(el);
  const decide = (on: boolean) => { void setAnalytics(on).then(() => { if (on) track('setting', { key: 'analytics', value: 'on' }); }); close(); onDone?.(); };
  el.querySelector('#c-yes')!.addEventListener('click', () => decide(true)); el.querySelector('#c-no')!.addEventListener('click', () => decide(false));
}

// ------------------------------------------------------------------ "Contanos"
export function openFeedback(): void {
  track('screen', { name: 'feedback' });
  let kind: 'idea' | 'problema' | 'falta' = 'idea';
  const el = h('div', { class: 'plan-sheet' });
  el.innerHTML = `<h3 class="plan-h">${esc(t('Contanos'))}</h3><p class="stress-hint" style="margin:0 0 12px">${esc(t('Lo que escribas acá sí nos llega (a diferencia de las estadísticas, que nunca llevan texto). No pongas datos personales.'))}</p>
    <div class="fb-kinds">${KIND_LABELS.map(([k, l]) => `<button class="chip ${k === kind ? 'on' : ''}" data-k="${k}">${esc(t(l))}</button>`).join('')}</div>
    <textarea id="fb-text" class="plan-ta" maxlength="1000" rows="6" placeholder="${esc(t('¿Qué querés contarnos?'))}" style="margin-top:12px"></textarea>
    <button class="btn btn-primary btn-block" id="fb-send" style="margin-top:12px">${esc(t('Enviar'))}</button>`;
  const close = openSheet(el), ta = el.querySelector<HTMLTextAreaElement>('#fb-text')!, btn = el.querySelector<HTMLButtonElement>('#fb-send')!;
  el.querySelectorAll<HTMLElement>('.chip').forEach((c) => { c.onclick = () => { kind = c.dataset.k as typeof kind; el.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c)); }; });
  btn.onclick = async () => {
    const text = ta.value.trim();
    if (!text) { toast(t('Escribí algo antes de enviar')); return; }
    btn.disabled = true;
    try { await sendFeedback(kind, { text, version: VERSION }); track('feedback_sent', { kind }); close(); toast(t('Gracias, lo recibimos')); }
    catch { btn.disabled = false; toast(t('No pude enviarlo ahora. Probá de nuevo.')); }
  };
}

// ------------------------------------------------------------------ "Qué te gustaría que sumemos": votos por funciones que todavía no existen
export function openWishlist(): void {
  const voted = new Set<string>(read<string[]>('finagent.votes.v1', []));
  const el = h('div', { class: 'plan-sheet' });
  el.innerHTML = `<h3 class="plan-h">${esc(t('Qué te gustaría que sumemos'))}</h3><p class="stress-hint" style="margin:0 0 6px">${esc(t('Todavía no existen. Tu voto nos ayuda a elegir qué construir primero. Algunas pueden requerir permisos o acuerdos que hoy no tenemos.'))}</p>
    <div class="wish-list">${FEATURES.map((f) => `<div class="wish" data-f="${f}"><div class="wish-t"><b>${esc(t(WISHES[f][0]))}</b><span>${esc(t(WISHES[f][1]))}</span></div><button class="btn btn-sm ${voted.has(f) ? 'btn-ghost' : 'btn-primary'}" ${voted.has(f) ? 'disabled' : ''}>${esc(voted.has(f) ? t(VOTE_LABELS.voted) : t(VOTE_LABELS.vote))}</button></div>`).join('')}</div>`;
  openSheet(el);
  for (const f of FEATURES) track('fakedoor', { feature: f, action: 'view' });
  el.querySelectorAll<HTMLElement>('.wish').forEach((row) => {
    const f = row.dataset.f as (typeof FEATURES)[number], b = row.querySelector('button')!;
    b.onclick = async () => {
      b.disabled = true;
      try { await sendFeatureVote(f); voted.add(f); write('finagent.votes.v1', [...voted]); b.className = 'btn btn-sm btn-ghost'; b.textContent = t(VOTE_LABELS.voted); track('fakedoor', { feature: f, action: 'interest' }); }
      catch { b.disabled = false; toast(t('No pude anotarlo ahora. Probá de nuevo.')); }
    };
  });
}

// ------------------------------------------------------------------ encuesta de recomendación (una sola vez, hasta 3 intentos espaciados)
const DAYS = 'finagent.days.v1', NPS = 'finagent.nps.v1', DAY_MS = 86_400_000;
export function noteOpenDay(): void {
  const today = new Date().toISOString().slice(0, 10), days = read<string[]>(DAYS, []);
  if (!days.includes(today)) write(DAYS, [...days, today].slice(-60));
}
/** Pregunta "¿recomendarías FinAgent?" cuando la persona ya lo usó en 3 días distintos. Si dice "ahora no", vuelve a preguntar a los 14 días (máximo 3 veces). */
export function maybeAskNps(now = Date.now()): boolean {
  if (!isServerMode()) return false;
  const st = read<{ n: number; at: number; done?: boolean }>(NPS, { n: 0, at: 0 });
  if (st.done || read<string[]>(DAYS, []).length < 3 || st.n >= 3 || (st.n > 0 && now - st.at < 14 * DAY_MS)) return false;
  write(NPS, { ...st, n: st.n + 1, at: now });
  const el = h('div', { class: 'plan-sheet' });
  el.innerHTML = `<h3 class="plan-h">${esc(t('¿Qué tan probable es que recomiendes FinAgent a un amigo?'))}</h3>
    <div class="nps-grid">${Array.from({ length: 11 }, (_, i) => `<button class="chip" data-s="${i}">${i}</button>`).join('')}</div>
    <div class="nps-ends"><span>${esc(t('Nada probable'))}</span><span>${esc(t('Muy probable'))}</span></div>
    <textarea id="nps-text" class="plan-ta" maxlength="1000" rows="3" placeholder="${esc(t('Si querés, contanos por qué'))}" style="margin-top:12px;min-height:80px"></textarea>
    <button class="btn btn-primary btn-block" id="nps-send" disabled style="margin-top:12px">${esc(t('Enviar'))}</button><button class="btn btn-ghost btn-block" id="nps-no" style="margin-top:8px">${esc(t('Ahora no'))}</button>`;
  const close = openSheet(el);
  let score = -1; const send = el.querySelector<HTMLButtonElement>('#nps-send')!;
  el.querySelectorAll<HTMLElement>('.nps-grid .chip').forEach((c) => { c.onclick = () => { score = Number(c.dataset.s); el.querySelectorAll('.nps-grid .chip').forEach((x) => x.classList.toggle('on', x === c)); send.disabled = false; }; });
  send.onclick = async () => {
    send.disabled = true;
    try { const text = el.querySelector<HTMLTextAreaElement>('#nps-text')!.value.trim(); await sendFeedback('nps', { score, ...(text ? { text } : {}), version: VERSION }); write(NPS, { n: st.n + 1, at: now, done: true }); track('feedback_sent', { kind: 'nps' }); close(); toast(t('Gracias, lo recibimos')); }
    catch { send.disabled = false; toast(t('No pude enviarlo ahora. Probá de nuevo.')); }
  };
  el.querySelector('#nps-no')!.addEventListener('click', close);
  return true;
}
