// Precios de la API de Gemini (USD por millón de tokens, nivel pago, Standard) para estimar el costo de cada respuesta con tokens REALES.
// Fuente: página oficial de precios (ai.google.dev/gemini-api/docs/pricing), consultada en octubre de 2026. Los precios cambian: revisar antes de decidir.
// El razonamiento ("thinking") se cobra como salida.

export interface Tokens { input: number; output: number; thoughts: number; cached: number }
export const NO_TOKENS = (): Tokens => ({ input: 0, output: 0, thoughts: 0, cached: 0 });

interface Price { in: number; out: number; cachedIn: number }
interface PriceEntry extends Price { from?: { at: string; price: Price } } // "from": precio nuevo a partir de una fecha anunciada

const FLASH_38: PriceEntry = { in: 0.75, out: 3.75, cachedIn: 0.075, from: { at: '2027-01-01', price: { in: 1.5, out: 7.5, cachedIn: 0.15 } } };
export const PRICES: Record<string, PriceEntry> = {
  'gemini-3.5-flash-lite': { in: 0.30, out: 2.50, cachedIn: 0.03 },
  'gemini-3.1-flash-lite': { in: 0.25, out: 1.50, cachedIn: 0.025 },
  'gemini-3.8-flash': FLASH_38,
  'gemini-3.6-flash': FLASH_38,
  'gemini-3-flash-preview': { in: 0.50, out: 3.00, cachedIn: 0.05 },
  'gemini-3.1-pro-preview': { in: 2.00, out: 12.00, cachedIn: 0.20 },
};

/** Costo estimado en USD de una respuesta, o null si no se conoce el precio del modelo. Los tokens en caché se cobran a menos. */
export function estimateCostUSD(model: string, t: Tokens, at: Date = new Date()): number | null {
  const e = PRICES[model];
  if (!e) return null;
  const p: Price = e.from && at.toISOString().slice(0, 10) >= e.from.at ? e.from.price : e;
  const fresh = Math.max(0, t.input - t.cached);
  return (fresh * p.in + t.cached * p.cachedIn + (t.output + t.thoughts) * p.out) / 1e6;
}
