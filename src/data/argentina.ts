// Datos macro de Argentina, gratuitos y sin clave: DolarAPI (cotizaciones) y ArgentinaDatos (riesgo país, inflación).
import { getJsonFrom } from './net';

export interface DolarRow { casa: string; nombre: string; compra: number | null; venta: number | null; fecha: string | null }

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export async function fetchDolares(): Promise<DolarRow[]> {
  const j = await getJsonFrom('https://dolarapi.com/v1/dolares', 'Cotizaciones del dólar');
  if (!Array.isArray(j) || !j.length) throw new Error('Cotizaciones del dólar: sin datos');
  return j.map((d: any) => ({
    casa: String(d.casa), nombre: String(d.nombre ?? d.casa), compra: num(d.compra), venta: num(d.venta),
    fecha: d.fechaActualizacion ?? null,
  }));
}

/** Brecha de cada cotización contra el oficial, en %: (venta / venta oficial - 1) × 100. */
export function withBrecha(rows: DolarRow[]): Array<DolarRow & { brecha_pct: number | null }> {
  const oficial = rows.find((r) => r.casa === 'oficial')?.venta ?? null;
  return rows.map((r) => ({
    ...r,
    brecha_pct: oficial && r.venta && r.casa !== 'oficial' ? Math.round((r.venta / oficial - 1) * 10000) / 100 : null,
  }));
}

export async function fetchRiesgoPais(): Promise<{ valor: number; fecha: string }> {
  const j = await getJsonFrom('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo', 'Riesgo país');
  const v = num(j?.valor);
  if (v === null) throw new Error('Riesgo país: dato no válido');
  return { valor: v, fecha: String(j.fecha) };
}

async function lastOf(path: string, what: string): Promise<{ fecha: string; valor: number } | null> {
  try {
    const j = await getJsonFrom(`https://api.argentinadatos.com/v1/finanzas/indices/${path}`, what);
    const arr: any[] = (Array.isArray(j) ? j : []).filter((x: any) => x && typeof x.fecha === 'string')
      .sort((a: any, b: any) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)); // no se asume el orden de la API
    const last = arr[arr.length - 1];
    const v = num(last?.valor);
    return v === null ? null : { fecha: String(last.fecha), valor: v };
  } catch { return null; }
}

/** Inflación mensual e interanual más recientes (INDEC vía ArgentinaDatos). Cualquiera puede venir null. */
export async function fetchInflacion() {
  const [mensual, interanual] = await Promise.all([lastOf('inflacion', 'Inflación mensual'), lastOf('inflacionInteranual', 'Inflación interanual')]);
  return { mensual, interanual };
}
