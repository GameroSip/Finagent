// Cliente del servidor de FinAgent: cuenta automática (sin registro), plan y límites, y transporte de las consultas al modelo.
// Si la app se compila con VITE_API_BASE, funciona SIN que el usuario cargue ninguna clave de Gemini ni ningún código.
import { http } from './http';
import type { GenerateArgs, GenerateResult, Transport } from './transport';

let apiBase: string = String((import.meta as any).env?.VITE_API_BASE ?? '').replace(/\/+$/, '');
export const getApiBase = (): string => apiBase;
export const setApiBase = (b: string): void => { apiBase = b.replace(/\/+$/, ''); }; // para pruebas
export const isServerMode = (): boolean => !!apiBase;

// ------------------------------------------------------------------ almacenamiento (localStorage; en memoria si no hay)
const mem = new Map<string, string>();
const store = {
  get(k: string): string | null { try { return globalThis.localStorage?.getItem(k) ?? mem.get(k) ?? null; } catch { return mem.get(k) ?? null; } },
  set(k: string, v: string): void { mem.set(k, v); try { globalThis.localStorage?.setItem(k, v); } catch { /* sin almacenamiento */ } },
  remove(k: string): void { mem.delete(k); try { globalThis.localStorage?.removeItem(k); } catch { /* */ } },
};
const SESSION_KEY = 'finagent.session.v1';
const INTEREST_KEY = 'finagent.interest.v1';
// Fuera del prefijo "finagent." A PROPÓSITO: "borrar todo" no debe hacer que este teléfono cree otra cuenta (y otro cupo gratis).
const DEVICE_KEY = 'fa-device';

export type Tier = 'free' | 'paid';
export interface PlanInfo { id: string; label: string; modelLabel: string; dailyLimit: number; monthlyLimit: number; available?: boolean }
export interface Remaining { day: number; month: number }
export interface Session { token: string; expiresAt: number; plan: PlanInfo }
export interface PlanEntry extends PlanInfo { blurb: string; deepModelLabel: string | null; deepMonthlyLimit: number; available: boolean }

