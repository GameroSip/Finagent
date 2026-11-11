// Velocidad de respuesta: razonamiento explícito, límite de espera por modelo y marcha atrás si Google rechaza el parámetro.
import { describe, expect, it } from 'vitest';
import { ATTEMPT_TIMEOUT_MS, buildBody, chainFor, ModelRouter, thinkingFor } from '../server/gemini';
import { PLANS } from '../src/plans';

const OK = { status: 200, text: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) };
type Call = { model: string; body: any; timeoutMs?: number };
function mk(handler: (c: Call, n: number) => any) {
  const calls: Call[] = [], clock = { t: 1_000_000 };
  const r = new ModelRouter(async (model, body, timeoutMs) => { const c = { model, body, timeoutMs }; calls.push(c); const out = await handler(c, calls.length); if (out instanceof Error) throw out; return out; }, () => clock.t, async () => {});
  return { r, calls, clock };
}
const timeoutErr = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
const inp = (over: Record<string, unknown> = {}) => ({ chain: chainFor(PLANS.plus), contents: [{ role: 'user', parts: [{ text: 'hola' }] }], withTools: false, thinking: 'low' as const, ...over });
const level = (c: Call) => c.body.generationConfig?.thinkingConfig?.thinkingLevel;

describe('razonamiento explícito (la causa de que el modelo potente tarde)', () => {
  it('a los modelos Flash y Pro se les pide el nivel del plan; a Flash-Lite no se le manda nada (ya es rápido)', () => {
    expect(thinkingFor('gemini-3.8-flash', 'low')).toBe('low'); expect(thinkingFor('gemini-3.8-flash', 'medium')).toBe('medium');
    expect(thinkingFor('gemini-3.5-flash-lite', 'low')).toBeUndefined(); expect(thinkingFor('gemini-3.1-flash-lite-preview', 'high')).toBeUndefined();
    expect(thinkingFor('gemini-3.8-flash', undefined)).toBeUndefined();
  });
  it('Gemini 3.1 Pro no admite "minimal": se usa "low" (así no falla)', () => { expect(thinkingFor('gemini-3.1-pro-preview', 'minimal')).toBe('low'); expect(thinkingFor('gemini-3.1-pro-preview', 'medium')).toBe('medium'); });
  it('el pedido lleva generationConfig.thinkingConfig.thinkingLevel SOLO cuando corresponde (el nombre exacto que documenta Google)', () => {
    expect(buildBody([], false, undefined, 'low').generationConfig).toEqual({ thinkingConfig: { thinkingLevel: 'low' } }); expect('generationConfig' in buildBody([], false)).toBe(false);
  });
  it('los planes piden "low" para chat y "medium" solo para el análisis profundo', () => {
    expect(PLANS.plus.thinking).toBe('low'); expect(PLANS.pro.thinking).toBe('low'); expect(PLANS.pro.deepThinking).toBe('medium'); expect(PLANS.free.thinking).toBe('minimal');
  });
  it('Plus: el modelo potente recibe "low" y el respaldo (Flash-Lite) no recibe ajuste', async () => {
    const { r, calls } = mk((c) => (c.model === 'gemini-3.8-flash' ? { status: 429, text: '{"error":{"message":"quota"}}' } : OK));
    const res = await r.generate(inp()); expect(res.ok).toBe(true);
    expect(calls.map((c) => [c.model, level(c)])).toEqual([['gemini-3.8-flash', 'low'], ['gemini-3.5-flash-lite', undefined]]);
  });
  it('plan gratuito: sin ajuste de razonamiento (su velocidad no cambia)', async () => {
    const { r, calls } = mk(() => OK); await r.generate(inp({ chain: chainFor(PLANS.free), thinking: PLANS.free.thinking }));
    expect(calls).toHaveLength(1); expect('generationConfig' in calls[0].body).toBe(false);
  });
  it('análisis profundo (Pro): pide "medium" al modelo Pro', async () => {
    const { r, calls } = mk(() => OK); await r.generate(inp({ chain: chainFor(PLANS.pro, true), thinking: PLANS.pro.deepThinking, deep: true }));
    expect(calls[0].model).toBe('gemini-3.1-pro-preview'); expect(level(calls[0])).toBe('medium');
  });
});

