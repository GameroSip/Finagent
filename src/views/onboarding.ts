// Primera apertura: una sola cosa que hacer, pegar la clave de Gemini. Todo lo demás es automático.
import { GeminiError, ModelManager, modelLabel } from '../models';
import { saveSettings } from '../store';
import { $, esc, h, openUrl } from '../ui/dom';
import { icon } from '../ui/icons';
import { logoSvg } from '../ui/logo';
import { t } from '../i18n';

export function mountOnboarding(root: HTMLElement, models: ModelManager, onDone: () => void): void {
  const el = h('div', { class: 'onb' });
  el.innerHTML = `
    <div class="onb-inner">
      <div class="onb-logo">${logoSvg(88)}</div>
      <h1 class="onb-title">Tu analista financiero<br><span class="grad-text">con inteligencia artificial</span></h1>
      <p class="onb-sub">Datos reales, cada cifra verificada y foco en el mercado argentino.</p>
      <ul class="onb-feats">
        <li><span class="fi">${icon('shield', 20)}</span><div><b>Cifras verificadas</b><span>Si un número no sale de los datos, te avisa.</span></div></li>
        <li><span class="fi">${icon('landmark', 20)}</span><div><b>Mercado argentino</b><span>Dólar, brecha, riesgo país, CEDEARs y acciones locales.</span></div></li>
        <li><span class="fi">${icon('zap', 20)}</span><div><b>Todo automático</b><span>Elige solo el mejor modelo disponible. Sin configurar nada.</span></div></li>
      </ul>
      <div class="card onb-card">
        <label for="onb-key" class="eyebrow" style="font-weight:600">Tu clave de Gemini (gratis)</label>
        <div class="onb-field">
          <span class="muted">${icon('keyRound', 18)}</span>
          <input id="onb-key" type="password" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Pegá tu clave acá" />
          <button class="btn btn-ghost btn-sm" id="onb-paste" type="button">Pegar</button>
        </div>
        <button class="onb-link" id="onb-get" type="button">Conseguí una clave gratis en Google AI Studio ${icon('externalLink', 14)}</button>
        <div id="onb-err" class="error-box hide" style="margin-top:12px"></div>
      </div>
      <button class="btn btn-primary btn-block" id="onb-go" disabled style="margin-top:16px">Empezar</button>
      <p class="muted onb-note">${icon('lock', 13)} Tu clave se guarda solo en este teléfono. En el nivel gratuito Google puede usar lo que escribas para mejorar sus modelos: no cargues datos personales. Información educativa, no es asesoramiento financiero.</p>
    </div>`;
  root.append(el);

  const input = $<HTMLInputElement>('#onb-key', el), go = $<HTMLButtonElement>('#onb-go', el), err = $('#onb-err', el);
  const showErr = (m: string) => { err.innerHTML = `${icon('warn', 18)}<span>${esc(m)}</span>`; err.classList.remove('hide'); };
  input.addEventListener('input', () => { go.disabled = input.value.trim().length < 20; err.classList.add('hide'); });

  $('#onb-paste', el).onclick = async () => {
    try { input.value = (await navigator.clipboard.readText()).trim(); input.dispatchEvent(new Event('input')); }
    catch { showErr('No pude leer el portapapeles. Mantené presionado el campo y elegí "Pegar".'); }
  };
  $('#onb-get', el).onclick = () => openUrl('https://aistudio.google.com/apikey');

  go.onclick = async () => {
    const key = input.value.trim();
    go.disabled = true; go.innerHTML = `<span class="spin"></span> Verificando clave…`;
    try {
      const chain = await models.discover(key, true, true);
      saveSettings({ apiKey: key });
      go.innerHTML = `${icon('check', 18)} ${t('Conectado')} · ${esc(modelLabel(chain[0]))}`;
      setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); onDone(); }, 280); }, 700);
    } catch (e) {
      go.disabled = false; go.textContent = 'Empezar';
      if (e instanceof GeminiError && e.kind === 'invalid_key') showErr('Esa clave no es válida. Revisá que la hayas copiado completa.');
      else showErr('No pude conectarme a Google. Revisá tu conexión e intentá de nuevo.');
    }
  };
}
