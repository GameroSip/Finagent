// Tarjetas ricas del chat: los datos de las herramientas se muestran como gráficos y tablas, no solo texto.
import type { Ctx } from '../ctx';
import { mountCompareChart, mountPriceChart, PALETTE, type ChartHandle } from '../ui/chart';
import { esc, h, openUrl } from '../ui/dom';
import { dirClass, fmtCompact, fmtNum, fmtPct, fmtPrice, initials, symbolColor, timeAgo } from '../ui/format';
import { icon, type IconName } from '../ui/icons';
import { sparkSvg } from '../ui/spark';

export interface Rich { el: HTMLElement; mount?: () => void; destroy?: () => void }

function shell(title: string, sub: string, ic: IconName, onHead?: () => void): { el: HTMLElement; body: HTMLElement } {
  const el = h('div', { class: 'rich' });
  const head = h('div', { class: 'rich-head' });
  head.innerHTML = `<span class="rich-ic">${icon(ic, 16)}</span><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px">${esc(title)}</div>${sub ? `<div class="muted" style="font-size:12px">${esc(sub)}</div>` : ''}</div>${onHead ? icon('arrowUpRight', 16) : ''}`;
  if (onHead) { head.style.cursor = 'pointer'; head.onclick = onHead; }
  const body = h('div', { class: 'rich-body' });
  el.append(head, body);
  return { el, body };
}

const pillHtml = (pct: number | null | undefined) => {
  const c = dirClass(pct ?? null);
  return `<span class="pill ${c}">${c === 'up' ? icon('arrowUp', 11) : c === 'down' ? icon('arrowDown', 11) : ''}${fmtPct(pct ?? null, false)}</span>`;
};

const PERIOD: Record<string, string> = { '6mo': '6 meses', '1y': '1 año', '2y': '2 años', '5y': '5 años' };

function chartCard(ui: any, ctx: Ctx): Rich {
  const { el, body } = shell(ui.symbol, `Gráfico técnico · ${PERIOD[ui.period] ?? ui.period}`, 'candles', () => ctx.openAsset(ui.symbol));
  const box = h('div', { style: 'margin:0 -6px' });
  body.append(box);
  const legend = h('div', { class: 'chips-wrap', style: 'margin-top:8px' });
  const emas = [{ span: 50, color: PALETTE[3] }, { span: 200, color: PALETTE[4] }].filter((e) => ui.ema?.[e.span]);
  legend.innerHTML = `<span class="chip">Velas</span>${emas.map((e) => `<span class="chip"><i class="dot" style="background:${e.color}"></i>EMA ${e.span}</span>`).join('')}`;
  body.append(legend);
  let handle: ChartHandle | null = null;
  return {
    el, destroy: () => handle?.destroy(),
    mount: () => {
      handle = mountPriceChart(box, { points: ui.bars, mode: 'candles', height: 220, intraday: false,
        ema: emas.map((e) => ({ span: e.span, values: ui.ema[e.span], color: e.color })) });
    },
  };
}

function compareCard(ui: any): Rich {
  const { el, body } = shell('Rendimiento comparado', 'Variación % desde el inicio del período (1 año)', 'layers');
  const box = h('div', { style: 'margin:0 -6px' });
  body.append(box);
  const legend = h('div', { class: 'chips-wrap', style: 'margin-top:8px' });
  legend.innerHTML = ui.lines.map((l: any, i: number) => {
    const last = l.points[l.points.length - 1]?.[1];
    return `<span class="chip"><i class="dot" style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(l.symbol)} <b class="num ${dirClass(last) === 'down' ? 'down' : 'up'}">${fmtPct(last, true)}</b></span>`;
  }).join('');
  body.append(legend);
  let handle: ChartHandle | null = null;
  return { el, destroy: () => handle?.destroy(), mount: () => { handle = mountCompareChart(box, ui.lines, 220); } };
}

