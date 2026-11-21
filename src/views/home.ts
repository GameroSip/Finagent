// Menú de inicio "Bento": cinco accesos grandes arriba de Mercados (Analista IA, Mercado, Termómetro de tensión, Mi cartera, Calculadora).
// Cada tarjeta lleva data-tour para el recorrido interactivo (src/tour.ts). Los datos de mercado los pasa la pantalla Mercados
// cuando ya los cargó (no se piden dos veces); el termómetro se calcula con las ruedas diarias del SPY, una vez por sesión.
import type { Ctx } from '../ctx';
import { loadPortfolio } from '../portfolio';
import { stressNow, STRESS_TEXTS } from '../stress';
import type { StressLevel } from '../stress';
import { fetchChart } from '../yahoo';
import { t } from '../i18n';
import { esc, h } from '../ui/dom';
import { dirClass, fmtNum, fmtPct, fmtPrice } from '../ui/format';
import { icon } from '../ui/icons';
import { dialSvg, FILLED } from '../ui/stressCard';
import { openCalculator } from './calculator';

/** Todos los textos del menú en un solo lugar (se traducen con t()). Ninguno promete datos al instante ni asesoramiento. */
export const HOME_TEXTS = {
  chatEyebrow: 'Analista IA', verified: 'Cifras verificadas', chatTitle: 'Preguntá lo que quieras sobre mercados y tu cartera',
  chatPlaceholder: 'Preguntale al analista…', voice: 'Dictar', attach: 'Adjuntar',
  marketEyebrow: 'Mercado y activos', marketFoot: 'Cotizaciones, dólar y gráficos técnicos',
  radarEyebrow: 'Termómetro de tensión', radarSub: 'S&P 500 (SPY) · ruedas diarias', radarWait: 'Calculando…', radarOff: 'Sin datos por ahora',
  portEyebrow: 'Mi cartera', portEmpty: 'Cargá tu primera posición', portOne: '1 posición', portMany: '{n} posiciones', portLocal: 'Se guarda solo en tu teléfono',
  portShot: 'Captura del broker', portPdf: 'Informe PDF',
  calcEyebrow: 'Calculadora', calcTitle: 'Escenarios y aportes', calcSub: 'Simulá con tus propios supuestos',
} as const;
export const homeTexts = (): string[] => Object.values(HOME_TEXTS);

export interface Bento {
  el: HTMLElement;
  /** Índices ya cargados por Mercados (se usan S&P 500 y Bitcoin si están). */
  setQuotes(list: Array<{ symbol: string; name: string; price: number | null; changePct: number | null }>): void;
  /** Dólar blue (venta) ya cargado por Mercados. */
  setDolar(venta: number | null): void;
  /** Al volver a la pantalla: refresca el resumen de cartera. */
  refresh(): void;
}

const hx = (k: keyof typeof HOME_TEXTS) => esc(t(HOME_TEXTS[k]));
let radarCache: { level: StressLevel | null; at: number } | null = null;

