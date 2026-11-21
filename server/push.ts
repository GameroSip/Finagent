// Avisos push anónimos por tópicos de FCM (API HTTP v1), pensado para Cloudflare Workers: la firma del JWT de la cuenta de servicio
// se hace con Web Crypto (crypto.subtle), sin librerías de Node. Lo dispara un Cron Trigger (ver wrangler.toml).
//
// Privacidad: el servidor manda a tópicos PÚBLICOS (p. ej. macro_dolar_es_h13). No guarda tokens ni sabe quién está suscripto;
// la app se suscribe sola, desde el teléfono, a las horas en que acepta avisos (eso implementa el horario de silencio de cada uno).
// Lo único que guarda es el último valor avisado de cada indicador (tabla push_state), para no repetir avisos.
//
// Fuentes: DolarAPI, ArgentinaDatos y alternative.me responden a servidores en la nube. Yahoo no: por eso el termómetro de tensión
// del S&P 500 se evalúa en el teléfono, y el tópico radar_stress del servidor lleva el índice de miedo y codicia (cripto), dicho tal cual.
import { briefMessage, dolarMessage, fngMessage, fngRegime, notifyViolations, topicName, type FngRegime, type NotifyMessage, type ServerTopic } from '../src/notifyTexts';
import { FORBIDDEN_CLAIMS } from '../src/about';
import type { UiLang } from '../src/i18n';
import type { D1Like } from './d1';

