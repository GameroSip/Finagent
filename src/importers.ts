// Importar una cartera desde capturas o PDF de un broker. Todo lo específico de cada broker vive en la tabla BROKERS:
// para sumar uno nuevo alcanza con agregar una fila (nombre, cómo reconocerlo y pistas de cómo muestra los datos).
import { CASH_CODES, parseNum } from './portfolio';

export interface BrokerProfile {
  id: string;
  name: string;
  /** Cómo reconocer el nombre que devuelve el modelo. */
  match: RegExp;
  /** Cómo muestra los datos ese broker (se le pasa al modelo como pista). */
  hint: string;
  /** Los activos locales de este broker cotizan en Yahoo con sufijo .BA (en pesos). */
  localSuffix?: '.BA';
}

export const BROKERS: BrokerProfile[] = [
  { id: 'iol', name: 'InvertirOnline (IOL)', match: /iol|invertir ?online/i, localSuffix: '.BA',
    hint: 'Pantalla "Portafolio" / "Mi cuenta": cada fila es un activo con su ticker (GGAL, YPFD, AL30, AAPL…) y su nombre; columnas típicas: Cantidad, Último precio, Variación diaria, PPC (precio promedio de compra), Rendimiento / Ganancia y Valuación (valorizado). Precios en pesos ($) salvo que diga US$ o D (AL30D). Abajo o arriba aparecen los saldos disponibles en pesos y en dólares.' },
  { id: 'balanz', name: 'Balanz', match: /balanz/i, localSuffix: '.BA',
    hint: 'Pantalla "Tenencia" agrupada por tipo (Acciones, CEDEARs, Bonos, Fondos): Cantidad, Precio, Variación y Valuación. Los saldos disponibles figuran como "Pesos" y "Dólares".' },
  { id: 'cocos', name: 'Cocos Capital', match: /cocos/i, localSuffix: '.BA',
    hint: 'Pantalla "Portfolio" / "Tenencias": ticker, cantidad, precio actual, precio promedio y resultado en $ y %. El efectivo figura como "Pesos" y "Dólares".' },
  { id: 'ppi', name: 'Portfolio Personal (PPI)', match: /ppi|portfolio personal/i, localSuffix: '.BA',
    hint: 'Tenencia con ticker, cantidad, precio y valuación; separada por moneda de liquidación (pesos / dólares MEP / dólares cable).' },
  { id: 'bull', name: 'Bull Market', match: /bull ?market/i, localSuffix: '.BA',
    hint: 'Cartera con ticker, cantidad, último precio, PPC y valuación.' },
  { id: 'ibkr', name: 'Interactive Brokers', match: /interactive|ibkr/i,
    hint: 'Tabla "Positions": Symbol, Position (cantidad), Avg Price, Last, Market Value, todo en USD. "Cash" va aparte.' },
  { id: 'binance', name: 'Binance / cripto', match: /binance|bybit|kraken|coinbase|lemon|belo|ripio|buenbit|cripto/i,
    hint: 'Billetera con monedas (BTC, ETH, SOL, USDT…), cantidad con muchos decimales y su valor estimado en USD o ARS. USDT, USDC y DAI son efectivo en dólares.' },
];

const GENERAL_RULES = `Leé la o las capturas de una cartera de inversión (si son varias, son partes de la misma pantalla larga: no repitas una fila que se vea en dos capturas). Devolvé el JSON del esquema.
Reglas:
- Una entrada por activo. "symbol" es el ticker (GGAL, AL30, AAPL, BTC…), nunca el nombre de la empresa. Si solo figura el nombre y no estás seguro del ticker, omitilo.
- "quantity" es la cantidad de unidades (nominales, acciones, cuotapartes, monedas), NO el valor en pesos. No confundas columnas: Cantidad/Nominales = quantity; Último/Precio = last_price; PPC/Precio promedio/Costo = avg_cost; Valuación/Valorizado/Total/Monto = market_value.
- Números: en Argentina el punto separa los miles y la coma los decimales ("1.234,50" es 1234.5, "10.000" es 10000). En el JSON van como número con punto decimal.
- No incluyas totales, subtotales, porcentajes, encabezados ni filas de resumen.
- Saldos disponibles (pesos, dólares) van en "cash", no como activos.
- "asset_type": accion_ar (acciones locales), cedear, bono_ar (bonos, letras y obligaciones negociables), fci (fondos comunes), cripto, accion_us, etf u otro.
- "currency": la moneda de los precios de esa fila (ARS, USD…).
- Si algo no se lee bien, omitilo y contalo en "notes". No inventes datos.`;

