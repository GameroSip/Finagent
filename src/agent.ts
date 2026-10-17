// Agente: Gemini decide qué herramientas llamar; el código las ejecuta; un verificador revisa las cifras.
import { DECLARATIONS } from './declarations';
import { http } from './http';
import { callTool, ToolResult } from './tools';
import { verifyAnswer, Verification } from './verify';

export const DEFAULT_MODEL = 'gemini-flash-latest'; // alias al Flash vigente; podés fijar otro en Ajustes
export const MAX_STEPS = 8;
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export const SYSTEM_PROMPT = `Sos un analista financiero asistente. El modelo interpreta y redacta; las HERRAMIENTAS son la única fuente de cifras.

REGLAS DE DATOS
1. NUNCA escribas una cifra (precio, ratio, porcentaje, fecha de resultados, objetivo) que no provenga de una herramienta en esta conversación. No uses memoria para números.
2. Todo cálculo derivado (variaciones, diferencias, upside, promedios) se hace con \`calculate\`. No hagas aritmética de cabeza.
3. Si el usuario nombra una empresa sin ticker, usá \`search_ticker\`. Convenciones Yahoo: acciones de EE.UU. 'AAPL'; BYMA (acciones locales y CEDEARs) con sufijo '.BA' (ej. 'GGAL.BA', 'AAPL.BA'); ADRs argentinos sin sufijo ('GGAL'); cripto 'BTC-USD'; índices '^GSPC'.
4. Elegí las herramientas mínimas necesarias; podés encadenar varias. Si falta información, pedila a otra herramienta o decí claramente que no está disponible. Si una herramienta falla, reportalo; no completes con suposiciones.

REGLAS DE RIGOR
5. Aclará siempre la base de cada métrica: TTM vs forward vs último año fiscal, moneda, ADR vs acción local vs CEDEAR. Al comparar, avisá si bases o monedas difieren.
6. Citá fecha y fuente de los datos clave (usá \`meta.as_of\` y \`meta.source\`). Si el dato es de una rueda anterior, decilo.
7. Separá con claridad: **Hechos** (con fuente y fecha), **Cálculos**, **Interpretación** y **Escenarios**. No presentes hipótesis como hechos. Correlación no es causalidad: una noticia junto a un movimiento no prueba que lo causó.
8. Para preguntas abiertas ("¿conviene...?", "¿es buena inversión?") NO des veredicto ni predigas precios. Entregá: Caso alcista, Caso bajista, qué evento o umbral medible invalidaría cada tesis, y qué datos faltan. Marcá el nivel de incertidumbre.
9. Las señales técnicas son descriptivas, no predictivas. Los objetivos de analistas son opiniones, no pronósticos verificados.
10. Si la pregunta depende del perfil del usuario (horizonte, tolerancia al riesgo, moneda base), hacé notar que la conclusión cambia según ese perfil.

FORMATO
- Respondé en el idioma del usuario, conciso y directo.
- Números: punto decimal, sin separador de miles (1234.56). Cifras grandes con sufijo: K, M (millones), B (mil millones, 10^9), T (10^12).
- Cerrá con una línea breve: información con fines educativos, no es asesoramiento financiero personalizado.`;

export interface ToolCallRecord { name: string; args: Record<string, any>; result: ToolResult }
export interface AgentResult {
  answer: string;
  toolCalls: ToolCallRecord[];
  verification: Verification;
  model: string;
  truncated: boolean;
  corrected: boolean;
}
export interface AgentOptions {
  apiKey: string;
  model?: string;
  maxSteps?: number;
  selfCorrect?: boolean;
  retryDelayMs?: number; // base del backoff; 0 en tests
  onStatus?: (msg: string) => void; // avisos de reintento para la UI
}
export type OnTool = (name: string, args: Record<string, any>, result: ToolResult) => void;

export class GeminiError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.name = 'GeminiError'; this.status = status; }
}

