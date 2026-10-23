import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import '@fontsource-variable/inter/wght.css';
import './ui/theme.css';
import './ui/components.css';
import { mountApp } from './app';
import { ModelManager } from './models';
import { startDomTranslation } from './i18n';
import { isServerMode } from './server';
import { installIconLoader } from './ui/assetIcon';
import { getSettings, subscribe } from './store';
import { h } from './ui/dom';
import { introDone, mountIntro } from './views/intro';
import { mountSplash } from './views/splash';
import { mountOnboarding } from './views/onboarding';

function resolvedTheme(): 'dark' | 'light' {
  const t = getSettings().theme;
  return t === 'auto' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t;
}
function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
  if (Capacitor.isNativePlatform()) void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}

installIconLoader();
startDomTranslation();
const root = document.getElementById('root')!;
const models = new ModelManager();
applyTheme();
subscribe(applyTheme);
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);
root.append(h('div', { class: 'aurora' }));

function start() {
  mountApp(root, models);
  const key = getSettings().apiKey;
  if (!isServerMode() && key) void models.discover(key).catch(() => { /* clave inválida: se avisa al usar el chat */ });
}

// Primera apertura: introducción (carga con configuración inicial → cuenta → idioma → recorrido). Las siguientes: un splash corto con el logo en 3D y a la app.
// Con servidor (beta) la cuenta se crea sola o con Google; sin servidor (desarrollo) al final se pide la clave de Gemini.
if (!introDone()) {
  mountIntro(root, { server: isServerMode(), onDone: start, keyStep: !isServerMode() && !getSettings().apiKey ? (done) => mountOnboarding(root, models, done) : undefined });
} else if (isServerMode()) mountSplash(root, start);
else if (getSettings().apiKey) mountSplash(root, start, { server: false });
else mountOnboarding(root, models, start);
