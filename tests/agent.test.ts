import { beforeEach, describe, expect, it } from 'vitest';
import { FinancialAgent, flattenContents, MAX_STEPS } from '../src/agent';
import { HttpRequest, HttpResult, setHttp } from '../src/http';
import { GeminiError, ModelManager, modelLabel } from '../src/models';
import { clearCache } from '../src/tools';

beforeEach(() => { clearCache(); });

// ------------------------------------------------------------------ descubrimiento y orden de modelos
const NAMES = [
  'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-pro',
  // variantes que NO sirven para este caso:
  'gemini-3.1-flash-image', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-live-preview', 'gemini-embedding-001', 'gemma-3-27b-it',
];
const listing = (names = NAMES) => ({ models: names.map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) });
const json = (status: number, body: unknown): HttpResult => ({ status, headers: {}, text: JSON.stringify(body) });

describe('selección automática de modelos', () => {
  it('ordena por calidad y descarta variantes inútiles', async () => {
    let hits = 0;
    setHttp(async (req) => { hits++; expect(req.headers?.['x-goog-api-key']).toBe('KEY'); return json(200, listing()); });
    const m = new ModelManager();
    const chain = await m.discover('KEY', true);
    expect(chain).toEqual([
      'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3-flash-preview',
      'gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest',
    ]);
    await m.discover('KEY');            // dentro de las 12 h: no vuelve a consultar
    expect(hits).toBe(1);
    await m.discover('KEY', true);      // forzado: sí
    expect(hits).toBe(2);
  });

  it('descarta modelos que no son de chat (texto a voz, audio, imagen) aunque su nombre diga "preview"', async () => {
    const names = ['gemini-3.2-flash', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-preview-native-audio-dialog', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-preview-09-2025'];
    setHttp(async () => json(200, listing(names)));
    const chain = await new ModelManager().discover('KEY', true);
    expect(chain).toEqual(['gemini-3.2-flash', 'gemini-2.5-flash-preview-09-2025', 'gemini-flash-latest']);   // las versiones con fecha sí son de chat
  });

  it('pagina el listado', async () => {
    const pages = [{ ...listing(['gemini-3.2-flash']), nextPageToken: 'p2' }, listing(['gemini-3.9-flash'])];
    let i = 0;
    setHttp(async (req) => { if (i === 1) expect(req.url).toContain('pageToken=p2'); return json(200, pages[i++]); });
    expect((await new ModelManager().discover('KEY', true))[0]).toBe('gemini-3.9-flash');
  });

  it('clave inválida lanza siempre; la red caída solo en modo estricto', async () => {
    setHttp(async () => json(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }));
    await expect(new ModelManager().discover('mala', true)).rejects.toMatchObject({ kind: 'invalid_key' });
    setHttp(async () => { throw new Error('offline'); });
    const m = new ModelManager();
    expect(await m.discover('KEY', true)).toEqual(['gemini-flash-latest']);            // conserva la cadena
    await expect(m.discover('KEY', true, true)).rejects.toMatchObject({ kind: 'busy' }); // onboarding: avisa
  });

  it('clasifica los errores de Gemini', () => {
    const k = (s: number, msg = '') => new GeminiError(s, msg).kind;
    expect(k(400, 'API key not valid')).toBe('invalid_key');
    expect(k(403, 'API key expired')).toBe('invalid_key');
    expect(k(403, 'Permission denied on model')).toBe('unavailable');
    expect(k(404, 'models/x is not found')).toBe('unavailable');
    expect(k(429, 'Quota exceeded ... limit: 0, model: x')).toBe('unavailable'); // modelo sin cupo gratuito
    expect(k(429, 'Resource exhausted, retry in 20s')).toBe('busy');
    expect(k(503, 'overloaded')).toBe('busy');
    expect(k(400, 'something else')).toBe('other');
  });

  it('descarta, pausa y recupera modelos', () => {
    const m = new ModelManager();
    let t = 1_000_000;
    m.now = () => t;
    m.chain = ['A', 'B', 'C'];
    m.markUnavailable('A');
    m.markCooldown('B');
    expect(m.pick()).toBe('C');
    expect(m.pick(['C'])).toBeNull();
    t += 91_000;                         // terminó la pausa de B, A sigue descartado
    expect(m.pick()).toBe('B');
    t += 25 * 3600_000;                  // 24 h después A vuelve a estar disponible
    expect(m.pick()).toBe('A');
  });

  it('muestra nombres legibles', () => {
    expect(modelLabel('gemini-3.8-flash')).toBe('Gemini 3.8 Flash');
    expect(modelLabel('gemini-3.5-flash-lite')).toBe('Gemini 3.5 Flash-Lite');
    expect(modelLabel('gemini-3.1-pro-preview')).toBe('Gemini 3.1 Pro Preview');
    expect(modelLabel('gemini-flash-latest')).toBe('Gemini Flash');
  });
});

