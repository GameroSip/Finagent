import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.finagent.app',
  appName: 'FinAgent',
  webDir: 'dist',
  // Las llamadas a Yahoo y Gemini se hacen con CapacitorHttp (red nativa, sin CORS): ver src/http.ts
  android: { allowMixedContent: false },
};

export default config;
