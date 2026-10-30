import type { DayBar } from '../../src/radar';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export interface Fetched { bars: DayBar[]; note?: string }

/** Historia diaria completa de Yahoo (cierres con splits ajustados). Reintenta ante límites de uso. */
export async function fetchDaily(symbol: string): Promise<Fetched> {
  let lastErr = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const host of ['query1', 'query2']) {
      try {
        const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=max&interval=1d&includePrePost=false&events=div,splits`, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Accept: 'application/json' } });
        if (r.status === 429 || r.status >= 500) { lastErr = `HTTP ${r.status}`; await sleep(1500 * (attempt + 1)); continue; }
        const j: any = await r.json();
        const res = j?.chart?.result?.[0];
        if (!res) { lastErr = j?.chart?.error?.description ?? `HTTP ${r.status}`; continue; }
        const q = res.indicators?.quote?.[0] ?? {}, ts: number[] = res.timestamp ?? [], bars: DayBar[] = [];
        for (let i = 0; i < ts.length; i++) {
          const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
          if ([o, h, l, c].some((x) => typeof x !== 'number' || !(x > 0))) continue;
          bars.push({ t: ts[i], o, h, l, c, v: Number(q.volume?.[i]) || 0 });
        }
        return { bars };
      } catch (e: any) { lastErr = String(e?.message ?? e); await sleep(800 * (attempt + 1)); }
    }
  }
  throw new Error(`${symbol}: ${lastErr || 'sin datos'}`);
}

/** Camino aleatorio con volatilidad que se agrupa (parecido a un activo real, pero SIN ninguna señal predictiva escondida). Para probar el circuito sin internet. */
export function synthetic(seed: number, days = 6000, volMean = 0.012): DayBar[] {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const norm = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const bars: DayBar[] = [];
  let price = 100, vol = volMean;
  for (let i = 0; i < days; i++) {
    vol = Math.max(0.003, 0.94 * vol + 0.06 * volMean + 0.25 * volMean * Math.abs(norm()) * 0.4);
    const ret = vol * norm(), o = price, c = price * Math.exp(ret), range = Math.abs(ret) + vol * 0.6 * rnd();
    const h = Math.max(o, c) * (1 + range * 0.3 * rnd()), l = Math.min(o, c) * (1 - range * 0.3 * rnd());
    bars.push({ t: 946684800 + i * 86400, o, h, l, c, v: Math.round(1e6 * Math.exp(0.35 * norm() + 8 * Math.abs(ret))) });
    price = c;
  }
  return bars;
}
