// Economía de los planes: cuánto cuesta atender a una persona de cada plan y qué precio conviene cobrar.
// Funciones puras (se prueban aparte). Se usan en el panel de administración (/admin) con los costos que el servidor va midiendo.
import { estimateCostUSD, type Tokens } from './pricing';
import { modelFor, PLANS, type Plan, type PlanId } from './plans';

/** Tokens por respuesta MEDIDOS con Gemini real (41 respuestas con 3.5 Flash-Lite). Para otros modelos se usan los mismos tokens: es una ESTIMACIÓN hasta medir. */
export const DEFAULT_TOKENS: Tokens = { input: 8475, output: 354, thoughts: 0, cached: 0 };

export interface EconParams {
  tokens: Tokens;                              // por respuesta
  measured?: Record<string, number>;           // modelo → costo real por respuesta, medido por el servidor (si existe, se usa en vez del estimado)
  daysActive: number;                          // días por mes que una persona suscripta usa la app
  utilization: number;                         // fracción de su límite diario que usa en esos días (0–1)
  playFee: number;                             // comisión de Google Play (0–1)
  taxRate: number;                             // impuestos incluidos en el precio publicado (se descuentan antes de la comisión)
  targetMargin: number;                        // margen que querés ganar (0–1)
  fixedPerUserMonth: number;                   // otros costos por suscriptor (servidor, soporte)
  now?: Date;
}
export const DEFAULT_PARAMS: EconParams = { tokens: DEFAULT_TOKENS, daysActive: 15, utilization: 0.4, playFee: 0.15, taxRate: 0, targetMargin: 0.6, fixedPerUserMonth: 0 };

export const PRICE_POINTS = [2.99, 4.99, 6.99, 9.99, 14.99];

export interface PriceRow { price: number; net: number; marginAvg: number; marginWorst: number }
export interface PlanEcon {
  plan: PlanId; model: string; source: 'measured' | 'estimated'; costPerAnswer: number;
  answersAvg: number; answersMax: number; costAvg: number; costMax: number;
  netFactor: number;                           // de cada USD publicado, cuánto te queda tras impuestos y comisión
  breakEven: number; breakEvenWorst: number; recommended: number;
  rows: PriceRow[];
}

/** Costo en USD de UNA respuesta con ese modelo. */
export function costPerAnswer(model: string, p: EconParams): { usd: number; source: 'measured' | 'estimated' } {
  const m = p.measured?.[model];
  if (m !== undefined && m > 0) return { usd: m, source: 'measured' };
  const e = estimateCostUSD(model, p.tokens, p.now ?? new Date());
  if (e === null) throw new Error(`Sin precio oficial cargado para ${model}`);
  return { usd: e, source: 'estimated' };
}

export function planEconomics(plan: Plan, p: EconParams = DEFAULT_PARAMS, prices: number[] = PRICE_POINTS): PlanEcon {
  const base = costPerAnswer(modelFor(plan), p), deep = plan.deepModel ? costPerAnswer(modelFor(plan, true), p) : null;
  const answersMax = plan.dailyLimit * 30;                                    // peor caso: todos los días, todo el cupo
  const answersAvg = plan.dailyLimit * p.daysActive * p.utilization;
  const deepMax = plan.deepMonthlyLimit, deepAvg = plan.deepMonthlyLimit * p.utilization;   // las "profundas" salen del mismo cupo: solo suman la diferencia de costo
  const extra = (n: number) => (deep ? n * Math.max(0, deep.usd - base.usd) : 0);
  const costAvg = answersAvg * base.usd + extra(deepAvg) + p.fixedPerUserMonth;
  const costMax = answersMax * base.usd + extra(deepMax) + p.fixedPerUserMonth;
  const netFactor = (1 - p.playFee) / (1 + p.taxRate);
  const rows = prices.map((price) => { const net = price * netFactor; return { price, net, marginAvg: (net - costAvg) / net, marginWorst: (net - costMax) / net }; });
  return { plan: plan.id, model: modelFor(plan), source: base.source, costPerAnswer: base.usd, answersAvg, answersMax, costAvg, costMax, netFactor,
    breakEven: costAvg / netFactor, breakEvenWorst: costMax / netFactor, recommended: costAvg / ((1 - p.targetMargin) * netFactor), rows };
}

export const allPlansEconomics = (p: EconParams = DEFAULT_PARAMS): PlanEcon[] => (['plus', 'pro'] as const).map((id) => planEconomics(PLANS[id], p));
