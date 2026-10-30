// Tarjeta del termómetro de tensión (pantalla del activo) y "Mi plan": un texto que escribe la persona y la app solo se lo recuerda.
// El plan NO se envía a ningún servidor ni se le muestra a la IA: queda en este teléfono.
import { locale, t } from '../i18n';
import { RADAR_STATS } from '../data/radarStats';
import { historyOf, STRESS_TEXTS as T, type StressLevel, type StressResult } from '../stress';
import { esc, h, toast } from './dom';
import { fmtNum } from './format';
import { icon } from './icons';
import { openSheet } from './sheet';

const KEY = 'finagent.plan.v1', MAX = 600;
export const getPlan = (): string => { try { return (globalThis.localStorage?.getItem(KEY) ?? '').slice(0, MAX); } catch { return ''; } };
export function setPlan(text: string): void {
  try { const v = text.trim().slice(0, MAX); if (v) globalThis.localStorage?.setItem(KEY, v); else globalThis.localStorage?.removeItem(KEY); } catch { /* sin almacenamiento */ }
}

const pct = (x: number) => `${(x * 100).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;   // siempre un decimal: en una tabla, 4,0 y 14,6 se comparan mejor que 4 y 14,6
const FILLED: Record<StressLevel, number> = { baja: 1, media: 2, alta: 3 };

/** HTML de la sección (vacío si el tipo de activo no está respaldado por el backtest). */
export function stressHtml(r: StressResult): string {
  if (r.kind === 'unsupported' && r.reason === 'tipo') return '';
  const head = (extra = '') => `<div class="section" style="margin-top:22px"><div class="section-head"><h2>${esc(t(T.title))}</h2>${extra}</div>`;
  if (r.kind === 'unsupported') return `${head()}<p class="stress-off">${esc(t(T.unsupported[r.reason]))}</p></div>`;
  const hist = historyOf(r.group, r.level), plan = getPlan();
  const date = new Date(r.asOf * 1000).toLocaleDateString(locale(), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const row = (label: string, v: number, usual: number) => `<div class="sh-row"><span>${esc(t(label))}</span><b class="num">${pct(v)}</b><span class="num">${pct(usual)}</span></div>`;
  const conds = (Object.keys(T.conditions) as Array<keyof typeof T.conditions>).map((k) => `<li class="${r.conditions[k] ? 'on' : ''}"><i class="dot"></i><span>${esc(t(T.conditions[k]))}</span></li>`).join('');
  const planBlock = plan
    ? `<div class="stress-plan ${r.level !== 'baja' ? 'hot' : ''}"><div class="sp-top"><b>${esc(t(r.level !== 'baja' ? T.plan.yours : T.plan.title))}</b><button class="link-btn" id="a-plan-edit">${esc(t(T.plan.edit))}</button></div><p data-notrans>${esc(plan)}</p></div>`
    : `<button class="link-row" id="a-plan-edit"><span>${esc(t(T.plan.cta))}</span>${icon('arrowUpRight', 16)}</button><p class="stress-hint">${esc(t(T.plan.local))}</p>`;
  return `${head(`<span class="muted" style="font-size:12px">${esc(t('al cierre del {d}', { d: date }))}</span>`)}
    <div class="stress">
      <div class="stress-top"><div class="stress-meter" aria-hidden="true">${[0, 1, 2].map((i) => `<i class="${i < FILLED[r.level] ? 'on' : ''}"></i>`).join('')}</div><div class="stress-level" id="a-stress-level" data-level="${r.level}">${esc(t(T.levels[r.level]))}</div></div>
      <p class="stress-sum">${esc(t(T.summary[r.level]))}</p>
      <div class="stress-sub">${esc(t(T.today))}</div><ul class="stress-cond">${conds}</ul>
      <div class="stress-sub">${esc(t(T.after))}</div>
      <div class="stress-hist"><div class="sh-row head"><span></span><span>${esc(t(T.levelShort[r.level]))}</span><span>${esc(t(T.usual))}</span></div>
        ${row(T.drop, hist.stats.t5.drop, hist.stats.t5.expDrop)}${row(T.up, hist.stats.t5.up, hist.stats.t5.expUp)}</div>
      <p class="stress-src">${esc(t('{n} días en este nivel · {a} activos ({g}) · {y}–2026', { n: fmtNum(hist.stats.n, 0), a: hist.assets, g: t(T.groups[r.group]), y: RADAR_STATS.desde }))}. ${esc(t(T.usualNote))}</p>
      ${planBlock}
      <p class="stress-note">${esc(t(T.note))}</p>
    </div></div>`;
}

/** Conecta el botón de "Mi plan". `after` se llama al guardar para redibujar la tarjeta. */
export function bindStress(host: HTMLElement, after: () => void): void {
  host.querySelector<HTMLElement>('#a-plan-edit')?.addEventListener('click', () => openPlanSheet(after));
}

export function openPlanSheet(after: () => void): void {
  const cur = getPlan(), el = h('div', { class: 'plan-sheet' });
  el.innerHTML = `<h3 class="plan-h">${esc(t(T.plan.title))}</h3><p class="stress-hint" style="margin:0 0 12px">${esc(t(T.plan.hint))}</p>
    <textarea id="plan-text" class="plan-ta" maxlength="${MAX}" rows="6" placeholder="${esc(t(T.plan.placeholder))}"></textarea>
    <div class="plan-count muted" id="plan-count"></div>
    <button class="btn btn-primary btn-block" id="plan-save" style="margin-top:12px">${esc(t(T.plan.save))}</button>
    ${cur ? `<button class="btn btn-ghost btn-block" id="plan-del" style="margin-top:8px">${esc(t(T.plan.remove))}</button>` : ''}`;
  const close = openSheet(el), ta = el.querySelector<HTMLTextAreaElement>('#plan-text')!, count = el.querySelector<HTMLElement>('#plan-count')!;
  ta.value = cur;
  const upd = () => { count.textContent = `${ta.value.length} / ${MAX}`; };
  ta.addEventListener('input', upd); upd();
  el.querySelector('#plan-save')!.addEventListener('click', () => { setPlan(ta.value); close(); toast(t(ta.value.trim() ? T.plan.saved : T.plan.removed)); after(); });
  el.querySelector('#plan-del')?.addEventListener('click', () => { setPlan(''); close(); toast(t(T.plan.removed)); after(); });
}
