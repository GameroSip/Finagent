// Enrutador de modelos del servidor: llama a Gemini con la clave del negocio, aplica el prompt y las herramientas de FinAgent,
// y respeta el modelo FIJO de cada plan (el gratis usa solo el suyo; los de pago pueden tener un respaldo).
// Distingue "sin capacidad" (el cupo de Gemini se agotó: no es un error, es un límite) de una falla real, para poder explicárselo al usuario.
import { flattenContents } from '../src/contents';
import { modelFor, type Plan, type Thinking } from '../src/plans';
import { SYSTEM_PROMPT } from '../src/prompt';
import { DAILY_QUOTA_MS, parseQuota } from '../src/quota';
import { DECLARATIONS } from '../src/toolSpecs';

/** `timeoutMs`: si Gemini no termina en ese tiempo, el pedido se corta (AbortSignal.timeout) y el enrutador pasa al modelo de respaldo. */
export type GeminiFetch = (model: string, body: unknown, timeoutMs?: number) => Promise<{ status: number; text: string }>;

export interface RouteInput {
  chain: string[];          // modelos permitidos para el plan, en orden de preferencia
  pinned?: string;          // modelo ya usado en este turno (las firmas de razonamiento solo valen para ese modelo)
  contents: unknown[];
  withTools: boolean;
  note?: string;            // contexto real de la cuenta para el modelo (plan, modelo, límites)
  thinking?: Thinking;      // nivel de razonamiento que pide el plan (para el análisis profundo, el del análisis profundo)
  deep?: boolean;           // análisis profundo: se acepta esperar más
}
export type RouteResult =
  | { ok: true; model: string; data: any; switched: boolean }
  | { ok: false; status: 500 | 502 | 503; error: 'busy' | 'upstream' | 'config'; retryAfterSec?: number; detail?: string }
  | { ok: false; status: 503; error: 'capacity'; scope: 'minute' | 'day'; retryAfterSec: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** El prompt y las herramientas los pone el SERVIDOR: el cliente solo manda la conversación (así la app no sirve de proxy genérico). */
export function buildBody(contents: unknown[], withTools: boolean, note?: string, thinking?: Thinking): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: note ? `${SYSTEM_PROMPT}\n\nCONTEXTO DE LA CUENTA (dato real; usalo solo si preguntan por su plan, su modelo o sus límites): ${note}` : SYSTEM_PROMPT }] },
    contents,
    ...(withTools ? { tools: [{ functionDeclarations: DECLARATIONS }] } : {}),
    ...(thinking ? { generationConfig: { thinkingConfig: { thinkingLevel: thinking } } } : {}),
  };
}

/** Qué nivel de razonamiento se le manda a cada modelo. Flash-Lite ya razona "minimal" por defecto: no se le manda nada (no cambia su velocidad). Gemini 3.1 Pro no admite "minimal": se usa "low". */
export function thinkingFor(model: string, wanted?: Thinking): Thinking | undefined {
  if (!wanted || /flash[- ]?lite/i.test(model)) return undefined;
  return wanted === 'minimal' && /(^|[^a-z])pro([^a-z]|$)/i.test(model) ? 'low' : wanted;
}

/** Cuánto se espera a un modelo antes de pasar al siguiente. El último de la cadena no tiene un límite corto: ya no hay a dónde pasar. */
export const ATTEMPT_TIMEOUT_MS = { fast: 20_000, deep: 50_000, last: 60_000 };
const TIMEOUT_COOLDOWN_MS = 30_000;       // un modelo que se pasó de tiempo se aparta un rato, para que el próximo pedido no sufra lo mismo
const isTimeout = (e: any) => e?.name === 'TimeoutError' || e?.name === 'AbortError';

/** Modelos de un plan, en orden: el suyo y, si el plan lo permite, sus respaldos (el gratis no tiene). */
export const chainFor = (plan: Plan, deep = false): string[] => [...new Set([modelFor(plan, deep), ...plan.fallbacks])];

