// Punto de entrada de Cloudflare Workers. Secretos: JWT_SECRET, ADMIN_TOKEN, GEMINI_API_KEY (se cargan con `wrangler secret put`). Base: D1 (binding "DB").
import { createApp, type Env } from './app';
import { D1Sql, type D1Like } from './d1';
import { ModelRouter } from './gemini';
import { SqlStore } from './store';

// GEMINI_BASE es opcional: solo sirve para apuntar a un Gemini simulado en las pruebas locales (por defecto, el de Google).
interface WorkerEnv extends Env { DB: D1Like; GEMINI_API_KEY: string; GEMINI_BASE?: string }

let currentKey = '';
let currentBase = 'https://generativelanguage.googleapis.com/v1beta';
// El enrutador vive en el "isolate" y conserva qué modelos están sin cupo entre pedidos.
const router = new ModelRouter(async (model, body) => {
  const res = await fetch(`${currentBase}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': currentKey }, body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
});

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    currentKey = env.GEMINI_API_KEY;
    currentBase = env.GEMINI_BASE ?? 'https://generativelanguage.googleapis.com/v1beta';
    return createApp({ store: new SqlStore(new D1Sql(env.DB)), env, router, version: '0.6.0' })(req);
  },
};
