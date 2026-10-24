// Menú de herramientas del gráfico: qué se puede activar, qué significa cada una y cuáles aplican al gráfico que se está viendo.
import type { ChartTools } from '../ui/chart';
import { TOOL_COLORS } from '../ui/chart';
import { esc, h } from '../ui/dom';
import { icon } from '../ui/icons';
import { openSheet } from '../ui/sheet';

export type ToolId = keyof ChartTools;
export interface ToolDef { id: ToolId; label: string; desc: string; group: 'over' | 'panel'; needs?: 'intraday' | 'volume'; color: string }

export const TOOL_DEFS: ToolDef[] = [
  { id: 'ema20', label: 'EMA 20', group: 'over', color: TOOL_COLORS.ema20, desc: 'Promedio de las últimas 20 velas que pesa más lo reciente. Muestra la tendencia de corto plazo.' },
  { id: 'ema50', label: 'EMA 50', group: 'over', color: TOOL_COLORS.ema50, desc: 'La misma idea con 50 velas: tendencia de mediano plazo. Si el precio la pierde, suele ser una señal de debilidad.' },
  { id: 'ema200', label: 'EMA 200', group: 'over', color: TOOL_COLORS.ema200, desc: 'La referencia de largo plazo más seguida. Arriba suele considerarse mercado alcista; abajo, bajista.' },
  { id: 'bollinger', label: 'Bandas de Bollinger', group: 'over', color: TOOL_COLORS.bb, desc: 'Un canal alrededor del promedio de 20 velas. Cuando el precio toca una banda está "estirado" respecto de lo normal.' },
  { id: 'fib', label: 'Fibonacci', group: 'over', color: TOOL_COLORS.fib, desc: 'Niveles de retroceso (23,6%, 38,2%, 50%, 61,8%, 78,6%) del último gran movimiento: zonas donde el precio suele pausar o rebotar.' },
  { id: 'pivots', label: 'Pivotes', group: 'over', color: TOOL_COLORS.pivot, desc: 'Soportes (S) y resistencias (R) calculados con el máximo, mínimo y cierre del período anterior. Los usan muchos traders del día.' },
  { id: 'vwap', label: 'VWAP', group: 'over', needs: 'intraday', color: TOOL_COLORS.vwap, desc: 'Precio promedio del día ponderado por volumen. Es la referencia de los fondos para saber si compraron "caro" o "barato".' },
  { id: 'profile', label: 'Perfil de volumen', group: 'over', needs: 'volume', color: TOOL_COLORS.profile, desc: 'Barras horizontales: a qué precios se operó más. POC es el precio con más negocio; el área de valor (VAH–VAL) concentra el 70%.' },
  { id: 'sessions', label: 'Sesiones de mercado', group: 'over', needs: 'intraday', color: TOOL_COLORS.london, desc: 'Sombrea las horas de Asia, Londres y Nueva York. El movimiento suele aumentar cuando abre cada plaza y más aún cuando se superponen.' },
  { id: 'volume', label: 'Volumen', group: 'panel', needs: 'volume', color: '#6B7A90', desc: 'Cuántas unidades se operaron en cada vela. Un movimiento con mucho volumen es más confiable que uno con poco.' },
  { id: 'rsi', label: 'RSI (14)', group: 'panel', color: '#8C93A6', desc: 'Mide la fuerza del movimiento de 0 a 100. Arriba de 70 se considera sobrecompra; abajo de 30, sobreventa.' },
  { id: 'macd', label: 'MACD', group: 'panel', color: '#6FA8DC', desc: 'Compara dos medias para detectar cambios de tendencia: cuando la línea cruza a su señal suele cambiar el impulso.' },
];

const KEY = 'finagent.charttools.v1';
export const DEFAULT_TOOLS: ChartTools = { volume: true };
export function loadTools(): ChartTools {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return v && typeof v === 'object' ? v : { ...DEFAULT_TOOLS }; } catch { return { ...DEFAULT_TOOLS }; }
}
export function saveTools(t: ChartTools): void { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* sin almacenamiento */ } }
export const activeCount = (t: ChartTools): number => TOOL_DEFS.filter((d) => t[d.id]).length;

/** Por qué una herramienta no se puede usar en el gráfico actual (o null si se puede). */
export function whyUnavailable(d: ToolDef, ctx: { intraday: boolean; hasVolume: boolean }): string | null {
  if (d.needs === 'intraday' && !ctx.intraday) return 'Solo en los rangos 1D y 1S';
  if (d.needs === 'volume' && !ctx.hasVolume) return 'Este activo no informa volumen';
  return null;
}

export function openToolsSheet(o: { tools: ChartTools; intraday: boolean; hasVolume: boolean; onChange: (t: ChartTools, changed: ToolId) => void }): void {
  const tools = { ...o.tools };
  const row = (d: ToolDef) => {
    const why = whyUnavailable(d, o);
    return `<label class="tool-row${why ? ' off' : ''}"><span class="tool-dot" style="background:${d.color}"></span>
      <span class="tool-txt"><b>${esc(d.label)}</b><small>${esc(d.desc)}</small>${why ? `<small class="tool-why">${esc(why)}</small>` : ''}</span>
      <input type="checkbox" class="tgl" data-t="${d.id}" ${tools[d.id] ? 'checked' : ''} ${why ? 'disabled' : ''} /></label>`;
  };
  const el = h('div', { class: 'tools-sheet' });
  el.innerHTML = `<div class="sheet-title">${icon('sliders', 20)} Herramientas del gráfico</div>
    <p class="muted" style="margin:2px 0 6px;font-size:13px">Activá lo que quieras ver. Todas son gratis y no gastan conversaciones.</p>
    <div class="eyebrow" style="margin:12px 0 2px">Sobre el precio</div>${TOOL_DEFS.filter((d) => d.group === 'over').map(row).join('')}
    <div class="eyebrow" style="margin:14px 0 2px">Paneles debajo</div>${TOOL_DEFS.filter((d) => d.group === 'panel').map(row).join('')}
    <button class="btn btn-ghost btn-block" id="t-clear" style="margin-top:14px">Quitar todas</button>`;
  el.addEventListener('change', (e) => {
    const inp = e.target as HTMLInputElement, id = inp.dataset.t as ToolId | undefined;
    if (!id) return;
    if (inp.checked) tools[id] = true; else delete tools[id];
    o.onChange({ ...tools }, id);
  });
  el.querySelector('#t-clear')!.addEventListener('click', () => {
    el.querySelectorAll<HTMLInputElement>('.tgl').forEach((i) => { i.checked = false; });
    for (const k of Object.keys(tools)) delete tools[k as ToolId];
    o.onChange({}, 'volume');
  });
  openSheet(el);
}
