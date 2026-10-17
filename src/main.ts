import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import '@fontsource-variable/inter/wght.css';
import './ui/theme.css';
import './ui/components.css';
import { mountApp } from './app';
import { ModelManager } from './models';
import { getSettings, subscribe } from './store';
import { h } from './ui/dom';
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

const root = document.getElementById('root')!;
const models = new ModelManager();
applyTheme();
subscribe(applyTheme);
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);
root.append(h('div', { class: 'aurora' }));

function start() {
  mountApp(root, models);
  const key = getSettings().apiKey;
  if (key) void models.discover(key).catch(() => { /* clave inválida: se avisa al usar el chat */ });
}

if (getSettings().apiKey) start();
else mountOnboarding(root, models, start);
