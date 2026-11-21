// Punto de entrada de Cloudflare Workers. Secretos: JWT_SECRET, ADMIN_TOKEN, GEMINI_API_KEY (se cargan con `wrangler secret put`). Base: D1 (binding "DB").
import { createApp, type Env } from './app';
import { D1Sql, type D1Like } from './d1';
import { ModelRouter } from './gemini';
import { SqlStore } from './store';
import { D1Kv, FcmClient, parseServiceAccount, runPushCron } from './push';

// GEMINI_BASE es opcional: solo sirve para apuntar a un Gemini simulado en las pruebas locales (por defecto, el de Google).
// FCM_SERVICE_ACCOUNT (secreto, opcional): JSON de la cuenta de servicio de Firebase. Sin él, el control periódico no manda nada.
interface WorkerEnv extends Env { DB: D1Like; GEMINI_API_KEY: string; GEMINI_BASE?: string; FCM_SERVICE_ACCOUNT?: string; PUSH_DOLAR_PCT?: string }

let currentKey = '';
let currentBase = 'https://generativelanguage.googleapis.com/v1beta';
// El enrutador vive en el "isolate" y conserva qué modelos están sin cupo entre pedidos.
const router = new ModelRouter(async (model, body, timeoutMs) => {
  const res = await fetch(`${currentBase}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': currentKey }, body: JSON.stringify(body),
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
  return { status: res.status, text: await res.text() };
});

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    currentKey = env.GEMINI_API_KEY;
    currentBase = env.GEMINI_BASE ?? 'https://generativelanguage.googleapis.com/v1beta';
    return createApp({ store: new SqlStore(new D1Sql(env.DB)), env, router, version: '0.16.0' })(req);
  },
  // Cron Trigger (wrangler.toml → [triggers]): avisos push por tópicos (dólar, miedo y codicia, resumen diario).
  async scheduled(_event: unknown, env: WorkerEnv, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    const sa = parseServiceAccount(env.FCM_SERVICE_ACCOUNT);
    if (!sa) return;                                              // push no configurado: no hace nada (ni consulta fuentes ni escribe la base)
    ctx.waitUntil(runPushCron({ kv: new D1Kv(env.DB), sender: new FcmClient(sa), fetchFn: (u, i) => fetch(u, i), now: new Date(), cfg: env.PUSH_DOLAR_PCT ? { dolarPct: Number(env.PUSH_DOLAR_PCT) || 2 } : {} })
      .then((r) => { if (r.errors.length) console.log('push:', r.errors.slice(0, 5).join(' | ')); }));
  },
};
