// Sesiones firmadas (HMAC-SHA256, formato JWT) con WebCrypto: corre igual en Cloudflare Workers y en Node 22. Sin dependencias.
const enc = new TextEncoder();
const toB64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

/** Comparación en tiempo constante (no revela cuántos caracteres coinciden). */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export interface TokenPayload { sub: string; iat: number; exp: number }

export async function signToken(p: TokenPayload, secret: string): Promise<string> {
  const head = toB64u(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = toB64u(enc.encode(JSON.stringify(p)));
  return `${head}.${body}.${toB64u(await hmac(secret, `${head}.${body}`))}`;
}

/** Devuelve el contenido si la firma es válida y no venció; si no, null. */
export async function verifyToken(token: string, secret: string, nowSec: number): Promise<TokenPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || !secret) return null;
  try {
    const expected = toB64u(await hmac(secret, `${parts[0]}.${parts[1]}`));
    if (!timingSafeEqual(expected, parts[2])) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64u(parts[1]))) as TokenPayload;
    return typeof p.sub === 'string' && typeof p.exp === 'number' && p.exp > nowSec ? p : null;
  } catch { return null; }
}

export const newId = (): string => crypto.randomUUID();

// Sin 0/O/1/I/L: no se confunden al dictarlos o copiarlos.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Código de invitación legible: FA-K7P2-9XQM (≈ 2·10^11 combinaciones). */
export function newInviteCode(): string {
  const r = crypto.getRandomValues(new Uint8Array(8));
  const c = [...r].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `FA-${c.slice(0, 4)}-${c.slice(4)}`;
}
export const CODE_RE = /^FA-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
