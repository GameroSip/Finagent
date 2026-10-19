// Utilidades compartidas por las líneas de comando de evaluación y del duelo.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HttpRequest, HttpResult } from '../src/http';

export const EVALS_DIR = dirname(fileURLToPath(import.meta.url));

/** Carga evals/.env (CLAVE=valor) sin pisar variables ya definidas. */
export function loadEnvFile(): void {
  const f = join(EVALS_DIR, '.env');
  if (!existsSync(f)) return;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

/** --nombre  /  --nombre=valor */
export const flag = (name: string): string | undefined => {
  const a = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  return a === undefined ? undefined : a.includes('=') ? a.split('=').slice(1).join('=') : 'true';
};

/** Llamada real a Gemini (Node). */
export async function realGemini(req: HttpRequest): Promise<HttpResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), req.timeoutMs ?? 120_000);
  try {
    const res = await fetch(req.url, { method: req.method ?? 'GET', headers: { 'Content-Type': 'application/json', ...(req.headers ?? {}) },
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined, signal: ctl.signal });
    return { status: res.status, headers: {}, text: await res.text() };
  } finally { clearTimeout(timer); }
}
