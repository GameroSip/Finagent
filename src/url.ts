/** Devuelve la URL normalizada si es http(s); si no, null (evita javascript:, data:, intent:, etc.). */
export function safeUrl(url: unknown): string | null {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch { return null; }
}
