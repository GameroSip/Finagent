import { describe, expect, it } from 'vitest';
import { FREE_FOREVER, planMultiplier, planPitch } from '../src/planPitch';
import type { PlanEntry } from '../src/server';
import { DISMISS_HARD, DISMISS_SOFT, EMPTY, MAX_PER_30D, decideUpsell, type UpsellState } from '../src/upsell';

const DAY = 86_400_000, NOW = Date.parse('2026-10-21T12:00:00Z');
const S = (o: Partial<UpsellState> = {}): UpsellState => ({ ...EMPTY, ...o });
const entry = (o: Partial<PlanEntry>): PlanEntry => ({ id: 'x', label: 'X', modelLabel: 'Modelo X', dailyLimit: 3, monthlyLimit: 90, available: true, blurb: '', deepModelLabel: null, deepMonthlyLimit: 0, ...o });
const FREE = entry({ id: 'free', label: 'Gratis', modelLabel: 'Gemini 3.5 Flash-Lite', dailyLimit: 3 });

describe('lo que se promete de cada plan sale de sus límites reales', () => {
  it('el multiplicador se redondea hacia abajo: 10 por día contra 3 es 3x, no 3,3x ni 4x; 30 contra 3 es 10x', () => {
    expect(planMultiplier({ dailyLimit: 10 }, { dailyLimit: 3 })).toBe(3);
    expect(planMultiplier({ dailyLimit: 30 }, { dailyLimit: 3 })).toBe(10);
    expect(planMultiplier({ dailyLimit: 29 }, { dailyLimit: 3 })).toBe(9);          // nunca se infla
    expect(planMultiplier({ dailyLimit: 2 }, { dailyLimit: 3 })).toBe(1);
  });
  it('si cambian los límites, el mensaje cambia solo (no hay un "10x" escrito a mano)', () => {
    const pro = entry({ id: 'pro', label: 'Pro', modelLabel: 'Gemini 3.8 Flash', dailyLimit: 30, deepModelLabel: 'Gemini 3.1 Pro', hasFallback: true });
    expect(planPitch(pro, FREE).headline).toBe('10x más usos que el plan gratuito');
    expect(planPitch({ ...pro, dailyLimit: 45 }, FREE).headline).toBe('15x más usos que el plan gratuito');
    expect(planPitch({ ...pro, dailyLimit: 3 }, FREE).headline).toBe('Más usos que el plan gratuito');   // sin ventaja real, no promete un número
  });
  it('solo enumera ventajas que el plan realmente tiene', () => {
    const plus = entry({ id: 'plus', modelLabel: 'Gemini 3.8 Flash', dailyLimit: 10, hasFallback: true }), pro = entry({ id: 'pro', modelLabel: 'Gemini 3.8 Flash', dailyLimit: 30, deepModelLabel: 'Gemini 3.1 Pro', hasFallback: true });
    expect(planPitch(plus, FREE).benefits).toEqual(['Un modelo más potente: Gemini 3.8 Flash', 'Respaldo automático si el modelo principal está saturado', 'Sin recordatorios de planes']);
    expect(planPitch(pro, FREE).benefits).toContain('Análisis profundo con Gemini 3.1 Pro');
    expect(planPitch(plus, FREE).benefits.join()).not.toMatch(/profundo/);                     // Plus no tiene análisis profundo
    expect(planPitch({ ...plus, modelLabel: FREE.modelLabel, hasFallback: false }, FREE).benefits.join()).not.toMatch(/más potente|Respaldo/);   // mismo modelo: no dice "más potente"
  });
  it('lo que sigue gratis son funciones que existen hoy', () => {
    expect(FREE_FOREVER.length).toBeGreaterThanOrEqual(5);
    expect(FREE_FOREVER.join(' ')).toMatch(/Fibonacci/);
  });
});

describe('cuándo se recuerdan los planes (sin molestar)', () => {
  it('nunca a quien ya paga un plan', () => {
    expect(decideUpsell(S({ answers: 50 }), { planId: 'plus', trigger: 'low-quota', remaining: 1 }, NOW).why).toBe('plan-de-pago');
    expect(decideUpsell(S({ answers: 50 }), { planId: 'pro', trigger: 'weekly' }, NOW).show).toBe(false);
  });
  it('no antes de que la persona haya usado la app (al menos 2 respuestas para el aviso de poco cupo)', () => {
    expect(decideUpsell(S({ answers: 1 }), { planId: 'free', trigger: 'low-quota', remaining: 1 }, NOW).show).toBe(false);
    expect(decideUpsell(S({ answers: 2 }), { planId: 'free', trigger: 'low-quota', remaining: 1 }, NOW)).toEqual({ show: true, why: 'poco-cupo' });
  });
  it('el aviso de poco cupo solo aparece cuando queda 1 conversación (o ninguna), no antes', () => {
    expect(decideUpsell(S({ answers: 5 }), { planId: 'free', trigger: 'low-quota', remaining: 2 }, NOW).show).toBe(false);
    expect(decideUpsell(S({ answers: 5 }), { planId: 'free', trigger: 'low-quota', remaining: 0 }, NOW).show).toBe(true);
  });
  it('como mucho uno cada 24 horas', () => {
    expect(decideUpsell(S({ answers: 5, lastShown: NOW - 3_600_000 }), { planId: 'free', trigger: 'low-quota', remaining: 1 }, NOW).why).toBe('muy-pronto');
    expect(decideUpsell(S({ answers: 5, lastShown: NOW - DAY - 1 }), { planId: 'free', trigger: 'low-quota', remaining: 1 }, NOW).show).toBe(true);
  });
  it('el recordatorio semanal necesita 3 respuestas y 7 días desde el último', () => {
    expect(decideUpsell(S({ answers: 2 }), { planId: 'free', trigger: 'weekly' }, NOW).show).toBe(false);
    expect(decideUpsell(S({ answers: 5, lastShown: NOW - 3 * DAY }), { planId: 'free', trigger: 'weekly' }, NOW).show).toBe(false);
    expect(decideUpsell(S({ answers: 5, lastShown: NOW - 8 * DAY }), { planId: 'free', trigger: 'weekly' }, NOW).show).toBe(true);
  });
  it('descartar lo silencia (7 días con "Ahora no", 90 con "No mostrar más")', () => {
    const base = { answers: 9, lastShown: NOW - 30 * DAY };
    expect(decideUpsell(S({ ...base, dismissedUntil: NOW + DISMISS_SOFT }), { planId: 'free', trigger: 'weekly' }, NOW).why).toBe('descartado');
    expect(decideUpsell(S({ ...base, dismissedUntil: NOW + DISMISS_SOFT }), { planId: 'free', trigger: 'weekly' }, NOW + DISMISS_SOFT + 1).show).toBe(true);
    expect(decideUpsell(S({ ...base, dismissedUntil: NOW + DISMISS_HARD }), { planId: 'free', trigger: 'weekly' }, NOW + 60 * DAY).show).toBe(false);
  });
  it('tope de 6 por mes aunque pase el tiempo mínimo', () => {
    const shown = Array.from({ length: MAX_PER_30D }, (_, i) => NOW - (2 + i * 4) * DAY);
    expect(decideUpsell(S({ answers: 9, lastShown: shown[0], shownAt: shown }), { planId: 'free', trigger: 'low-quota', remaining: 1 }, NOW).why).toBe('tope-mensual');
  });
});
