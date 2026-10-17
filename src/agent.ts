// Agente: Gemini decide qué herramientas llamar; el código las ejecuta; un verificador revisa las cifras.
// Modelo y límites son AUTOMÁTICOS: no hay nada que configurar.
import { http } from './http';
import { API_ROOT, GeminiError, ModelManager, modelLabel } from './models';
import { callTool, ToolResult } from './tools';
import { DECLARATIONS } from './toolSpecs';
import { Verification, verifyAnswer } from './verify';

export { GeminiError } from './models';
export const MAX_STEPS = 12;

export const SYSTEM_PROMPT = `Sos un analista financiero asistente dentro de una app móvil. El modelo interpreta y redacta; las HERRAMIENTAS son la única fuente de cifras.

REGLAS DE DATOS
1. NUNCA escribas una cifra (precio, ratio, porcentaje, fecha de resultados, objetivo) que no provenga de una herramienta en esta conversación. No uses memoria para números.
2. Todo cálculo derivado (variaciones, diferencias, upside, promedios) se hace con \`calculate\`. No hagas aritmética de cabeza.
3. Si el usuario nombra una empresa sin ticker, usá \`search_ticker\`. Convenciones Yahoo: acciones de EE.UU. 'AAPL'; BYMA (acciones locales y CEDEARs) con sufijo '.BA' (ej. 'GGAL.BA', 'AAPL.BA'); ADRs argentinos sin sufijo ('GGAL'); cripto 'BTC-USD'; índices '^GSPC'.
4. Elegí las herramientas mínimas necesarias; podés encadenar varias y llamar varias a la vez. Si falta información, pedila a otra herramienta o decí claramente que no está disponible. Si una herramienta falla, reportalo; no completes con suposiciones.
5. Para "¿cómo está el mercado?" o "resumen del día": \`get_market_overview\` + \`get_headlines\` (y \`get_argentina_macro\` si el usuario es de Argentina o pregunta por activos locales). Para dólar, brecha, riesgo país o inflación: \`get_argentina_macro\`.

REGLAS DE RIGOR
6. Aclará siempre la base de cada métrica: TTM vs forward vs último año fiscal, moneda, ADR vs acción local vs CEDEAR. Al comparar, avisá si bases o monedas difieren.
7. Citá fecha y fuente de los datos clave (usá \`meta.as_of\` y \`meta.source\`). Si el dato es de una rueda anterior, decilo.
8. Separá con claridad: **Hechos** (con fuente y fecha), **Cálculos**, **Interpretación** y **Escenarios**. No presentes hipótesis como hechos. Correlación no es causalidad.
9. Los titulares son narrativa mediática, no hechos verificados: parafraseá, nombrá el medio y contrastá con los datos; nunca copies titulares textuales largos.
10. Para preguntas abiertas ("¿conviene...?", "¿es buena inversión?") NO des veredicto ni predigas precios. Entregá: Caso alcista, Caso bajista, qué evento o umbral medible invalidaría cada tesis, y qué datos faltan. Marcá el nivel de incertidumbre.
11. Las señales técnicas son descriptivas, no predictivas. Los objetivos de analistas son opiniones, no pronósticos verificados.
12. Si la conclusión depende del perfil del usuario (horizonte, tolerancia al riesgo, moneda base), hacé notar que cambia según ese perfil.

FORMATO
- La app muestra gráficos y tarjetas automáticamente cuando consultás datos: no los describas punto por punto, interpretalos.
- Respondé en el idioma del usuario, conciso y directo; títulos cortos y listas cuando ayuden.
- Números: punto decimal, sin separador de miles (1234.56). Cifras grandes con sufijo: K, M (millones), B (mil millones, 10^9), T (10^12).
- No agregues avisos legales: la app ya los muestra.`;

export interface ToolCallRecord { name: string; args: Record<string, any>; result: ToolResult; ui?: any }
export interface AgentResult {
  answer: string;
  toolCalls: ToolCallRecord[];
  verification: Verification;
  model: string;
  truncated: boolean;
  corrected: boolean;
}
export interface Hooks {
  onTool?: (name: string, args: Record<string, any>, result: ToolResult) => void;
  onToolStart?: (name: string, args: Record<string, any>) => void;
  onStatus?: (msg: string) => void;
}
export interface AgentOptions { apiKey: string; models: ModelManager; retryDelayMs?: number }

const userMsg = (text: string) => ({ role: 'user', parts: [{ text }] });
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Al cambiar de modelo a mitad de conversación, las firmas de pensamiento y las llamadas a funciones del modelo
 * anterior no son válidas. Se aplanan a texto plano (conservando los resultados) y se fusionan turnos del mismo rol.
 */