export class ModelRouter {
  private cooldown = new Map<string, { until: number; scope: 'minute' | 'day' | 'other' }>(); // modelo → hasta cuándo se lo aparta y por qué
  private noThinking = new Set<string>();                  // modelos a los que Google les rechazó el parámetro de razonamiento: se los llama sin él
  constructor(private call: GeminiFetch, private now: () => number = Date.now, private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {}

  async generate(i: RouteInput): Promise<RouteResult> {
    const order = i.pinned ? [i.pinned, ...i.chain.filter((m) => m !== i.pinned)] : i.chain;
    let wait = Infinity;
    let quota: 'minute' | 'day' | null = null;   // si algún modelo se rechazó por cupo (y de qué tipo)
    let other = false;                            // si hubo otro tipo de falla (sobrecarga, red)
    const note = (scope: 'minute' | 'day' | 'other', ms: number) => {
      wait = Math.min(wait, ms);
      if (scope === 'other') other = true; else quota = scope === 'day' && quota !== 'minute' ? 'day' : 'minute';
    };
    for (let idx = 0; idx < order.length; idx++) {
      const model = order[idx];
      const cd = this.cooldown.get(model);
      if (cd && cd.until > this.now()) { note(cd.scope, cd.until - this.now()); continue; }
      const switched = !!i.pinned && model !== i.pinned;
      let thinking = this.noThinking.has(model) ? undefined : thinkingFor(model, i.thinking);
      const mk = (th?: Thinking) => buildBody(switched ? flattenContents(i.contents as any[]) : i.contents, i.withTools, i.note, th);
      let body = mk(thinking);
      const isLast = !order.slice(idx + 1).some((m) => !((this.cooldown.get(m)?.until ?? 0) > this.now()));
      const timeoutMs = isLast ? ATTEMPT_TIMEOUT_MS.last : i.deep ? ATTEMPT_TIMEOUT_MS.deep : ATTEMPT_TIMEOUT_MS.fast;
      for (let attempt = 0; attempt < 2; attempt++) {
        let res: { status: number; text: string };
        let timedOut = false;
        try { res = await this.call(model, body, timeoutMs); } catch (e: any) { timedOut = isTimeout(e); res = { status: 0, text: String(e?.message ?? e) }; }

        if (res.status >= 200 && res.status < 300) {
          try { return { ok: true, model, data: JSON.parse(res.text), switched }; }
          catch { return { ok: false, status: 502, error: 'upstream', detail: 'respuesta ilegible de Gemini' }; }
        }
        if (timedOut) { // se pasó de tiempo: NO se reintenta el mismo modelo (esperaría otro tanto); se lo aparta un rato y se pasa al siguiente
          this.cooldown.set(model, { until: this.now() + TIMEOUT_COOLDOWN_MS, scope: 'other' }); note('other', TIMEOUT_COOLDOWN_MS);
          break;
        }
        if (res.status === 429) { // cupo: se aparta el modelo lo que Gemini diga (o 60 s; si es cupo diario, hasta que vuelva)
          const q = parseQuota(res.text);
          const ms = q.daily ? (q.retryAfterMs ? Math.min(q.retryAfterMs + 30_000, 24 * 3600_000) : DAILY_QUOTA_MS) : clamp(q.retryAfterMs ?? 60_000, 5_000, 15 * 60_000);
          const scope = q.daily ? 'day' : 'minute';
          this.cooldown.set(model, { until: this.now() + ms, scope }); note(scope, ms);
          break;
        }
        if (res.status === 404) { this.cooldown.set(model, { until: this.now() + 24 * 3600_000, scope: 'other' }); other = true; break; } // modelo retirado
        if (res.status === 401 || res.status === 403 || /API key not valid|API_KEY_INVALID/i.test(res.text)) {
          return { ok: false, status: 500, error: 'config', detail: 'La clave de Gemini del servidor no es válida o no tiene permiso.' };
        }
        if (res.status === 400 && thinking && /thinking/i.test(res.text)) { // Google no acepta el parámetro de razonamiento para este modelo: se lo llama sin él (y se recuerda), sin gastar el reintento
          this.noThinking.add(model); thinking = undefined; body = mk(undefined); attempt--; continue;
        }
        if (res.status === 400) return { ok: false, status: 502, error: 'upstream', detail: res.text.slice(0, 200) }; // pedido inválido: otro modelo tampoco lo resolvería
        if (attempt === 0) { await this.sleep(400); continue; } // 500/503/red: un reintento corto
        this.cooldown.set(model, { until: this.now() + 20_000, scope: 'other' }); note('other', 20_000);
      }
    }
    const retryAfterSec = Number.isFinite(wait) ? Math.ceil(wait / 1000) : 30;
    if (quota && !other) return { ok: false, status: 503, error: 'capacity', scope: quota, retryAfterSec };
    return { ok: false, status: 503, error: 'busy', retryAfterSec };
  }
}
