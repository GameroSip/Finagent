// Servidor de FinAgent: cuentas automáticas (sin registro), planes con un modelo fijo y límites, y puente con Gemini.
// Es una función (Request → Response) sin dependencias de la plataforma: corre en Cloudflare Workers, en Node o en cualquier otro lado.
import { estimateCostUSD } from '../src/pricing';
import { consume, localDates, PLAN_RANK, PLANS, planNote, refund, type Plan, type PlanId, type Ticket } from '../src/plans';
import { ADMIN_HTML } from './admin-page';
import { CODE_RE, newId, newInviteCode, signToken, timingSafeEqual, verifyToken } from './auth';
import { chainFor, type ModelRouter } from './gemini';
import type { SqlStore, UserRow } from './store';

export interface Env {
  JWT_SECRET: string; ADMIN_TOKEN: string;
  DAILY_BUDGET_USD?: string;        // tope de gasto diario (USD): importa cuando la clave de Gemini es de pago
  KILL_SWITCH?: string;             // "1" = mantenimiento
  GEMINI_TIER?: string;             // "free" (por defecto) o "paid": define qué se le dice al usuario sobre sus datos y la capacidad
  GEMINI_RPM?: string;              // pedidos por minuto que el servidor se permite hacerle a Gemini (cuida el cupo gratuito)
  GLOBAL_DAILY_ANSWERS?: string;    // respuestas nuevas por día en total (cuida el cupo gratuito)
  MAX_NEW_USERS_PER_DAY?: string;   // cuentas automáticas nuevas por día en total
}
export interface Deps { store: SqlStore; env: Env; router: ModelRouter; now?: () => Date; tz?: string; version?: string }

const TOKEN_TTL_SEC = 90 * 24 * 3600;     // la sesión dura 90 días
const TURN_TTL_MS = 10 * 60_000;          // una respuesta tiene 10 minutos para completarse
const MAX_CALLS_PER_TURN = 12;
const MAX_BODY_BYTES = 120_000;
const MAX_MESSAGES = 60;
const GENERATE_PER_MINUTE = 20;           // ráfaga por usuario
const DEVICE_AUTH_PER_HOUR = 30;          // intentos de crear/recuperar cuenta por dirección y hora
const NEW_ACCOUNTS_PER_IP_DAY = 5;        // cuentas nuevas por dirección y día (contra quien crea cuentas en masa para cobrar más cupo gratis)
const PLAN_REDEEM_PER_HOUR = 10;
const DEVICE_RE = /^[A-Za-z0-9_-]{8,80}$/;

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '86400' };
const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS, ...extra } });

class HttpError extends Error { constructor(public status: number, public body: unknown) { super(String((body as any)?.error ?? status)); } }

/** Segundos que faltan para la medianoche en la zona horaria dada. */
function secondsToMidnight(now: Date, tz: string): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return 86_400 - (g('hour') * 3600 + g('minute') * 60 + g('second'));
}

