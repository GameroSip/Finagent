// Los tres brazos del duelo. Los tres usan el MISMO canal (http), el mismo reparto de modelos y la misma pregunta:
//   finagent: el agente completo (herramientas + verificador).   plain: Gemini sin herramientas.   search: Gemini con búsqueda de Google.
import { FinancialAgent, GeminiError } from '../../src/agent';
import { http } from '../../src/http';
import { API_ROOT, DAILY_QUOTA_MS, parseQuota, type ModelManager } from '../../src/models';
import { clearCache } from '../../src/tools';

export type ArmId = 'finagent' | 'plain' | 'search';
export const ARM_LABEL: Record<ArmId, string> = { finagent: 'FinAgent', plain: 'Gemini a secas', search: 'Gemini + búsqueda de Google' };

/** Instrucción mínima y neutral para los dos brazos sin herramientas: no se los sabotea ni se los favorece. */
export const PLAIN_SYSTEM = "You are a helpful financial assistant. Answer concisely, in the same language as the user's question.";

export interface ArmAnswer {
  arm: ArmId; answer: string; ms: number; model: string; modelCalls: number;
  searchUsed?: boolean;
  /** infra: Gemini no atendió (cupo, saturación); unavailable: este brazo no se pudo usar con esta clave (p. ej. la búsqueda). */
  error?: { kind: 'infra' | 'unavailable'; message: string };
}

export class FatalDuelError extends Error {}

export async function runFinAgent(models: ModelManager, apiKey: string, question: string): Promise<ArmAnswer> {
  clearCache();
  const agent = new FinancialAgent({ apiKey, models, retryDelayMs: 1500 });
  const t0 = Date.now();
  try {
    const r = await agent.ask(question);
    return { arm: 'finagent', answer: r.answer, ms: Date.now() - t0, model: r.model, modelCalls: r.stats.modelCalls };
  } catch (e: any) {
    if (e instanceof GeminiError && e.kind === 'invalid_key') throw new FatalDuelError('La clave de Gemini no es válida.');
    return { arm: 'finagent', answer: '', ms: Date.now() - t0, model: '', modelCalls: 0, error: { kind: 'infra', message: String(e?.message ?? e) } };
  }
}

async function generate(models: ModelManager, apiKey: string, question: string, search: boolean): Promise<{ text: string; model: string; grounded: boolean }> {
  const tried = new Set<string>();
  let last: Error = new GeminiError(503, 'Sin modelos disponibles', 'busy');
  for (;;) {
    const model = models.pick(tried);
    if (!model) throw last;
    const body: Record<string, unknown> = { systemInstruction: { parts: [{ text: PLAIN_SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: question }] }] };
    if (search) body.tools = [{ google_search: {} }];
    let res;
    try {
      res = await http({ url: `${API_ROOT}/models/${encodeURIComponent(model)}:generateContent`, method: 'POST', headers: { 'x-goog-api-key': apiKey }, body, timeoutMs: 120000 });
    } catch (e: any) { last = new GeminiError(0, `Sin conexión con Gemini: ${e?.message ?? e}`, 'busy'); tried.add(model); continue; }
    if (res.status >= 200 && res.status < 300) {
      const j = JSON.parse(res.text);
      const cand = j?.candidates?.[0];
      const text = (cand?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim();
      return { text, model, grounded: !!cand?.groundingMetadata };
    }
    let msg = res.text.slice(0, 300);
    try { msg = JSON.parse(res.text)?.error?.message ?? msg; } catch { /* texto plano */ }
    const err = new GeminiError(res.status, msg);
    const q = parseQuota(res.text);
    err.retryAfterMs = q.retryAfterMs; err.daily = q.daily;
    last = err; tried.add(model);
    // La búsqueda puede no estar disponible con esta clave o este modelo (400/403): se prueba con el siguiente modelo, sin marcarlo para los demás brazos.
    // (Si la clave fuera inválida, ya habría fallado el primer brazo.)
    if (search && (res.status === 400 || res.status === 403)) continue;
    if (err.kind === 'invalid_key') throw err;
    if (err.kind === 'unavailable') models.markUnavailable(model);
    else if (err.kind === 'busy') {
      if (err.daily) models.markUnavailable(model, err.retryAfterMs ? Math.min(err.retryAfterMs + 30_000, 24 * 3600_000) : DAILY_QUOTA_MS);
      else models.markCooldown(model, Math.min(Math.max(err.retryAfterMs ?? 90_000, 5_000), 15 * 60_000));
    } else if (!search) throw err;
  }
}

export async function runGemini(models: ModelManager, apiKey: string, question: string, search: boolean): Promise<ArmAnswer> {
  const arm: ArmId = search ? 'search' : 'plain';
  const t0 = Date.now();
  try {
    const r = await generate(models, apiKey, question, search);
    return { arm, answer: r.text, ms: Date.now() - t0, model: r.model, modelCalls: 1, searchUsed: search ? r.grounded : undefined };
  } catch (e: any) {
    const kind = search && e instanceof GeminiError && (e.status === 400 || e.status === 403) ? 'unavailable' : 'infra';
    if (kind === 'infra' && e instanceof GeminiError && e.kind === 'invalid_key') throw new FatalDuelError('La clave de Gemini no es válida.');
    return { arm, answer: '', ms: Date.now() - t0, model: '', modelCalls: 0, error: { kind, message: String(e?.message ?? e) } };
  }
}
