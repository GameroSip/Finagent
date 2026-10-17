// Capa HTTP. En la app (Android) usa la red NATIVA de Capacitor: no hay CORS y se pueden leer cabeceras
// como Set-Cookie. En el navegador (desarrollo/tests) usa fetch.
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}
export interface HttpResult {
  status: number;
  headers: Record<string, string>;
  text: string;
}
export type HttpFn = (req: HttpRequest) => Promise<HttpResult>;

export const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

function lowerKeys(h: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h ?? {})) out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
  return out;
}

const defaultHttp: HttpFn = async (req) => {
  const method = req.method ?? 'GET';
  const timeout = req.timeoutMs ?? 20000;
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({
      url: req.url,
      method,
      headers: { ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(req.headers ?? {}) },
      data: req.body,
      connectTimeout: timeout,
      readTimeout: timeout,
      responseType: 'text',
    });
    const text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
    return { status: r.status, headers: lowerKeys(r.headers), text };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(req.url, {
      method,
      headers: { ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(req.headers ?? {}) },
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      signal: ctl.signal,
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    return { status: res.status, headers, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
};

let impl: HttpFn = defaultHttp;
/** Permite inyectar un http simulado (tests). Sin argumento, restaura el real. */
export function setHttp(fn?: HttpFn): void {
  impl = fn ?? defaultHttp;
}
export const http: HttpFn = (req) => impl(req);
