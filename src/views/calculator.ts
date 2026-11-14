// Calculadora de escenarios: cuentas con supuestos que elige la persona. No predice nada.
// Dos modos: "Mi cartera" (qué pasaría con lo que cargaste si el dólar o los activos se mueven X%) y "Aportes" (cuánto se junta con un aporte mensual).
import { track } from '../analytics';
import type { Ctx } from '../ctx';
import { parseNum, savings, scenario, type Valued } from '../portfolio';
import { $, esc, h } from '../ui/dom';
import { dirClass, fmtNum, fmtPct } from '../ui/format';
import { icon } from '../ui/icons';
import type { Overlay } from './asset';
import { exportPortfolioPdf } from './exportPdf';

export interface CalcInput { valued: Valued[]; base: 'ARS' | 'USD'; rate: number }

const field = (id: string, label: string, value: string, suffix = '') =>
  `<label class="onb-field" style="display:flex"><span class="muted" style="font-size:13px;min-width:132px">${esc(label)}</span><input id="${id}" inputmode="decimal" value="${esc(value)}" style="text-align:right"/>${suffix ? `<span class="muted" style="font-size:13px;padding-right:8px">${esc(suffix)}</span>` : ''}</label>`;
const num = (el: HTMLInputElement, d = 0) => { const n = parseNum(el.value); return n === null ? d : n; };