describe('límite de espera por modelo', () => {
  it('el modelo potente (con respaldo detrás) tiene un límite corto; el último de la cadena, uno largo; el análisis profundo, uno intermedio', async () => {
    let m = mk((c) => (c.model === 'gemini-3.8-flash' ? { status: 429, text: '{}' } : OK)); await m.r.generate(inp());
    expect(m.calls.map((c) => c.timeoutMs)).toEqual([ATTEMPT_TIMEOUT_MS.fast, ATTEMPT_TIMEOUT_MS.last]);
    m = mk(() => OK); await m.r.generate(inp({ chain: chainFor(PLANS.free) })); expect(m.calls[0].timeoutMs).toBe(ATTEMPT_TIMEOUT_MS.last);                     // plan gratuito: no hay a dónde pasar
    m = mk(() => OK); await m.r.generate(inp({ chain: chainFor(PLANS.pro, true), deep: true })); expect(m.calls[0].timeoutMs).toBe(ATTEMPT_TIMEOUT_MS.deep);
    expect(ATTEMPT_TIMEOUT_MS.fast).toBeLessThan(ATTEMPT_TIMEOUT_MS.deep); expect(ATTEMPT_TIMEOUT_MS.deep).toBeLessThan(ATTEMPT_TIMEOUT_MS.last);
  });
  it('si el modelo potente se pasa de tiempo, responde el respaldo SIN reintentar el mismo modelo (no se espera dos veces)', async () => {
    const { r, calls } = mk((c) => (c.model === 'gemini-3.8-flash' ? timeoutErr() : OK));
    const res = await r.generate(inp()); expect(res.ok && res.model).toBe('gemini-3.5-flash-lite');
    expect(calls.filter((c) => c.model === 'gemini-3.8-flash')).toHaveLength(1);
  });
  it('y se lo aparta 30 segundos: el siguiente pedido no vuelve a esperar al modelo lento; después vuelve a probarse', async () => {
    const { r, calls, clock } = mk((c) => (c.model === 'gemini-3.8-flash' ? timeoutErr() : OK));
    await r.generate(inp()); calls.length = 0;
    await r.generate(inp()); expect(calls.map((c) => c.model)).toEqual(['gemini-3.5-flash-lite']);        // salteó al lento
    clock.t += 31_000; calls.length = 0; await r.generate(inp()); expect(calls.map((c) => c.model)).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
  });
  it('si TODOS se pasan de tiempo, avisa "ocupado" en lugar de colgarse', async () => {
    const { r } = mk(() => timeoutErr()); const res = await r.generate(inp()); expect(res.ok).toBe(false); if (!res.ok) { expect(res.status).toBe(503); expect(res.error).toBe('busy'); }
  });
  it('una caída de red común (no es un tiempo de espera) mantiene el reintento corto de antes', async () => {
    const { r, calls } = mk((c, n) => (n === 1 ? { status: 503, text: 'overloaded' } : OK)); const res = await r.generate(inp());
    expect(res.ok && res.model).toBe('gemini-3.8-flash'); expect(calls).toHaveLength(2);
  });
});

describe('si Google no acepta el parámetro de razonamiento para un modelo', () => {
  it('se reintenta ese modelo SIN el parámetro (sin gastar el reintento) y se recuerda para los pedidos siguientes', async () => {
    const { r, calls } = mk((c) => (level(c) ? { status: 400, text: '{"error":{"message":"Thinking level is not supported for this model"}}' } : OK));
    const res = await r.generate(inp()); expect(res.ok && res.model).toBe('gemini-3.8-flash');
    expect(calls.map((c) => level(c))).toEqual(['low', undefined]);
    calls.length = 0; await r.generate(inp()); expect(calls.map((c) => level(c))).toEqual([undefined]);                // ya no lo manda a ese modelo
  });
  it('cualquier otro error 400 NO se reintenta (sigue siendo un pedido inválido)', async () => {
    const { r, calls } = mk(() => ({ status: 400, text: '{"error":{"message":"Invalid JSON payload"}}' })); const res = await r.generate(inp());
    expect(res.ok).toBe(false); if (!res.ok) expect(res.status).toBe(502); expect(calls).toHaveLength(1);
  });
  it('el rechazo del parámetro en un modelo no afecta a los demás', async () => {
    const { r, calls } = mk((c) => (c.model === 'gemini-3.8-flash' && level(c) ? { status: 400, text: 'thinking_level invalid' } : c.model === 'gemini-3.8-flash' ? { status: 429, text: '{}' } : OK));
    await r.generate(inp()); expect(calls.map((c) => c.model)).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite']);
  });
});