export function flattenContents(contents: any[]): any[] {
  const out: any[] = [];
  for (const c of contents) {
    const parts: any[] = [];
    for (const p of c.parts ?? []) {
      if (p.thought) continue;
      if (p.functionCall) parts.push({ text: `[consulté ${p.functionCall.name}(${JSON.stringify(p.functionCall.args ?? {})})]` });
      else if (p.functionResponse) parts.push({ text: `[resultado de ${p.functionResponse.name}: ${JSON.stringify(p.functionResponse.response?.result ?? {}).slice(0, 6000)}]` });
      else if (typeof p.text === 'string' && p.text) parts.push({ text: p.text });
    }
    if (!parts.length) continue;
    const role = c.role === 'model' ? 'model' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push(...parts); else out.push({ role, parts });
  }
  return out;
}

export class FinancialAgent {
  contents: any[] = [];
  private activeModel: string | null = null;
  private o: Required<AgentOptions>;

  constructor(opts: AgentOptions) {
    if (!opts.apiKey?.trim()) throw new Error('Falta la API key de Gemini.');
    this.o = { retryDelayMs: 2500, ...opts, apiKey: opts.apiKey.trim() };
  }
  get model() { return this.activeModel ?? this.o.models.pick() ?? ''; }
  get modelLabel() { return this.model ? modelLabel(this.model) : ''; }
  reset() { this.contents = []; }

  private async request(model: string, withTools: boolean, hooks: Hooks): Promise<any> {
    const body: Record<string, unknown> = { systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: this.contents };
    if (withTools) body.tools = [{ functionDeclarations: DECLARATIONS }];
    let delay = this.o.retryDelayMs;
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await http({ url: `${API_ROOT}/models/${encodeURIComponent(model)}:generateContent`, method: 'POST',
          headers: { 'x-goog-api-key': this.o.apiKey }, body, timeoutMs: 120000 });
      } catch (e: any) {
        if (attempt < 2) { hooks.onStatus?.('Sin conexión; reintentando…'); await sleep(delay); delay *= 2; continue; }
        throw new GeminiError(0, `Sin conexión con Gemini: ${e?.message ?? e}`, 'busy');
      }
      if (res.status >= 200 && res.status < 300) {
        try { return JSON.parse(res.text); } catch { throw new GeminiError(res.status, 'Respuesta de Gemini no válida', 'other'); }
      }
      let msg = res.text.slice(0, 300);
      try { msg = JSON.parse(res.text)?.error?.message ?? msg; } catch { /* texto plano */ }
      const err = new GeminiError(res.status, msg);
      if (err.kind === 'busy' && attempt < 2) {
        hooks.onStatus?.('Mucha demanda; reintentando…');
        await sleep(delay); delay *= 2; continue;
      }
      throw err;
    }
  }

  /** Prueba los modelos en orden de preferencia; los no disponibles o saturados se saltean (y se recuerdan). */
  private async generate(withTools: boolean, hooks: Hooks): Promise<any> {
    const tried = new Set<string>();
    let last: GeminiError | null = null;
    for (;;) {
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
        return data;
      } catch (e) {
        if (!(e instanceof GeminiError)) throw e;
        last = e;
        if (e.kind === 'unavailable') { this.o.models.markUnavailable(model); tried.add(model); continue; }
        if (e.kind === 'busy') { this.o.models.markCooldown(model); tried.add(model); continue; }
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

  async ask(question: string, hooks: Hooks = {}): Promise<AgentResult> {
    this.contents.push(userMsg(question));
    const calls: ToolCallRecord[] = [];
    let { answer, truncated } = await this.run(calls, hooks);
    let verification = verifyAnswer(answer, calls.map((c) => c.result), question);
    let corrected = false;
    if (!verification.ok && !truncated) {
      const bad = verification.unverified.slice(0, 8).map((u) => u.text).join(', ');
      hooks.onStatus?.('Verificando cifras…');
      this.contents.push(userMsg(
        `Verificación automática: estas cifras de tu respuesta no coinciden con ningún resultado de herramienta: ${bad}. ` +
        'Verificá cada una con las herramientas (usá `calculate` para derivados) y reescribí la respuesta completa, ' +
        'corrigiendo o eliminando lo que no puedas respaldar.'));
      ({ answer, truncated } = await this.run(calls, hooks));
      verification = verifyAnswer(answer, calls.map((c) => c.result), question);
      corrected = true;
    }
    return { answer, toolCalls: calls, verification, model: this.model, truncated, corrected };
  }
}
