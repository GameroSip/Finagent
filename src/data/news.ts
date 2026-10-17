// Titulares vía Google News RSS (gratuito, sin clave). Sirve para "narrativas": qué dicen los medios hoy.
import { getText } from './net';

export interface Headline { title: string; source: string | null; url: string; published: string | null; ts: number | null }
export type Region = 'ar' | 'us';

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').trim();

const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decode(m[1]) : null;
};

export function parseRss(xml: string, limit = 10): Headline[] {
  const out: Headline[] = [];
  const seen = new Set<string>();
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    let title = tag(item, 'title');
    const url = tag(item, 'link');
    if (!title || !url) continue;
    const source = tag(item, 'source');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const pub = tag(item, 'pubDate');
    const ts = pub ? Date.parse(pub) : NaN;
    out.push({ title, source, url, published: Number.isFinite(ts) ? new Date(ts).toISOString().replace(/\.\d+Z$/, 'Z') : null, ts: Number.isFinite(ts) ? ts : null });
    if (out.length >= limit) break;
  }
  return out;
}

const REGIONS: Record<Region, { hl: string; gl: string; ceid: string; topic: string }> = {
  ar: { hl: 'es-419', gl: 'AR', ceid: 'AR:es-419', topic: '(mercados OR Merval OR dólar OR bonos OR acciones OR "riesgo país")' },
  us: { hl: 'en-US', gl: 'US', ceid: 'US:en', topic: '("stock market" OR "Wall Street" OR Fed OR Nasdaq OR earnings)' },
};

export async function fetchHeadlines(query: string | undefined, region: Region = 'ar', limit = 10): Promise<Headline[]> {
  const r = REGIONS[region] ?? REGIONS.ar;
  const q = `${(query ?? '').trim() || r.topic} when:2d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${r.hl}&gl=${r.gl}&ceid=${encodeURIComponent(r.ceid)}`;
  const xml = await getText(url, 'Titulares');
  const items = parseRss(xml, limit);
  if (!items.length) throw new Error('Titulares: sin resultados');
  return items;
}