// ------------------------------------------------------------------ agente con Gemini simulado
interface Call { model: string; body: any }
type Responder = (model: string, body: any, n: number) => HttpResult;
function mockGemini(responder: Responder): Call[] {
  const calls: Call[] = [];
  setHttp(async (req: HttpRequest) => {
    const model = decodeURIComponent(/models\/([^:]+):generateContent/.exec(req.url)![1]);
    const body = JSON.parse(JSON.stringify(req.body));
    calls.push({ model, body });
    return responder(model, body, calls.length);
  });
  return calls;
}
const text = (t: string): HttpResult => json(200, { candidates: [{ content: { role: 'model', parts: [{ text: t }] } }] });
const fcall = (expr: string): HttpResult => json(200, { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'calculate', args: { expression: expr } }, thoughtSignature: 'sig-A' }] } }] });
const err = (status: number, message: string): HttpResult => json(status, { error: { message } });
const agentWith = (chain: string[]) => {
  const models = new ModelManager();
  models.chain = chain;
  return { models, agent: new FinancialAgent({ apiKey: 'KEY', models, retryDelayMs: 0 }) };
};

describe('agente', () => {
  it('pasa al siguiente modelo si el primero no tiene cupo y lo recuerda', async () => {
    const calls = mockGemini((m) => (m === 'A' ? err(429, 'Quota exceeded for metric ... limit: 0') : text('Hola.')));
    const { agent } = agentWith(['A', 'B']);
    expect((await agent.ask('hola')).answer).toBe('Hola.');
    expect(calls.map((c) => c.model)).toEqual(['A', 'B']);
    await agent.ask('otra');
    expect(calls.map((c) => c.model)).toEqual(['A', 'B', 'B']);        // A ya no se vuelve a intentar
    expect(agent.model).toBe('B');
  });

  it('ante saturación reintenta, pausa el modelo y usa el siguiente', async () => {
    const calls = mockGemini((m) => (m === 'A' ? err(503, 'The model is overloaded') : text('Listo.')));
    const { agent, models } = agentWith(['A', 'B']);
    expect((await agent.ask('hola')).answer).toBe('Listo.');
    expect(calls.filter((c) => c.model === 'A')).toHaveLength(3);      // 1 intento + 2 reintentos
    expect(models.pick()).toBe('B');                                   // A quedó en pausa, no descartado
  });

  it('al cambiar de modelo aplana las firmas de pensamiento y llamadas a funciones', async () => {
    const calls = mockGemini((m, _b, n) => {
      if (m === 'A' && n === 1) return fcall('2+2');
      if (m === 'A') return err(429, 'Quota exceeded ... limit: 0');
      return text('El resultado es 4.');
    });
    const { agent } = agentWith(['A', 'B']);
    const res = await agent.ask('¿cuánto es 2+2?');
    expect(res.answer).toBe('El resultado es 4.');
    const lastForB = JSON.stringify(calls.at(-1)!.body.contents);
    expect(calls.at(-1)!.model).toBe('B');
    expect(lastForB).not.toContain('functionCall');
    expect(lastForB).not.toContain('thoughtSignature');
    expect(lastForB).toContain('[resultado de calculate');
    expect(res.toolCalls[0].result.result).toBe(4);
  });

  it('una clave inválida corta de inmediato, sin probar otros modelos', async () => {
    const calls = mockGemini(() => err(400, 'API key not valid. Please pass a valid API key.'));
    const { agent } = agentWith(['A', 'B']);
    await expect(agent.ask('hola')).rejects.toMatchObject({ kind: 'invalid_key' });
    expect(calls).toHaveLength(1);
  });

  it('si todos están saturados lo dice con claridad', async () => {
    mockGemini(() => err(503, 'overloaded'));
    const { agent } = agentWith(['A', 'B']);
    await expect(agent.ask('hola')).rejects.toThrow(/saturados/);
  });

  it('verifica cifras y corrige si el modelo inventó alguna', async () => {
    let n = 0;
    mockGemini(() => {
      n++;
      if (n === 1) return fcall('1.1*100');
      if (n === 2) return text('La suba fue de 35.7%.');            // inventada
      return text('La suba fue de 110.');                             // respaldada por calculate
    });
    const { agent } = agentWith(['A']);
    const res = await agent.ask('¿cuánto es 1.1 por 100?');
    expect(res.corrected).toBe(true);
    expect(res.verification.ok).toBe(true);
    expect(res.answer).toContain('110');
  });

  it('al llegar al límite de pasos cierra sin herramientas', async () => {
    const calls = mockGemini((_m, body) => (body.tools ? fcall('1+1') : text('Respuesta parcial.')));
    const { agent } = agentWith(['A']);
    const res = await agent.ask('loop');
    expect(res.truncated).toBe(true);
    expect(res.answer).toBe('Respuesta parcial.');
    expect(calls).toHaveLength(MAX_STEPS + 1);
    expect(calls.at(-1)!.body.tools).toBeUndefined();
  });

  it('exige API key', () => {
    expect(() => new FinancialAgent({ apiKey: '  ', models: new ModelManager() })).toThrow(/API key/);
  });
});

