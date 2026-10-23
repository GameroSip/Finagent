// Tarjeta de sugerencia de planes (la decide src/upsell.ts).
import { planMultiplier } from '../planPitch';
import { fetchMe, fetchPlans, quotaInfo } from '../server';
import { decideUpsell, dismiss, DISMISS_HARD, DISMISS_SOFT, loadUpsell, markShown, type Trigger } from '../upsell';
import { t } from '../i18n';
import { esc, h } from './dom';
import { icon } from './icons';

/** Devuelve la tarjeta si corresponde mostrarla ahora (y la da por mostrada); si no, null. */
export async function maybeUpsellCard(trigger: Trigger, onPlans: () => void): Promise<HTMLElement | null> {
  let q = quotaInfo();
  // Al abrir la app con una sesión guardada todavía no se sabe qué plan tiene la persona: se consulta ANTES de decidir (si no se puede, no se muestra nada: nunca se asume "gratis").
  if (!q.plan) { try { q = await fetchMe(); } catch { return null; } }
  const d = decideUpsell(loadUpsell(), { planId: q.plan?.id ?? 'paid-unknown', trigger, remaining: q.remaining?.day }, Date.now());
  if (!d.show) return null;
  let times = 0, model = '';
  try {
    const { plans } = await fetchPlans();
    const free = plans.find((p) => p.id === 'free'), top = [...plans].filter((p) => p.id !== 'free').sort((a, b) => b.dailyLimit - a.dailyLimit)[0];
    if (free && top) { times = planMultiplier(top, free); model = top.label; }
  } catch { /* sin catálogo: se muestra el texto sin números */ }
  const more = times >= 2 ? t('{m} tiene {n}x más usos y un modelo más potente.', { m: t(model), n: times }) : t('Los planes de pago tendrán más usos y un modelo más potente.');
  const el = h('div', { class: 'upsell-card' });
  el.innerHTML = `<span class="upsell-tag">Sugerencia</span>
    <div class="upsell-row"><span class="upsell-ic">${icon('gem', 20)}</span><div><b>${esc(t(trigger === 'low-quota' ? 'Te queda 1 conversación hoy' : 'Más usos, un modelo más potente'))}</b>
      <p>${esc(more)} ${esc(t('Los gráficos, los mercados y las herramientas siguen gratis.'))}</p></div></div>
    <div class="upsell-actions"><button class="btn btn-primary btn-sm" data-u="plans">Ver planes</button><button class="btn btn-ghost btn-sm" data-u="later">Ahora no</button><button class="link-btn" data-u="never">No mostrar más</button></div>`;
  el.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-u]')?.dataset.u;
    if (!a) return;
    if (a === 'plans') onPlans();
    else { dismiss(a === 'never' ? DISMISS_HARD : DISMISS_SOFT); el.remove(); }
  });
  markShown();
  return el;
}
