// Recordatorios de los planes de pago. Reglas pensadas para NO molestar: nada hasta que la persona use la app, como máximo uno cada 24 horas
// y seis por mes, nunca a quien ya tiene un plan, y se pueden descartar ("Ahora no" 7 días, "No mostrar más" 90 días). Es una sugerencia propia de FinAgent, no publicidad de terceros.
export type Trigger = 'low-quota' | 'weekly';
export interface UpsellState { answers: number; lastShown: number; dismissedUntil: number; shownAt: number[] }

const DAY = 86_400_000;
export const MIN_GAP = DAY, WEEKLY_GAP = 7 * DAY, MAX_PER_30D = 6, MIN_ANSWERS_LOW = 2, MIN_ANSWERS_WEEKLY = 3;
export const DISMISS_SOFT = 7 * DAY, DISMISS_HARD = 90 * DAY;
export const EMPTY: UpsellState = { answers: 0, lastShown: 0, dismissedUntil: 0, shownAt: [] };

export function decideUpsell(s: UpsellState, ctx: { planId: string; trigger: Trigger; remaining?: number }, now: number): { show: boolean; why: string } {
  if (ctx.planId !== 'free') return { show: false, why: 'plan-de-pago' };                                  // quien ya paga no recibe recordatorios
  if (now < s.dismissedUntil) return { show: false, why: 'descartado' };
  if (now - s.lastShown < MIN_GAP) return { show: false, why: 'muy-pronto' };
  if (s.shownAt.filter((t) => now - t < 30 * DAY).length >= MAX_PER_30D) return { show: false, why: 'tope-mensual' };
  if (ctx.trigger === 'low-quota') return ctx.remaining !== undefined && ctx.remaining <= 1 && s.answers >= MIN_ANSWERS_LOW ? { show: true, why: 'poco-cupo' } : { show: false, why: 'sin-motivo' };
  return s.answers >= MIN_ANSWERS_WEEKLY && now - s.lastShown >= WEEKLY_GAP ? { show: true, why: 'semanal' } : { show: false, why: 'sin-motivo' };
}

// ------------------------------------------------------------------ almacenamiento
const KEY = 'finagent.upsell.v1';
const mem = new Map<string, string>();
export function loadUpsell(): UpsellState {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? mem.get(KEY) ?? 'null') as Partial<UpsellState> | null;
    return { ...EMPTY, ...(v ?? {}), shownAt: Array.isArray(v?.shownAt) ? v!.shownAt!.filter((x) => typeof x === 'number') : [] };
  } catch { return { ...EMPTY }; }
}
export function saveUpsell(s: UpsellState): void { const j = JSON.stringify(s); mem.set(KEY, j); try { globalThis.localStorage?.setItem(KEY, j); } catch { /* sin almacenamiento */ } }
export const noteAnswer = (): void => { const s = loadUpsell(); saveUpsell({ ...s, answers: s.answers + 1 }); };
export function markShown(now = Date.now()): void { const s = loadUpsell(); saveUpsell({ ...s, lastShown: now, shownAt: [...s.shownAt.filter((t) => now - t < 30 * DAY), now] }); }
export function dismiss(ms: number, now = Date.now()): void { const s = loadUpsell(); saveUpsell({ ...s, dismissedUntil: now + ms }); }
