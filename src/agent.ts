// Agente: Gemini decide qué herramientas llamar; el código las ejecuta; un verificador revisa las cifras.
// Modelo y límites son AUTOMÁTICOS: no hay nada que configurar.
import { http } from './http';
import { flattenContents, historyToContents, type Turn } from './contents';
import { languageHint } from './lang';
import { NO_TOKENS, type Tokens } from './pricing';
import type { Transport } from './transport';
import { API_ROOT, DAILY_QUOTA_MS, GeminiError, ModelManager, modelLabel, parseQuota } from './models';
import { callTool, ToolResult } from './tools';
import { DECLARATIONS } from './toolSpecs';
import { collectNumbers, redactUnverified, Verification, verifyAnswer } from './verify';

export { GeminiError } from './models';
export const MAX_STEPS = 12;
const MAX_TURNS = 10;          // turnos de contexto que se reenvían al modelo
const MAX_KNOWN_NUMBERS = 3000; // cifras de herramientas que se recuerdan por chat para verificar respuestas siguientes

export { SYSTEM_PROMPT } from './prompt';
import { SYSTEM_PROMPT } from './prompt';

export interface ToolCallRecord { name: string; args: Record<string, any>; result: ToolResult; ui?: any }
/** Métricas de una respuesta (para evaluar al modelo; la app no las muestra). */
export interface AskStats {
  modelCalls: number;          // pedidos al modelo que hicieron falta
  toolSteps: number;           // consultas a herramientas
  draftChecked: number;        // cifras del PRIMER borrador
  draftUnverified: string[];   // cifras del primer borrador que NO salían de las herramientas (el "índice de alucinación" real)
  tokens: Tokens;              // tokens REALES que informó Gemini (entrada, salida, razonamiento, en caché)
  corrected: boolean;          // hizo falta la pasada de corrección o de reescritura
  rewritten: boolean;          // hizo falta la reescritura sin herramientas
}
export interface AgentResult {
  answer: string;
  toolCalls: ToolCallRecord[];
  verification: Verification;
  model: string;
  truncated: boolean;
  corrected: boolean;
  /** Cantidad de cifras que no se pudieron respaldar y se quitaron de la respuesta (el usuario nunca ve una cifra sin sustento). */
  redacted: number;
  stats: AskStats;
  /** Cifras que devolvieron las herramientas en este turno (para verificar las respuestas siguientes del mismo chat). */
  numbers: number[];
}
export interface Hooks {
  onTool?: (name: string, args: Record<string, any>, result: ToolResult) => void;
  onToolStart?: (name: string, args: Record<string, any>) => void;
  onStatus?: (msg: string) => void;
}
export interface AgentOptions { apiKey: string; models: ModelManager; retryDelayMs?: number; transport?: Transport }

/** El usuario detuvo la respuesta. */
export class AbortedError extends Error {
  constructor() { super('Respuesta detenida'); this.name = 'AbortedError'; }
}


const userMsg = (text: string) => ({ role: 'user', parts: [{ text }] });
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));


export class FinancialAgent {
  contents: any[] = [];
  /** Turnos anteriores del chat (compactos). Se persisten con el chat y se restauran al reabrirlo. */
  history: Turn[] = [];
  /** Cifras de las herramientas de turnos anteriores: una respuesta de seguimiento puede repetirlas sin que se marquen como inventadas. */
  priorNumbers: number[] = [];
  private aborted = false;
  private modelCalls = 0;
  private turn: string | undefined; // modo servidor: la respuesta en curso (el servidor la cuenta como UNA consulta)
  private tokens: Tokens = NO_TOKENS();
  private activeModel: string | null = null;
  private o: Required<Omit<AgentOptions, 'transport'>> & { transport?: Transport };