describe('flattenContents', () => {
  it('descarta pensamientos, convierte funciones a texto y fusiona turnos del mismo rol', () => {
    const out = flattenContents([
      { role: 'user', parts: [{ text: 'hola' }] },
      { role: 'model', parts: [{ text: 'pensando', thought: true }, { functionCall: { name: 'calculate', args: { expression: '1+1' } }, thoughtSignature: 'x' }] },
      { role: 'user', parts: [{ functionResponse: { name: 'calculate', response: { result: { ok: true, result: 2 } } } }] },
      { role: 'user', parts: [{ text: 'seguí' }] },
    ]);
    expect(out.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(JSON.stringify(out)).not.toContain('pensando');
    expect(out[2].parts).toHaveLength(2);
  });
});

// ------------------------------------------------------------------ cero cifras sin respaldo
import { verifyAnswer } from '../src/verify';
describe('el usuario nunca ve una cifra sin respaldo', () => {
  it('si el modelo insiste, la cifra se quita del texto (y avisa cuántas)', async () => {
    let n = 0;
    const calls = mockGemini(() => { n++; return n <= 2 ? text('Rinde 24.572% y vol 21.512%.') : text('Rinde 24.572% anual.'); });
    const { agent } = agentWith(['A']);
    const res = await agent.ask('¿cuánto rinde?');
    expect(res.answer).toBe('Rinde [dato no verificado] anual.');
    expect(res.redacted).toBe(1);
    expect(verifyAnswer(res.answer, []).ok).toBe(true);
    expect(calls).toHaveLength(3);                           // borrador, corrección con herramientas, reescritura sin herramientas
    expect(calls[1].body.tools).toBeDefined();
    expect(calls[2].body.tools).toBeUndefined();
    expect(agent.history[0].a).toBe(res.answer);             // el contexto guardado tampoco conserva la cifra inventada
  });

  it('si la reescritura sin esas cifras alcanza, no se quita nada', async () => {
    let n = 0;
    mockGemini(() => { n++; return n <= 2 ? text('Rinde 24.572%.') : text('No tengo ese dato disponible.'); });
    const { agent } = agentWith(['A']);
    const res = await agent.ask('¿cuánto rinde?');
    expect(res.answer).toBe('No tengo ese dato disponible.');
    expect(res.redacted).toBe(0);
    expect(res.corrected).toBe(true);
  });

  it('también cuando la respuesta se corta por el límite de pasos (antes se salteaba la corrección)', async () => {
    const calls = mockGemini((_m, body) => (body.tools ? fcall('1+1') : text('Dato 99.123 sin respaldo.')));
    const { agent } = agentWith(['A']);
    const res = await agent.ask('loop');
    expect(res.truncated).toBe(true);
    expect(res.answer).toBe('Dato [dato no verificado] sin respaldo.');
    expect(res.redacted).toBe(1);
    expect(calls).toHaveLength(MAX_STEPS + 2);               // pasos + cierre + reescritura
  });

  it('las cifras respaldadas por herramientas no se tocan', async () => {
    let n = 0;
    mockGemini(() => { n++; return n === 1 ? fcall('1.1*100') : text('El resultado es 110.'); });
    const { agent } = agentWith(['A']);
    const res = await agent.ask('multiplicá');
    expect(res.answer).toBe('El resultado es 110.');
    expect(res.redacted).toBe(0);
    expect(res.corrected).toBe(false);
  });
});

// ------------------------------------------------------------------ cupo agotado (429): sin reintentos inútiles y respetando a Gemini
import { parseQuota } from '../src/models';
const quota429 = (retryDelay?: string, quotaId = 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', message = 'You exceeded your current quota'): HttpResult =>
  json(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message, details: [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] },
    ...(retryDelay ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] : []) ] } });

