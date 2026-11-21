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
    // Ícono chico (silueta blanca: lo genera scripts/android-patch.sh) y color de acento de las notificaciones.
    LocalNotifications: { smallIcon: 'ic_stat_finagent', iconColor: '#3B82F6' },
  },
};

export default config;
