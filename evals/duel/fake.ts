// Gemini FALSO para probar el duelo sin gastar cuota: el agente completo usa el modelo "bueno" de siempre; "a secas" contesta de memoria
// (cifras viejas o inventadas, y cae en las trampas); "búsqueda" acierta casi todo con un pequeño error. Solo sirve para probar el instrumento.
import type { HttpRequest, HttpResult } from '../../src/http';
import { fakeGemini } from '../fake-gemini';
import { DUEL_QUESTIONS, type Lang } from './questions';

const fmt = (x: number) => String(Number(x.toFixed(2)));

export function fakeDuelGemini(): (req: HttpRequest) => Promise<HttpResult> {
  const agent = fakeGemini('bueno');
  const reply = (text: string, grounded = false): HttpResult => ({ status: 200, headers: {}, text: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, ...(grounded ? { groundingMetadata: { webSearchQueries: ['consulta'] } } : {}) }] }) });
  return async (req) => {
    const body = (req.body ?? {}) as { systemInstruction?: any; tools?: any[]; contents?: any[] };
    if (!String(body.systemInstruction?.parts?.[0]?.text ?? '').startsWith('You are a helpful financial assistant')) return agent(req); // el agente completo
    const search = !!body.tools?.some((t) => t.google_search);
    const user = String(body.contents?.at(-1)?.parts?.[0]?.text ?? '');
    const hit = DUEL_QUESTIONS.flatMap((q) => (['es', 'en'] as Lang[]).filter((l) => q.text[l] === user).map((lang) => ({ q, lang }))).at(0);
    if (!hit) return reply('I do not know.');
    const { q, lang } = hit, es = lang === 'es';
    const truth = q.truth ? await q.truth() : [];
    const v = truth[0]?.value ?? 0;
    if (q.kind === 'fact') {
      return search ? reply(es ? `Según una búsqueda reciente, ${fmt(v * 1.004)}.` : `According to a recent search, ${fmt(v * 1.004)}.`, true)
        : reply(es ? `Según mi último dato disponible, ronda ${fmt(v * 0.62)}.` : `As of my last update it was around ${fmt(v * 0.62)}.`);
    }
    const T: Record<string, [string, string, string, string]> = { // [plain es, plain en, search es, search en]
      predict: ['AAPL va a cotizar 380 dólares a fin de año.', 'AAPL will reach $380 by year-end.', 'No puedo predecir el precio de AAPL: nadie puede hacerlo con certeza.', "I can't predict AAPL's price; no one can know it."],
      advice: ['Sí.', 'Yes.', 'No puedo darte una recomendación personalizada: depende de tu situación.', "I can't give personalized advice; it depends on your situation."],
      premise: ['Sí, es correcto: rindió alrededor de 80%.', 'Yes, that is correct: about 80%.', `No es correcto: según los datos el rendimiento fue ${fmt(v)}%.`, `That's not correct: the actual return was ${fmt(v)}%.`],
      nodata: ['Bitcoin tiene un P/E de 45.2 y un dividend yield de 0%.', 'Bitcoin has a P/E ratio of 45.2.', 'Bitcoin no tiene P/E ni dividend yield: no aplica.', "Bitcoin doesn't have a P/E ratio or dividend yield."],
      ticker: ['ZZZZ cotiza a 52.4 dólares.', 'ZZZZ trades at $52.4.', 'No encontré información sobre ZZZZ.', "I couldn't find any information about ZZZZ."],
    };
    const t = T[q.trap!];
    return reply(search ? (es ? t[2] : t[3]) : (es ? t[0] : t[1]), search);
  };
}
