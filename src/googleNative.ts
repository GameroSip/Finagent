// Inicio de sesión con Google en Android (Credential Manager). Devuelve el ID token que el servidor verifica en /v1/auth/google.
// Solo se activa si la compilación trae el ID de cliente WEB de Google (variable VITE_GOOGLE_WEB_CLIENT_ID); si no, el botón sigue como "próximamente".
import { Capacitor } from '@capacitor/core';
import { registerGoogleProvider } from './server';

const WEB_CLIENT_ID = (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined)?.trim();

export function installGoogleSignIn(): void {
  if (!WEB_CLIENT_ID || !Capacitor.isNativePlatform()) return;
  let ready: Promise<void> | null = null;
  registerGoogleProvider(async () => {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    ready ??= SocialLogin.initialize({ google: { webClientId: WEB_CLIENT_ID, mode: 'online', skipAuthOnlyAuthorizationAfterSignIn: true } }).catch((e) => { ready = null; throw e; });
    await ready;
    const res = await SocialLogin.login({ provider: 'google', options: {} });
    const token = (res.result as { idToken?: string | null }).idToken;
    if (!token) throw new Error('sin idToken');
    return token;
  });
}