describe('cupo agotado (429)', () => {
  it('lee lo que informa Gemini', () => {
    expect(parseQuota(JSON.stringify({ error: { details: [{ retryDelay: '28.5s' }] } }))).toEqual({ retryAfterMs: 28500, daily: false });
    expect(parseQuota(quota429('45s').text)).toEqual({ retryAfterMs: 45000, daily: false });
    expect(parseQuota('{"error":{"details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}').daily).toBe(true);
    expect(parseQuota('Quota exceeded. Please retry in 12.5s.')).toEqual({ retryAfterMs: 12500, daily: false });
    expect(parseQuota('algo que no se reconoce')).toEqual({ retryAfterMs: undefined, daily: false });
    expect(parseQuota('')).toEqual({ retryAfterMs: undefined, daily: false });
  });

  it('pasa de inmediato al siguiente modelo (sin reintentar el mismo) y espera lo que pidió Gemini', async () => {
    let t = 1_000_000;
    const calls = mockGemini((m) => (m === 'A' ? { ...quota429('45s') } : text('Listo.')));
    const { agent, models } = agentWith(['A', 'B']);
    models.now = () => t;
    expect((await agent.ask('hola')).answer).toBe('Listo.');
    expect(calls.filter((c) => c.model === 'A')).toHaveLength(1);        // antes: 3 pedidos rechazados seguidos
    expect(models.pick()).toBe('B');
    t += 44_000; expect(models.pick()).toBe('B');                        // todavía no pasaron los 45 s
    t += 2_000; expect(models.pick()).toBe('A');                         // ya se puede volver al mejor modelo (antes se esperaban 90 s fijos)
  });

  it('si Gemini pide esperar muy poco, espera y reintenta UNA vez el mismo modelo', async () => {
    let n = 0;
    const calls = mockGemini((m) => (m === 'A' && n++ === 0 ? quota429('0.1s') : text('Listo.')));
    const { agent } = agentWith(['A', 'B']);
    const res = await agent.ask('hola');
    expect(res.answer).toBe('Listo.');
    expect(calls.map((c) => c.model)).toEqual(['A', 'A']);
  });

  it('cupo DIARIO agotado: el modelo se aparta hasta cuando Gemini dice que vuelve (6755 s en tu reporte real)', async () => {
    let t = 1_000_000;
    const calls = mockGemini((m) => (m === 'A' ? quota429('6755s', 'GenerateRequestsPerDayPerProjectPerModel-FreeTier') : text('Listo.')));
    const { agent, models } = agentWith(['A', 'B']);
    models.now = () => t;
    await agent.ask('hola');
    expect(calls.filter((c) => c.model === 'A')).toHaveLength(1);
    t += 6_700_000; expect(models.pick()).toBe('B');                     // todavía no pasaron 6755 s
    t += 100_000; expect(models.pick()).toBe('A');                       // ya volvió (antes se lo apartaba 6 h fijas)
  });

  it('cupo diario sin tiempo informado: se aparta 6 horas', async () => {
    let t = 1_000_000;
    mockGemini((m) => (m === 'A' ? quota429(undefined, 'GenerateRequestsPerDayPerProjectPerModel-FreeTier') : text('Listo.')));
    const { agent, models } = agentWith(['A', 'B']);
    models.now = () => t;
    await agent.ask('hola');
    t += 5 * 3600_000; expect(models.pick()).toBe('B');
    t += 2 * 3600_000; expect(models.pick()).toBe('A');
  });

  it('si el aviso no trae detalles, usa el "retry in" del mensaje; si no trae nada, 90 s', async () => {
    let t = 1_000_000;
    mockGemini((m) => (m === 'A' ? err(429, 'Quota exceeded. Please retry in 12.5s.') : text('Listo.')));
    const a = agentWith(['A', 'B']); a.models.now = () => t;
    await a.agent.ask('hola');
    t += 13_000; expect(a.models.pick()).toBe('A');

    t = 1_000_000;
    mockGemini((m) => (m === 'A' ? err(429, 'Resource exhausted') : text('Listo.')));
    const b = agentWith(['A', 'B']); b.models.now = () => t;
    await b.agent.ask('hola');
    t += 89_000; expect(b.models.pick()).toBe('B');
    t += 2_000; expect(b.models.pick()).toBe('A');
  });

  it('la saturación pasajera (503) se sigue reintentando', async () => {
    const calls = mockGemini((m) => (m === 'A' ? err(503, 'The model is overloaded') : text('Listo.')));
    const { agent } = agentWith(['A', 'B']);
    await agent.ask('hola');
    expect(calls.filter((c) => c.model === 'A')).toHaveLength(3);
  });
});