  constructor(opts: AgentOptions) {
    if (!opts.transport && !opts.apiKey?.trim()) throw new Error('Falta la API key de Gemini.'); // con servidor no hace falta clave
    this.o = { retryDelayMs: 2500, ...opts, apiKey: (opts.apiKey ?? '').trim() };
  }
  get model() { return this.activeModel ?? this.o.models.pick() ?? ''; }
  get modelLabel() { return this.model ? modelLabel(this.model) : ''; }
  reset() { this.contents = []; this.history = []; this.priorNumbers = []; }
  /** Restaura el estado de un chat guardado. */
  restore(history: Turn[], numbers: number[]) { this.history = history.slice(-MAX_TURNS); this.priorNumbers = numbers; this.contents = []; }
  /** Quita el último turno (para "Regenerar"). */
  popTurn() { this.history.pop(); }
  /** Detiene la respuesta en curso: la llamada de red ya enviada no se puede cancelar, pero su resultado se descarta. */
  abort() { this.aborted = true; }
  private check() { if (this.aborted) throw new AbortedError(); }

  private async request(model: string, withTools: boolean, hooks: Hooks): Promise<any> {
    const body: Record<string, unknown> = { systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: this.contents };
    if (withTools) body.tools = [{ functionDeclarations: DECLARATIONS }];
    let delay = this.o.retryDelayMs;
    for (let attempt = 0; ; attempt++) {
      this.check();
      let res;
      try {
        res = await http({ url: `${API_ROOT}/models/${encodeURIComponent(model)}:generateContent`, method: 'POST',
          headers: { 'x-goog-api-key': this.o.apiKey }, body, timeoutMs: 120000 });
        this.check();
      } catch (e: any) {
        if (e instanceof AbortedError) throw e;
        if (attempt < 2) { hooks.onStatus?.('Sin conexión; reintentando…'); await sleep(delay); delay *= 2; continue; }
        throw new GeminiError(0, `Sin conexión con Gemini: ${e?.message ?? e}`, 'busy');
      }
      if (res.status >= 200 && res.status < 300) {
        try { return JSON.parse(res.text); } catch { throw new GeminiError(res.status, 'Respuesta de Gemini no válida', 'other'); }
      }
      let msg = res.text.slice(0, 300);
      try { msg = JSON.parse(res.text)?.error?.message ?? msg; } catch { /* texto plano */ }
      const err = new GeminiError(res.status, msg);
      const quota = parseQuota(res.text);
      err.retryAfterMs = quota.retryAfterMs; err.daily = quota.daily;
      if (err.kind === 'busy' && res.status === 429) {
        // Cupo agotado (por minuto o por día): volver a pedirle lo mismo al mismo modelo casi nunca sirve y solo suma pedidos rechazados.
        // Solo si Gemini pide esperar muy poco se espera y se reintenta una vez; si no, se pasa de inmediato al siguiente modelo.
        if (!quota.daily && quota.retryAfterMs !== undefined && quota.retryAfterMs <= 8000 && attempt < 1) {
          hooks.onStatus?.('Cupo por minuto agotado; esperando unos segundos…');
          await sleep(quota.retryAfterMs + 250); continue;
        }
        throw err;
      }
      if (err.kind === 'busy' && attempt < 2) { // saturación pasajera (503…): reintento con espera creciente
        hooks.onStatus?.('Mucha demanda; reintentando…');
        await sleep(delay); delay *= 2; continue;
      }
      throw err;
    }
  }

  /** Prueba los modelos en orden de preferencia; los no disponibles o saturados se saltean (y se recuerdan). */
  /** Modo servidor: una vuelta del modelo a través del servidor de FinAgent (que pone la clave, el prompt y elige el modelo). */
  private async generateViaTransport(withTools: boolean): Promise<any> {
    this.check();
    const r = await this.o.transport!.generate({ contents: this.contents, withTools, turn: this.turn });
    this.turn = r.turn ?? this.turn;
    this.activeModel = r.model;
    this.o.models.active = r.model;
    this.modelCalls++;
    const u = r.data?.usageMetadata;
    if (u) { this.tokens.input += u.promptTokenCount ?? 0; this.tokens.output += u.candidatesTokenCount ?? 0; this.tokens.thoughts += u.thoughtsTokenCount ?? 0; this.tokens.cached += u.cachedContentTokenCount ?? 0; }
    return r.data;
  }