/** Instrucción para el modelo: reglas generales y las pistas de todos los brokers (el modelo reconoce cuál es). */
export function buildPortfolioPrompt(): string {
  return `${GENERAL_RULES}\n\nPistas de cómo muestra los datos cada broker:\n${BROKERS.map((b) => `- ${b.name}: ${b.hint}`).join('\n')}`;
}

// ───────────────────────── lo que devuelve el modelo ─────────────────────────

export interface RawPosition { symbol?: unknown; name?: unknown; asset_type?: unknown; quantity?: unknown; avg_cost?: unknown; last_price?: unknown; market_value?: unknown; currency?: unknown }
export interface RawShot { broker?: unknown; positions?: unknown; cash?: unknown; notes?: unknown }

/** Lee el JSON del modelo aunque venga con ``` o con texto alrededor. */
export function parseShotJson(raw: string): RawShot | null {
  const clean = raw.replace(/```[a-z]*/gi, '').trim();
  const tryParse = (s: string) => { try { const v = JSON.parse(s); return v && typeof v === 'object' ? (Array.isArray(v) ? { positions: v } : v) : null; } catch { return null; } };
  return tryParse(clean) ?? (clean.indexOf('{') >= 0 && clean.lastIndexOf('}') > clean.indexOf('{') ? tryParse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1)) : null);
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') { const s = v.replace(/[^\d.,\-]/g, ''); return s ? parseNum(s) : null; }
  return null;
};
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function normCurrency(c: unknown): string | null {
  const s = str(c).toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  if (/^(ARS|\$|PESOS?|AR\$|\$ARS)$/.test(s)) return 'ARS';
  if (/^(USD|US\$|U\$S|U\$D|DOLARES?|DÓLARES?|DOLAR|DÓLAR|USDMEP|USDCCL|MEP|CABLE)$/.test(s)) return 'USD';
  if ((CASH_CODES as readonly string[]).includes(s)) return s;
  return /^[A-Z]{3}$/.test(s) ? s : null;
}

export interface Proposed {
  kind: 'asset' | 'cash';
  symbol: string;                 // símbolo de Yahoo (o código de moneda si es efectivo)
  qty: number;
  cost: number | null;
  name?: string;
  assetType?: string;
  currency?: string | null;
  /** Otros símbolos de Yahoo para probar si el primero no cotiza. */
  alternatives: string[];
  /** Avisos para que la persona mire esa fila con más atención. */
  flags: Array<'value' | 'dup'>;
}
export interface ShotResult { broker: BrokerProfile | null; brokerName: string; items: Proposed[]; notes: string; dropped: number }

const brokerOf = (name: string): BrokerProfile | null => BROKERS.find((b) => b.match.test(name)) ?? null;
const LOCAL_TYPES = new Set(['accion_ar', 'cedear', 'bono_ar']);

/** Del ticker del broker a los símbolos de Yahoo, del más probable al menos. */
export function yahooCandidates(rawSym: string, type: string, currency: string | null, broker: BrokerProfile | null): string[] {
  const sym = rawSym.toUpperCase().replace(/^(BCBA|BYMA|NYSE|NASDAQ):/, '').replace(/[\s]/g, '').replace(/\.$/, '');
  if (!/^[A-Z0-9.^=\-]{1,20}$/.test(sym)) return [];
  if (/[.\-=^]/.test(sym)) return [sym];                                   // ya viene en formato de Yahoo
  const local = [`${sym}.BA`, sym], world = [sym, `${sym}.BA`];
  if (type === 'cripto') return [`${sym}-USD`, sym];
  if (LOCAL_TYPES.has(type)) return local;
  if (type === 'accion_us' || type === 'etf') return world;
  if (type === 'fci') return [sym, `${sym}.BA`];
  // Sin tipo: si el broker es local o los precios están en pesos, es casi seguro un activo de la bolsa local.
  return broker?.localSuffix || currency === 'ARS' ? local : world;
}

export function shotToItems(raws: RawShot[]): ShotResult {
  let brokerName = '', notes = '', dropped = 0;
  const items: Proposed[] = [];
  const seen = new Map<string, Proposed>();
  const cash = new Map<string, number>();
  for (const r of raws) {
    if (!brokerName && str(r.broker)) brokerName = str(r.broker);
    if (str(r.notes)) notes = notes ? `${notes} ${str(r.notes)}` : str(r.notes);
  }
  const broker = brokerOf(brokerName);
  for (const r of raws) {
    for (const p of (Array.isArray(r.positions) ? r.positions : []) as RawPosition[]) {
      const sym = str(p?.symbol).toUpperCase().replace(/\s+/g, '');
      const qty = num(p?.quantity);
      if (!sym || qty === null || !(qty > 0)) { dropped++; continue; }
      const cur = normCurrency(p?.currency);
      const type = str(p?.asset_type);
      if ((CASH_CODES as readonly string[]).includes(sym) || /^(PESOS?|DOLARES?|DÓLARES?)$/i.test(sym)) { const c = normCurrency(sym) ?? sym; cash.set(c, (cash.get(c) ?? 0) + qty); continue; }
      const cands = yahooCandidates(sym, type, cur, broker);
      if (!cands.length) { dropped++; continue; }
      const cost = num(p?.avg_cost);
      const price = num(p?.last_price), mv = num(p?.market_value);
      const flags: Proposed['flags'] = [];
      if (price && mv && Math.abs(qty * price - mv) / mv > 0.05) flags.push('value');      // cantidad × precio no da la valuación: probable columna cruzada
      const item: Proposed = { kind: 'asset', symbol: cands[0], qty, cost: cost !== null && cost > 0 ? cost : null, name: str(p?.name) || undefined, assetType: type || undefined, currency: cur, alternatives: cands.slice(1), flags };
      const prev = seen.get(cands[0]);
      if (prev) { if (Math.abs(prev.qty - qty) > 1e-9) { item.flags.push('dup'); items.push(item); } continue; }   // la misma fila en dos capturas no se suma
      seen.set(cands[0], item); items.push(item);
    }
    for (const c of (Array.isArray(r.cash) ? r.cash : []) as Array<{ currency?: unknown; amount?: unknown }>) {
      const cur = normCurrency(c?.currency), amt = num(c?.amount);
      if (!cur || amt === null || amt <= 0) { dropped++; continue; }
      if (!cash.has(cur) || (cash.get(cur) ?? 0) < amt) cash.set(cur, Math.max(cash.get(cur) ?? 0, amt));      // repetido en otra captura: se queda con uno
    }
  }
  for (const [cur, amount] of cash) items.push({ kind: 'cash', symbol: cur, qty: amount, cost: null, currency: cur, alternatives: [], flags: [] });
  return { broker, brokerName: broker?.name ?? brokerName, items, notes, dropped };
}

/** Prueba cada símbolo candidato hasta encontrar uno que cotice; devuelve el primero que sí (o el original si ninguno). */
export async function resolveSymbols<T extends { kind: string; symbol: string; alternatives: string[] }>(
  items: T[], quoteOf: (symbol: string) => Promise<{ price: number | null; currency?: string | null }>, concurrency = 4,
): Promise<Array<{ symbol: string; found: boolean; price: number | null; currency: string | null }>> {
  const out: Array<{ symbol: string; found: boolean; price: number | null; currency: string | null }> = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++; if (i >= items.length) return;
      const it = items[i];
      if (it.kind === 'cash') { out[i] = { symbol: it.symbol, found: true, price: 1, currency: it.symbol }; continue; }
      out[i] = { symbol: it.symbol, found: false, price: null, currency: null };
      for (const s of [it.symbol, ...it.alternatives]) {
        try { const q = await quoteOf(s); if (q.price !== null && Number.isFinite(q.price)) { out[i] = { symbol: s, found: true, price: q.price, currency: q.currency ?? null }; break; } } catch { /* se prueba el siguiente */ }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}
