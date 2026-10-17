// Selección AUTOMÁTICA de modelos de Gemini: el usuario nunca elige modelo.
// Se descubren los modelos disponibles para su API key, se ordenan por calidad (versión más nueva primero) y,
// si uno falla (cuota, baja, sin acceso), la app pasa sola al siguiente.
import { http } from './http';

export const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
const FALLBACK = 'gemini-flash-latest'; // alias al Flash vigente: último recurso
const MODEL_RE = /^gemini-(\d+)(?:\.(\d+))?-(flash-lite|flash|pro)(?:-(.+))?$/;

type Family = 'flash' | 'flash-lite' | 'pro';
interface Parsed { id: string; family: Family; ver: [number, number]; preview: boolean }
interface RawModel { name: string; supportedGenerationMethods?: string[] }

/** Interpreta un modelo. Devuelve null si no es un modelo de texto de uso general (image, tts, live, audio...). */
function parseModel(m: RawModel): Parsed | null {
  const id = m.name.replace(/^models\//, '');
  if (m.supportedGenerationMethods && !m.supportedGenerationMethods.includes('generateContent')) return null;
  const x = MODEL_RE.exec(id);
  if (!x) return null;
  const suffix = x[4];
  let preview = false;
  if (suffix !== undefined) {
    if (/^preview(-\d[\w-]*)?$/.test(suffix)) preview = true; // solo fechas/versiones: 'preview-tts' o 'preview-native-audio-dialog' NO son modelos de chat
    else if (!/^\d{3}$/.test(suffix)) return null;
  }
  return { id, family: x[3] as Family, ver: [Number(x[1]), Number(x[2] ?? 0)], preview };
}

const rank = (a: Parsed, b: Parsed) =>
  b.ver[0] - a.ver[0] || b.ver[1] - a.ver[1] || Number(a.preview) - Number(b.preview);

/** Cadena de preferencia: Flash más nuevos (rápidos y buenos con herramientas), un Flash-Lite, y el resto. */
function buildChain(models: Parsed[]): string[] {
  const flash = models.filter((m) => m.family === 'flash').sort(rank);
  const lite = models.filter((m) => m.family === 'flash-lite').sort(rank);
  const pro = models.filter((m) => m.family === 'pro').sort(rank);
  const ordered = [...flash.slice(0, 2), ...lite.slice(0, 1), ...flash.slice(2), ...lite.slice(1)];
  if (!ordered.length && pro.length) ordered.push(pro[0]);
  const ids = ordered.map((m) => m.id);
  if (!ids.includes('gemini-flash-latest')) ids.push(FALLBACK);
  return ids;
}

/** Nombre legible para mostrar en la interfaz, p. ej. "Gemini 3.8 Flash". */
export function modelLabel(id: string): string {
  const x = MODEL_RE.exec(id);
  if (!x) return id === 'gemini-flash-latest' ? 'Gemini Flash' : id;
  const fam = ({ flash: 'Flash', 'flash-lite': 'Flash-Lite', pro: 'Pro' } as const)[x[3] as Family];
  return `Gemini ${x[1]}${x[2] ? '.' + x[2] : ''} ${fam}${x[4] && /^preview/.test(x[4]) ? ' Preview' : ''}`;
}

export type ErrorKind = 'invalid_key' | 'unavailable' | 'busy' | 'other';

function classify(status: number, msg: string): ErrorKind {
  if (status === 400 && /api key not valid|api_key_invalid|api key expired/i.test(msg)) return 'invalid_key';
  if (status === 403) return /model/i.test(msg) && !/api key/i.test(msg) ? 'unavailable' : 'invalid_key';
  if (
    status === 404 ||
    (status === 400 && /not supported|not found|unsupported|not available|is not a valid model/i.test(msg)) ||
    (status === 429 && /limit:\s*0\b|not available for (this|the) (free|tier)/i.test(msg))
  ) return 'unavailable';
  if ([0, 429, 500, 502, 503, 504].includes(status)) return 'busy';
  return 'other';
}

export class GeminiError extends Error {
  status: number;
  kind: ErrorKind;
  constructor(status: number, message: string, kind?: ErrorKind) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.kind = kind ?? classify(status, message);
  }
}