export function openCalculator(ctx: Ctx, input: CalcInput | null = null, onClose?: () => void): Overlay {
  void ctx;
  track('screen', { name: 'calculator' });
  const el = h('div', { class: 'overlay' });
  let closed = false;
  let mode: 'portfolio' | 'savings' = input ? 'portfolio' : 'savings';
  const close = () => { if (closed) return; closed = true; el.classList.add('leaving'); setTimeout(() => { el.remove(); onClose?.(); }, 200); };
  el.innerHTML = `<div class="ov-bar"><button class="icon-btn" id="c-back" aria-label="Volver">${icon('chevronLeft', 22)}</button><div class="ov-title"><div style="font-weight:750">Calculadora de escenarios</div></div></div>
    <div class="ov-body"><div class="seg" id="c-mode">${input ? '<button data-m="portfolio" class="on">Mi cartera</button>' : ''}<button data-m="savings" class="${input ? '' : 'on'}">Aportes y plazo</button></div><div id="c-panel" style="margin-top:14px"></div></div>`;
  $('#c-back', el).onclick = close;
  const panel = $('#c-panel', el);

  function portfolioPanel() {
    panel.innerHTML = `<p class="muted" style="font-size:13px;line-height:1.5">Elegí cuánto se mueven el dólar y tus activos y mirá cómo quedaría tu cartera. Es una cuenta con tus supuestos, no una predicción.</p>
      ${field('c-fx', 'El dólar sube', '20', '%')}${field('c-as', 'Tus activos cambian', '-15', '%')}
      <div class="muted" style="font-size:11.5px;margin-top:6px">Usá negativos para bajas. El efectivo en pesos o dólares no cambia por sí mismo; lo que se mueve es su valor al convertir.</div>
      <div id="c-out" class="card" style="margin-top:14px"></div>
      <div style="display:flex;gap:10px;margin-top:14px"><button class="btn btn-ghost btn-sm" id="c-pdf">${icon('externalLink', 16)} Guardar este escenario en PDF</button></div>
      <p class="muted" style="font-size:11.5px;line-height:1.5;margin-top:14px">No considera que los activos en pesos que cotizan en el país (como los CEDEARs) suelen moverse con el dólar. Información, no asesoramiento.</p>`;
    const fx = $<HTMLInputElement>('#c-fx', panel), as = $<HTMLInputElement>('#c-as', panel), out = $('#c-out', panel);
    const run = () => scenario(input!.valued, input!.base, input!.rate, { fxPct: num(fx), assetsPct: num(as) });
    const draw = () => {
      const r = run();
      out.innerHTML = `<div class="eyebrow">Tu cartera en ${r.base}</div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:6px"><span class="muted">Hoy</span><span class="num" style="font-weight:650">${fmtNum(r.before)}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:4px"><span class="muted">Con tus supuestos</span><span class="num" style="font-size:22px;font-weight:780">${fmtNum(r.after)}</span></div>
        <div style="text-align:right;margin-top:4px"><span class="pill ${dirClass(r.deltaPct)}">${fmtPct(r.deltaPct)}</span></div>
        <div style="margin-top:10px">${r.rows.slice(0, 10).map((x) => `<div style="display:flex;justify-content:space-between;font-size:13px;margin-top:6px"><span style="font-weight:650">${esc(x.symbol)}</span><span class="num">${fmtNum(x.before)} → ${fmtNum(x.after)} <span class="${dirClass(x.deltaPct)}">(${fmtPct(x.deltaPct)})</span></span></div>`).join('')}</div>
        <div class="muted" style="font-size:11.5px;margin-top:10px">Dólar de ${fmtNum(r.rateBefore)} a ${fmtNum(r.rateAfter)} pesos.${r.excluded ? ` ${r.excluded} posiciones sin precio o en otra moneda quedan afuera.` : ''}</div>`;
    };
    fx.oninput = draw; as.oninput = draw; draw();
    $('#c-pdf', panel).onclick = () => { void exportPortfolioPdf(input!.valued, input!.base, input!.rate, run()); };
  }

  function savingsPanel() {
    panel.innerHTML = `<p class="muted" style="font-size:13px;line-height:1.5">Cuánto podrías juntar si aportás todos los meses, con una rentabilidad y una inflación que suponés vos. No es una promesa ni una predicción.</p>
      ${field('s-ini', 'Lo que ya tenés', '0')}${field('s-mon', 'Aporte por mes', '100')}${field('s-rate', 'Rentabilidad anual supuesta', '5', '%')}${field('s-inf', 'Inflación anual supuesta', '3', '%')}${field('s-yrs', 'Años', '10', 'años')}
      <div id="s-out" class="card" style="margin-top:14px"></div>
      <p class="muted" style="font-size:11.5px;line-height:1.5;margin-top:14px">Interés compuesto mensual, aportes a fin de mes, sin impuestos ni comisiones. Las rentabilidades reales varían y pueden ser negativas.</p>`;
    const g = (id: string) => $<HTMLInputElement>(id, panel);
    const out = $('#s-out', panel);
    const draw = () => {
      const r = savings({ initial: num(g('#s-ini')), monthly: num(g('#s-mon')), annualRatePct: num(g('#s-rate')), inflationPct: num(g('#s-inf')), years: num(g('#s-yrs'), 1) });
      out.innerHTML = `<div class="eyebrow">Al final del plazo</div>
        <div class="num" style="font-size:26px;font-weight:780;margin-top:4px">${fmtNum(r.nominal)}</div><div class="muted" style="font-size:12.5px">en valores de ese momento</div>
        <div style="display:flex;justify-content:space-between;margin-top:10px"><span class="muted">En valores de hoy (sin inflación)</span><span class="num" style="font-weight:650">${fmtNum(r.real)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px"><span class="muted">Lo que pusiste vos</span><span class="num">${fmtNum(r.contributed)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px"><span class="muted">Intereses supuestos</span><span class="num">${fmtNum(r.interest)}</span></div>`;
    };
    panel.querySelectorAll('input').forEach((i) => { i.oninput = draw; });
    draw();
  }

  const show = () => (mode === 'portfolio' && input ? portfolioPanel() : savingsPanel());
  $('#c-mode', el).onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-m]');
    if (!b) return;
    mode = b.dataset.m === 'portfolio' ? 'portfolio' : 'savings';
    el.querySelectorAll('#c-mode button').forEach((x) => x.classList.toggle('on', x === b));
    show();
  };
  show();
  return { el, close };
}
