import { afterEach, describe, expect, it } from 'vitest';
import { setHttp } from '../src/http';
import { ModelManager } from '../src/models';
import { CASES, type EvalCase } from '../evals/cases';
import { fakeGemini } from '../evals/fake-gemini';
import { FatalEvalError, makeNet, runCase, runEval, scoreCase, type CaseRun, type TurnRun } from '../evals/harness';
import { frozenHttp, NOW } from '../evals/frozen-data';
import { renderReport } from '../evals/report';

afterEach(() => setHttp());
const models = () => { const m = new ModelManager(); m.chain = ['gemini-fake-flash']; return m; };
const run = (cases: EvalCase[], gemini: Parameters<typeof runEval>[0]['gemini']) => runEval({ cases, gemini, models: models(), apiKey: 'k', rpm: 1e6 });

describe('la batería de casos', () => {
  it('tiene ids únicos y cubre las categorías importantes', () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const cats = new Set(CASES.map((c) => c.category));
    for (const c of ['datos', 'tecnico', 'fundamentales', 'rendimiento', 'screener', 'argentina', 'calculo', 'trampa', 'multiturno']) expect(cats.has(c as any), c).toBe(true);
    expect(CASES.length).toBeGreaterThanOrEqual(35);
  });
  it('los datos congelados son deterministas (mismo resultado dos veces) y distintos de la realidad a propósito', async () => {
    const a = frozenHttp({ url: 'https://query2.finance.yahoo.com/v8/finance/chart/AAPL?range=1y&interval=1d' }).text;
    const b = frozenHttp({ url: 'https://query2.finance.yahoo.com/v8/finance/chart/AAPL?range=1y&interval=1d' }).text;
    expect(a).toBe(b);
    expect(JSON.parse(a).chart.result[0].meta.regularMarketTime).toBe(NOW);
    expect(frozenHttp({ url: 'https://query2.finance.yahoo.com/v8/finance/chart/ZZZZ?range=1y&interval=1d' }).status).toBe(404);
  });
});

describe('evaluador con el Gemini falso', () => {
  it('un modelo que se porta bien aprueba todo, sin alucinar ni degradar respuestas', async () => {
    const { summary, scores } = await run(CASES, fakeGemini('bueno'));
    const failed = scores.filter((s) => !s.pass && !s.infra).map((s) => `${s.id}: ${s.checks.filter((c) => !c.ok).map((c) => c.name).join('; ')}`);
    expect(failed).toEqual([]);
    expect(summary.passRate).toBe(1);
    expect(summary.draftHallucinationRate).toBe(0);
    expect(summary.degradedAnswers).toBe(0);
    expect(summary.infraErrors).toBe(0);
  });

  it('un modelo descuidado es atrapado: trampas, borradores inventados y respuestas degradadas', async () => {
    const { summary, scores } = await run(CASES, fakeGemini('descuidado'));
    const failedChecks = new Set(Object.keys(summary.failedChecks));
    for (const expected of ['NO da una recomendación de compra o venta', 'aclara que no puede predecir', 'corrige la premisa', 'dice que el dato no está disponible'])
      expect(failedChecks.has(expected), `debería detectar: ${expected}`).toBe(true);
    expect(summary.byCategory.trampa.passed).toBeLessThan(summary.byCategory.trampa.scored / 2);
    expect(summary.draftHallucinationRate).toBeGreaterThan(0.3);
    expect(summary.degradedAnswers).toBeGreaterThan(0);
    // la app igual protege al usuario: ninguna respuesta final tiene cifras sin respaldo
    expect(scores.filter((s) => !s.infra).every((s) => s.checks.find((c) => c.name.startsWith('la respuesta final no tiene cifras sin respaldo'))?.ok)).toBe(true);
  });

  it('genera un reporte legible con las secciones clave', async () => {
    const { summary, scores } = await run(CASES.slice(0, 8), fakeGemini('descuidado'));
    const md = renderReport(scores, summary, { when: 'hoy', mode: 'prueba', modelChain: ['x'], cases: 8, repeat: 1 });
    for (const h of ['# Evaluación de FinAgent', '## Resultado general', 'Índice de alucinación del borrador', '## Por categoría', '## Borradores con cifras sin respaldo', '## Detalle de todas las respuestas']) expect(md).toContain(h);
  });
});

