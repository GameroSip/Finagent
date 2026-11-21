#!/usr/bin/env bash
# Prepara el proyecto Android que genera `npx cap add android` (lo usan build-apk, release-aab y android-emulator).
# Uso:  bash scripts/android-patch.sh prepare   → antes de `cap add`: si hay Firebase (GOOGLE_SERVICES_JSON), instala su plugin
#       bash scripts/android-patch.sh patch     → después de `cap sync`: permisos, ícono de notificación y configuración de Firebase
# GOOGLE_SERVICES_JSON (secreto, opcional): el contenido de google-services.json. Sin él, la app funciona igual, con avisos solo locales.
set -euo pipefail
PHASE="${1:-patch}"
FIREBASE_PLUGIN="@capacitor-firebase/messaging@8.6.0"

if [ "$PHASE" = "prepare" ]; then
  if [ -n "${GOOGLE_SERVICES_JSON:-}" ]; then
    npm install --no-save "$FIREBASE_PLUGIN" "firebase@^12.6.0"
    echo "Firebase: plugin de mensajería instalado (avisos push por tópicos)."
  else
    echo "Sin GOOGLE_SERVICES_JSON: el APK sale sin push del servidor (las notificaciones locales funcionan igual)."
  fi
  exit 0
fi

M=android/app/src/main/AndroidManifest.xml
[ -f "$M" ] || { echo "No existe $M: corré antes 'npx cap add android'"; exit 1; }

# 1) Permisos. POST_NOTIFICATIONS: Android 13+ exige pedirlo (la app lo pide recién cuando la persona activa un aviso).
for P in RECORD_AUDIO MODIFY_AUDIO_SETTINGS POST_NOTIFICATIONS; do
  grep -q "android.permission.$P\"" "$M" || sed -i "s#<uses-permission android:name=\"android.permission.INTERNET\" />#&\n    <uses-permission android:name=\"android.permission.$P\" />#" "$M"
done
# El plugin de notificaciones locales declara SCHEDULE_EXACT_ALARM; FinAgent no programa alarmas exactas y Google Play pide justificarlo: se quita.
grep -q 'xmlns:tools=' "$M" || sed -i 's#<manifest xmlns:android="http://schemas.android.com/apk/res/android"#& xmlns:tools="http://schemas.android.com/tools"#' "$M"
grep -q 'SCHEDULE_EXACT_ALARM" tools:node="remove"' "$M" || sed -i 's#</manifest>#    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove" />\n</manifest>#' "$M"
# Android 11+: sin esto la app no "ve" el servicio de reconocimiento de voz del teléfono y el dictado cae al respaldo
grep -q "android.speech.RecognitionService" "$M" || sed -i 's#</manifest>#    <queries>\n        <intent>\n            <action android:name="android.speech.RecognitionService" />\n        </intent>\n    </queries>\n</manifest>#' "$M"

# 2) Ícono chico de las notificaciones (Android lo pinta de un solo color: tiene que ser una silueta blanca, no el ícono a color).
D=android/app/src/main/res/drawable
mkdir -p "$D"
cat > "$D/ic_stat_finagent.xml" <<'XML'
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#00000000" android:strokeColor="#FFFFFFFF" android:strokeWidth="2.4" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="M3,17.5L9,11.5L13,15.5L20.5,8" />
    <path android:fillColor="#00000000" android:strokeColor="#FFFFFFFF" android:strokeWidth="2.4" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="M15,8L20.5,8L20.5,13.5" />
</vector>
XML

# 3) Firebase (solo si hay google-services.json): archivo de configuración + ícono, color y canal por defecto de los push.
if [ -n "${GOOGLE_SERVICES_JSON:-}" ]; then
  printf '%s' "$GOOGLE_SERVICES_JSON" > android/app/google-services.json
  node -e "const j=JSON.parse(require('fs').readFileSync('android/app/google-services.json','utf8')); const ok=(j.client||[]).some(c=>c.client_info?.android_client_info?.package_name==='com.finagent.app'); if(!ok){console.error('google-services.json no tiene el paquete com.finagent.app');process.exit(1)}"
  V=android/app/src/main/res/values; mkdir -p "$V"
  [ -f "$V/finagent_notify.xml" ] || printf '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="finagent_notify">#3B82F6</color>\n</resources>\n' > "$V/finagent_notify.xml"
  grep -q "default_notification_icon" "$M" || perl -0pi -e 's#(<application\b[^>]*>)#$1\n        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="\@drawable/ic_stat_finagent" />\n        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="\@color/finagent_notify" />\n        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="digests" />#s' "$M"
  grep -q "default_notification_icon" "$M" || { echo "No pude agregar la configuración de Firebase al manifiesto"; exit 1; }
  echo "Firebase configurado."
fi

# 4) Controles
grep -c 'android.permission.RECORD_AUDIO"' "$M" | grep -q 1 || { echo "Falta el permiso del micrófono en el manifiesto"; cat "$M"; exit 1; }
grep -q 'android.permission.POST_NOTIFICATIONS"' "$M" || { echo "Falta el permiso de notificaciones en el manifiesto"; cat "$M"; exit 1; }
echo "Proyecto Android preparado."
