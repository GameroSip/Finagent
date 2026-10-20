// Planes de uso de FinAgent (para el servidor): qué modelo usa cada plan, cuántas consultas puede hacer y con qué límites.
// Los límites se cuentan en el SERVIDOR (los de Google son por proyecto, no por usuario: un solo usuario podría agotarles el cupo a todos).
// Los valores son una propuesta inicial para ajustar con costos reales de la beta.

export type PlanId = 'free' | 'plus' | 'pro';
export interface Plan {
  id: PlanId; label: string;
  model: string;                // el modelo FIJO de este plan (el usuario lo ve en la app)
  modelLabel: string;           // cómo se muestra: "Gemini 3.5 Flash-Lite"
  fallbacks: string[];          // modelos de respaldo si el principal no tiene cupo (vacío = el plan usa SOLO su modelo)
  deepModel?: string;           // modelo del "análisis profundo" (solo planes que lo incluyen)
  deepModelLabel?: string;
  available: boolean;           // ¿ya se puede contratar? Los de pago todavía no: se muestran como "próximamente"
  blurb: string;                // qué ofrece, en una frase
  thinking: 'low' | 'medium' | 'high'; // nivel de razonamiento (pendiente de conectar al pedido cuando se verifique el nombre del parámetro en la documentación)
  dailyLimit: number; monthlyLimit: number; deepMonthlyLimit: number;
  maxToolSteps: number; maxOutputTokens: number;
}

export const PLANS: Record<PlanId, Plan> = {
  free: { id: 'free', label: 'Gratis', model: 'gemini-3.5-flash-lite', modelLabel: 'Gemini 3.5 Flash-Lite', fallbacks: [], available: true, thinking: 'low', dailyLimit: 3, monthlyLimit: 90, deepMonthlyLimit: 0, maxToolSteps: 3, maxOutputTokens: 700,
    blurb: 'Respuestas rápidas con un modelo liviano.' },
  // Los planes de pago son una PROPUESTA preliminar (el precio no está definido y todavía no se pueden contratar): sirven para mostrar qué vendría y medir el interés.
  plus: { id: 'plus', label: 'Plus', model: 'gemini-3.8-flash', modelLabel: 'Gemini 3.8 Flash', fallbacks: ['gemini-3.5-flash-lite'], available: false, thinking: 'medium', dailyLimit: 10, monthlyLimit: 200, deepMonthlyLimit: 0, maxToolSteps: 5, maxOutputTokens: 1200,
    blurb: 'Un modelo más potente y más conversaciones por día.' },
  pro: { id: 'pro', label: 'Pro', model: 'gemini-3.8-flash', modelLabel: 'Gemini 3.8 Flash', fallbacks: ['gemini-3.5-flash-lite'], deepModel: 'gemini-3.1-pro-preview', deepModelLabel: 'Gemini 3.1 Pro', available: false, thinking: 'medium', dailyLimit: 30, monthlyLimit: 600, deepMonthlyLimit: 30, maxToolSteps: 6, maxOutputTokens: 2000,
    blurb: 'El modelo más potente para análisis profundos y el máximo de conversaciones.' },
};
export const PLAN_RANK: Record<PlanId, number> = { free: 0, plus: 1, pro: 2 };

/** Texto de contexto para el modelo: así, si el usuario pregunta por su plan o sus límites, FinAgent responde con datos reales y no inventa. */
export function planNote(p: Plan): string {
  const paid = (['plus', 'pro'] as const).filter((x) => !PLANS[x].available).map((x) => PLANS[x].label).join(' y ');
  return `Plan ${p.label}: usa ${p.modelLabel} y permite ${p.dailyLimit} conversaciones por día (${p.monthlyLimit} por mes).` +
    (p.id === 'free' ? ` Los planes de pago (${paid}) con modelos más potentes y más conversaciones todavía no están disponibles: se pueden anotar para que les avisen en Ajustes → Tu plan. No inventes precios ni fechas.` : '');
}

/** Contador atómico (en producción: Firestore, Redis o Postgres). */
export interface UsageStore { incr(key: string, by: number): Promise<number> }
export class MemoryUsageStore implements UsageStore {
  private m = new Map<string, number>();
  async incr(key: string, by: number): Promise<number> { const v = (this.m.get(key) ?? 0) + by; this.m.set(key, v); return v; }
  peek(key: string): number { return this.m.get(key) ?? 0; }
}

/** El "día" y el "mes" del usuario según SU zona horaria (no la de Google, que reinicia sus cupos a medianoche del Pacífico). */
export function localDates(now: Date, tz: string): { day: string; month: string; nextDay: string; nextMonth: string } {
  const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); // YYYY-MM-DD
  const day = fmt(now), month = day.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  return { day, month, nextDay: fmt(new Date(now.getTime() + 24 * 3600_000)), nextMonth: m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01` };
}

export interface Ticket { keys: string[] }
export type Consume =
  | { ok: true; ticket: Ticket; remaining: { day: number; month: number } }
  | { ok: false; reason: 'daily' | 'monthly' | 'deep' | 'no-deep'; resetsOn: string };

/**
 * Descuenta UNA consulta ANTES de llamar al modelo. Si se pasa de algún límite, devuelve el descuento y avisa cuál y cuándo se reinicia.
 * Si después la respuesta falla, hay que llamar a refund(): solo cuentan las respuestas entregadas.
 */
export async function consume(store: UsageStore, userId: string, plan: Plan, now: Date, tz: string, opts: { deep?: boolean } = {}): Promise<Consume> {
  const d = localDates(now, tz);
  if (opts.deep && (!plan.deepModel || plan.deepMonthlyLimit <= 0)) return { ok: false, reason: 'no-deep', resetsOn: '' };
  const dayKey = `${userId}:d:${d.day}`, monthKey = `${userId}:m:${d.month}`, deepKey = `${userId}:deep:${d.month}`;
  const keys = opts.deep ? [dayKey, monthKey, deepKey] : [dayKey, monthKey];
  const [day, month, deep] = await Promise.all(keys.map((k) => store.incr(k, 1)));
  const over = day > plan.dailyLimit ? 'daily' : month > plan.monthlyLimit ? 'monthly' : opts.deep && deep > plan.deepMonthlyLimit ? 'deep' : null;
  if (over) {
    await Promise.all(keys.map((k) => store.incr(k, -1)));
    return { ok: false, reason: over, resetsOn: over === 'daily' ? d.nextDay : d.nextMonth };
  }
  return { ok: true, ticket: { keys }, remaining: { day: plan.dailyLimit - day, month: plan.monthlyLimit - month } };
}

/** Devuelve el descuento de una consulta que no llegó a responderse (error de Gemini, cupo, red). */
export async function refund(store: UsageStore, t: Ticket): Promise<void> { await Promise.all(t.keys.map((k) => store.incr(k, -1))); }

export const modelFor = (plan: Plan, deep = false): string => (deep && plan.deepModel ? plan.deepModel : plan.model);