export function deviceId(): string {
  let d = store.get(DEVICE_KEY);
  if (!d) { d = globalThis.crypto?.randomUUID?.() ?? `d-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; store.set(DEVICE_KEY, d); }
  return d;
}
export function getSession(): Session | null {
  try {
    const s = JSON.parse(store.get(SESSION_KEY) ?? 'null') as Session | null;
    return s && typeof s.token === 'string' && s.expiresAt > Date.now() ? s : null;
  } catch { return null; }
}
export const hasSession = (): boolean => !!getSession();
/** Solo para pruebas: olvida el identificador de este teléfono (equivale a reinstalar la app). */
export const forgetDevice = (): void => store.remove(DEVICE_KEY);
export function signOut(): void { store.remove(SESSION_KEY); quota = {}; notifyQuota(); }

// ------------------------------------------------------------------ plan y consultas que quedan (visibles en la app)
export interface QuotaInfo { remaining?: Remaining; plan?: PlanInfo; resetsOn?: string; tier?: Tier }
let quota: QuotaInfo = {};
const qListeners = new Set<() => void>();
const notifyQuota = () => qListeners.forEach((f) => f());
export const quotaInfo = (): QuotaInfo => quota;
export const subscribeQuota = (fn: () => void): (() => void) => { qListeners.add(fn); return () => qListeners.delete(fn); };
const setQuota = (q: QuotaInfo) => { quota = { ...quota, ...q }; notifyQuota(); };

// ------------------------------------------------------------------ errores (cada uno con un mensaje que el usuario entiende)
export class LimitError extends Error {
  constructor(public reason: string, public resetsOn: string, public plan?: PlanInfo) { super('limit'); this.name = 'LimitError'; }
}
export class SessionError extends Error { constructor() { super('session'); this.name = 'SessionError'; } }
export class AccessDeniedError extends Error { constructor() { super('disabled'); this.name = 'AccessDeniedError'; } }
export type BusyKind = 'busy' | 'maintenance' | 'budget' | 'config' | 'network' | 'rate' | 'capacity';
export class ServerBusyError extends Error {
  constructor(public kind: BusyKind, public retryAfterSec?: number, public scope?: 'minute' | 'day' | 'signups', public tier?: Tier) { super(kind); this.name = 'ServerBusyError'; }
}
export class PlanCodeError extends Error {
  constructor(public code: 'code' | 'used' | 'rate' | 'network' | 'other') { super(code); this.name = 'PlanCodeError'; }
}

/** "2026-10-20" → "mañana a las 00:00" / "el 20/10" (según el día de hoy en el teléfono). */
export function resetLabel(resetsOn: string, today = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(resetsOn);
  if (!m) return 'más tarde';
  const t = new Date(today.getTime() + 86_400_000);
  const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  return resetsOn === tomorrow ? 'mañana a las 00:00' : `el ${m[3]}/${m[2]}`;
}
const fmtWait = (s: number) => (s < 60 ? `${Math.max(1, s)} segundos` : s < 5400 ? `${Math.ceil(s / 60)} minutos` : `${Math.ceil(s / 3600)} horas`);
const fmtLater = (s: number) => (s <= 3600 ? 'en menos de una hora' : s < 6 * 3600 ? `en unas ${Math.ceil(s / 3600)} horas` : 'mañana');

export function limitMessage(e: LimitError, today = new Date()): string {
  const when = resetLabel(e.resetsOn, today), p = e.plan, plan = p?.label ? ` de tu plan ${p.label}` : '';
  const upsell = p?.id === 'free' ? ' Los planes de pago (próximamente) tendrán más conversaciones y modelos más potentes: podés anotarte en Ajustes → Tu plan.' : '';
  if (e.reason === 'daily') return `Usaste las ${p?.dailyLimit ?? ''} conversaciones de hoy${plan}. Se reinician ${when}. Mientras tanto podés mirar Mercados, el dólar y los gráficos, que no gastan conversaciones.${upsell}`.replace('las  conversaciones', 'las conversaciones');
  if (e.reason === 'monthly') return `Llegaste al límite mensual${plan}. Se reinicia ${when}.${upsell}`;
  return 'Tu plan actual no incluye esta función.';
}
export function busyMessage(e: ServerBusyError): string {
  const free = e.tier !== 'paid';
  switch (e.kind) {
    case 'network': return 'No pude conectarme con FinAgent. Revisá tu conexión e intentá de nuevo.';
    case 'maintenance': return 'FinAgent está en mantenimiento. Volvé a intentar en unos minutos.';
    case 'budget': return 'FinAgent alcanzó su límite de uso de hoy. Probá de nuevo mañana: tu conversación no se descontó.';
    case 'config': return 'FinAgent tiene un problema de configuración. Ya estamos al tanto: tu conversación no se descontó.';
    case 'rate': return 'Estás consultando muy rápido. Esperá un momento e intentá de nuevo.';
    case 'capacity':
      if (e.scope === 'day') return `Hoy se agotó la capacidad ${free ? 'gratuita ' : ''}de FinAgent. Se reinicia ${fmtLater(e.retryAfterSec ?? 0)}. Tu conversación no se descontó.${free ? ' Los planes de pago (próximamente) tendrán capacidad reservada.' : ''}`;
      if (e.scope === 'signups') return 'FinAgent llegó hoy a su límite de usuarios nuevos. Probá de nuevo mañana.';
      return `Hay mucha demanda en este momento${free ? ' (FinAgent usa un cupo gratuito compartido)' : ''}. Probá de nuevo en ${fmtWait(e.retryAfterSec ?? 30)}. Tu conversación no se descontó.`;
    default: return `FinAgent tuvo un problema momentáneo${e.retryAfterSec ? `; probá de nuevo en ${fmtWait(e.retryAfterSec)}` : ''}. Tu conversación no se descontó.`;
  }
}
export function planCodeMessage(e: PlanCodeError): string {
  return ({ code: 'Ese código no es válido. Revisá que lo hayas escrito completo (FA-XXXX-XXXX).', used: 'Ese código ya se usó el máximo de veces. Pedí uno nuevo.',
    rate: 'Demasiados intentos. Esperá un rato e intentá de nuevo.', network: 'No pude conectarme con FinAgent. Revisá tu conexión e intentá de nuevo.',
    other: 'No pude validar el código. Intentá de nuevo en un momento.' } as const)[e.code];
}

/** Acepta el código con o sin guiones y en minúsculas: "fak7p29xqm" → "FA-K7P2-9XQM". */
export function normalizeCode(raw: string): string {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.startsWith('FA') && c.length === 10 ? `FA-${c.slice(2, 6)}-${c.slice(6)}` : raw.trim().toUpperCase();
}
export const isCodeShape = (s: string): boolean => /^FA-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(s);

// ------------------------------------------------------------------ llamadas
async function call(method: 'GET' | 'POST', path: string, body?: unknown, auth = true): Promise<{ status: number; json: any }> {
  const s = auth ? getSession() : null;
  const res = await http({ url: apiBase + path, method, headers: { 'content-type': 'application/json', ...(s ? { authorization: `Bearer ${s.token}` } : {}) }, body, timeoutMs: 90_000 });
  let json: any = null;
  try { json = JSON.parse(res.text); } catch { /* sin cuerpo JSON */ }
  return { status: res.status, json };
}
const netCall = async (...a: Parameters<typeof call>) => { try { return await call(...a); } catch { throw new ServerBusyError('network'); } };

/** Crea (o recupera) la cuenta automática de este teléfono. No hay registro: el teléfono se identifica solo. */
export async function registerDevice(): Promise<Session> {
  const r = await netCall('POST', '/v1/auth/device', { deviceId: deviceId() }, false);
  if (r.status === 200 && r.json?.token) {
    const s: Session = { token: r.json.token, expiresAt: r.json.expiresAt, plan: r.json.plan };
    store.set(SESSION_KEY, JSON.stringify(s));
    setQuota({ plan: s.plan, tier: r.json.tier });
    return s;
  }
  if (r.status === 403) throw new AccessDeniedError();
  if (r.status === 503 && r.json?.error === 'capacity') throw new ServerBusyError('capacity', r.json.retryAfterSec, r.json.scope, r.json.tier);
  if (r.status === 429) throw new ServerBusyError('rate', r.json?.retryAfterSec);
  throw new ServerBusyError('busy');
}
let registering: Promise<Session> | null = null;
/** Si ya hay sesión, la usa; si no, crea la cuenta automática (una sola vez aunque se pida varias veces a la vez). */
export async function ensureSession(): Promise<Session> {
  const s = getSession();
  if (s) return s;
  return (registering ??= registerDevice().finally(() => { registering = null; }));
}

/** Llamada con sesión: si el servidor dice que la sesión venció, se renueva sola (misma cuenta del teléfono) y se repite UNA vez. */
async function authed(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; json: any }> {
  await ensureSession();
  let r = await netCall(method, path, body);
  if (r.status === 401) { store.remove(SESSION_KEY); await ensureSession(); r = await netCall(method, path, body); }
  return r;
}

export async function fetchMe(): Promise<QuotaInfo> {
  const r = await authed('GET', '/v1/me');
  if (r.status !== 200) throw new ServerBusyError('busy');
  setQuota({ plan: r.json.plan, remaining: r.json.remaining, resetsOn: r.json.resetsOn, tier: r.json.tier });
  return quota;
}

/** Catálogo de planes (lo arma el servidor: una sola fuente de verdad). */
export async function fetchPlans(): Promise<{ tier: Tier; plans: PlanEntry[] }> {
  const r = await netCall('GET', '/v1/plans', undefined, false);
  if (r.status !== 200 || !Array.isArray(r.json?.plans)) throw new ServerBusyError('busy');
  setQuota({ tier: r.json.tier });
  return { tier: r.json.tier, plans: r.json.plans };
}

/** Un código de acceso desbloquea un plan (para testers). */
export async function redeemPlanCode(code: string): Promise<{ plan: PlanInfo; unchanged: boolean }> {
  let r: { status: number; json: any };
  try { r = await authed('POST', '/v1/plan/redeem', { code: normalizeCode(code) }); } catch { throw new PlanCodeError('network'); }
  if (r.status === 200) { setQuota({ plan: r.json.plan, ...(r.json.remaining ? { remaining: r.json.remaining } : {}) }); if (!r.json.unchanged) void fetchMe().catch(() => {}); return { plan: r.json.plan, unchanged: !!r.json.unchanged }; }
  throw new PlanCodeError(r.status === 404 || r.status === 400 ? 'code' : r.status === 403 ? 'used' : r.status === 429 ? 'rate' : 'other');
}

// "Avisame cuando esté disponible": se recuerda también en el teléfono para mostrarlo como anotado.
export const getInterests = (): string[] => { try { const v = JSON.parse(store.get(INTEREST_KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
export async function sendInterest(plan: string): Promise<void> {
  const r = await authed('POST', '/v1/interest', { plan });
  if (r.status !== 200) throw new ServerBusyError('busy');
  store.set(INTEREST_KEY, JSON.stringify([...new Set([...getInterests(), plan])]));
}

export class ServerTransport implements Transport {
  async generate(a: GenerateArgs): Promise<GenerateResult> {
    const { status, json } = await authed('POST', '/v1/generate', { contents: a.contents, withTools: a.withTools, ...(a.turn ? { turn: a.turn } : {}) });
    if (status === 200 && json?.data) {
      if (json.remaining) setQuota({ remaining: json.remaining, plan: json.plan, tier: json.tier });
      return { data: json.data, model: json.model, turn: json.turn };
    }
    if (status === 401) throw new SessionError();
    if (status === 429 && json?.error === 'limit') { setQuota({ remaining: { day: 0, month: json.reason === 'monthly' ? 0 : quota.remaining?.month ?? 0 }, plan: json.plan }); throw new LimitError(json.reason, json.resetsOn, json.plan); }
    if (status === 429) throw new ServerBusyError('rate', json?.retryAfterSec);
    if (status === 503 && json?.error === 'capacity') throw new ServerBusyError('capacity', json.retryAfterSec, json.scope, json.tier);
    if (status === 503 && ['maintenance', 'budget'].includes(json?.error)) throw new ServerBusyError(json.error);
    if (status === 500 && json?.error === 'config') throw new ServerBusyError('config');
    throw new ServerBusyError('busy', json?.retryAfterSec);
  }
  async abandon(turn: string): Promise<void> {
    try { await authed('POST', '/v1/turn/abandon', { turn }); await fetchMe().catch(() => {}); } catch { /* mejor esfuerzo */ }
  }
}
export const transport = new ServerTransport();