  private async generate(withTools: boolean, hooks: Hooks): Promise<any> {
    if (this.o.transport) return this.generateViaTransport(withTools);
    const tried = new Set<string>();
    let last: GeminiError | null = null;
    for (;;) {
      this.check();
      const model = this.o.models.pick(tried);
      if (!model) {
        throw last && last.kind === 'busy'
          ? new GeminiError(429, 'Todos los modelos disponibles están saturados en este momento. Probá de nuevo en un minuto.', 'busy')
          : last ?? new GeminiError(404, 'No hay ningún modelo de Gemini disponible para esta clave.', 'unavailable');
      }
      if (this.activeModel && model !== this.activeModel) {
        this.contents = flattenContents(this.contents);
        hooks.onStatus?.(`Cambiando a ${modelLabel(model)}…`);
      }
      try {
        const data = await this.request(model, withTools, hooks);
        this.activeModel = model;
        this.o.models.active = model;
        this.modelCalls++;
        const u = data?.usageMetadata; // el uso real que informa Gemini: reemplaza las estimaciones de costo
        if (u) { this.tokens.input += u.promptTokenCount ?? 0; this.tokens.output += u.candidatesTokenCount ?? 0; this.tokens.thoughts += u.thoughtsTokenCount ?? 0; this.tokens.cached += u.cachedContentTokenCount ?? 0; }
        return data;
      } catch (e) {
        if (!(e instanceof GeminiError)) throw e;
        last = e;
        if (e.kind === 'unavailable') { this.o.models.markUnavailable(model); tried.add(model); continue; }
        if (e.kind === 'busy') {
          if (e.daily) this.o.models.markUnavailable(model, e.retryAfterMs ? Math.min(e.retryAfterMs + 30_000, 24 * 3600_000) : DAILY_QUOTA_MS); // cupo diario agotado: hasta cuando Gemini dice que vuelve (si no lo dice, 6 h)
          else this.o.models.markCooldown(model, Math.min(Math.max(e.retryAfterMs ?? 90_000, 5_000), 15 * 60_000)); // lo que pidió Gemini (o 90 s)
          tried.add(model); continue;
        }
        throw e; // invalid_key / other
      }
    }
  }

  private async run(calls: ToolCallRecord[], hooks: Hooks): Promise<{ answer: string; truncated: boolean }> {
    for (let step = 0; step < MAX_STEPS; step++) {
      const data = await this.generate(true, hooks);
      const cand = data?.candidates?.[0];
      const content = cand?.content;
      if (!content) {
        const why = data?.promptFeedback?.blockReason ?? cand?.finishReason ?? 'sin contenido';
        return { answer: `No pude generar una respuesta (${why}). Probá reformulando la pregunta.`, truncated: false };
      }
      this.contents.push({ role: 'model', ...content }); // se conserva tal cual (incluye thoughtSignature)
      const parts: any[] = content.parts ?? [];
      const fcs = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
      if (!fcs.length) {
        const text = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim();
        return { answer: text || 'No obtuve una respuesta del modelo. Reintentá.', truncated: false };
      }
      fcs.forEach((fc) => hooks.onToolStart?.(fc.name, fc.args ?? {}));
      const results = await Promise.all(fcs.map((fc) => callTool(fc.name, (fc.args ?? {}) as Record<string, any>)));
      this.check();
      const responses = fcs.map((fc, i) => {
        const { ui, ...forModel } = results[i]; // la UI recibe los datos del gráfico; el modelo no los necesita
        const args = (fc.args ?? {}) as Record<string, any>;
        calls.push({ name: fc.name, args, result: forModel, ui });
        hooks.onTool?.(fc.name, args, results[i]);
        return { functionResponse: { name: fc.name, response: { result: forModel } } };
      });
      this.contents.push({ role: 'user', parts: responses });
    }
    this.contents.push(userMsg('Alcanzaste el límite de consultas. Respondé ahora con lo que obtuviste, indicando explícitamente qué información faltó.'));
    const data = await this.generate(false, hooks);
    const content = data?.candidates?.[0]?.content;
    if (content) this.contents.push({ role: 'model', ...content });
    const text = (content?.parts ?? []).filter((p: any) => typeof p.text === 'string' && !p.thought).map((p: any) => p.text).join('').trim();
    return { answer: text || 'No alcancé a completar el análisis. Probá con una pregunta más acotada.', truncated: true };
  }

