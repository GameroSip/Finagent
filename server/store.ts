// Almacenamiento del servidor sobre SQL (Cloudflare D1 en producción, SQLite de Node en desarrollo y pruebas).
import type { Plan, PlanId, Ticket, UsageStore } from '../src/plans';
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

  // ---- registro de uso (solo números, nunca el texto)
  async logCall(c: CallRow): Promise<void> {
    await this.sql.run('INSERT INTO calls (user_id, ts, model, in_tokens, out_tokens, thoughts, cached, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', c.user_id, c.ts, c.model, c.in_tokens, c.out_tokens, c.thoughts, c.cached, c.cost_usd);
  }
  async costSince(ts: number): Promise<number> {
    return (await this.sql.all<{ c: number }>('SELECT COALESCE(SUM(cost_usd), 0) AS c FROM calls WHERE ts >= ?', ts))[0]?.c ?? 0;
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
