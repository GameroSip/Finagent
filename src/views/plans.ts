// Pantalla de planes: qué ganás pagando y qué sigue siendo gratis. Los planes de pago todavía no se pueden contratar: el botón anota el interés.
import { FREE_FOREVER, planPitch } from '../planPitch';
import { fetchPlans, getInterests, isServerMode, quotaInfo, sendInterest, type PlanEntry } from '../server';
import { esc, h, toast } from '../ui/dom';
import { icon } from '../ui/icons';
import { openSheet } from '../ui/sheet';
import { t } from '../i18n';

export async function openPlans(): Promise<void> {
  if (!isServerMode()) { toast('Los planes están disponibles en la versión con cuenta.'); return; }
  const el = h('div', { class: 'plans-sheet' });
  el.innerHTML = `<div class="plans-hero"><span class="plans-gem">${icon('gem', 26)}</span><h2>Llevá FinAgent al siguiente nivel</h2></div><div class="skeleton" style="height:230px;border-radius:22px;margin-top:14px"></div>`;
  openSheet(el);
  let plans: PlanEntry[];
  try { plans = (await fetchPlans()).plans; } catch { el.innerHTML += '<p class="muted" style="text-align:center;margin-top:16px">No pude cargar los planes ahora. Probá de nuevo en un momento.</p>'; return; }
  const free = plans.find((p) => p.id === 'free')!, paid = plans.filter((p) => p.id !== 'free'), mine = new Set(getInterests()), current = quotaInfo().plan?.id;
  const card = (p: PlanEntry, featured: boolean) => {
    const pitch = planPitch(p, free), anotado = mine.has(p.id), isMine = current === p.id;
    return `<div class="plan-card${featured ? ' feat' : ''}">
      <div class="plan-badge">${isMine ? 'Tu plan actual' : featured ? 'El más completo' : 'Para empezar'}</div>
      <div class="plan-top"><div class="plan-name">${esc(t(p.label))}</div><div class="plan-mult"><b>${pitch.multiplier >= 2 ? `${pitch.multiplier}x` : '+'}</b><span>${pitch.multiplier >= 2 ? 'más usos que el plan gratuito' : 'más usos'}</span></div></div>
      <div class="plan-model">${icon('zap', 15)} ${esc(p.modelLabel)}</div>
      <ul class="plan-ul">${pitch.benefits.map((b) => `<li>${icon('check', 16)}<span>${esc(b)}</span></li>`).join('')}</ul>
      ${isMine ? '' : `<button class="btn ${featured ? 'btn-primary' : 'btn-ghost'} btn-block" data-plan="${esc(p.id)}" ${anotado && !p.available ? 'disabled' : ''}>${p.available ? 'Suscribirme' : anotado ? 'Anotado ✓' : 'Avisame cuando esté disponible'}</button>
      ${p.available ? '' : '<div class="plan-foot">Todavía no se puede contratar ni tiene precio definido. Anotarte no te compromete a nada.</div>'}`}</div>`;
  };
  const row = (label: string, f: (p: PlanEntry) => string) => `<tr><th>${esc(label)}</th>${[free, ...paid].map((p) => `<td>${f(p)}</td>`).join('')}</tr>`;
  const mult = (p: PlanEntry) => (p.id === 'free' ? '1x' : `${planPitch(p, free).multiplier}x`);
  el.innerHTML = `<div class="plans-hero"><span class="plans-gem">${icon('gem', 26)}</span><h2>Llevá FinAgent al siguiente nivel</h2>
      <p>Las herramientas, los gráficos y los datos son gratis. Los planes amplían la conversación con la IA.</p></div>
    ${paid.map((p, i) => card(p, i === paid.length - 1)).join('')}
    <div class="plans-free"><h3>${icon('badgeCheck', 18)} Gratis para siempre</h3><ul>${FREE_FOREVER.map((t) => `<li>${icon('check', 15)}<span>${esc(t)}</span></li>`).join('')}</ul></div>
    <div style="overflow-x:auto"><table class="plans-cmp"><thead><tr><th></th>${[free, ...paid].map((p) => `<th>${esc(t(p.label))}</th>`).join('')}</tr></thead><tbody>
      ${row('Usos con IA', mult)}${row('Modelo', (p) => esc(p.modelLabel))}${row('Análisis profundo', (p) => (p.deepModelLabel ? '✓' : '—'))}${row('Gráficos y herramientas', () => '✓')}${row('Mercados del mundo', () => '✓')}
    </tbody></table></div>`;
  el.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-plan]');
    if (!b || b.disabled) return;
    const id = b.dataset.plan!, p = plans.find((x) => x.id === id)!;
    if (p.available) { toast('La suscripción llega pronto.'); return; }
    b.disabled = true;
    try { await sendInterest(id); b.textContent = 'Anotado ✓'; toast('Listo: te avisamos cuando esté disponible'); }
    catch { b.disabled = false; toast('No pude anotarte ahora. Probá de nuevo.'); }
  });
}