// ------------------------------------------------------------------ idioma: se le indica al modelo (la evaluación real mostró que contestaba en español)
describe('idioma del usuario', () => {
  const HINT = 'write the ENTIRE answer in English';
  const userTexts = (c: Call) => c.body.contents.filter((x: any) => x.role === 'user').map((x: any) => x.parts?.[0]?.text ?? '');

  it('si escribe en inglés, la pregunta, la corrección y la reescritura llevan la indicación (y el historial guarda solo la pregunta)', async () => {
    let n = 0;
    const calls = mockGemini(() => { n++; return n <= 2 ? text('It yields 24.572%.') : text('No data available.'); }); // cifra inventada: fuerza corrección y reescritura
    const { agent } = agentWith(['A']);
    await agent.ask("What is Microsoft's P/E ratio?");
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(userTexts(c).at(-1)).toContain(HINT);
    expect(agent.history[0].q).toBe("What is Microsoft's P/E ratio?");   // sin la indicación
  });

  it('si escribe en español no se agrega nada', async () => {
    const calls = mockGemini(() => text('Listo.'));
    const { agent } = agentWith(['A']);
    await agent.ask('¿Cuál es el P/E de Microsoft?');
    expect(userTexts(calls[0]).at(-1)).toBe('¿Cuál es el P/E de Microsoft?');
  });
});

// ------------------------------------------------------------------ tokens reales por respuesta
describe('medición de tokens', () => {
  const withUsage = (r: HttpResult, u: Record<string, number>): HttpResult => json(200, { ...JSON.parse(r.text), usageMetadata: u });
  it('suma los tokens que informa Gemini en todos los pedidos de una respuesta (entrada, salida, razonamiento, caché)', async () => {
    let n = 0;
    mockGemini(() => (n++ === 0
      ? withUsage(fcall('1+1'), { promptTokenCount: 1000, candidatesTokenCount: 10, cachedContentTokenCount: 600 })
      : withUsage(text('Listo.'), { promptTokenCount: 1500, candidatesTokenCount: 40, thoughtsTokenCount: 120 })));
    const { agent } = agentWith(['A']);
    const r = await agent.ask('cuánto es 1+1');
    expect(r.stats.tokens).toEqual({ input: 2500, output: 50, thoughts: 120, cached: 600 });
    expect(r.stats.modelCalls).toBe(2);
  });
  it('cada respuesta empieza de cero y, si Gemini no informa uso, queda en 0 (no se inventa)', async () => {
    mockGemini(() => text('Listo.'));
    const { agent } = agentWith(['A']);
    expect((await agent.ask('hola')).stats.tokens).toEqual({ input: 0, output: 0, thoughts: 0, cached: 0 });
  });
});

describe('identidad de FinAgent en el prompt', () => {
  it('se presenta como FinAgent, no oculta la tecnología de base y prohíbe afirmar lo que no es cierto', async () => {
    const { SYSTEM_PROMPT } = await import('../src/agent');
    expect(SYSTEM_PROMPT).toMatch(/te llamás FinAgent/);
    expect(SYSTEM_PROMPT).toMatch(/no lo niegues: decí que FinAgent usa modelos Gemini de Google/);
    expect(SYSTEM_PROMPT).toMatch(/NUNCA afirmes que FinAgent entrenó su propio modelo, que tiene licencias de datos, que Google o DeepMind lo respaldan/);
  });
});
