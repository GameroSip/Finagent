// Armazón de la app: pestañas, superposiciones (detalle/búsqueda) y botón "atrás" de Android.
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { Ctx, TabId, View } from './ctx';
import type { ModelManager } from './models';
import { wipeAll } from './store';
import { h } from './ui/dom';
import { closeTopSheet } from './ui/sheet';
import { icon, type IconName } from './ui/icons';
import { openAssetOverlay, type Overlay } from './views/asset';
import { createChatView, type ChatView } from './views/chat';
import { createMarketView } from './views/market';
import { openSearchOverlay } from './views/search';
import { createSettingsView } from './views/settings';
import { createWatchView } from './views/watchlist';

const TABS: Array<{ id: TabId; label: string; ic: IconName }> = [
  { id: 'market', label: 'Mercados', ic: 'activity' }, { id: 'chat', label: 'Asistente', ic: 'sparkles' },
  { id: 'watch', label: 'Favoritos', ic: 'star' }, { id: 'settings', label: 'Ajustes', ic: 'settings' },
];

export function mountApp(root: HTMLElement, models: ModelManager): void {
  const app = h('div', { class: 'app' });
  const viewsEl = h('div', { class: 'views' });
  const tabbar = h('nav', { class: 'tabbar', attrs: { 'aria-label': 'Navegación' } });
  app.append(viewsEl, tabbar);
  root.append(app);

  const overlays: Overlay[] = [];
  let tab: TabId = 'market';
  const views = {} as Record<TabId, View>;
  let chat: ChatView;

  const ctx: Ctx = {
    models,
    go(t) { setTab(t); },
    openAsset(symbol, name) { push((done) => openAssetOverlay(ctx, symbol, name, done)); },
    openSearch() { push((done) => openSearchOverlay(ctx, done)); },
    layer(make) { push(make); },
    askAI(prompt, label) { closeAll(); setTab('chat'); chat.ask(prompt, label); },
    logout() { wipeAll(); location.reload(); },
  };

  views.market = createMarketView(ctx);
  chat = createChatView(ctx);
  views.chat = chat;
  views.watch = createWatchView(ctx);
  views.settings = createSettingsView(ctx);
  (Object.keys(views) as TabId[]).forEach((id) => { views[id].el.classList.add('hide'); viewsEl.append(views[id].el); });

  for (const t of TABS) {
    const b = h('button', { class: `tab ${t.id === 'chat' ? 'ai' : ''}`, attrs: { 'data-tab': t.id, 'aria-label': t.label } });
    b.innerHTML = t.id === 'chat' ? `<span class="ic-wrap">${icon(t.ic, 19)}</span><span>${t.label}</span>` : `${icon(t.ic, 21)}<span>${t.label}</span>`;
    b.onclick = () => { closeAll(); setTab(t.id); };
    tabbar.append(b);
  }

  function setTab(t: TabId) {
    tab = t;
    (Object.keys(views) as TabId[]).forEach((id) => views[id].el.classList.toggle('hide', id !== t));
    tabbar.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.tab === t));
    views[t].onShow?.();
  }
  // Cada pantalla se quita de la pila por identidad cuando termina de cerrarse (antes se hacía pop() del último,
  // y abrir un activo desde la búsqueda dejaba la pila desfasada y el botón "atrás" dejaba de funcionar).
  function push(make: (done: () => void) => Overlay) {
    let o!: Overlay;
    o = make(() => { const i = overlays.indexOf(o); if (i >= 0) overlays.splice(i, 1); });
    overlays.push(o);
    root.append(o.el);
  }
  const topOverlay = () => [...overlays].reverse().find((o) => !o.el.classList.contains('leaving'));
  function closeAll() { [...overlays].forEach((o) => o.close()); }

  if (Capacitor.isNativePlatform()) {
    void CapApp.addListener('backButton', () => {
      if (closeTopSheet()) return;
      const top = topOverlay();
      if (top) top.close();
      else if (tab !== 'market') setTab('market');
      else void CapApp.minimizeApp();
    });
  }
  setTab('market');
}
