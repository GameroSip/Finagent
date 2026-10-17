import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.finagent.app',
  appName: 'FinAgent',
  webDir: 'dist',
  backgroundColor: '#05070C',
  android: { allowMixedContent: false },
  plugins: {
    // Edge-to-edge: Capacitor inyecta --safe-area-inset-* para respetar la barra de estado y de gestos.
    SystemBars: { insetsHandling: 'css' },
  },
};

export default config;
