// Ajustes: lo mínimo. El modelo y los límites son automáticos; acá solo hay cuenta, tema, diagnóstico y datos.
import { ABOUT } from '../about';
import { getLang, LANGS, setLang } from '../i18n';
import { VERSION } from '../version';
import { setSound, soundOn } from '../ui/sfx';
import { openAbout } from './about';
import { openPlans } from './plans';
import { fetchMe, isCodeShape, isServerMode, normalizeCode, PlanCodeError, planCodeMessage, quotaInfo, redeemPlanCode, googleAvailable, GoogleError, googleMessage, signInWithGoogle, deleteAccount, pingServer } from '../server';
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
import { actionSheet, confirmSheet, openSheet } from '../ui/sheet';
import { t } from '../i18n';
import { analyticsOn, setAnalytics, track } from '../analytics';
import { openFeedback, openWishlist } from './feedback';
import { brandOf } from '../brand';



interface Probe { name: string; run: () => Promise<unknown> }

export function createSettingsView(ctx: Ctx): View {
  const el = h('div', { class: 'view' });
  const key = () => getSettings().apiKey;
  const quotaText = () => { const q = quotaInfo(); return q.remaining && q.plan ? t('{d} de {l} conversaciones hoy · {m} este mes', { d: q.remaining.day, l: q.plan.dailyLimit, m: q.remaining.month }) : t('Cargando…'); };
  const serverAccountHtml = () => { const q = quotaInfo(), p = q.plan;
    return `<div class="set-group"><div class="set-title">Tu plan</div><div class="card set-card">
        <div class="set-row"><span class="set-ic">${icon('layers', 18)}</span><div style="flex:1"><div class="set-main">${esc(t('Plan {name}', { name: t(p?.label ?? '') }))}</div><div class="set-sub" id="s-quota">${esc(quotaText())}</div></div></div>
        <div class="set-row"><span class="set-ic">${icon('zap', 18)}</span><div style="flex:1"><div class="set-main">Nivel de IA</div><div class="set-sub">Tu plan usa un nivel fijo</div></div><span class="val" id="s-model">${esc(brandOf(p?.modelLabel))}</span></div>
        ${googleAvailable() ? `<button class="set-row" id="s-google"><span class="set-ic">G</span><div style="flex:1;text-align:left"><div class="set-main">Iniciar sesión con Google</div><div class="set-sub">Guardá tu plan aunque cambies de teléfono</div></div></button>` : ''}
        <div class="set-note" id="s-tiernote" ${q.tier === 'free' ? '' : 'hidden'}>${esc(ABOUT.freeTier)}</div>
      </div></div>
      <div class="set-group"><div class="set-title">Planes de pago</div><div class="card set-card">
        <div class="set-row"><span class="set-ic">${icon('gem', 18)}</span><div style="flex:1"><div class="set-main">Plus y Pro <span class="chip-soon">Próximamente</span></div><div class="set-sub">Un modelo más potente y muchos más usos. Los gráficos, los mercados y las herramientas siguen gratis.</div></div></div>
        <button class="btn btn-primary btn-block" id="s-plans-open" style="margin-top:6px">Ver planes</button></div></div>
      <div class="set-group"><div class="set-title">Tengo un código</div><div class="card set-card">
        <div class="set-row" style="gap:8px"><input id="s-code" class="set-input" placeholder="FA-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="14" style="flex:1"><button class="btn btn-ghost btn-sm" id="s-redeem">Canjear</button></div>
        <div class="set-sub" id="s-code-msg" style="padding:0 2px 10px">Un código te da acceso a un plan (por ejemplo, si participás de las pruebas).</div>
      </div></div>`; };
  const masked = () => (key() ? `••••••••${key().slice(-4)}` : 'Sin clave');

  const probes: Probe[] = [
    { name: 'Yahoo Finance · precios', run: () => fetchChart('AAPL', '5d', '1d') },
    { name: 'Yahoo Finance · fundamentales', run: () => fetchInfo('AAPL') },
    { name: 'DolarAPI · cotizaciones', run: () => fetchDolares() },
    { name: 'ArgentinaDatos · riesgo país', run: () => fetchRiesgoPais() },
    { name: 'Google News · titulares', run: () => fetchHeadlines(undefined, 'ar', 3) },
    { name: 'alternative.me · miedo y codicia', run: () => fetchFearGreed() },
    // Con servidor, la clave de Gemini está en el servidor: el teléfono no puede (ni debe) consultar a Google, así que se chequea el servidor de FinAgent.
    isServerMode() ? { name: 'FinAgent AI · servidor', run: () => pingServer() } : { name: 'Google Gemini · modelos', run: () => ctx.models.discover(key(), true, true) },
  ];

  function render() {
    const s = getSettings();
    const id = ctx.models.active ?? ctx.models.pick();
    const nChats = listChats().length;
    el.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Tu cuenta y la app</div><h1 class="title-xl">Ajustes</h1></div></div>
      <div class="card prof"><div style="width:52px;height:52px;border-radius:16px;overflow:hidden;flex:none">${logoSvg(52)}</div>
        <div><div style="font-weight:750;font-size:18px">FinAgent</div><div class="muted" style="font-size:13px">${t('Versión')} ${VERSION} · ${t(isServerMode() ? 'beta cerrada' : 'todo en tu teléfono')}</div></div></div>

      ${isServerMode() ? serverAccountHtml() : `<div class="set-group"><div class="set-title">Inteligencia artificial</div><div class="card set-card">
        <div class="set-row"><span class="set-ic">${icon('layers', 18)}</span><div style="flex:1"><div class="set-main">Modelo</div><div class="set-sub">Automático: usa el mejor disponible y se actualiza solo</div></div><span class="val">${esc(id ? modelLabel(id) : 'Gemini')}</span></div>
        <button class="set-row" id="s-refresh"><span class="set-ic">${icon('refresh', 18)}</span><div style="flex:1;text-align:left"><div class="set-main">Buscar modelos nuevos</div></div></button>
      </div></div>

      <div class="set-group"><div class="set-title">Cuenta</div><div class="card set-card">
        <div class="set-row"><span class="set-ic">${icon('keyRound', 18)}</span><div style="flex:1"><div class="set-main">Clave de Gemini</div><div class="set-sub num">${masked()}</div></div><button class="btn btn-ghost btn-sm" id="s-key">Cambiar</button></div>
      </div></div>`}

      <div class="set-group"><div class="set-title">Apariencia</div><div class="card set-card">
        <button class="set-row" id="s-lang"><span class="set-ic">${icon('globe', 18)}</span><div class="set-main" style="flex:1;text-align:left">Idioma</div><span class="val" data-notrans>${esc(LANGS.find((l) => l.id === getLang())!.native)}</span></button>
        <label class="set-row" id="s-sound"><span class="set-ic">${icon('volume2', 18)}</span><div style="flex:1;text-align:left"><div class="set-main">Sonidos</div><div class="set-sub">Efecto de sonido al abrir la app</div></div><input type="checkbox" class="tgl" id="s-sound-t" ${soundOn() ? 'checked' : ''}></label>
        <div class="set-row"><span class="set-ic">${icon('moon', 18)}</span><div class="set-main" style="flex:1">Tema</div>
          <div class="seg" id="s-theme">${(['auto', 'dark', 'light'] as Theme[]).map((t) => `<button data-t="${t}" class="${s.theme === t ? 'on' : ''}">${{ auto: 'Auto', dark: 'Oscuro', light: 'Claro' }[t]}</button>`).join('')}</div></div>
      </div></div>

      <div class="set-group"><div class="set-title" style="display:flex;justify-content:space-between;align-items:center">Estado de las fuentes <button class="link-btn" id="s-probe">Verificar</button></div>
        <div class="card set-card" id="s-sources">${probes.map((p, i) => `<div class="set-row src" data-i="${i}"><span class="sdot"></span><div class="set-main" style="flex:1;font-weight:550">${esc(p.name)}</div><span class="muted src-res" style="font-size:12px">sin verificar</span></div>`).join('')}</div>
        <div class="muted" style="font-size:12px;margin:8px 4px 0">Si una fuente falla desde tu red, esa sección muestra un aviso y el resto sigue funcionando.</div></div>

      <div class="set-group"><div class="set-title">Datos</div><div class="card set-card">
        <button class="set-row" id="s-clear-chats"><span class="set-ic">${icon('messageSquare', 18)}</span><div style="flex:1;text-align:left"><div class="set-main">Borrar historial de chats</div><div class="set-sub">${nChats ? `${nChats} ${nChats === 1 ? 'chat guardado' : 'chats guardados'} en este teléfono` : 'No hay chats guardados'}</div></div></button>
        <button class="set-row" id="s-clear-w"><span class="set-ic">${icon('star', 18)}</span><div class="set-main" style="flex:1;text-align:left">Borrar favoritos</div></button>
        ${isServerMode() ? `<button class="set-row danger" id="s-delete"><span class="set-ic">${icon('trash', 18)}</span><div style="flex:1;text-align:left"><div class="set-main">${esc(t('Eliminar mi cuenta y mis datos'))}</div><div class="set-sub">${esc(t('Borra tu cuenta y todo lo que guardamos de vos en el servidor'))}</div></div></button>` : ''}
        <button class="set-row danger" id="s-wipe"><span class="set-ic">${icon('trash', 18)}</span><div style="flex:1;text-align:left"><div class="set-main">Cerrar sesión y borrar todo</div><div class="set-sub">Elimina tu clave y tus datos de este teléfono</div></div></button>
      </div></div>

      ${isServerMode() ? `<div class="set-group"><div class="set-title">${esc(t('Beta'))}</div><div class="card set-card">
        <label class="set-row" id="s-analytics"><span class="set-ic">${icon('activity', 18)}</span><div style="flex:1;text-align:left"><div class="set-main">${esc(t('Ayudar a mejorar la beta'))}</div><div class="set-sub">${esc(t('Estadísticas de uso anónimas. Nunca incluyen lo que escribís ni tu plan.'))}</div></div><input type="checkbox" class="tgl" id="s-analytics-t" ${analyticsOn() ? 'checked' : ''}></label>
        <button class="set-row" id="s-feedback"><span class="set-ic">${icon('messageSquare', 18)}</span><div style="flex:1;text-align:left"><div class="set-main">${esc(t('Contanos qué falta o qué falló'))}</div><div class="set-sub">${esc(t('Tu opinión nos dice qué mejorar primero'))}</div></div></button>
        <button class="set-row" id="s-wishes"><span class="set-ic">${icon('gem', 18)}</span><div style="flex:1;text-align:left"><div class="set-main">${esc(t('Qué te gustaría que sumemos'))}</div><div class="set-sub">${esc(t('Votá las funciones que más te servirían'))}</div></div></button>
      </div></div>` : ''}
      <div class="set-group"><div class="set-title">Acerca de</div><div class="card set-card">
        <button class="set-row" id="s-about"><span class="set-ic">${icon('info', 18)}</span><div style="flex:1;text-align:left"><div class="set-main">Acerca de FinAgent</div><div class="set-sub">Cómo funciona, qué hay detrás, privacidad y límites</div></div></button>
        <button class="set-row" id="s-intro"><span class="set-ic">${icon('arrowUpRight', 18)}</span><div style="flex:1;text-align:left"><div class="set-main">Ver la introducción otra vez</div><div class="set-sub">El recorrido por las funciones de la app</div></div></button>
      </div></div>`;
    bind();
    if (isServerMode()) {
      void fetchMe().then(() => {
        const q = quotaInfo(), set = (sel: string, t: string) => { const n = el.querySelector(sel); if (n) n.textContent = t; };
        set('#s-quota', quotaText()); set('#s-model', brandOf(q.plan?.modelLabel));
        const note = el.querySelector<HTMLElement>('#s-tiernote'); if (note) note.hidden = q.tier !== 'free';
      }).catch(() => {});
    }
  }

  /** Vuelve a mostrar la introducción (se reinicia la app para que arranque limpia). */
  function replayIntro() { try { localStorage.removeItem('finagent.intro.v1'); } catch { /* sin almacenamiento */ } location.reload(); }

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
    const refreshBtn = el.querySelector<HTMLElement>('#s-refresh');
    if (refreshBtn) refreshBtn.onclick = async () => {
      try { const chain = await ctx.models.discover(key(), true, true); toast(t('Usando {m}', { m: modelLabel(chain[0]) })); render(); }
      catch { toast('No pude consultar los modelos ahora'); }
    };
    const keyBtn = el.querySelector<HTMLElement>('#s-key');
    if (keyBtn) keyBtn.onclick = changeKey;
    el.querySelector<HTMLElement>('#s-lang')!.onclick = () => actionSheet(t('Idioma'), LANGS.map((l) => ({ label: l.native, run: () => { if (l.id !== getLang()) { track('setting', { key: 'lang', value: l.id }); setLang(l.id); location.reload(); } } })));
    el.querySelector<HTMLInputElement>('#s-sound-t')!.onchange = (e) => { const on = (e.target as HTMLInputElement).checked; setSound(on); track('setting', { key: 'sound', value: on ? 'on' : 'off' }); };
    const an = el.querySelector<HTMLInputElement>('#s-analytics-t');
    if (an) an.onchange = () => { void setAnalytics(an.checked); if (an.checked) track('setting', { key: 'analytics', value: 'on' }); };         // al apagarlas se borra todo lo pendiente y se le avisa al servidor
    el.querySelector<HTMLElement>('#s-feedback')?.addEventListener('click', openFeedback);
    el.querySelector<HTMLElement>('#s-wishes')?.addEventListener('click', openWishlist);
    el.querySelector<HTMLElement>('#s-about')!.onclick = () => openAbout({ version: VERSION, onReplayIntro: replayIntro });
    el.querySelector<HTMLElement>('#s-intro')!.onclick = replayIntro;
    const googleBtn = el.querySelector<HTMLElement>('#s-google');
    if (googleBtn) googleBtn.onclick = async () => { try { await signInWithGoogle(); toast(t('Listo: tu cuenta quedó vinculada a Google.')); render(); } catch (e) { toast(e instanceof GoogleError ? googleMessage(e) : t('No pude iniciar sesión con Google. Intentá de nuevo en un momento.')); } };
    const plansBtn = el.querySelector<HTMLElement>('#s-plans-open');
    if (plansBtn) plansBtn.onclick = () => void openPlans();
    const redeemBtn = el.querySelector<HTMLButtonElement>('#s-redeem');
    if (redeemBtn) redeemBtn.onclick = async () => {
      const input = $<HTMLInputElement>('#s-code', el), msg = $('#s-code-msg', el), code = normalizeCode(input.value);
      if (!isCodeShape(code)) { msg.textContent = 'Revisá el código: tiene el formato FA-XXXX-XXXX.'; return; }
      redeemBtn.disabled = true;
      try {
        const r = await redeemPlanCode(code);
        msg.textContent = r.unchanged ? 'Tu plan ya incluye eso.' : t('¡Listo! Ahora tenés el plan {p} ({m}).', { p: t(r.plan.label), m: r.plan.modelLabel });
        input.value = ''; if (!r.unchanged) setTimeout(render, 600);
      } catch (e) { msg.textContent = e instanceof PlanCodeError ? planCodeMessage(e) : 'No pude validar el código.'; }
      finally { redeemBtn.disabled = false; }
    };
    $('#s-theme', el).addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!b) return;
      saveSettings({ theme: b.dataset.t as Theme }); track('setting', { key: 'theme', value: b.dataset.t as Theme });
      $('#s-theme', el).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    });
    $('#s-probe', el).onclick = () => void probeAll();
    $('#s-clear-chats', el).onclick = async () => {
      if (!listChats().length) { toast('No hay chats para borrar'); return; }
      if (await confirmSheet({ title: '¿Borrar todo el historial de chats?', text: 'Se eliminan todas tus conversaciones de este teléfono. No se puede deshacer.', confirm: 'Borrar', danger: true })) { deleteAllChats(); toast('Historial borrado'); render(); }
    };
    $('#s-clear-w', el).onclick = async () => { if (await confirmSheet({ title: '¿Borrar todos tus favoritos?', confirm: 'Borrar', danger: true })) { clearWatchlist(); toast('Favoritos borrados'); } };
    const del = el.querySelector<HTMLElement>('#s-delete');
    if (del) del.onclick = async () => {
      if (!(await confirmSheet({ title: t('¿Eliminar tu cuenta y tus datos?'), text: t('Se borran tu cuenta y todo lo que guardamos de vos en el servidor (uso, estadísticas, comentarios y votos), y los datos de este teléfono. No se puede deshacer.'), confirm: t('Eliminar todo'), danger: true }))) return;
      try { await deleteAccount(); ctx.logout(); } catch { toast(t('No pude eliminar la cuenta ahora. Revisá tu conexión e intentá de nuevo.')); }     // si falla, no se borra nada del teléfono: se puede reintentar
    };
    $('#s-wipe', el).onclick = async () => {
      if (await confirmSheet({ title: '¿Cerrar sesión y borrar todo?', text: isServerMode() ? 'Se eliminan tu sesión, tus favoritos y todos tus chats de este teléfono. No se puede deshacer.' : 'Se eliminan tu clave, tus favoritos y todos tus chats de este teléfono. No se puede deshacer.', confirm: 'Borrar todo', danger: true })) ctx.logout();
    };
  }

  render();
  return { el, onShow: render };
}
