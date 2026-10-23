// Verificación de un "ID token" de Google (inicio de sesión con Google): la firma se comprueba con las claves públicas de Google (RS256, WebCrypto),
// y además el emisor, a quién va dirigido (nuestro client ID) y el vencimiento. Solo se conserva el identificador de la cuenta (sub): ni el correo ni el nombre.
export interface Jwk { kid: string; n: string; e: string; kty: string; alg?: string }
export type JwksFetcher = () => Promise<Jwk[]>;

const dec = new TextDecoder();
const b64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const json = <T,>(s: string): T => JSON.parse(dec.decode(b64u(s))) as T;

let cache: { at: number; keys: Jwk[] } | null = null;
/** Las claves públicas de Google (se cachean 1 hora). */
export const googleJwks: JwksFetcher = async () => {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.keys;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('no pude leer las claves de Google');
  const keys = ((await r.json()) as { keys: Jwk[] }).keys;
  cache = { at: Date.now(), keys };
  return keys;
};

export interface GoogleIdentity { sub: string }
export async function verifyGoogleIdToken(token: string, o: { audiences: string[]; nowSec: number; jwks: JwksFetcher }): Promise<GoogleIdentity | null> {
  try {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    const head = json<{ alg?: string; kid?: string }>(h), pay = json<{ iss?: string; aud?: string; exp?: number; iat?: number; sub?: string }>(p);
    if (head.alg !== 'RS256' || !head.kid) return null;                                              // jamás "none" ni otros algoritmos
    if (pay.iss !== 'https://accounts.google.com' && pay.iss !== 'accounts.google.com') return null;
    if (!pay.aud || !o.audiences.includes(pay.aud)) return null;                                      // tiene que ser para ESTA app
    if (typeof pay.exp !== 'number' || pay.exp <= o.nowSec || typeof pay.iat === 'number' && pay.iat > o.nowSec + 300) return null;
    if (!pay.sub || pay.sub.length > 64) return null;
    let key = (await o.jwks()).find((k) => k.kid === head.kid);
    if (!key) { cache = null; key = (await o.jwks()).find((k) => k.kid === head.kid); }               // rotación de claves: se vuelve a pedir una vez
    if (!key || key.kty !== 'RSA') return null;
    const pub = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: key.n, e: key.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pub, b64u(s), new TextEncoder().encode(`${h}.${p}`));
    return ok ? { sub: pay.sub } : null;
  } catch { return null; }
}
