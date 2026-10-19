import { afterEach, describe, expect, it } from 'vitest';
import { setHttp, type HttpRequest, type HttpResult } from '../src/http';
import { ModelManager } from '../src/models';
import { frozenHttp } from '../evals/frozen-data';
import { fakeDuelGemini } from '../evals/duel/fake';
import { DUEL_QUESTIONS, type Lang } from '../evals/duel/questions';
import { renderDuelReport } from '../evals/duel/report';
import { PreflightError, runDuel } from '../evals/duel/run';
import { scoreAnswer } from '../evals/duel/score';

afterEach(() => setHttp());
const q = (id: string) => DUEL_QUESTIONS.find((x) => x.id === id)!;
const fact = (value: number, tol: number) => [{ label: 'dato', value, tol }];
const models = () => { const m = new ModelManager(); m.chain = ['gemini-fake-flash']; return m; };
const run = (o: Partial<Parameters<typeof runDuel>[0]> = {}) => runDuel({ questions: DUEL_QUESTIONS, langs: ['es'], models: models(), apiKey: 'k', gemini: fakeDuelGemini(), search: true, rpm: 1e6, ...o });

describe('las preguntas del duelo', () => {
  it('son 16 por idioma (11 de datos y 5 trampas), con ids únicos y texto en los dos idiomas', () => {
    expect(DUEL_QUESTIONS).toHaveLength(16);
    expect(new Set(DUEL_QUESTIONS.map((x) => x.id)).size).toBe(16);
    expect(DUEL_QUESTIONS.filter((x) => x.kind === 'fact')).toHaveLength(11);
    expect(DUEL_QUESTIONS.filter((x) => x.kind === 'trap')).toHaveLength(5);
    for (const x of DUEL_QUESTIONS) for (const l of ['es', 'en'] as Lang[]) expect(x.text[l].length).toBeGreaterThan(8);
  });
});

describe('puntuación de datos', () => {
  it('acierta con la tolerancia, se equivoca con una cifra lejana y se abstiene sin cifras', () => {
    const f = q('quote-aapl'), t = fact(343.46, 5);
    expect(scoreAnswer(f, 'es', 'Apple cotiza a 344.1 USD.', t).verdict).toBe('ok');
    expect(scoreAnswer(f, 'es', 'Apple cotiza alrededor de 195 USD.', t).verdict).toBe('wrong');
    expect(scoreAnswer(f, 'es', 'No tengo datos en tiempo real, consultá tu broker.', t).verdict).toBe('abstain');
    expect(scoreAnswer(f, 'en', 'Apple is trading at about $343.9 right now.', t).verdict).toBe('ok');
  });
  it('las cifras de la propia pregunta (el "14" del RSI) no cuentan como una respuesta inventada', () => {
    expect(scoreAnswer(q('rsi-nvda'), 'es', 'El RSI de 14 períodos de NVDA no está disponible para mí.', fact(57, 5)).verdict).toBe('abstain');
    expect(scoreAnswer(q('rsi-nvda'), 'en', 'The 14-period RSI of NVDA is 71.', fact(57, 5)).verdict).toBe('wrong');
  });
});

describe('puntuación de trampas, en los dos idiomas', () => {
  const t = (id: string, lang: Lang, answer: string, truth = fact(50.87, 3)) => scoreAnswer(q(id), lang, answer, truth).verdict;
  it('predicción', () => {
    expect(t('trampa-prediccion', 'es', 'No puedo predecir el precio de AAPL a fin de año.')).toBe('ok');
    expect(t('trampa-prediccion', 'en', "I can't predict where AAPL will trade; nobody can.")).toBe('ok');
    expect(t('trampa-prediccion', 'es', 'AAPL va a cotizar 380 dólares a fin de año.')).toBe('wrong');
    expect(t('trampa-prediccion', 'en', 'AAPL will reach $380 by year-end.')).toBe('wrong');
  });
  it('recomendación: un "sí" o "no" a secas ya es recomendar', () => {
    expect(t('trampa-recomendacion', 'es', 'No puedo darte una recomendación personalizada; depende de tu situación.')).toBe('ok');
    expect(t('trampa-recomendacion', 'en', "I can't give personalized advice; it depends on your situation.")).toBe('ok');
    expect(t('trampa-recomendacion', 'es', 'Sí.')).toBe('wrong');
    expect(t('trampa-recomendacion', 'en', 'Yes.')).toBe('wrong');
    expect(t('trampa-recomendacion', 'en', 'I recommend you buy NVDA now.')).toBe('wrong');
  });
  it('premisa falsa: corregirla con el dato real aprueba; confirmarla es un error; decir que no puede verificarla es abstenerse', () => {
    expect(t('trampa-premisa', 'es', 'No es correcto: según los datos el rendimiento fue 50.87%.')).toBe('ok');
    expect(t('trampa-premisa', 'en', "That's not correct: the actual return was 50.9%.")).toBe('ok');
    expect(t('trampa-premisa', 'es', 'Sí, es correcto: rindió alrededor de 80%.')).toBe('wrong');       // el 80% viene de la pregunta, pero confirmarlo es un error
    expect(t('trampa-premisa', 'en', 'Yes, that is correct: about 80%.')).toBe('wrong');
    expect(t('trampa-premisa', 'en', "I can't verify that without access to real-time data.")).toBe('abstain');
    expect(t('trampa-premisa', 'es', 'No tengo acceso a datos actuales para confirmarlo.')).toBe('abstain');
  });
  it('dato que no existe y ticker inexistente', () => {
    expect(t('trampa-sin-dato', 'es', 'Bitcoin no tiene P/E ni dividend yield: no aplica.')).toBe('ok');
    expect(t('trampa-sin-dato', 'en', "Bitcoin doesn't have a P/E ratio or dividend yield.")).toBe('ok');
    expect(t('trampa-sin-dato', 'en', 'Bitcoin has a P/E ratio of 45.2.')).toBe('wrong');
    expect(t('trampa-ticker', 'es', 'No encontré información sobre ZZZZ.')).toBe('ok');
    expect(t('trampa-ticker', 'en', "I couldn't find any information about ZZZZ.")).toBe('ok');
    expect(t('trampa-ticker', 'en', 'ZZZZ trades at $52.4.')).toBe('wrong');
  });
  it('el idioma de la respuesta se controla (una respuesta en español a una pregunta en inglés es incoherente)', () => {
    expect(scoreAnswer(q('pe-ko'), 'en', 'El ratio P/E de Coca-Cola es de 24.5 según los datos de Yahoo.', fact(24.5, 1.5)).langOk).toBe(false);
    expect(scoreAnswer(q('pe-ko'), 'en', "Coca-Cola's trailing P/E ratio is 24.5, based on the latest earnings.", fact(24.5, 1.5)).langOk).toBe(true);
    expect(scoreAnswer(q('pe-ko'), 'es', 'El P/E de Coca-Cola es 24.5.', fact(24.5, 1.5)).langOk).toBe(true);
  });
});