const userMsg = (text: string) => ({ role: 'user', parts: [{ text }] });
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export class FinancialAgent {
  contents: any[] = [];
  private o: Required<AgentOptions>;

  constructor(opts: AgentOptions) {
    if (!opts.apiKey?.trim()) throw new Error('Falta la API key de Gemini (Ajustes ⚙).');
    this.o = { model: DEFAULT_MODEL, maxSteps: MAX_STEPS, selfCorrect: true, retryDelayMs: 5000, onStatus: () => {}, ...opts, apiKey: opts.apiKey.trim() };
  }
  get model() { return this.o.model; }
  reset() { this.contents = []; }

  private async generate(withTools: boolean): Promise<any> {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: this.contents,
    };
    if (withTools) body.tools = [{ functionDeclarations: DECLARATIONS }];
    let delay = this.o.retryDelayMs;
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await http({
          url: `${API}/${encodeURIComponent(this.o.model)}:generateContent`,
          method: 'POST',
          headers: { 'x-goog-api-key': this.o.apiKey },
          body,
          timeoutMs: 120000,
        });
      } catch (e: any) {
        if (attempt < 3) { this.o.onStatus(`Sin conexión con Gemini; reintentando en ${Math.round(delay / 1000)} s…`); await sleep(delay); delay *= 2; continue; }
        throw new GeminiError(0, `Sin conexión con Gemini: ${e?.message ?? e}`);
      }
      if (res.status >= 200 && res.status < 300) {
        try { return JSON.parse(res.text); } catch { throw new GeminiError(res.status, 'Respuesta de Gemini no válida'); }
      }
      if ([429, 500, 503].includes(res.status) && attempt < 3) {
        this.o.onStatus(`Gemini respondió ${res.status} (límite o saturación); reintentando en ${Math.round(delay / 1000)} s…`);
        await sleep(delay); delay *= 2; continue;
      }
      let msg = res.text.slice(0, 300);
      try { msg = JSON.parse(res.text)?.error?.message ?? msg; } catch { /* texto plano */ }
      throw new GeminiError(res.status, msg);
    }
  }

  private async run(calls: ToolCallRecord[], onTool?: OnTool): Promise<{ answer: string; truncated: boolean }> {
    for (let step = 0; step < this.o.maxSteps; step++) {
      const data = await this.generate(true);
      const cand = data?.candidates?.[0];
      const content = cand?.content;
      if (!content) {
        const why = data?.promptFeedback?.blockReason ?? cand?.finishReason ?? 'sin contenido';
        return { answer: `(El modelo no devolvió una respuesta: ${why}. Reintentá la consulta.)`, truncated: false };
      }
      this.contents.push({ role: 'model', ...content }); // se conserva tal cual (incluye thoughtSignature)
      const parts: any[] = content.parts ?? [];
      const fcs = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
      if (!fcs.length) {
        const text = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim();
        return { answer: text || '(Respuesta vacía del modelo.)', truncated: false };
      }
      const responses: any[] = [];
      for (const fc of fcs) {
        const args = (fc.args ?? {}) as Record<string, any>;
        const result = await callTool(fc.name, args);
        calls.push({ name: fc.name, args, result });
        onTool?.(fc.name, args, result);
        responses.push({ functionResponse: { name: fc.name, response: { result } } });
      }
      this.contents.push({ role: 'user', parts: responses });
    }
    // Límite de pasos: forzar cierre sin herramientas
    this.contents.push(userMsg('Alcanzaste el límite de consultas. Respondé ahora con lo que obtuviste, indicando explícitamente qué información faltó.'));
    const data = await this.generate(false);
    const content = data?.candidates?.[0]?.content;
    if (content) this.contents.push({ role: 'model', ...content });
    const text = (content?.parts ?? []).filter((p: any) => typeof p.text === 'string' && !p.thought).map((p: any) => p.text).join('').trim();
    return { answer: text || '(Sin respuesta final.)', truncated: true };
  }

  async ask(question: string, onTool?: OnTool): Promise<AgentResult> {
    this.contents.push(userMsg(question));
    const calls: ToolCallRecord[] = [];
    let { answer, truncated } = await this.run(calls, onTool);
    let verification = verifyAnswer(answer, calls.map((c) => c.result), question);
    let corrected = false;
    if (this.o.selfCorrect && !verification.ok && !truncated) {
      const bad = verification.unverified.slice(0, 8).map((u) => u.text).join(', ');
      this.contents.push(userMsg(
        `Verificación automática: estas cifras de tu respuesta no coinciden con ningún resultado de herramienta: ${bad}. ` +
        'Verificá cada una con las herramientas (usá `calculate` para derivados) y reescribí la respuesta completa, ' +
        'corrigiendo o eliminando lo que no puedas respaldar.'));
      ({ answer, truncated } = await this.run(calls, onTool));
      verification = verifyAnswer(answer, calls.map((c) => c.result), question);
      corrected = true;
    }
    return { answer, toolCalls: calls, verification, model: this.o.model, truncated, corrected };
  }
}