  /** Una vuelta del modelo SIN herramientas (se usa para reescribir sin cifras sin respaldo). */
  private async plainRewrite(instruction: string, hooks: Hooks, hint = ''): Promise<string | null> {
    this.contents.push(userMsg(instruction + hint));
    const data = await this.generate(false, hooks);
    const content = data?.candidates?.[0]?.content;
    if (!content) return null;
    this.contents.push({ role: 'model', ...content });
    const text = (content.parts ?? []).filter((p: any) => typeof p.text === 'string' && !p.thought).map((p: any) => p.text).join('').trim();
    return text || null;
  }

  async ask(question: string, hooks: Hooks = {}): Promise<AgentResult> {
    this.aborted = false;
    this.modelCalls = 0;
    this.turn = undefined;
    this.tokens = NO_TOKENS();
    this.contents = historyToContents(this.history);
    const hint = languageHint(question); // si el usuario escribe en inglés, se le recuerda al modelo en cada turno (el historial guarda solo la pregunta)
    this.contents.push(userMsg(question + hint));
    const calls: ToolCallRecord[] = [];
    try {
      let { answer, truncated } = await this.run(calls, hooks);
      const verify = () => verifyAnswer(answer, [...calls.map((c) => c.result), this.priorNumbers], question);
      const list = (v: Verification) => v.unverified.slice(0, 8).map((u) => u.text).join(', ');
      let verification = verify();
      const draft = { checked: verification.checked, unverified: verification.unverified.map((u) => u.text) };
      let corrected = false, rewritten = false;

      // 1) Corrección con herramientas: el modelo puede consultar o calcular lo que le faltó.
      if (!verification.ok && !truncated) {
        hooks.onStatus?.('Verificando cifras…');
        this.contents.push(userMsg(
          `Verificación automática: estas cifras de tu respuesta no coinciden con ningún resultado de herramienta: ${list(verification)}. ` +
          'Verificá cada una con las herramientas (usá `get_performance` para rendimientos y `calculate` para derivados) y reescribí la respuesta completa, ' +
          'corrigiendo o eliminando lo que no puedas respaldar.' + hint));
        ({ answer, truncated } = await this.run(calls, hooks));
        verification = verify();
        corrected = true;
      }

      // 2) Si todavía quedan cifras sin respaldo (o se agotaron los pasos): reescritura sin herramientas y sin esas cifras.
      if (!verification.ok) {
        hooks.onStatus?.('Quitando cifras sin respaldo…');
        const text = await this.plainRewrite(
          `Verificación automática: estas cifras siguen sin respaldo en los datos de las herramientas: ${list(verification)}. ` +
          'Reescribí la respuesta completa SIN ellas ni ninguna otra cifra que no esté en los datos: no hagas cuentas ni estimaciones. ' +
          'Si falta un dato, decí que no está disponible. No uses herramientas.', hooks, hint);
        if (text) { answer = text; verification = verify(); corrected = true; rewritten = true; }
      }

      // 3) Último recurso: lo que siga sin respaldo se quita del texto. Nunca se muestra una cifra sin sustento.
      let redacted = 0;
      if (!verification.ok) {
        redacted = verification.unverified.length;
        answer = redactUnverified(answer, verification.unverified);
        verification = verify();
      }

      // Turno completo: se guarda de forma compacta y se recuerdan las cifras de las herramientas.
      this.history.push({ q: question, a: answer });
      this.history = this.history.slice(-MAX_TURNS);
      const numbers = [...new Set(collectNumbers(calls.map((c) => c.result)))];
      this.priorNumbers = [...new Set([...this.priorNumbers, ...numbers])].slice(-MAX_KNOWN_NUMBERS);
      const stats: AskStats = { modelCalls: this.modelCalls, toolSteps: calls.length, draftChecked: draft.checked, draftUnverified: draft.unverified, tokens: { ...this.tokens }, corrected, rewritten };
      return { answer, toolCalls: calls, verification, model: this.model, truncated, corrected, redacted, stats, numbers };
    } catch (e) {
      this.contents = historyToContents(this.history); // se descarta el turno incompleto
      // Modo servidor: si la respuesta falló (no si la detuvo el usuario) después de haber descontado la consulta, se devuelve.
      if (this.turn && !(e instanceof AbortedError)) void this.o.transport?.abandon?.(this.turn);
      throw e;
    }
  }
}

export { flattenContents, historyToContents } from './contents';
export type { Turn } from './contents';
