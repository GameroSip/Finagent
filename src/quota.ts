// Lectura de los avisos de cupo de Gemini. Módulo sin dependencias: lo usan la app y el servidor.

/**
 * Qué informa Gemini cuando rechaza un pedido por cupo (formato de errores de Google: `details` con RetryInfo y QuotaFailure, y el
 * texto "Please retry in 28.5s"). Si no se reconoce nada, devuelve valores neutros y la app usa su espera por defecto.
 */
export function parseQuota(raw: string): { retryAfterMs?: number; daily: boolean } {
  let retry: number | undefined;
  let daily = /per\s+day/i.test(raw) || /PerDay/.test(raw);
  try {
    for (const d of JSON.parse(raw)?.error?.details ?? []) {
      const m = typeof d?.retryDelay === 'string' ? /^([\d.]+)s$/.exec(d.retryDelay) : null;
      if (m) retry = Math.ceil(parseFloat(m[1]) * 1000);
      for (const v of d?.violations ?? []) if (/PerDay/i.test(String(v?.quotaId ?? ''))) daily = true;
    }
  } catch { /* no es JSON */ }
  if (retry === undefined) { const m = /retry in ([\d.]+)\s*s/i.exec(raw); if (m) retry = Math.ceil(parseFloat(m[1]) * 1000); }
  return { retryAfterMs: retry, daily };
}
/** Un modelo con el cupo DIARIO agotado se aparta unas horas (no se le insiste en cada pregunta ni en cada apertura de la app). */
export const DAILY_QUOTA_MS = 6 * 3600_000;
