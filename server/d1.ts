// Adaptador de Cloudflare D1 a la interfaz Sql. Se tipa a mano lo mínimo para no depender de @cloudflare/workers-types.
import type { Sql } from './store';

export interface D1Like {
  prepare(sql: string): { bind(...params: unknown[]): { all<T = unknown>(): Promise<{ results: T[] }>; run(): Promise<unknown> } };
}

export class D1Sql implements Sql {
  constructor(private db: D1Like) {}
  async all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> { return (await this.db.prepare(sql).bind(...params).all<T>()).results; }
  async run(sql: string, ...params: unknown[]): Promise<void> { await this.db.prepare(sql).bind(...params).run(); }
}