import { computeMetrics } from '../server/metrics';
import { cleanEvent } from '../src/telemetry';
import { ADMIN, makeServer } from './helpers/make-server';

describe('de punta a punta: el servidor le pasa a Gemini el nivel de razonamiento de cada plan', () => {
  it('Plus: "low" al modelo potente; Gratis: nada (Flash-Lite); Pro con análisis profundo: "medium" al modelo Pro', async () => {
    const s = await makeServer();
    const plus = await s.session('plus', 'tel-plus-00000001'); expect((await s.ask(plus.token)).status).toBe(200);
    let last = s.seen[s.seen.length - 1]; expect(last.model).toBe('gemini-3.8-flash'); expect(last.body.generationConfig).toEqual({ thinkingConfig: { thinkingLevel: 'low' } });
    const free = await s.session('free', 'tel-free-00000001'); expect((await s.ask(free.token)).status).toBe(200);
    last = s.seen[s.seen.length - 1]; expect(last.model).toBe('gemini-3.5-flash-lite'); expect(last.body.generationConfig).toBeUndefined();
    const pro = await s.session('pro', 'tel-pro-000000001'); expect((await s.ask(pro.token, { deep: true })).status).toBe(200);
    last = s.seen[s.seen.length - 1]; expect(last.model).toBe('gemini-3.1-pro-preview'); expect(last.body.generationConfig).toEqual({ thinkingConfig: { thinkingLevel: 'medium' } });
  });
  it('si Gemini no responde a tiempo, el usuario Plus recibe igual su respuesta (del nivel Rápido) y el servidor no se cuelga', async () => {
    const s = await makeServer({ gemini: async (model) => { if (model === 'gemini-3.8-flash') throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); return { status: 200, text: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'respuesta' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }) }; } });
    const plus = await s.session('plus', 'tel-plus-00000002'); const r = await s.ask(plus.token);
    expect(r.status).toBe(200); expect(r.json.model).toBe('gemini-3.5-flash-lite');
  });
});

describe('el panel mide cuánto tarda cada nivel', () => {
  it('el evento "respuesta del asistente" acepta el nivel, solo de la lista cerrada', () => {
    expect(cleanEvent('ai_done', { tools: 'get_quote', ms: 4200, steps: 2, checked: 3, unverified: 0, fixed: false, tier: 'avanzado' })).toMatchObject({ tier: 'avanzado' });
    expect(cleanEvent('ai_done', { ms: 1000, tier: 'gemini-3.8-flash' })).toBeNull();      // nunca el nombre del modelo de Google
  });
  it('mediana y p90 por nivel, sin mezclar niveles y sin inventar datos donde no hay', () => {
    const r = (user_id: string, ms: number, tier?: string) => ({ user_id, day: '2026-11-09', name: 'ai_done', props: JSON.stringify({ ms, ...(tier ? { tier } : {}) }) });
    const m = computeMetrics({ users: 4, consentYes: 4, consentNo: 0, activity: [], firstDay: [], byName: [], feedback: [], rows: [r('a', 2000, 'rapido'), r('b', 4000, 'rapido'), r('c', 9000, 'avanzado'), r('d', 11000, 'avanzado'), r('e', 13000, 'avanzado'), r('f', 7000)] }, '2026-11-10', 14);
    expect(m.ai.latencyByTier.rapido).toMatchObject({ median: 3000, n: 2 }); expect(m.ai.latencyByTier.avanzado).toMatchObject({ median: 11000, n: 3 }); expect(m.ai.latencyByTier.profundo).toBeNull();
    expect(m.ai.latencyMs).toMatchObject({ n: 6 });             // el total sigue contando también las respuestas sin nivel
  });
  it('de punta a punta: el panel entrega la tabla por nivel', async () => {
    const s = await makeServer(), se = await s.session('free', 'tel-nivel-0002'); await s.call('POST', '/v1/consent', { token: se.token, body: { analytics: true } });
    await s.call('POST', '/v1/events', { token: se.token, body: { events: [{ n: 'ai_done', p: { ms: 3500, tier: 'rapido', tools: '' } }] } });
    const m = (await s.call('GET', '/v1/admin/metrics', { token: ADMIN })).json; expect(m.ai.latencyByTier.rapido).toMatchObject({ median: 3500, n: 1 });
  });
});
