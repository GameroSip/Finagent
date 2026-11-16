// Entrega un archivo generado en el teléfono: en la app abre el menú de compartir de Android; en el navegador lo descarga.
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const toBase64 = (b: Uint8Array): string => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
export const safeFileName = (n: string): string => `${n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'informe'}.pdf`;

/** Devuelve true si se entregó (o se abrió el menú de compartir). */
export async function deliverPdf(bytes: Uint8Array, name: string, dialogTitle: string): Promise<boolean> {
  const file = safeFileName(name);
  if (Capacitor.isNativePlatform()) {
    try {
      const r = await Filesystem.writeFile({ path: file, data: toBase64(bytes), directory: Directory.Cache });
      await Share.share({ title: dialogTitle, dialogTitle, url: r.uri });
      return true;
    } catch (e: any) {
      return /cancel/i.test(String(e?.message ?? e));                  // cerrar el menú no es un error
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  a.download = file;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