export interface ServiceAccount { project_id: string; client_email: string; private_key: string }
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return typeof j.project_id === 'string' && typeof j.client_email === 'string' && typeof j.private_key === 'string' && j.private_key.includes('PRIVATE KEY') ? j : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- JWT RS256 con Web Crypto
const enc = new TextEncoder();
export function b64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === 'string' ? enc.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function pemToDer(pem: string): ArrayBuffer {
  const b = atob(pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\s+/g, ''));
  const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out.buffer;
}
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export async function signServiceJwt(sa: ServiceAccount, nowSec: number): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
export class FcmClient {
  private token: { value: string; exp: number } | null = null;
  constructor(private sa: ServiceAccount, private fetchFn: FetchFn = (u, i) => fetch(u, i), private now: () => number = () => Date.now()) {}
  private async accessToken(): Promise<string> {
    if (this.token && this.token.exp - 60_000 > this.now()) return this.token.value;
    const assertion = await signServiceJwt(this.sa, Math.floor(this.now() / 1000));
    const res = await this.fetchFn(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}` });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || typeof j.access_token !== 'string') throw new Error(`FCM: no pude obtener el token de acceso (${res.status})`);
    this.token = { value: j.access_token, exp: this.now() + (Number(j.expires_in) || 3600) * 1000 };
    return this.token.value;
  }
  /** Manda un aviso a un tópico. Antes controla el texto: un aviso que prometa de más o suene a recomendación NO sale. */
  async send(topic: string, base: ServerTopic, msg: NotifyMessage): Promise<void> {
    assertSafe(msg);
    const link = msg.link.to === 'asset' ? `asset/${msg.link.symbol}` : msg.link.to;
    const res = await this.fetchFn(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.sa.project_id)}/messages:send`, {
      method: 'POST', headers: { authorization: `Bearer ${await this.accessToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: {
        topic, notification: { title: msg.title, body: msg.body }, data: { link, topic: base, channel: msg.channel },
        android: { priority: 'normal', ttl: '3600s', notification: { channel_id: msg.channel, icon: 'ic_stat_finagent', color: '#3B82F6' } },
      } }),
    });
    if (!res.ok) throw new Error(`FCM: el envío a ${topic} falló (${res.status})`);
  }
}
export function assertSafe(msg: NotifyMessage): void {
  const text = `${msg.title} ${msg.body}`;
  const bad = [...notifyViolations(text), ...FORBIDDEN_CLAIMS.filter(([, re]) => re.test(text)).map(([w]) => w)];
  if (bad.length) throw new Error(`Aviso bloqueado (${bad.join(', ')}): ${text}`);
}

// ---------------------------------------------------------------- estado mínimo (último valor avisado)
export interface Kv { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<void> }
export class D1Kv implements Kv {
  constructor(private db: D1Like) {}
  async get(k: string) { const r = await this.db.prepare('SELECT v FROM push_state WHERE k = ?').bind(k).all<{ v: string }>(); return r.results[0]?.v ?? null; }
  async set(k: string, v: string) { await this.db.prepare('INSERT INTO push_state (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at').bind(k, v, Date.now()).run(); }
}
export class MemoryKv implements Kv { m = new Map<string, string>(); async get(k: string) { return this.m.get(k) ?? null; } async set(k: string, v: string) { this.m.set(k, v); } }

// ---------------------------------------------------------------- el control periódico
export interface PushConfig {
  dolarPct: number;           // variación mínima (%) desde el último aviso para avisar de nuevo
  dolarCooldownMs: number;    // y como mucho un aviso por cotización cada tanto
  briefUtcHour: number;       // hora UTC del resumen diario (13 = 10:00 en Argentina)
  langs: UiLang[];
}
export const PUSH_CFG: PushConfig = { dolarPct: 2, dolarCooldownMs: 3 * 3600_000, briefUtcHour: 13, langs: ['es', 'en', 'pt'] };
const CASAS = ['blue', 'oficial', 'bolsa'] as const;

export interface Sender { send(topic: string, base: ServerTopic, msg: NotifyMessage): Promise<void> }
export interface CronResult { sent: string[]; errors: string[] }
const getJson = async (f: FetchFn, url: string) => { const r = await f(url, { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json() as Promise<any>; };

export async function runPushCron(o: { kv: Kv; sender: Sender; fetchFn: FetchFn; now: Date; cfg?: Partial<PushConfig> }): Promise<CronResult> {
  const cfg = { ...PUSH_CFG, ...o.cfg }, now = o.now.getTime(), hour = o.now.getUTCHours(), out: CronResult = { sent: [], errors: [] };
  const broadcast = async (base: ServerTopic, make: (lang: UiLang) => NotifyMessage) => {
    for (const lang of cfg.langs) {
      const topic = topicName(base, lang, hour);
      try { await o.sender.send(topic, base, make(lang)); out.sent.push(topic); } catch (e: any) { out.errors.push(String(e?.message ?? e)); }
    }
  };
  let dolares: any[] | null = null;
  try { dolares = await getJson(o.fetchFn, 'https://dolarapi.com/v1/dolares'); } catch (e: any) { out.errors.push(String(e?.message ?? e)); }
  const venta = (casa: string) => { const v = Number(dolares?.find((d) => d?.casa === casa)?.venta); return Number.isFinite(v) && v > 0 ? v : null; };

  // 1) Dólar: aviso cuando se mueve `dolarPct` % o más desde el ÚLTIMO AVISO (no desde el valor anterior: así un goteo lento también avisa una vez).
  for (const casa of CASAS) {
    const v = venta(casa); if (v == null) continue;
    const base = Number(await o.kv.get(`dolar:${casa}`)), at = Number(await o.kv.get(`dolar:${casa}:at`)) || 0;
    if (!base) { await o.kv.set(`dolar:${casa}`, String(v)); continue; }
    if (Math.abs(v / base - 1) * 100 >= cfg.dolarPct && now - at >= cfg.dolarCooldownMs) {
      await broadcast('macro_dolar', (lang) => dolarMessage(lang, casa, v, base));
      await o.kv.set(`dolar:${casa}`, String(v)); await o.kv.set(`dolar:${casa}:at`, String(now));
    }
  }

  // 2) Miedo y codicia (cripto): aviso solo cuando cambia de régimen, con histéresis (no por un punto alrededor del límite).
  try {
    const j = await getJson(o.fetchFn, 'https://api.alternative.me/fng/?limit=1'), value = Number(j?.data?.[0]?.value);
    if (Number.isFinite(value)) {
      const prev = (await o.kv.get('fng:regime')) as FngRegime | null, reg = fngRegime(value, prev);
      if (!prev) await o.kv.set('fng:regime', reg);
      else if (reg !== prev) { await broadcast('radar_stress', (lang) => fngMessage(lang, prev, reg, value)); await o.kv.set('fng:regime', reg); }
    }
  } catch (e: any) { out.errors.push(String(e?.message ?? e)); }

  // 3) Resumen del día: una vez, de lunes a viernes, a la hora configurada.
  const day = o.now.toISOString().slice(0, 10), weekday = o.now.getUTCDay() >= 1 && o.now.getUTCDay() <= 5;
  if (weekday && hour === cfg.briefUtcHour && (await o.kv.get('brief:date')) !== day) {
    const oficial = venta('oficial'), blue = venta('blue'), mep = venta('bolsa');
    if (oficial && blue && mep) {
      let riesgo: number | null = null;
      try { const r = await getJson(o.fetchFn, 'https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo'); riesgo = Number.isFinite(Number(r?.valor)) ? Number(r.valor) : null; } catch { /* sin riesgo país: el resumen sale igual */ }
      await broadcast('daily_brief', (lang) => briefMessage(lang, { oficial, blue, mep, riesgo }));
      await o.kv.set('brief:date', day);
    }
  }
  return out;
}
