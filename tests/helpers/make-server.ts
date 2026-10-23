import { fakeGemini } from '../../evals/fake-gemini';
import { createApp, type Env } from '../../server/app';
import { ModelRouter, type GeminiFetch } from '../../server/gemini';
import type { JwksFetcher } from '../../server/google';
import { NodeSql } from '../../server/node-sql';
import { SqlStore } from '../../server/store';

export const ADMIN = 'admin-de-prueba';
export const user = (text: string) => [{ role: 'user', parts: [{ text }] }];

export async function makeServer(opts: { gemini?: GeminiFetch; env?: Partial<Env>; jwks?: JwksFetcher } = {}) {
  const store = new SqlStore(new NodeSql(':memory:'));
  await store.migrate();
  let clock = new Date('2026-10-19T15:00:00Z');
  const fake = fakeGemini('bueno');
  const seen: Array<{ model: string; body: any }> = [];
  const gemini: GeminiFetch = opts.gemini ?? (async (model, body) => { seen.push({ model, body }); const r = await fake({ url: `https://x/models/${model}:generateContent`, method: 'POST', body }); return { status: r.status, text: r.text }; });
  const router = new ModelRouter(gemini, () => clock.getTime(), async () => {});
  const env: Env = { JWT_SECRET: 'secreto-de-prueba', ADMIN_TOKEN: ADMIN, DAILY_BUDGET_USD: '5', ...opts.env };
  const app = createApp({ store, env, router, now: () => clock, version: 'test', jwks: opts.jwks });
  const call = async (method: string, path: string, o: { body?: unknown; token?: string; headers?: Record<string, string> } = {}) => {
    const res = await app(new Request(`https://api.test${path}`, { method, headers: { ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...o.headers }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }));
    return { status: res.status, json: (await res.json().catch(() => null)) as any, headers: res.headers };
  };
  const invite = async (plan = 'plus', count = 1, uses = 1) => (await call('POST', '/v1/admin/invites', { token: ADMIN, body: { count, plan, uses } })).json.codes as string[];
  const device = (deviceId = 'dispositivo-1234', headers: Record<string, string> = {}) => call('POST', '/v1/auth/device', { body: { deviceId }, headers });
  /** Una cuenta automática (como la que crea la app al abrirse); si se pide otro plan, el administrador se lo asigna. */
  const session = async (plan = 'free', deviceId = 'dispositivo-1234') => {
    const r = await device(deviceId);
    const u = await store.findUser('device', deviceId);
    if (plan !== 'free') await call('POST', '/v1/admin/users', { token: ADMIN, body: { userId: u!.id, plan } });
    return { token: r.json.token as string, userId: u!.id, code: 'device' };
  };
  const ask = (token: string, extra: Record<string, unknown> = {}) => call('POST', '/v1/generate', { token, body: { contents: user('¿A cuánto cotiza Apple hoy?'), withTools: true, ...extra } });
  return { store, app, call, invite, device, session, ask, seen, setNow: (iso: string) => { clock = new Date(iso); }, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); }, router };
}