export function createApp(d: Deps): (req: Request) => Promise<Response> {
  const { store, env, router } = d;
  const now = () => (d.now ? d.now() : new Date());
  const tz = d.tz ?? 'America/Argentina/Cordoba';
  const tier = env.GEMINI_TIER === 'paid' ? 'paid' : 'free';
  const num = (v: string | undefined, dflt: number) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) ? n : dflt; };
  const stat = (name: string) => store.incr(`stat:${name}:${localDates(now(), tz).day}`, 1);

  async function readJson(req: Request): Promise<any> {
    const len = Number(req.headers.get('content-length') ?? 0);
    if (len > MAX_BODY_BYTES) throw new HttpError(413, { error: 'too_large' });
    const text = await req.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new HttpError(413, { error: 'too_large' });
    try { return JSON.parse(text || '{}'); } catch { throw new HttpError(400, { error: 'bad_json' }); }
  }

  async function authUser(req: Request): Promise<{ user: UserRow; plan: Plan }> {
    const m = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '');
    const p = m ? await verifyToken(m[1], env.JWT_SECRET, Math.floor(now().getTime() / 1000)) : null;
    const user = p ? await store.getUser(p.sub) : null;
    if (!user || user.disabled) throw new HttpError(401, { error: 'session' });
    return { user, plan: PLANS[user.plan as PlanId] ?? PLANS.free };
  }

  async function remainingFor(user: UserRow, plan: Plan) {
    const dt = localDates(now(), tz);
    const day = await store.peek(`${user.id}:d:${dt.day}`), month = await store.peek(`${user.id}:m:${dt.month}`);
    return { day: Math.max(0, plan.dailyLimit - day), month: Math.max(0, plan.monthlyLimit - month) };
  }
  const planInfo = (p: Plan) => ({ id: p.id, label: p.label, modelLabel: p.modelLabel, dailyLimit: p.dailyLimit, monthlyLimit: p.monthlyLimit, available: p.available });
  const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const capacity = (scope: 'minute' | 'day' | 'signups', retryAfterSec: number) => json(503, { error: 'capacity', scope, retryAfterSec, tier }, { 'retry-after': String(retryAfterSec) });

  // ------------------------------------------------------------------ rutas
  /** Cuenta automática: el teléfono se presenta con su identificador y el servidor le da una sesión. Sin registro ni códigos. */
  async function deviceAuth(req: Request): Promise<Response> {
    const ip = clientIp(req), dt = localDates(now(), tz);
    if (await store.incr(`rl:device:${ip}:${Math.floor(now().getTime() / 3_600_000)}`, 1) > DEVICE_AUTH_PER_HOUR) return json(429, { error: 'rate', retryAfterSec: 3600 });
    const deviceId = String((await readJson(req)).deviceId ?? '');
    if (!DEVICE_RE.test(deviceId)) return json(400, { error: 'bad_request' });
    let user = await store.findUser('device', deviceId);
    if (!user) {
      if (await store.peek(`new:all:${dt.day}`) >= num(env.MAX_NEW_USERS_PER_DAY, 300)) return capacity('signups', secondsToMidnight(now(), tz));
      if (await store.peek(`new:ip:${ip}:${dt.day}`) >= NEW_ACCOUNTS_PER_IP_DAY) return json(429, { error: 'signups_ip', retryAfterSec: secondsToMidnight(now(), tz) });
      user = { id: newId(), code: 'device', device_id: deviceId, plan: 'free', created_at: now().toISOString(), disabled: 0, plan_code: null };
      await store.createUser(user);
      await store.incr(`new:all:${dt.day}`, 1); await store.incr(`new:ip:${ip}:${dt.day}`, 1);
    }
    if (user.disabled) return json(403, { error: 'disabled' });
    const iat = Math.floor(now().getTime() / 1000);
    return json(200, { token: await signToken({ sub: user.id, iat, exp: iat + TOKEN_TTL_SEC }, env.JWT_SECRET), plan: planInfo(PLANS[user.plan] ?? PLANS.free), tier, expiresAt: (iat + TOKEN_TTL_SEC) * 1000 });
  }

  async function me(req: Request): Promise<Response> {
    const { user, plan } = await authUser(req);
    return json(200, { plan: planInfo(plan), remaining: await remainingFor(user, plan), resetsOn: localDates(now(), tz).nextDay, tier });
  }

  /** Catálogo público de planes: la app lo muestra tal cual (una sola fuente de verdad). */
  function plans(): Response {
    return json(200, { tier, plans: Object.values(PLANS).map((p) => ({ id: p.id, label: p.label, available: p.available, blurb: p.blurb, modelLabel: p.modelLabel, deepModelLabel: p.deepModelLabel ?? null,
      dailyLimit: p.dailyLimit, monthlyLimit: p.monthlyLimit, deepMonthlyLimit: p.deepMonthlyLimit })) });
  }

  /** Un código de acceso desbloquea un plan (para testers): no se usa para entrar. */
  async function planRedeem(req: Request): Promise<Response> {
    const { user } = await authUser(req);
    if (await store.incr(`rl:plan:${user.id}:${Math.floor(now().getTime() / 3_600_000)}`, 1) > PLAN_REDEEM_PER_HOUR) return json(429, { error: 'rate', retryAfterSec: 3600 });
    const code = String((await readJson(req)).code ?? '').trim().toUpperCase();
    if (!CODE_RE.test(code)) return json(400, { error: 'bad_request' });
    const invite = await store.getInvite(code);
    if (!invite || invite.disabled) return json(404, { error: 'code' });          // mismo mensaje exista o no: no se pueden adivinar códigos
    const current = PLANS[user.plan] ?? PLANS.free, target = PLANS[invite.plan];
    if (user.plan_code === code || PLAN_RANK[invite.plan] <= PLAN_RANK[current.id]) return json(200, { plan: planInfo(current), unchanged: true }); // ya lo tiene (o tendría un plan menor): no se gasta el código
    if (await store.countRedemptions(code) >= invite.max_devices) return json(403, { error: 'used' });
    await store.setUserPlan(user.id, invite.plan, code);
    return json(200, { plan: planInfo(target), unchanged: false, remaining: await remainingFor({ ...user, plan: invite.plan }, target) });
  }

  /** "Avisame cuando esté": mide cuánta gente querría cada plan de pago. */
  async function interest(req: Request): Promise<Response> {
    const { user } = await authUser(req);
    const plan = String((await readJson(req)).plan ?? '');
    if (!PLANS[plan as PlanId] || PLANS[plan as PlanId].available) return json(400, { error: 'plan' });
    return json(200, { ok: true, first: await store.addInterest(user.id, plan, now().getTime()) });
  }

  async function generate(req: Request): Promise<Response> {
    if (env.KILL_SWITCH === '1') return json(503, { error: 'maintenance' });
    const { user, plan } = await authUser(req);
    const b = await readJson(req);
    const contents = b.contents;
    if (!Array.isArray(contents) || !contents.length || contents.length > MAX_MESSAGES || contents.some((c) => !c || (c.role !== 'user' && c.role !== 'model') || !Array.isArray(c.parts))) return json(400, { error: 'bad_request' });

    const t = now().getTime(), dt = localDates(now(), tz);
    if (await store.incr(`rl:gen:${user.id}:${Math.floor(t / 60_000)}`, 1) > GENERATE_PER_MINUTE) return json(429, { error: 'rate', retryAfterSec: 30 }); // ráfaga: no cuenta como consulta
    const dayStart = Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), now().getUTCDate());
    if (await store.costSince(dayStart) >= num(env.DAILY_BUDGET_USD, 5)) return json(503, { error: 'budget' });   // corte de emergencia: tope de gasto diario

    // Cuidado del cupo de Gemini (clave gratuita): el servidor se limita ANTES de pedir, así no choca contra el límite de Google.
    const minute = Math.floor(t / 60_000), rpm = Math.max(1, num(env.GEMINI_RPM, 8));
    if (await store.incr(`rl:gemini:${minute}`, 1) > rpm) { await store.incr(`rl:gemini:${minute}`, -1); await stat('cap'); return capacity('minute', 60 - Math.floor((t % 60_000) / 1000)); }
    const answersKey = `cap:ans:${dt.day}`;
    const release = () => store.incr(`rl:gemini:${minute}`, -1); // si al final no se le pide nada a Gemini, el pedido no cuenta contra el límite por minuto
    if (!b.turn && await store.peek(answersKey) >= num(env.GLOBAL_DAILY_ANSWERS, 150)) { await release(); await stat('cap'); return capacity('day', secondsToMidnight(now(), tz)); }

    // Una respuesta de FinAgent = varios pedidos al modelo (herramientas, corrección), pero cuenta como UNA consulta: se descuenta en el primero.
    let turnId: string | undefined, pinned: string | undefined, ticket: Ticket | undefined;
    let remaining: { day: number; month: number } | undefined;
    if (b.turn) {
      const turn = await store.getTurn(String(b.turn));
      if (!turn || turn.user_id !== user.id) { await release(); return json(400, { error: 'turn' }); }
      if (t - turn.created_at > TURN_TTL_MS || turn.refunded) { await release(); return json(400, { error: 'turn_expired' }); }
      if (turn.calls >= MAX_CALLS_PER_TURN) { await release(); return json(429, { error: 'turn_limit' }); }
      await store.bumpTurn(turn.id); turnId = turn.id; pinned = turn.model;
    } else {
      const c = await consume(store, user.id, plan, now(), tz, { deep: !!b.deep });
      if (!c.ok) { await release(); return json(429, { error: 'limit', reason: c.reason, resetsOn: c.resetsOn, plan: planInfo(plan) }); }
      ticket = c.ticket; remaining = c.remaining;
    }

    const r = await router.generate({ chain: chainFor(plan, !!b.deep), pinned, contents, withTools: !!b.withTools, note: planNote(plan) });
    if (!r.ok) {
      if (ticket) await refund(store, ticket);                                                       // no se entregó nada: no se cobra la consulta
      if (r.error === 'capacity') { await stat('429'); return capacity(r.scope, r.retryAfterSec); }  // el cupo de Gemini se agotó: se explica, no es una falla
      return json(r.status, { error: r.error, retryAfterSec: r.retryAfterSec, tier }, r.retryAfterSec ? { 'retry-after': String(r.retryAfterSec) } : {});
    }
    const u = r.data?.usageMetadata ?? {};
    const tokens = { input: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0, thoughts: u.thoughtsTokenCount ?? 0, cached: u.cachedContentTokenCount ?? 0 };
    await store.logCall({ user_id: user.id, ts: t, model: r.model, in_tokens: tokens.input, out_tokens: tokens.output, thoughts: tokens.thoughts, cached: tokens.cached, cost_usd: estimateCostUSD(r.model, tokens, now()) ?? 0 });
    if (!turnId) { turnId = newId(); await store.incr(answersKey, 1); await store.putTurn({ id: turnId, user_id: user.id, created_at: t, calls: 1, model: r.model, ticket: JSON.stringify(ticket), refunded: 0 }); }
    return json(200, { data: r.data, model: r.model, turn: turnId, remaining: remaining ?? await remainingFor(user, plan), plan: planInfo(plan), tier });
  }

  /** La respuesta no pudo completarse (después de haber descontado la consulta): se devuelve, una sola vez. */
  async function abandon(req: Request): Promise<Response> {
    const { user } = await authUser(req);
    const b = await readJson(req);
    const turn = b.turn ? await store.getTurn(String(b.turn)) : null;
    if (!turn || turn.user_id !== user.id) return json(400, { error: 'turn' });
    if (await store.markRefunded(turn.id)) await refund(store, JSON.parse(turn.ticket) as Ticket);
    return json(200, { ok: true });
  }

  function admin(req: Request): void {
    const m = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '');
    if (!env.ADMIN_TOKEN || !m || !timingSafeEqual(m[1], env.ADMIN_TOKEN)) throw new HttpError(401, { error: 'admin' });
  }

  async function adminInvites(req: Request): Promise<Response> {
    admin(req);
    const b = await readJson(req);
    const count = Math.min(Math.max(Number(b.count ?? 1), 1), 200);
    const plan = (b.plan ?? 'plus') as PlanId;
    if (!PLANS[plan]) return json(400, { error: 'plan' });
    const uses = Math.min(Math.max(Number(b.uses ?? b.maxDevices ?? 1), 1), 1000);       // cuántas personas pueden canjear cada código
    const codes: string[] = [];
    while (codes.length < count) { const code = newInviteCode(); if (await store.createInvite(code, plan, uses, b.note ? String(b.note).slice(0, 80) : null, now().toISOString())) codes.push(code); }
    return json(200, { codes, plan, uses });
  }

  async function adminUsage(req: Request, url: URL): Promise<Response> {
    admin(req);
    const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 7), 1), 90);
    const rep = await store.usageReport(now().getTime() - days * 86_400_000);
    const total = rep.byDay.reduce((a, r) => ({ calls: a.calls + r.calls, cost: a.cost + r.cost }), { calls: 0, cost: 0 });
    let gemini429 = 0, capacityRejects = 0;
    for (let i = 0; i < days; i++) {                                                     // cuántas veces el cupo de Gemini o el del servidor dijo "no"
      const day = localDates(new Date(now().getTime() - i * 86_400_000), tz).day;
      gemini429 += await store.peek(`stat:429:${day}`); capacityRejects += await store.peek(`stat:cap:${day}`);
    }
    return json(200, { days, tier, ...rep, usersByPlan: await store.usersByPlan(), interest: await store.interestCounts(), stats: { gemini429, capacityRejects },
      total: { ...total, answers: rep.answers, costPerAnswer: rep.answers ? total.cost / rep.answers : null } });
  }

  async function adminUsers(req: Request): Promise<Response> {
    admin(req);
    const b = await readJson(req);
    if (b.plan !== undefined && !PLANS[b.plan as PlanId]) return json(400, { error: 'plan' });
    const n = await store.updateUsers({ userId: b.userId, code: b.code }, { plan: b.plan, disabled: b.disabled });
    return json(200, { updated: n });
  }

  return async (req) => {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      const route = `${req.method} ${url.pathname.replace(/\/+$/, '') || '/'}`;
      switch (route) {
        case 'GET /admin': return new Response(ADMIN_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'", 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' } });
        case 'GET /health': return json(200, { ok: true, version: d.version ?? 'dev', tier });
        case 'GET /v1/plans': return plans();
        case 'POST /v1/auth/device': return await deviceAuth(req);
        case 'GET /v1/me': return await me(req);
        case 'POST /v1/plan/redeem': return await planRedeem(req);
        case 'POST /v1/interest': return await interest(req);
        case 'POST /v1/generate': return await generate(req);
        case 'POST /v1/turn/abandon': return await abandon(req);
        case 'POST /v1/admin/invites': return await adminInvites(req);
        case 'GET /v1/admin/usage': return await adminUsage(req, url);
        case 'POST /v1/admin/users': return await adminUsers(req);
        default: return json(404, { error: 'not_found' });
      }
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, e.body);
      return json(500, { error: 'internal' }); // sin detalles hacia afuera
    }
  };
}
