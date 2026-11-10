// Almacenamiento del servidor sobre SQL (Cloudflare D1 en producción, SQLite de Node en desarrollo y pruebas).
import type { Plan, PlanId, Ticket, UsageStore } from '../src/plans';
import type { RawMetrics } from './metrics';
import { SCHEMA_SQL } from './schema';

/** Lo mínimo que se necesita de una base SQL. */
export interface Sql {
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<void>;
}

export interface Invite { code: string; plan: PlanId; max_devices: number; note: string | null; created_at: string; disabled: number }
export interface UserRow { id: string; code: string; device_id: string; plan: PlanId; created_at: string; disabled: number; plan_code: string | null }
export interface TurnRow { id: string; user_id: string; created_at: number; calls: number; model: string; ticket: string; refunded: number }
export interface CallRow { user_id: string; ts: number; model: string; in_tokens: number; out_tokens: number; thoughts: number; cached: number; cost_usd: number }

export interface EventRow { ts: number; day: string; name: string; props: string | null }

export class SqlStore implements UsageStore {
  constructor(private sql: Sql) {}

  /** Crea las tablas (desarrollo y pruebas; en Cloudflare se usan las migraciones). */
  async migrate(): Promise<void> {
    for (const stmt of SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean)) await this.sql.run(stmt);
  }

  // ---- invitaciones y usuarios
  async createInvite(code: string, plan: PlanId, maxDevices: number, note: string | null, nowIso: string): Promise<boolean> {
    const before = await this.getInvite(code);
    if (before) return false;
    await this.sql.run('INSERT INTO invites (code, plan, max_devices, note, created_at) VALUES (?, ?, ?, ?, ?)', code, plan, maxDevices, note, nowIso);
    return true;
  }
  async getInvite(code: string): Promise<Invite | null> {
    return (await this.sql.all<Invite>('SELECT * FROM invites WHERE code = ?', code))[0] ?? null;
  }
  async findUser(code: string, deviceId: string): Promise<UserRow | null> {
    return (await this.sql.all<UserRow>('SELECT * FROM users WHERE code = ? AND device_id = ?', code, deviceId))[0] ?? null;
  }
  async createUser(u: UserRow): Promise<void> {
    await this.sql.run('INSERT INTO users (id, code, device_id, plan, created_at, disabled, plan_code) VALUES (?, ?, ?, ?, ?, 0, ?)', u.id, u.code, u.device_id, u.plan, u.created_at, u.plan_code);
  }
  /** Cuántas personas ya canjearon este código de plan. */
  async countRedemptions(code: string): Promise<number> {
    return (await this.sql.all<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE plan_code = ?', code))[0]?.n ?? 0;
  }
  async setUserPlan(userId: string, plan: PlanId, planCode: string | null): Promise<void> {
    await this.sql.run('UPDATE users SET plan = ?, plan_code = ? WHERE id = ?', plan, planCode, userId);
  }
  /** Anota el interés de un usuario en un plan de pago. true solo la primera vez. */
  async addInterest(userId: string, plan: string, ts: number): Promise<boolean> {
    const rows = await this.sql.all<{ user_id: string }>('INSERT INTO interest (user_id, plan, ts) VALUES (?, ?, ?) ON CONFLICT DO NOTHING RETURNING user_id', userId, plan, ts);
    return rows.length > 0;
  }
  async interestCounts(): Promise<Record<string, number>> {
    const rows = await this.sql.all<{ plan: string; n: number }>('SELECT plan, COUNT(*) AS n FROM interest GROUP BY plan');
    return Object.fromEntries(rows.map((r) => [r.plan, r.n]));
  }
  async usersByPlan(): Promise<Record<string, number>> {
    const rows = await this.sql.all<{ plan: string; n: number }>('SELECT plan, COUNT(*) AS n FROM users WHERE code = ? GROUP BY plan', 'device');
    return Object.fromEntries(rows.map((r) => [r.plan, r.n]));
  }
  /** Una cuenta de invitado pasa a ser de una cuenta de Google SIN perder su plan ni su uso del día. */
  async convertUser(id: string, code: string, deviceId: string): Promise<void> {
    await this.sql.run('UPDATE users SET code = ?, device_id = ? WHERE id = ?', code, deviceId, id);
  }
  async getUser(id: string): Promise<UserRow | null> {
    return (await this.sql.all<UserRow>('SELECT * FROM users WHERE id = ?', id))[0] ?? null;
  }
  /** Cambia plan y/o bloqueo de un usuario (por id) o de todos los de un código. Devuelve cuántos se modificaron. */
  async updateUsers(where: { userId?: string; code?: string }, change: { plan?: PlanId; disabled?: boolean }): Promise<number> {
    const rows = where.userId ? await this.sql.all<UserRow>('SELECT * FROM users WHERE id = ?', where.userId)
      : where.code ? await this.sql.all<UserRow>('SELECT * FROM users WHERE code = ?', where.code) : [];
    for (const r of rows) {
      if (change.plan) await this.sql.run('UPDATE users SET plan = ? WHERE id = ?', change.plan, r.id);
      if (change.disabled !== undefined) await this.sql.run('UPDATE users SET disabled = ? WHERE id = ?', change.disabled ? 1 : 0, r.id);
    }
    if (where.code && change.disabled !== undefined) await this.sql.run('UPDATE invites SET disabled = ? WHERE code = ?', change.disabled ? 1 : 0, where.code);
    return rows.length;
  }

  // ---- contadores atómicos (UsageStore)
  async incr(key: string, by: number): Promise<number> {
    const rows = await this.sql.all<{ n: number }>('INSERT INTO counters (key, n) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET n = n + ? RETURNING n', key, by, by);
    return rows[0].n;
  }
  async peek(key: string): Promise<number> {
    return (await this.sql.all<{ n: number }>('SELECT n FROM counters WHERE key = ?', key))[0]?.n ?? 0;
  }

  // ---- turnos (una respuesta de FinAgent = varios pedidos al modelo, pero cuenta como UNA consulta)
  async putTurn(t: TurnRow): Promise<void> {
    await this.sql.run('INSERT INTO turns (id, user_id, created_at, calls, model, ticket, refunded) VALUES (?, ?, ?, ?, ?, ?, 0)', t.id, t.user_id, t.created_at, t.calls, t.model, t.ticket);
  }
  async getTurn(id: string): Promise<TurnRow | null> {
    return (await this.sql.all<TurnRow>('SELECT * FROM turns WHERE id = ?', id))[0] ?? null;
  }
  async bumpTurn(id: string): Promise<void> { await this.sql.run('UPDATE turns SET calls = calls + 1 WHERE id = ?', id); }
  /** Marca el turno como devuelto; true solo la primera vez (para no devolver dos veces). */
  async markRefunded(id: string): Promise<boolean> {
    const rows = await this.sql.all<{ id: string }>('UPDATE turns SET refunded = 1 WHERE id = ? AND refunded = 0 RETURNING id', id);
    return rows.length > 0;
  }

  // ---- estadísticas de uso de la beta (solo valores de listas cerradas) y comentarios que la persona decide enviar
  async setConsent(userId: string, analytics: boolean, ts: number): Promise<void> {
    await this.sql.run('INSERT INTO consent (user_id, analytics, ts) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET analytics = excluded.analytics, ts = excluded.ts', userId, analytics ? 1 : 0, ts);
  }
  async hasConsent(userId: string): Promise<boolean> { return ((await this.sql.all<{ a: number }>('SELECT analytics AS a FROM consent WHERE user_id = ?', userId))[0]?.a ?? 0) === 1; }
  /** Guarda los eventos de a 15 por consulta: el plan gratuito de Cloudflare limita las consultas por pedido y D1 admite 100 parámetros por consulta (15 filas × 5 = 75). Un lote de 40 son 3 consultas, no 40. */
  async addEvents(userId: string, rows: EventRow[]): Promise<void> {
    for (let i = 0; i < rows.length; i += 15) {
      const chunk = rows.slice(i, i + 15);
      await this.sql.run(`INSERT INTO events (user_id, ts, day, name, props) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?)').join(', ')}`, ...chunk.flatMap((r) => [userId, r.ts, r.day, r.name, r.props]));
    }
  }
  async addFeedback(f: { user_id: string; ts: number; kind: string; score: number | null; text: string | null; version: string | null }): Promise<void> {
    await this.sql.run('INSERT INTO feedback (user_id, ts, kind, score, text, version) VALUES (?, ?, ?, ?, ?, ?)', f.user_id, f.ts, f.kind, f.score, f.text, f.version);
  }
  /** Borra TODO lo que el servidor guarda de una persona (cuenta, uso, consentimiento, eventos, comentarios, votos). Los contadores de límites quedan sin dueño: no se pueden asociar a nadie. */
  async deleteUser(userId: string): Promise<void> {
    for (const t of ['events', 'feedback', 'consent', 'interest', 'calls', 'turns']) await this.sql.run(`DELETE FROM ${t} WHERE user_id = ?`, userId);
    await this.sql.run('DELETE FROM users WHERE id = ?', userId);
  }
  async metricsRaw(sinceDay: string, names: string[]): Promise<RawMetrics> {
    const one = async (q: string, ...p: unknown[]) => (await this.sql.all<{ n: number }>(q, ...p))[0]?.n ?? 0;
    const marks = names.map(() => '?').join(',');
    return {
      users: await one('SELECT COUNT(*) AS n FROM users'), consentYes: await one('SELECT COUNT(*) AS n FROM consent WHERE analytics = 1'), consentNo: await one('SELECT COUNT(*) AS n FROM consent WHERE analytics = 0'),
      activity: await this.sql.all('SELECT user_id, day, COUNT(*) AS n FROM events WHERE day >= ? GROUP BY user_id, day', sinceDay),
      firstDay: await this.sql.all('SELECT user_id, MIN(day) AS day FROM events GROUP BY user_id'),
      byName: await this.sql.all('SELECT name, COUNT(*) AS n, COUNT(DISTINCT user_id) AS u FROM events WHERE day >= ? GROUP BY name', sinceDay),
      rows: names.length ? await this.sql.all(`SELECT user_id, day, name, props FROM events WHERE day >= ? AND name IN (${marks})`, sinceDay, ...names) : [],
      feedback: await this.sql.all('SELECT id, user_id, ts, kind, score, text, version FROM feedback ORDER BY ts DESC LIMIT 400'),
      interest: await this.interestCounts(),
    };
  }
  async eventsCsvRows(sinceDay: string, limit: number): Promise<Array<{ user_id: string; ts: number; day: string; name: string; props: string | null }>> {
    return this.sql.all('SELECT user_id, ts, day, name, props FROM events WHERE day >= ? ORDER BY ts LIMIT ?', sinceDay, limit);
  }

  // ---- registro de uso (solo números, nunca el texto)
  async logCall(c: CallRow): Promise<void> {
    await this.sql.run('INSERT INTO calls (user_id, ts, model, in_tokens, out_tokens, thoughts, cached, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', c.user_id, c.ts, c.model, c.in_tokens, c.out_tokens, c.thoughts, c.cached, c.cost_usd);
  }
  async costSince(ts: number): Promise<number> {
    return (await this.sql.all<{ c: number }>('SELECT COALESCE(SUM(cost_usd), 0) AS c FROM calls WHERE ts >= ?', ts))[0]?.c ?? 0;
  }
  /** Costo REAL por respuesta de cada modelo (costo de los pedidos / respuestas), solo con una muestra mínima para no tomar ruido. */
  async measuredCostPerAnswer(since: number, minAnswers = 5): Promise<Record<string, number>> {
    const cost = await this.sql.all<{ model: string; c: number }>('SELECT model, SUM(cost_usd) AS c FROM calls WHERE ts >= ? GROUP BY model', since);
    const ans = await this.sql.all<{ model: string; n: number }>('SELECT model, COUNT(*) AS n FROM turns WHERE created_at >= ? AND refunded = 0 GROUP BY model', since);
    const n = new Map(ans.map((a) => [a.model, a.n]));
    return Object.fromEntries(cost.filter((c) => (n.get(c.model) ?? 0) >= minAnswers && c.c > 0).map((c) => [c.model, c.c / n.get(c.model)!]));
  }
  async usageReport(since: number) {
    const byDay = await this.sql.all<{ day: string; model: string; calls: number; input: number; output: number; thoughts: number; cached: number; cost: number }>(
      `SELECT date(ts / 1000, 'unixepoch') AS day, model, COUNT(*) AS calls, SUM(in_tokens) AS input, SUM(out_tokens) AS output, SUM(thoughts) AS thoughts, SUM(cached) AS cached, SUM(cost_usd) AS cost
       FROM calls WHERE ts >= ? GROUP BY day, model ORDER BY day, model`, since);
    const topUsers = await this.sql.all<{ user_id: string; calls: number; cost: number }>(
      'SELECT user_id, COUNT(*) AS calls, SUM(cost_usd) AS cost FROM calls WHERE ts >= ? GROUP BY user_id ORDER BY cost DESC LIMIT 10', since);
    const answers = (await this.sql.all<{ n: number }>('SELECT COUNT(*) AS n FROM turns WHERE created_at >= ? AND refunded = 0', since))[0]?.n ?? 0;
    const users = (await this.sql.all<{ n: number }>('SELECT COUNT(*) AS n FROM users'))[0]?.n ?? 0;
    const invites = (await this.sql.all<{ n: number }>('SELECT COUNT(*) AS n FROM invites'))[0]?.n ?? 0;
    return { byDay, topUsers, answers, users, invites };
  }
}

export type { Plan, Ticket };
