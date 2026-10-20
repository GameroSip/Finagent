// SQLite integrado de Node 22 (node:sqlite) como base para desarrollo local y pruebas: SQL real, sin instalar nada.
import { DatabaseSync } from 'node:sqlite';
import type { Sql } from './store';

export class NodeSql implements Sql {
  private db: DatabaseSync;
  constructor(file = ':memory:') { this.db = new DatabaseSync(file); }
  async all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> { return this.db.prepare(sql).all(...(params as never[])) as unknown as T[]; }
  async run(sql: string, ...params: unknown[]): Promise<void> { this.db.prepare(sql).run(...(params as never[])); }
}
