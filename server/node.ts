// Servidor local para desarrollo y pruebas manuales (no es el de producción):
//   npx tsx server/node.ts                      → http://localhost:8787 con Gemini FALSO (no gasta cupo)
//   GEMINI_API_KEY=... npx tsx server/node.ts   → con Gemini real
// Variables: PORT, DB_FILE (por defecto finagent-dev.db), JWT_SECRET, ADMIN_TOKEN, DAILY_BUDGET_USD.
import { createServer } from 'node:http';
import { fakeGemini } from '../evals/fake-gemini';
import { createApp } from './app';
import { ModelRouter, type GeminiFetch } from './gemini';
import { NodeSql } from './node-sql';
import { SqlStore } from './store';

const key = process.env.GEMINI_API_KEY ?? '';
const fake = fakeGemini('bueno');
const call: GeminiFetch = key
  ? async (model, body) => { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) }); return { status: r.status, text: await r.text() }; }
  : async (model, body) => { const r = await fake({ url: `https://fake/models/${model}:generateContent`, method: 'POST', body }); return { status: r.status, text: r.text }; };

const store = new SqlStore(new NodeSql(process.env.DB_FILE ?? 'finagent-dev.db'));
await store.migrate();
const env = { JWT_SECRET: process.env.JWT_SECRET ?? 'dev-secret-cambiar', ADMIN_TOKEN: process.env.ADMIN_TOKEN ?? 'dev-admin', DAILY_BUDGET_USD: process.env.DAILY_BUDGET_USD,
  GEMINI_TIER: process.env.GEMINI_TIER, GEMINI_RPM: process.env.GEMINI_RPM, GLOBAL_DAILY_ANSWERS: process.env.GLOBAL_DAILY_ANSWERS, MAX_NEW_USERS_PER_DAY: process.env.MAX_NEW_USERS_PER_DAY };
const app = createApp({ store, env, router: new ModelRouter(call), version: 'dev' });

const port = Number(process.env.PORT ?? 8787);
createServer(async (rq, rs) => {
  const chunks: Buffer[] = [];
  for await (const c of rq) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const res = await app(new Request(`http://localhost:${port}${rq.url}`, { method: rq.method, headers: rq.headers as Record<string, string>, body: rq.method === 'GET' || rq.method === 'HEAD' ? undefined : body }));
  rs.writeHead(res.status, Object.fromEntries(res.headers));
  rs.end(Buffer.from(await res.arrayBuffer()));
}).listen(port, () => console.log(`FinAgent (desarrollo) en http://localhost:${port} — ${key ? 'Gemini REAL' : 'Gemini FALSO'} — admin: ${env.ADMIN_TOKEN}`));
