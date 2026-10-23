// Pantalla de carga: el logo de FinAgent en 3D, una línea de progreso y, cuando todo está listo, el logo despega hacia arriba (con un sonido sutil)
// mientras aparece la pantalla siguiente por debajo.
import { t } from '../i18n';
import { $, esc, h } from '../ui/dom';
import { icon } from '../ui/icons';
import type { LogoStage } from '../ui/logoStage';
import { playLaunch } from '../ui/sfx';

export interface LaunchOpts {
  /** El trabajo real de arranque (por ejemplo crear la cuenta). Si falla, se muestra el motivo y se puede reintentar. */
  run: () => Promise<unknown>;
  /** Texto del error, o null si no se puede reintentar. */
  failure: (e: unknown) => { text: string; retry: boolean };
  /** Se llama cuando el logo ya va en el aire: acá se arma la pantalla siguiente (así aparece mientras el logo se va). */
  onReveal: () => void;
  /** Se llama cuando terminó todo y la pantalla de carga ya no está. */
  onDone?: () => void;
  /** Tiempo mínimo en pantalla para que se aprecie el logo (ms). */
  minMs?: number;
}

const STEPS = ['Conectando con los mercados', 'Cargando herramientas de análisis', 'Preparando tu espacio'];

export function mountLaunch(root: HTMLElement, o: LaunchOpts): void {
  const el = h('div', { class: 'launch' });
  el.innerHTML = `<div class="launch-bg"></div><div class="launch-stage"></div>
    <div class="launch-ui"><div class="launch-word">FINAGENT</div>
      <div class="launch-line"><i id="l-bar"></i></div><div class="launch-status" id="l-msg">${esc(t(STEPS[0]))}</div>
      <div id="l-err" class="launch-err hide"></div><button class="btn btn-ghost hide" id="l-retry">${esc(t('Reintentar'))}</button></div>`;
  root.append(el);
  // three.js se carga aparte (pesa) para que la pantalla de carga aparezca al instante; si no se pudiera, queda la figura plana.
  const host = $('.launch-stage', el);
  const stageP: Promise<LogoStage> = import('../ui/logoStage').then((m) => m.createLogoStage(host));
  const bar = $('#l-bar', el), msg = $('#l-msg', el), err = $('#l-err', el), retry = $<HTMLButtonElement>('#l-retry', el);
  let timer = 0;

  const run = async () => {
    err.classList.add('hide'); retry.classList.add('hide'); msg.classList.remove('hide'); bar.style.width = '6%';
    const started = performance.now(), min = o.minMs ?? 1900;
    let step = 0;
    timer = window.setInterval(() => { step = Math.min(STEPS.length - 1, step + 1); msg.textContent = t(STEPS[step]); bar.style.width = `${Math.round(((step + 1) / (STEPS.length + 0.4)) * 100)}%`; }, min / STEPS.length);
    try {
      const stage = (await Promise.all([o.run(), new Promise((r) => setTimeout(r, min)), stageP.then(async (st) => { await st.ready; return st; })]))[2];
      clearInterval(timer); bar.style.width = '100%';
      el.classList.add('going'); void started;
      playLaunch();
      let fading = false;
      await stage.launch({ onReveal: () => { if (fading) return; fading = true; el.classList.add('revealing'); o.onReveal(); } });
      if (!fading) o.onReveal();
      stage.destroy(); el.remove(); o.onDone?.();
    } catch (e) {
      clearInterval(timer);
      const f = o.failure(e);
      msg.classList.add('hide'); err.innerHTML = `${icon('warn', 16)}<span>${esc(f.text)}</span>`; err.classList.remove('hide');
      if (f.retry) retry.classList.remove('hide');
    }
  };
  retry.onclick = () => void run();
  void run();
}