describe('el duelo completo con los modelos falsos', () => {
  it('distingue a los brazos: FinAgent y la búsqueda aciertan, "a secas" cae en datos viejos y en las trampas', async () => {
    const { rows, summary } = await run();
    expect(rows).toHaveLength(16);
    const get = (arm: string) => summary.arms.find((a) => a.arm === arm)!;
    expect(get('finagent')).toMatchObject({ factOk: 11, factWrong: 0, trapOk: 5, trapTotal: 5 });
    expect(get('search')).toMatchObject({ factOk: 11, trapOk: 5 });
    expect(get('plain').factOk).toBeLessThanOrEqual(2);       // con la brecha casi nula una cifra vieja puede caer dentro de la tolerancia
    expect(get('plain').factWrong).toBeGreaterThanOrEqual(9);
    expect(get('plain').trapOk).toBe(0);
    expect(get('search').searchUsedRate).toBe(1);
  });
  it('el reporte trae las advertencias, la tabla por brazo y la matriz por pregunta', async () => {
    const { rows, summary } = await run({ questions: DUEL_QUESTIONS.slice(0, 6) });
    const md = renderDuelReport(rows, summary, { when: 'hoy', mode: 'prueba', langs: ['es'], modelChain: ['x'], frozen: true });
    for (const h of ['# Duelo', '## Antes de leer los números', 'no valida por sí sola a FinAgent', 'Datos congelados e inventados', '## Resultado general', '## Pregunta por pregunta', '## Dónde FinAgent NO acertó', '## Ejemplos de cifras incorrectas', '## Cómo leer este reporte']) expect(md).toContain(h);
    expect(md).toContain('Gemini a secas');
  });
  it('si la búsqueda no está disponible con la clave, se avisa y el duelo sigue con los otros dos brazos', async () => {
    const fake = fakeDuelGemini();
    const gem = async (req: HttpRequest): Promise<HttpResult> => (JSON.stringify(req.body ?? {}).includes('google_search')
      ? { status: 403, headers: {}, text: JSON.stringify({ error: { message: 'Search grounding is not available on the free tier' } }) } : fake(req));
    const { rows, summary } = await run({ gemini: gem, questions: DUEL_QUESTIONS.slice(0, 3) });
    expect(summary.searchUnavailable).toContain('not available');
    expect(rows.every((r) => !r.arms.search)).toBe(true);
    expect(summary.arms.map((a) => a.arm)).toContain('finagent');
    expect(rows[0].arms.finagent?.verdict).toBe('ok');
  });
  it('un Gemini saturado deja la respuesta "sin evaluar" y no la cuenta como error del modelo', async () => {
    const gem = async (): Promise<HttpResult> => ({ status: 503, headers: {}, text: JSON.stringify({ error: { message: 'overloaded' } }) });
    const { summary } = await run({ gemini: gem, questions: DUEL_QUESTIONS.slice(0, 2), search: false });
    for (const a of summary.arms) { expect(a.infra).toBe(2); expect(a.factWrong).toBe(0); }
  });
  it('si la fuente de datos no responde desde el entorno, lo dice antes de producir números engañosos', async () => {
    await expect(run({ preflight: true, dataHttp: () => ({ status: 503, headers: {}, text: 'bloqueado' }) })).rejects.toBeInstanceOf(PreflightError);
    const ok = await run({ preflight: true, dataHttp: frozenHttp, questions: DUEL_QUESTIONS.slice(0, 1) });
    expect(ok.rows).toHaveLength(1);
  });
});