const STORE_KEY = 'finagent.models.v2';
const REFRESH_MS = 12 * 3600_000; // se vuelve a descubrir cada 12 h
const BAD_MS = 24 * 3600_000;     // un modelo no disponible se descarta 24 h

export class ModelManager {
  chain: string[] = [FALLBACK];
  private bad = new Map<string, number>();
  private cooldown = new Map<string, number>();
  private at = 0;
  active: string | null = null;
  now = () => Date.now();

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
      if (saved?.chain?.length) {
        this.chain = saved.chain;
        this.at = saved.at;
        Object.entries(saved.bad ?? {}).forEach(([id, until]) => this.bad.set(id, until as number));
      }
    } catch { /* estado corrupto: se vuelve a descubrir */ }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ at: this.at, chain: this.chain, bad: Object.fromEntries(this.bad) }));
    } catch { /* sin almacenamiento */ }
  }

  /**
   * Valida la key y descubre los modelos disponibles. `strict` propaga los errores de red (para el onboarding);
   * sin `strict`, ante un fallo de red se conserva la cadena anterior. Una key inválida siempre lanza.
   */
  async discover(apiKey: string, force = false, strict = false): Promise<string[]> {
    if (!force && this.at && this.now() - this.at < REFRESH_MS) return this.chain;
    const found: Parsed[] = [];
    let pageToken: string | undefined;
    try {
      for (let page = 0; page < 5; page++) {
        const res = await http({
          url: `${API_ROOT}/models?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`,
          headers: { 'x-goog-api-key': apiKey },
          timeoutMs: 20000,
        });
        if (res.status < 200 || res.status >= 300) {
          let msg = res.text.slice(0, 200);
          try { msg = JSON.parse(res.text)?.error?.message ?? msg; } catch { /* texto plano */ }
          const kind = classify(res.status, msg);
          throw kind === 'invalid_key' ? new GeminiError(res.status, msg, kind) : new GeminiError(res.status, msg, 'busy');
        }
        const j = JSON.parse(res.text);
        for (const m of j.models ?? []) {
          const p = parseModel(m);
          if (p) found.push(p);
        }
        pageToken = j.nextPageToken;
        if (!pageToken) break;
      }
    } catch (e) {
      if (e instanceof GeminiError && e.kind === 'invalid_key') throw e;
      if (strict) throw e instanceof GeminiError ? e : new GeminiError(0, 'Sin conexión con Gemini', 'busy');
      return this.chain;
    }
    if (found.length) {
      this.chain = buildChain(found);
      this.at = this.now();
      this.persist();
    }
    return this.chain;
  }

  /** Primer modelo utilizable (no descartado, no en pausa y no excluido), o null. */
  pick(exclude: Iterable<string> = []): string | null {
    const skip = new Set(exclude);
    const t = this.now();
    for (const id of this.chain) {
      if (!skip.has(id) && !((this.bad.get(id) ?? 0) > t) && !((this.cooldown.get(id) ?? 0) > t)) return id;
    }
    return null;
  }

  /** Sin acceso, dado de baja o cuota 0 en el plan gratuito: se descarta 24 h. */
  markUnavailable(id: string): void {
    this.bad.set(id, this.now() + BAD_MS);
    this.persist();
  }
  /** Límite por minuto o saturación: pausa corta. */
  markCooldown(id: string, ms = 90_000): void {
    this.cooldown.set(id, this.now() + ms);
  }
  /** Fuerza un nuevo descubrimiento (p. ej. al cambiar de API key). */
  invalidate(): void {
    this.at = 0;
    this.bad.clear();
    this.cooldown.clear();
    this.persist();
  }
}
