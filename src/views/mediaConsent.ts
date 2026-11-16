// Aviso, una sola vez, de qué pasa cuando se manda un audio o un archivo a Gemini.
import { t } from '../i18n';
import { confirmSheet } from '../ui/sheet';

const MEDIA_OK = 'finagent.media.ok.v1';

export async function mediaConsent(): Promise<boolean> {
  try { if (localStorage.getItem(MEDIA_OK) === '1') return true; } catch { /* sin almacenamiento */ }
  const ok = await confirmSheet({ title: t('¿Enviar a Google para leerlo?'), confirm: t('Entiendo, seguir'),
    text: t('Para leer tu archivo o tu voz, FinAgent lo manda a Google Gemini a través de su servidor. Con el nivel gratuito que se usa hoy, Google puede usar lo que se envía para mejorar sus productos y personas de su equipo pueden leerlo. No subas claves, documentos de identidad ni números de cuenta. FinAgent no guarda el audio ni el archivo. Cada envío cuenta como una de tus consultas del día.') });
  if (ok) { try { localStorage.setItem(MEDIA_OK, '1'); } catch { /* sin almacenamiento */ } }
  return ok;
}
