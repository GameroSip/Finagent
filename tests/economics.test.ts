import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, DEFAULT_TOKENS, PRICE_POINTS, allPlansEconomics, costPerAnswer, planEconomics, type EconParams } from '../src/economics';
import { PLANS } from '../src/plans';
import { PRICES } from '../src/pricing';

const P = (o: Partial<EconParams> = {}): EconParams => ({ ...DEFAULT_PARAMS, now: new Date('2026-10-21T12:00:00Z'), ...o });

describe('costo de una respuesta', () => {
  it('con los tokens medidos y el precio oficial de cada modelo (USD por millón)', () => {
    expect(costPerAnswer('gemini-3.5-flash-lite', P()).usd).toBeCloseTo(8475 * 0.3 / 1e6 + 354 * 2.5 / 1e6, 10);   // 0,0034275
    expect(costPerAnswer('gemini-3.8-flash', P()).usd).toBeCloseTo(8475 * 0.75 / 1e6 + 354 * 3.75 / 1e6, 10);     // 0,00768375
    expect(costPerAnswer('gemini-3.1-pro-preview', P()).usd).toBeCloseTo(8475 * 2 / 1e6 + 354 * 12 / 1e6, 10);     // 0,021198
  });
  it('el 3.8 Flash duplica su precio el 1 de enero de 2027 y el cálculo lo toma de la fecha', () => {
    const antes = costPerAnswer('gemini-3.8-flash', P({ now: new Date('2026-12-31T00:00:00Z') })).usd;
    const despues = costPerAnswer('gemini-3.8-flash', P({ now: new Date('2027-01-02T00:00:00Z') })).usd;
    expect(despues / antes).toBeCloseTo(2, 10);
  });
  it('si el servidor ya midió el costo real de un modelo, usa ese y lo marca como medido', () => {
    const c = costPerAnswer('gemini-3.8-flash', P({ measured: { 'gemini-3.8-flash': 0.0123 } }));
    expect(c).toEqual({ usd: 0.0123, source: 'measured' });
    expect(costPerAnswer('gemini-3.8-flash', P()).source).toBe('estimated');
  });
  it('todos los modelos que usan los planes tienen precio oficial cargado (si no, el cálculo fallaría en el panel)', () => {
    for (const pl of Object.values(PLANS)) for (const m of [pl.model, pl.deepModel, ...pl.fallbacks]) if (m) expect(PRICES[m], m).toBeDefined();
  });
});

describe('economía del plan', () => {
  it('Plus con uso moderado (15 días al mes, 40% del cupo): números verificables a mano', () => {
    const e = planEconomics(PLANS.plus, P());
    expect(e.answersAvg).toBeCloseTo(10 * 15 * 0.4, 10);        // 60 respuestas
    expect(e.answersMax).toBe(300);
    expect(e.costAvg).toBeCloseTo(60 * 0.00768375, 8);          // USD 0,461
    expect(e.costMax).toBeCloseTo(300 * 0.00768375, 8);         // USD 2,305
    expect(e.netFactor).toBeCloseTo(0.85, 10);
    expect(e.breakEven).toBeCloseTo(0.461025 / 0.85, 8);
    const r499 = e.rows.find((r) => r.price === 4.99)!;
    expect(r499.net).toBeCloseTo(4.99 * 0.85, 10);
    expect(r499.marginAvg).toBeCloseTo((4.2415 - 0.461025) / 4.2415, 6);
    expect(r499.marginWorst).toBeCloseTo((4.2415 - 2.305125) / 4.2415, 6);
  });
  it('en el punto de equilibrio no ganás ni perdés, y en el precio recomendado ganás exactamente el margen elegido', () => {
    for (const id of ['plus', 'pro'] as const) {
      const p = P({ targetMargin: 0.65, taxRate: 0.21, fixedPerUserMonth: 0.3 }), e = planEconomics(PLANS[id], p, [1]);
      const net = (price: number) => (price * (1 - p.playFee)) / (1 + p.taxRate);
      expect((net(e.breakEven) - e.costAvg) / net(e.breakEven)).toBeCloseTo(0, 10);
      expect((net(e.recommended) - e.costAvg) / net(e.recommended)).toBeCloseTo(0.65, 10);
      expect(e.breakEvenWorst).toBeGreaterThan(e.breakEven);
    }
  });
  it('más comisión, más impuestos o más uso siempre piden un precio mayor (nunca al revés)', () => {
    const base = planEconomics(PLANS.pro, P()).recommended;
    expect(planEconomics(PLANS.pro, P({ playFee: 0.3 })).recommended).toBeGreaterThan(base);
    expect(planEconomics(PLANS.pro, P({ taxRate: 0.21 })).recommended).toBeGreaterThan(base);
    expect(planEconomics(PLANS.pro, P({ utilization: 0.8 })).recommended).toBeGreaterThan(base);
    expect(planEconomics(PLANS.pro, P({ targetMargin: 0.8 })).recommended).toBeGreaterThan(base);
  });
  it('el plan Pro suma el sobrecosto de sus análisis profundos y el Plus no tiene ninguno', () => {
    const pro = planEconomics(PLANS.pro, P(), [1]), noDeep = planEconomics({ ...PLANS.pro, deepModel: undefined, deepMonthlyLimit: 0 }, P(), [1]);
    expect(pro.costMax - noDeep.costMax).toBeCloseTo(30 * (0.021198 - 0.00768375), 8);
    expect(pro.costAvg - noDeep.costAvg).toBeCloseTo(30 * 0.4 * (0.021198 - 0.00768375), 8);
  });
  it('trae una tabla de precios para comparar y ambos planes de pago', () => {
    const all = allPlansEconomics(P());
    expect(all.map((e) => e.plan)).toEqual(['plus', 'pro']);
    expect(all[0].rows.map((r) => r.price)).toEqual(PRICE_POINTS);
    expect(DEFAULT_TOKENS.input).toBe(8475);
  });
});
