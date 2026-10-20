// Primera apertura de la beta: la cuenta se crea sola (sin registro, sin códigos, sin claves). Solo se ve un instante.
import { AccessDeniedError, busyMessage, ensureSession, ServerBusyError } from '../server';
import { $, esc, h } from '../ui/dom';
import { icon } from '../ui/icons';
import { logoSvg } from '../ui/logo';

export function mountSplash(root: HTMLElement, onDone: () => void): void {
  const el = h('div', { class: 'onb' });
  el.innerHTML = `<div class="onb-inner" style="text-align:center"><div class="onb-logo">${logoSvg(88)}</div>
    <h1 class="onb-title" style="margin-top:18px">FinAgent</h1>
    <p class="onb-sub" id="sp-msg"><span class="spin"></span> Preparando tu cuenta…</p>
    <div id="sp-err" class="error-box hide" style="margin-top:16px"></div>
    <button class="btn btn-primary btn-block hide" id="sp-retry" style="margin-top:14px">Reintentar</button></div>`;
  root.append(el);
  const msg = $('#sp-msg', el), err = $('#sp-err', el), retry = $<HTMLButtonElement>('#sp-retry', el);

  const run = async () => {
    err.classList.add('hide'); retry.classList.add('hide'); msg.innerHTML = '<span class="spin"></span> Preparando tu cuenta…';
    try {
      await ensureSession();
      msg.innerHTML = `${icon('check', 18)} Listo`;
      setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); onDone(); }, 280); }, 350);
    } catch (e) {
      msg.textContent = '';
      const text = e instanceof AccessDeniedError ? 'Tu acceso a FinAgent fue desactivado. Si creés que es un error, escribinos.'
        : e instanceof ServerBusyError ? busyMessage(e) : 'No pude preparar tu cuenta. Revisá tu conexión e intentá de nuevo.';
      err.innerHTML = `${icon('warn', 18)}<span>${esc(text)}</span>`; err.classList.remove('hide');
      if (!(e instanceof AccessDeniedError)) retry.classList.remove('hide');
    }
  };
  retry.onclick = () => void run();
  void run();
}