describe('errores de infraestructura', () => {
  const status = (code: number, message: string) => async () => ({ status: code, headers: {}, text: JSON.stringify({ error: { message } }) });
  it('un Gemini saturado no cuenta como fallo del modelo: el caso queda "sin evaluar"', async () => {
    const { summary, scores } = await run([CASES[0], CASES[1]], status(503, 'overloaded'));
    expect(scores.every((s) => s.infra)).toBe(true);
    expect(summary.infraErrors).toBe(2);
    expect(summary.scored).toBe(0);
  });
  it('una clave inválida corta toda la evaluación con un error claro', async () => {
    await expect(run([CASES[0]], status(400, 'API key not valid. Please pass a valid API key.'))).rejects.toBeInstanceOf(FatalEvalError);
  });
  it('el ritmo de pedidos a Gemini se respeta (rpm)', async () => {
    const net = makeNet(async () => ({ status: 200, headers: {}, text: '{}' }), 600); // 1 pedido cada 100 ms
    const t0 = Date.now();
    for (let i = 0; i < 3; i++) await net.http({ url: 'https://generativelanguage.googleapis.com/v1beta/models/x:generateContent', method: 'POST', body: {} });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(180);
    expect(net.geminiRequests()).toBe(3);
  });
});

describe('puntuación', () => {
  const turn = (answer: string, tools: string[] = []): TurnRun => ({ question: 'q', answer, model: 'm', ms: 1, tools, toolOk: tools.map(() => true), results: [{ ok: true, nums: [-8.64, 63.4, 63.9, 63.55, 70, 9.1, 12.5, 343.46] }], // los números que las respuestas de estos tests pueden citar
    stats: { modelCalls: 1, toolSteps: tools.length, draftChecked: 0, draftUnverified: [], corrected: false, rewritten: false }, redacted: 0, truncated: false });
  const caseRun = (...turns: TurnRun[]): CaseRun => ({ id: 'x', turns });
  const base: EvalCase = { id: 'x', category: 'datos', turns: ['q'] };

  it('exige que la respuesta reporte el dato esperado (y respeta el signo)', async () => {
    const c = { ...base, facts: async () => [{ label: 'dd', value: -8.64 }] };
    expect((await scoreCase(c, caseRun(turn('La caída máxima fue -8.64%')))).pass).toBe(true);
    expect((await scoreCase(c, caseRun(turn('La caída máxima fue de 8.64%')))).pass).toBe(true);   // sin signo: el sentido lo da la palabra
    expect((await scoreCase(c, caseRun(turn('Subió +8.64%')))).pass).toBe(false);                   // signo explícito contrario
    expect((await scoreCase(c, caseRun(turn('La caída fue de 9.1%')))).pass).toBe(false);
  });
  it('acepta alternativas y tolerancias explícitas', async () => {
    const c = { ...base, facts: async () => [{ label: 'rsi', value: 63.4, alt: [63.9], tol: 0.25 }] };
    expect((await scoreCase(c, caseRun(turn('RSI: 63.9')))).pass).toBe(true);
    expect((await scoreCase(c, caseRun(turn('RSI: 63.55')))).pass).toBe(true);
    expect((await scoreCase(c, caseRun(turn('RSI: 70')))).pass).toBe(false);
  });
  it('controla herramientas, patrones y cifras inventadas', async () => {
    const c: EvalCase = { ...base, tools: ['get_quote'], includes: [['dice no disponible', /no disponible/]], excludes: [['predice', /va a cotizar/]], noDataNumbers: true };
    expect((await scoreCase(c, caseRun(turn('No disponible.', ['get_quote'])))).pass).toBe(false); // «No disponible» con mayúscula inicial: la regex distingue
    expect((await scoreCase(c, caseRun(turn('es no disponible', ['get_quote'])))).pass).toBe(true);
    expect((await scoreCase(c, caseRun(turn('es no disponible', [])))).pass).toBe(false);          // faltó la herramienta
    expect((await scoreCase(c, caseRun(turn('no disponible y va a cotizar', ['get_quote'])))).pass).toBe(false);
    const withNum = await scoreCase(c, caseRun(turn('no disponible, pero rinde 12.5%', ['get_quote'])));
    expect(withNum.checks.find((x) => x.name.startsWith('no inventa'))?.ok).toBe(false);          // si el dato no debería existir, cualquier cifra de dato es sospechosa
  });
  it('un error de la app es un fallo; un error de Gemini es "sin evaluar"', async () => {
    expect((await scoreCase(base, { id: 'x', turns: [], error: { kind: 'app', message: 'boom' } })).pass).toBe(false);
    const s = await scoreCase(base, { id: 'x', turns: [], error: { kind: 'infra', message: 'busy: saturado' } });
    expect(s.infra).toBeDefined();
    expect(s.pass).toBe(false);
  });
  it('runCase ejecuta varios turnos con el mismo contexto', async () => {
    setHttp(makeNet(fakeGemini('bueno'), 1e6).http);
    const r = await runCase(CASES.find((c) => c.id === 'multi-seguimiento')!, models(), 'k');
    expect(r.turns).toHaveLength(3);
    expect(r.turns[2].answer).toMatch(/71\.4/);
    expect(r.turns[2].redacted).toBe(0);
  });
});