export function createBento(ctx: Ctx): Bento {
  const el = h('section', { class: 'bento', attrs: { 'aria-label': t('Accesos') } });
  el.innerHTML = `
    <button class="bt bt-chat" data-tour="chat" style="--i:0" aria-label="${hx('chatEyebrow')}">
      <div class="bt-row"><span class="bt-eye">${icon('sparkles', 14)} ${hx('chatEyebrow')}</span><span class="bt-badge">${icon('badgeCheck', 12)} ${hx('verified')}</span></div>
      <h3 class="bt-h">${hx('chatTitle')}</h3>
      <span class="bt-pill"><span class="bt-ph">${hx('chatPlaceholder')}</span><span class="bt-ic" data-act="mic" role="button" aria-label="${hx('voice')}">${icon('mic', 17)}</span><span class="bt-ic" data-act="clip" role="button" aria-label="${hx('attach')}">${icon('paperclip', 17)}</span></span>
    </button>
    <button class="bt bt-market" data-tour="market" style="--i:1" aria-label="${hx('marketEyebrow')}">
      <span class="bt-eye">${icon('lineChart', 14)} ${hx('marketEyebrow')}</span>
      <div class="bt-quotes" id="bt-quotes">${['S&P 500', t('Dólar blue'), 'Bitcoin'].map((n) => `<div class="bt-q"><span>${esc(n)}</span><b class="num">—</b><i></i></div>`).join('')}</div>
      <span class="bt-foot">${hx('marketFoot')}</span>
    </button>
    <button class="bt bt-radar" data-tour="radar" style="--i:2" aria-label="${hx('radarEyebrow')}">
      <span class="bt-eye">${icon('radar', 14)} ${hx('radarEyebrow')}</span>
      <div class="bt-dial" id="bt-dial">${dialSvg(0)}<span class="bt-pulse"></span></div>
      <b class="bt-lv" id="bt-lv">${hx('radarWait')}</b>
      <span class="bt-sub">${hx('radarSub')}</span>
    </button>
    <button class="bt bt-port" data-tour="portfolio" style="--i:3" aria-label="${hx('portEyebrow')}">
      <span class="bt-eye">${icon('landmark', 14)} ${hx('portEyebrow')}</span>
      <b class="bt-big" id="bt-port-n"></b>
      <span class="bt-sub">${icon('lock', 11)} ${hx('portLocal')}</span>
      <span class="bt-chips"><span>${icon('camera', 11)} ${hx('portShot')}</span><span>${icon('fileText', 11)} ${hx('portPdf')}</span></span>
    </button>
    <button class="bt bt-calc" data-tour="calc" style="--i:4" aria-label="${hx('calcEyebrow')}">
      <span class="bt-calc-ic">${icon('calculator', 22)}</span>
      <span class="bt-calc-t"><span class="bt-eye">${hx('calcEyebrow')}</span><b>${hx('calcTitle')}</b><span class="bt-sub">${hx('calcSub')}</span></span>
      ${icon('chevronRight', 18)}
    </button>`;

  const $ = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;

  // ---- acciones
  $('.bt-chat').onclick = (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    ctx.go('chat');
    setTimeout(() => {
      if (act === 'mic') document.querySelector<HTMLButtonElement>('#c-mic')?.click();
      else if (act === 'clip') document.querySelector<HTMLButtonElement>('#c-clip')?.click();
      else document.querySelector<HTMLTextAreaElement>('#c-in')?.focus();
    }, 60);
  };
  $('.bt-market').onclick = () => document.querySelector('#m-indices')?.closest('.section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('.bt-radar').onclick = () => ctx.openAsset('SPY', 'S&P 500 (SPY)', 'market');
  $('.bt-port').onclick = () => ctx.go('portfolio');
  $('.bt-calc').onclick = () => ctx.layer((done) => openCalculator(ctx, null, done));

  // ---- datos
  const rows = () => [...el.querySelectorAll<HTMLElement>('.bt-q')];
  const paint = (row: HTMLElement | undefined, value: string, pct: number | null | undefined) => {
    if (!row) return;
    row.querySelector('b')!.textContent = value;
    const i = row.querySelector('i')!;
    i.className = pct === undefined || pct === null ? '' : dirClass(pct);
    i.textContent = pct === undefined || pct === null ? '' : fmtPct(pct);
  };
  function setQuotes(list: Parameters<Bento['setQuotes']>[0]) {
    const sp = list.find((q) => q.symbol === '^GSPC'), btc = list.find((q) => q.symbol === 'BTC-USD');
    if (sp?.price != null) paint(rows()[0], fmtNum(sp.price, 0), sp.changePct);
    if (btc?.price != null) paint(rows()[2], fmtNum(btc.price, 0), btc.changePct);
  }
  function setDolar(v: number | null) { if (v) paint(rows()[1], fmtPrice(v, 'ARS'), null); }

  function refresh() {
    const n = loadPortfolio().length;
    $('#bt-port-n').textContent = n === 0 ? t(HOME_TEXTS.portEmpty) : n === 1 ? t(HOME_TEXTS.portOne) : t(HOME_TEXTS.portMany).replace('{n}', String(n));
    $('#bt-port-n').classList.toggle('empty', n === 0);
  }

  function showLevel(level: StressLevel | null) {
    $('#bt-dial').innerHTML = `${dialSvg(level ? FILLED[level] : 0)}<span class="bt-pulse"></span>`;
    $('#bt-dial').dataset.level = level ?? '';
    $('#bt-lv').textContent = level ? t(STRESS_TEXTS.levels[level]) : t(HOME_TEXTS.radarOff);
  }
  async function loadRadar() {
    if (radarCache && Date.now() - radarCache.at < 30 * 60_000) { showLevel(radarCache.level); return; }
    try {
      const d = await fetchChart('SPY', '1y', '1d');
      const r = stressNow(d.bars, 'SPY', d.meta);
      radarCache = { level: r.kind === 'ok' ? r.level : null, at: Date.now() };
    } catch { radarCache = { level: null, at: Date.now() - 25 * 60_000 }; }   // si falla, reintenta en ~5 minutos
    if (el.isConnected) showLevel(radarCache.level);
  }

  refresh();
  void loadRadar();
  return { el, setQuotes, setDolar, refresh };
}