function quotesCard(ui: any, ctx: Ctx): Rich {
  const { el, body } = shell(ui.title ?? 'Cotizaciones', '', 'activity');
  const items: any[] = ui.items ?? [];
  if (items.some((i) => i.spark?.length > 1)) {
    const row = h('div', { class: 'scroll-x', style: 'margin:0 -14px;padding:2px 14px 4px' });
    items.forEach((i) => {
      const c = h('button', { class: 'mini-idx' });
      c.innerHTML = `<div class="eyebrow" style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(i.name)}</div>
        <div class="num" style="font-weight:700;margin:3px 0 5px">${fmtNum(i.price, i.price > 1000 ? 0 : 2)}</div>${pillHtml(i.changePct)}
        <div style="margin:6px -2px 0;height:26px">${sparkSvg(i.spark ?? [], { w: 112, h: 26 })}</div>`;
      c.onclick = () => ctx.openAsset(i.symbol, i.name);
      row.append(c);
    });
    body.append(row);
  } else {
    items.slice(0, 8).forEach((i, idx) => {
      const r = h('button', { class: 'qrow', style: idx ? 'border-top:1px solid var(--line)' : '' });
      r.innerHTML = `<div class="avatar" style="width:34px;height:34px;border-radius:11px;font-size:11px;background:${symbolColor(i.symbol)}">${esc(initials(i.symbol))}</div>
        <div style="flex:1;min-width:0;text-align:left"><div style="font-weight:700">${esc(i.symbol)}</div><div class="muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(i.name)}</div></div>
        <div style="text-align:right"><div class="num" style="font-weight:650;margin-bottom:2px">${fmtPrice(i.price, i.currency ?? 'USD')}</div>${pillHtml(i.changePct)}</div>`;
      r.onclick = () => ctx.openAsset(i.symbol, i.name);
      body.append(r);
    });
  }
  return { el };
}

function fxCard(ui: any): Rich {
  const { el, body } = shell('Argentina · dólar y macro', '', 'landmark');
  const rows: any[] = ui.rows ?? [];
  const oficial = rows.find((r) => r.casa === 'oficial')?.venta;
  if (rows.length) {
    body.insertAdjacentHTML('beforeend', `<table class="fx"><thead><tr><th></th><th>Compra</th><th>Venta</th><th>Brecha</th></tr></thead><tbody>${rows.map((r) => {
      const br = oficial && r.venta && r.casa !== 'oficial' ? (r.venta / oficial - 1) * 100 : null;
      return `<tr><td>${esc(r.nombre)}</td><td class="num">${fmtNum(r.compra, 0)}</td><td class="num" style="font-weight:700">${fmtNum(r.venta, 0)}</td><td class="num muted">${br === null ? '—' : fmtPct(br)}</td></tr>`;
    }).join('')}</tbody></table>`);
  }
  const chips: string[] = [];
  if (ui.riesgoPais) chips.push(`<span class="chip">Riesgo país <b class="num">${fmtNum(ui.riesgoPais.valor, 0)} pb</b></span>`);
  if (ui.inflacion?.mensual) chips.push(`<span class="chip">Inflación mensual <b class="num">${fmtNum(ui.inflacion.mensual.valor, 1)}%</b></span>`);
  if (ui.inflacion?.interanual) chips.push(`<span class="chip">Interanual <b class="num">${fmtNum(ui.inflacion.interanual.valor, 1)}%</b></span>`);
  if (chips.length) body.insertAdjacentHTML('beforeend', `<div class="chips-wrap" style="margin-top:10px">${chips.join('')}</div>`);
  return { el };
}

function headlinesCard(ui: any): Rich {
  const { el, body } = shell('Titulares', 'Narrativa de los medios (no son hechos verificados)', 'newspaper');
  (ui.items ?? []).slice(0, 6).forEach((n: any, idx: number) => {
    const a = h('a', { class: 'hl', attrs: { href: n.url }, style: idx ? 'border-top:1px solid var(--line)' : '' });
    a.innerHTML = `<div style="font-weight:600;line-height:1.35;font-size:13.5px">${esc(n.title)}</div><div class="muted" style="font-size:11.5px;margin-top:4px">${esc(n.source ?? '')} · ${esc(timeAgo(n.ts))}</div>`;
    a.onclick = (e) => { e.preventDefault(); openUrl(n.url); };
    body.append(a);
  });
  return { el };
}

