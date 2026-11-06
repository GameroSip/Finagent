import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/500.css';
import './ui/theme.css';
import './ui/components.css';
import './ui/design.css';
import './ui/intro.css';
import { mountApp } from './app';
import { ModelManager } from './models';
import { startDomTranslation } from './i18n';
import { ensureSession, isServerMode } from './server';
import { installIconLoader, setDomainResolver } from './ui/assetIcon';
import { fetchInfo } from './yahoo';
import { getSettings, subscribe } from './store';
import { h } from './ui/dom';
import { introDone, mountIntro, startupFailure } from './views/intro';
import { mountLaunch } from './views/launch';
import { mountOnboarding } from './views/onboarding';
import { hasDecided, installLifecycle, track, trackAppOpen } from './analytics';
import { maybeAskNps, noteOpenDay, openConsentSheet } from './views/feedback';

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
setDomainResolver(async (sym) => (await fetchInfo(sym)).website);   // acciones sin sitio conocido: Yahoo lo informa y de ahí sale el logo
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

// Primera apertura: pantalla de carga con el logo en 3D → (el logo despega) → cuenta → idioma → recorrido. Las siguientes: la pantalla de carga y directo a la app.
// Con servidor (beta) la cuenta se crea sola o con Google; sin servidor (desarrollo) al final se pide la clave de Gemini.
/** Estadísticas de la beta: una sesión por apertura; a quien ya usaba la app se le pregunta una sola vez; y la encuesta de recomendación cuando corresponde. */
function afterEnter() {
  installLifecycle(); noteOpenDay(); trackAppOpen();
  let crashes = 0;
  window.addEventListener('error', () => { if (crashes++ < 5) track('error', { kind: 'render' }); });
  window.addEventListener('unhandledrejection', () => { if (crashes++ < 5) track('error', { kind: 'other' }); });
  if (isServerMode()) setTimeout(() => { if (!hasDecided()) openConsentSheet(); else maybeAskNps(); }, 3000);
}
const enter = () => { start(); root.querySelector('.app')?.classList.add('screen-in'); afterEnter(); };
if (!introDone()) {
  mountIntro(root, { server: isServerMode(), onDone: enter, keyStep: !isServerMode() && !getSettings().apiKey ? (done) => mountOnboarding(root, models, done) : undefined });
} else if (isServerMode() || getSettings().apiKey) {
  mountLaunch(root, { run: () => (isServerMode() ? ensureSession() : Promise.resolve()), failure: startupFailure, onReveal: enter });
} else mountOnboarding(root, models, start);
