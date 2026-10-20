// Enrutador de modelos del servidor: llama a Gemini con la clave del negocio, aplica el prompt y las herramientas de FinAgent,
// y respeta el modelo FIJO de cada plan (el gratis usa solo el suyo; los de pago pueden tener un respaldo).
// Distingue "sin capacidad" (el cupo de Gemini se agotó: no es un error, es un límite) de una falla real, para poder explicárselo al usuario.
import { flattenContents } from '../src/contents';
import { modelFor, type Plan } from '../src/plans';
import { SYSTEM_PROMPT } from '../src/prompt';
import { DAILY_QUOTA_MS, parseQuota } from '../src/quota';
import { DECLARATIONS } from '../src/toolSpecs';

export type GeminiFetch = (model: string, body: unknown) => Promise<{ status: number; text: string }>;

export interface RouteInput {
  chain: string[];          // modelos permitidos para el plan, en orden de preferencia
  pinned?: string;          // modelo ya usado en este turno (las firmas de razonamiento solo valen para ese modelo)
  contents: unknown[];
  withTools: boolean;
  note?: string;            // contexto real de la cuenta para el modelo (plan, modelo, límites)
}
export type RouteResult =
  | { ok: true; model: string; data: any; switched: boolean }
  | { ok: false; status: 500 | 502 | 503; error: 'busy' | 'upstream' | 'config'; retryAfterSec?: number; detail?: string }
  | { ok: false; status: 503; error: 'capacity'; scope: 'minute' | 'day'; retryAfterSec: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** El prompt y las herramientas los pone el SERVIDOR: el cliente solo manda la conversación (así la app no sirve de proxy genérico). */
export function buildBody(contents: unknown[], withTools: boolean, note?: string): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: note ? `${SYSTEM_PROMPT}\n\nCONTEXTO DE LA CUENTA (dato real; usalo solo si preguntan por su plan, su modelo o sus límites): ${note}` : SYSTEM_PROMPT }] },
    contents,
    ...(withTools ? { tools: [{ functionDeclarations: DECLARATIONS }] } : {}),
  };
}

/** Modelos de un plan, en orden: el suyo y, si el plan lo permite, sus respaldos (el gratis no tiene). */
export const chainFor = (plan: Plan, deep = false): string[] => [...new Set([modelFor(plan, deep), ...plan.fallbacks])];

export class ModelRouter {
  private cooldown = new Map<string, { until: number; scope: 'minute' | 'day' | 'other' }>(); // modelo → hasta cuándo se lo aparta y por qué
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
    for (const model of order) {
      const cd = this.cooldown.get(model);
      if (cd && cd.until > this.now()) { note(cd.scope, cd.until - this.now()); continue; }
      const switched = !!i.pinned && model !== i.pinned;
      const body = buildBody(switched ? flattenContents(i.contents as any[]) : i.contents, i.withTools, i.note);
      for (let attempt = 0; attempt < 2; attempt++) {
        let res: { status: number; text: string };
        try { res = await this.call(model, body); } catch (e: any) { res = { status: 0, text: String(e?.message ?? e) }; }

        if (res.status >= 200 && res.status < 300) {
          try { return { ok: true, model, data: JSON.parse(res.text), switched }; }
          catch { return { ok: false, status: 502, error: 'upstream', detail: 'respuesta ilegible de Gemini' }; }
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