function metricsCard(ui: any, ctx: Ctx): Rich {
  const { el, body } = shell(`${ui.symbol} · fundamentales`, ui.name !== ui.symbol ? ui.name : '', 'scale', () => ctx.openAsset(ui.symbol, ui.name));
  const fmt = (it: any) => {
    if (it.key === 'market_cap') return fmtCompact(it.value);
    if (it.unit === '%') return fmtPct(it.value, false);
    if (it.unit === 'x') return `${fmtNum(it.value, 2)}x`;
    return fmtNum(it.value, 2);
  };
  body.insertAdjacentHTML('beforeend', `<div class="mgrid">${(ui.items ?? []).map((it: any) => `<div class="mcell"><div class="eyebrow" style="font-weight:600;font-size:12px">${esc(it.label)}</div><div class="num" style="font-weight:700;font-size:16px;margin-top:2px">${fmt(it)}</div></div>`).join('')}</div>`);
  return { el };
}

function screenCard(ui: any, ctx: Ctx): Rich {
  const passed: any[] = ui.passed ?? [], excluded: any[] = ui.excluded ?? [];
  const { el, body } = shell('Resultado del screener', `Pasan ${passed.length} de ${ui.evaluated} · ${ui.universe}`, 'search');
  if (!passed.length) body.insertAdjacentHTML('beforeend', '<div class="muted" style="font-size:13px;padding:4px 0">Ningún activo cumplió todos los filtros.</div>');
  passed.forEach((p, idx) => {
    const r = h('button', { class: 'qrow', style: idx ? 'border-top:1px solid var(--line)' : '' });
    r.innerHTML = `<div class="avatar" style="width:34px;height:34px;border-radius:11px;font-size:11px;background:${symbolColor(p.ticker)}">${esc(initials(p.ticker))}</div>
      <div style="flex:1;min-width:0;text-align:left"><div style="font-weight:700">${esc(p.ticker)}</div><div class="muted num" style="font-size:12px">P/E ${fmtNum(p.pe_ttm, 1)} · Div ${p.dividend_yield_pct !== undefined ? fmtPct(p.dividend_yield_pct, false) : '—'} · ROE ${p.roe_pct !== undefined ? fmtPct(p.roe_pct, false) : '—'}</div></div>
      <div class="num" style="font-weight:650">${fmtNum(p.price, 2)}</div>`;
    r.onclick = () => ctx.openAsset(p.ticker);
    body.append(r);
  });
  if (excluded.length) {
    body.insertAdjacentHTML('beforeend', `<details class="excl"><summary>Ver ${excluded.length} excluidos y por qué</summary>${excluded.map((e) => `<div class="excl-row"><b>${esc(e.ticker)}</b><span class="muted">${esc((e.reasons ?? []).join(' · '))}</span></div>`).join('')}</details>`);
  }
  return { el };
}

export function renderRich(ui: any, ctx: Ctx): Rich | null {
  if (!ui || typeof ui !== 'object') return null;
  try {
    switch (ui.kind) {
      case 'chart': return ui.bars?.length > 1 ? chartCard(ui, ctx) : null;
      case 'compare': return ui.lines?.length > 1 ? compareCard(ui) : null;
      case 'quotes': return ui.items?.length ? quotesCard(ui, ctx) : null;
      case 'fx': return fxCard(ui);
      case 'headlines': return ui.items?.length ? headlinesCard(ui) : null;
      case 'metrics': return ui.items?.length ? metricsCard(ui, ctx) : null;
      case 'screen': return screenCard(ui, ctx);
      default: return null;
    }
  } catch { return null; }
}
