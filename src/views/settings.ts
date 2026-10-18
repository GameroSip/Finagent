// Ajustes: lo mínimo. El modelo y los límites son automáticos; acá solo hay cuenta, tema, diagnóstico y datos.
import type { Ctx, View } from '../ctx';
import { fetchFearGreed } from '../data/market';
import { fetchDolares, fetchRiesgoPais } from '../data/argentina';
import { fetchHeadlines } from '../data/news';
import { GeminiError, modelLabel } from '../models';
import { deleteAllChats, listChats } from '../chats';
import { clearWatchlist, getSettings, saveSettings, type Theme } from '../store';
import { fetchChart, fetchInfo } from '../yahoo';
import { $, esc, h, toast } from '../ui/dom';
import { icon } from '../ui/icons';
import { logoSvg } from '../ui/logo';
import { confirmSheet, openSheet } from '../ui/sheet';

const VERSION = '0.3.7';

interface Probe { name: string; run: () => Promise<unknown> }

export function createSettingsView(ctx: Ctx): View {
  const el = h('div', { class: 'view' });
  const key = () => getSettings().apiKey;
  const masked = () => (key() ? `••••••••${key().slice(-4)}` : 'Sin clave');

  const probes: Probe[] = [
    { name: 'Yahoo Finance · precios', run: () => fetchChart('AAPL', '5d', '1d') },
    { name: 'Yahoo Finance · fundamentales', run: () => fetchInfo('AAPL') },
    { name: 'DolarAPI · cotizaciones', run: () => fetchDolares() },
    { name: 'ArgentinaDatos · riesgo país', run: () => fetchRiesgoPais() },
    { name: 'Google News · titulares', run: () => fetchHeadlines(undefined, 'ar', 3) },
    { name: 'alternative.me · miedo y codicia', run: () => fetchFearGreed() },
    { name: 'Google Gemini · modelos', run: () => ctx.models.discover(key(), true, true) },
  ];

  function render() {
    const s = getSettings();
    const id = ctx.models.active ?? ctx.models.pick();
    const nChats = listChats().length;
    el.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Tu cuenta y la app</div><h1 class="title-xl">Ajustes</h1></div></div>
      <div class="card prof"><div style="width:52px;height:52px;border-radius:16px;overflow:hidden;flex:none">${logoSvg(52)}</div>
        <div><div style="font-weight:750;font-size:18px">FinAgent</div><div class="muted" style="font-size:13px">Versión ${VERSION} · todo en tu teléfono</div></div></div>

      <div class="set-group"><div class="set-title">Inteligencia artificial</div><div class="card set-card">
        <div class="set-row"><span class="set-ic">${icon('sparkles', 18)}</span><div style="flex:1"><div class="set-main">Modelo</div><div class="set-sub">Automático: usa el mejor disponible y se actualiza solo</div></div><span class="val">${esc(id ? modelLabel(id) : 'Gemini')}</span></div>
        <button class="set-row" id="s-refresh"><span class="set-ic">${icon('refresh', 18)}</span><div style="flex:1;text-align:left"><div class="set-main">Buscar modelos nuevos</div></div></button>
      </div></div>

      <div class="set-group"><div class="set-title">Cuenta</div><div class="card set-card">
        <div class="set-row"><span class="set-ic">${icon('keyRound', 18)}</span><div style="flex:1"><div class="set-main">Clave de Gemini</div><div class="set-sub num">${masked()}</div></div><button class="btn btn-ghost btn-sm" id="s-key">Cambiar</button></div>
      </div></div>

      <div class="set-group"><div class="set-title">Apariencia</div><div class="card set-card">
        <div class="set-row"><span class="set-ic">${icon('moon', 18)}</span><div class="set-main" style="flex:1">Tema</div>
          <div class="seg" id="s-theme">${(['auto', 'dark', 'light'] as Theme[]).map((t) => `<button data-t="${t}" class="${s.theme === t ? 'on' : ''}">${{ auto: 'Auto', dark: 'Oscuro', light: 'Claro' }[t]}</button>`).join('')}</div></div>
      </div></div>

      <div class="set-group"><div class="set-title" style="display:flex;justify-content:space-between;align-items:center">Estado de las fuentes <button class="link-btn" id="s-probe">Verificar</button></div>
        <div class="card set-card" id="s-sources">${probes.map((p, i) => `<div class="set-row src" data-i="${i}"><span class="sdot"></span><div class="set-main" style="flex:1;font-weight:550">${esc(p.name)}</div><span class="muted src-res" style="font-size:12px">sin verificar</span></div>`).join('')}</div>
        <div class="muted" style="font-size:12px;margin:8px 4px 0">Si una fuente falla desde tu red, esa sección muestra un aviso y el resto sigue funcionando.</div></div>

      <div class="set-group"><div class="set-title">Datos</div><div class="card set-card">
        <button class="set-row" id="s-clear-chats"><span class="set-ic">${icon('messageSquare', 18)}</span><div style="flex:1;text-align:left"><div class="set-main">Borrar historial de chats</div><div class="set-sub">${nChats ? `${nChats} ${nChats === 1 ? 'chat guardado' : 'chats guardados'} en este teléfono` : 'No hay chats guardados'}</div></div></button>
        <button class="set-row" id="s-clear-w"><span class="set-ic">${icon('star', 18)}</span><div class="set-main" style="flex:1;text-align:left">Borrar favoritos</div></button>
        <button class="set-row danger" id="s-wipe"><span class="set-ic">${icon('trash', 18)}</span><div style="flex:1;text-align:left"><div class="set-main">Cerrar sesión y borrar todo</div><div class="set-sub">Elimina tu clave y tus datos de este teléfono</div></div></button>
      </div></div>

      <div class="set-group"><div class="set-title">Acerca de</div><div class="card" style="font-size:13px;line-height:1.55" >
        <p class="text-2">FinAgent es una herramienta de información financiera con fines educativos. No es asesoramiento de inversión: los datos pueden tener demora o errores y las respuestas de la IA pueden equivocarse. Tomá tus decisiones con criterio propio.</p>
        <p class="muted" style="margin-top:10px">Gráficos: TradingView Lightweight Charts™ (tradingview.com). Iconos: Lucide. Tipografía: Inter. Datos: Yahoo Finance, DolarAPI, ArgentinaDatos, Google News, alternative.me. IA: Google Gemini.</p></div></div>`;
    bind();
  }

  function changeKey() {
    const c = h('div');
    c.innerHTML = `<h3 style="font-size:19px;font-weight:750">Cambiar clave de Gemini</h3><p class="muted" style="margin:6px 0 14px;font-size:13.5px">Pegá la nueva clave. Se verifica antes de guardarla.</p>
      <div class="onb-field"><span class="muted">${icon('keyRound', 18)}</span><input id="k-in" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Nueva clave" /></div>
      <div id="k-err" class="error-box hide" style="margin-top:12px"></div>
      <div style="display:flex;gap:10px;margin-top:16px"><button class="btn btn-ghost" id="k-cancel" style="flex:1">Cancelar</button><button class="btn btn-primary" id="k-ok" style="flex:1">Guardar</button></div>`;
    const close = openSheet(c);
    const err = $('#k-err', c);
    $('#k-cancel', c).onclick = close;
    $('#k-ok', c).onclick = async () => {
      const v = $<HTMLInputElement>('#k-in', c).value.trim();
      const ok = $<HTMLButtonElement>('#k-ok', c);
      if (v.length < 20) { err.textContent = 'La clave parece incompleta.'; err.classList.remove('hide'); return; }
      ok.disabled = true; ok.innerHTML = '<span class="spin"></span>';
      try { ctx.models.invalidate(); await ctx.models.discover(v, true, true); saveSettings({ apiKey: v }); close(); toast('Clave actualizada'); render(); }
      catch (e) { ok.disabled = false; ok.textContent = 'Guardar'; err.textContent = e instanceof GeminiError && e.kind === 'invalid_key' ? 'Esa clave no es válida.' : 'No pude conectarme para verificarla.'; err.classList.remove('hide'); }
    };
  }

  async function probeAll() {
    const btn = $<HTMLButtonElement>('#s-probe', el);
    btn.disabled = true; btn.textContent = 'Verificando…';
    for (let i = 0; i < probes.length; i++) {
      const row = $(`.src[data-i="${i}"]`, el), res = $('.src-res', row), dot = $('.sdot', row);
      dot.className = 'sdot wait'; res.textContent = '…';
      const t0 = performance.now();
      try { await probes[i].run(); dot.className = 'sdot ok'; res.textContent = `${Math.round(performance.now() - t0)} ms`; res.className = 'src-res up'; }
      catch (e: any) { dot.className = 'sdot bad'; res.textContent = String(e?.message ?? 'error').slice(0, 48); res.className = 'src-res down'; }
    }
    btn.disabled = false; btn.textContent = 'Verificar';
  }

  function bind() {
    $('#s-refresh', el).onclick = async () => {
      try { const chain = await ctx.models.discover(key(), true, true); toast(`Usando ${modelLabel(chain[0])}`); render(); }
      catch { toast('No pude consultar los modelos ahora'); }
    };
    $('#s-key', el).onclick = changeKey;
    $('#s-theme', el).addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!b) return;
      saveSettings({ theme: b.dataset.t as Theme });
      $('#s-theme', el).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    });
    $('#s-probe', el).onclick = () => void probeAll();
    $('#s-clear-chats', el).onclick = async () => {
      if (!listChats().length) { toast('No hay chats para borrar'); return; }
      if (await confirmSheet({ title: '¿Borrar todo el historial de chats?', text: 'Se eliminan todas tus conversaciones de este teléfono. No se puede deshacer.', confirm: 'Borrar', danger: true })) { deleteAllChats(); toast('Historial borrado'); render(); }
    };
    $('#s-clear-w', el).onclick = async () => { if (await confirmSheet({ title: '¿Borrar todos tus favoritos?', confirm: 'Borrar', danger: true })) { clearWatchlist(); toast('Favoritos borrados'); } };
    $('#s-wipe', el).onclick = async () => {
      if (await confirmSheet({ title: '¿Cerrar sesión y borrar todo?', text: 'Se eliminan tu clave, tus favoritos y todos tus chats de este teléfono. No se puede deshacer.', confirm: 'Borrar todo', danger: true })) ctx.logout();
    };
  }

  render();
  return { el, onShow: render };
}
