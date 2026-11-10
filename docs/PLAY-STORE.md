# Publicar FinAgent en Google Play: guía paso a paso

Pensada para una **prueba abierta** con buen lanzamiento. Marca qué hace cada parte: 🤖 ya está hecho en el repositorio, 👤 lo hacés vos.
Reglas verificadas en noviembre de 2026; Google las cambia seguido, así que ante la duda mandan las páginas de ayuda de Play Console.

## Resumen de la ruta (unas 3 a 4 semanas con una cuenta personal nueva)
| Etapa | Qué es | Duración |
|---|---|---|
| 0 | Preparar cuenta, claves, páginas legales y ficha | 2–4 días |
| 1 | Prueba **interna** (hasta 100 personas, sin revisión) | 1 día |
| 2 | Prueba **cerrada** con 20–30 personas | 14 días seguidos (mínimo exigido) |
| 3 | Pedir **acceso a producción** | Google responde en ~7 días |
| 4 | Prueba **abierta** (tope mínimo 1.000) | revisión completa |
| 5 | **Producción** escalonada | 1–2 semanas |

Una cuenta **personal creada después del 13/11/2023** debe completar la etapa 2 (12 personas inscriptas 14 días seguidos) antes de la 3. Una cuenta de **organización** la evita, pero pide número D-U-N-S (puede tardar hasta 30 días). La prueba abierta **no cuenta** para ese requisito.

## Etapa 0 · Preparación

### 0.1 Cuenta de desarrollador 👤
1. Entrá a `play.google.com/console` con la cuenta de Google que quieras usar **para siempre** con la app.
2. Pagá los 25 USD (una sola vez), elegí cuenta *personal* u *organización* y verificá tu identidad con tu documento.

### 0.2 Nombre del paquete 👤
La app usa `com.finagent.app`. **Una vez subida, no se puede cambiar.** Antes de seguir, confirmá que esté libre (Play Console te avisa al crear la app) y decidí si querés otro (se cambia en `capacitor.config.ts`, campo `appId`). Tampoco olvides la búsqueda de marca de «FinAgent».

### 0.3 Clave de subida (para firmar el AAB) 👤
Play firma la app con su propia clave (*Play App Signing*); vos firmás cada paquete con una **clave de subida** que, si la perdés, Google puede restablecer.
1. Abrí **Google Cloud Shell** (`shell.cloud.google.com`, gratis con tu cuenta de Google).
2. Pegá esto y contestá las preguntas (**anotá las dos contraseñas**; usá la misma para ambas si querés):
   `keytool -genkeypair -v -keystore finagent-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
3. **Guardá una copia** del archivo: en Cloud Shell, menú ⋮ → *Download* → `finagent-upload.jks`.
4. Convertilo a texto: `base64 -w0 finagent-upload.jks` y copiá todo el resultado.
5. En `github.com/GameroSip/Finagent/settings/secrets/actions` creá 4 secretos:
   | Secreto | Valor |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | el texto del paso 4 |
   | `ANDROID_KEYSTORE_PASSWORD` | la contraseña del almacén de claves |
   | `ANDROID_KEY_ALIAS` | `upload` |
   | `ANDROID_KEY_PASSWORD` | la contraseña de la clave |
Nunca pegues estos valores en un chat ni en un archivo del repositorio.

### 0.4 Generar el AAB 🤖
En *Actions → "Paquete para Google Play (AAB firmado)" → Run workflow* (dejá «prueba» **sin** marcar). Baja el artefacto `finagent-aab` (el `.aab` que se sube a Play). Requiere la variable `API_BASE` (la dirección de tu servidor), que ya tenés. Cada ejecución sube sola el número de versión.
El modo «prueba» sirve solo para verificar que el empaquetado funciona sin tus claves; Play lo rechazaría.

### 0.5 Páginas legales 🤖 + 👤
Están en `docs/`: `privacidad.html`, `eliminar-cuenta.html`, `index.html`. Tenés que completar los `[COMPLETAR: …]` (fecha, nombre o razón social del responsable y correo de contacto) en los dos primeros archivos y publicarlas:
1. En el repositorio: *Settings → Pages → Build and deployment → Deploy from a branch → `main` → carpeta `/docs`*.
2. Las direcciones quedan: `https://gamerosip.github.io/Finagent/privacidad.html` y `…/eliminar-cuenta.html`.
**Que las revise tu abogado** (junto con el dictamen pendiente). Sin completar los marcadores, **no las publiques**.

### 0.6 Servidor para una prueba más grande 👤
En `wrangler.toml` ya está `NEW_ACCOUNTS_PER_IP_DAY = "30"` (las operadoras móviles comparten IP). Para entrar de a poco en la prueba abierta, bajá `MAX_NEW_USERS_PER_DAY` (hoy 300) a unos **40** y volvé a correr *Actions → "Servidor (Cloudflare)"*. Con clave gratuita de Gemini el servicio atiende 150 respuestas por día en total: unos 80 a 250 usuarios activos. Para crecer más hace falta pasar Gemini a nivel de pago.

### 0.7 Qué me falta de vos antes de publicar (no lo puedo resolver yo)
- Dictamen del abogado de mercado de capitales y revisión de las páginas legales.
- Licencia de los datos de Yahoo para uso comercial (hoy no está).
- Con la clave gratuita, Google puede usar las consultas de todos para mejorar sus productos (ya figura en la política).

## Etapa 1 y siguientes · En Play Console

### 1. Crear la app 👤
*Crear app* → nombre **FinAgent**, idioma **Español (Argentina)**, **App** (no juego), **Gratis**. Aceptá las declaraciones.

### 2. Contenido de la app (*Política y programas → Contenido de la app*) 👤
| Sección | Qué responder |
|---|---|
| Política de privacidad | la dirección de `privacidad.html` |
| Acceso a la app | «Toda la funcionalidad está disponible sin iniciar sesión» |
| Anuncios | No contiene anuncios |
| Clasificación de contenido | Cuestionario IARC: categoría *Utilidad/Referencia*; sin violencia, sexo, drogas ni apuestas |
| Público objetivo | **18 años o más** (no dirigida a menores) |
| Seguridad de los datos | ver tabla de abajo |
| **Funciones financieras** | ver sección siguiente (la más delicada) |
| **Contenido generado por IA** | Sí: asistente de chat. Indicá que hay botón «Reportar» en cada respuesta (🤖 ya está) |
| Eliminación de cuenta | URL de `eliminar-cuenta.html`, y la app ofrece Ajustes → Eliminar mi cuenta y mis datos (🤖 ya está) |
| Aplicaciones de noticias, salud, gobierno | No |

**Seguridad de los datos (borrador a verificar con el formulario):**
| Tipo | ¿Se recopila? | ¿Se comparte? | Notas |
|---|---|---|---|
| ID de dispositivo u otros ID | Sí (identificador aleatorio) | No | Obligatorio para la cuenta anónima |
| Actividad en la app (interacciones) | Sí, **opcional** | No | Solo si la persona acepta las estadísticas |
| Contenido generado por el usuario (consultas al asistente) | Sí (se transmite) | **Sí, con Google (Gemini)** | Se procesa de forma efímera: no se guarda en el servidor |
| Contenido generado por el usuario (comentarios y reportes) | Sí, opcional | No | Los envía la persona a propósito |
Cifrado en tránsito: **Sí**. Solicitud de eliminación: **Sí** (en la app y en la web). No se vende ningún dato. Revisalo con tu abogado: Google compara esto con lo que la app hace realmente.

**Declaración de funciones financieras:** Google exige completarla en toda app y revisa que sea exacta; <https://support.google.com/googleplay/android-developer/answer/13849271>. FinAgent **no opera, no guarda fondos, no presta y no asesora de forma personalizada**: muestra información de mercado y explica datos con IA. Declaralo con exactitud (elegí la opción que más se acerque y, si hay «Otra», describí: *información de mercado y análisis educativo; sin operaciones ni asesoramiento personalizado*). Hay desarrolladores a los que rechazaron esta declaración por inexacta: **que la revise tu abogado** y mantené coherentes la ficha, la política y las notas de revisión.

**Notas para el revisor** (campo *Instrucciones de acceso / notas*): «FinAgent es una herramienta informativa y educativa de mercados con un asistente de IA. No permite operar, no guarda fondos y no brinda asesoramiento personalizado. No requiere iniciar sesión. Cada respuesta del asistente tiene un botón Reportar. La cuenta se puede eliminar en Ajustes → Eliminar mi cuenta y mis datos.»

### 3. Ficha de la tienda 👤 (textos listos)
- **Nombre:** FinAgent
- **Descripción breve (≤80):** `Mercados, gráficos y asistente de IA con fuentes. Información educativa.`  (72 caracteres)
- **Descripción completa** (1399 caracteres de 4.000):
```
FinAgent te ayuda a entender los mercados sin que nada te empuje a operar.

• Mercados del mundo: índices, acciones, ETF, criptomonedas, divisas y materias primas, con gráficos y herramientas técnicas.
• Contexto argentino: dólar y brecha, riesgo país y CEDEARs.
• Asistente de IA: responde con datos consultados en el momento, muestra la fuente y la fecha de cada cifra y quita las que no puede respaldar.
• Movimiento esperado de la semana: un rango de volatilidad calculado con un modelo que probamos con datos históricos. No predice hacia dónde irá el precio.
• Termómetro de tensión: cuenta señales de estrés de un activo y muestra qué pasó históricamente después.
• Mi plan: escribí qué vas a hacer cuando haya tensión; queda solo en tu teléfono.
• En español, inglés y portugués.

IMPORTANTE: FinAgent es una herramienta de información con fines educativos. No es asesoramiento de inversión, no recomienda comprar ni vender, no permite operar y no predice precios. Los datos pueden tener demora o errores y la IA puede equivocarse: tomá tus decisiones con criterio propio.

VERSIÓN BETA: estamos probando la aplicación y puede tener errores. Tus consultas al asistente se procesan en nuestro servidor y se envían a Google (Gemini) para generar la respuesta; no guardamos su texto. Tus chats y favoritos quedan en tu teléfono. Podés eliminar tu cuenta y tus datos cuando quieras desde Ajustes.
```
- **Categoría:** Finanzas. **Correo de contacto** (público) y **sitio web**: la página `index.html`.
- **Gráficos** (carpeta `play-assets/`, generada con `e2e/make-play-assets.mjs`): ícono 512×512, imagen destacada 1024×500 y **capturas de teléfono de hasta 2:1** (acá 1080×2160). 
  ⚠ Las capturas incluidas usan **datos simulados**: **reemplazalas por capturas de tu teléfono con la app real** (incluí una del asistente respondiendo con fuentes). Si tu teléfono captura en 20:9 (2,22:1) hay que recortar a 2:1: Play no acepta más largo que el doble del ancho.
- No prometas rendimientos, no uses «asesor» ni «recomendaciones de inversión», no pongas emojis en el nombre.

### 4. Prueba interna (hasta 100 personas, sin revisión) 👤
*Pruebas → Prueba interna → Crear versión* → subí el `.aab` → agregá tu correo (y los de tu círculo) → compartí el enlace. Verificá que se instale desde Play, que abra, y que **Ajustes → Eliminar mi cuenta** y **Reportar** funcionen.

### 5. Prueba cerrada (obligatoria en cuentas personales nuevas) 👤
1. *Pruebas → Prueba cerrada → Crear pista* y una lista de testers (correos o un Google Group).
2. Reclutá **20 a 30 personas**: el mínimo es 12 inscriptas **14 días seguidos**, y si algunas se bajan antes, el contador puede frenarse o reiniciarse.
3. Subí el `.aab` (con un `versionCode` mayor) y compartí el enlace de inscripción.
4. Mensaje para los testers: «Instalá FinAgent desde este enlace con tu cuenta de Google y dejalo instalado 14 días. Abrilo cada 2 o 3 días. Si algo falla o falta, contanos en Ajustes → Contanos.»
5. Mirá tu panel `/admin` (retención, uso, comentarios) y `docs/BETA.md` para decidir.

### 6. Pedir acceso a producción 👤
Pasados los 14 días: *Panel → Solicitar acceso a producción* y respondé el cuestionario con honestidad (cómo se probó, qué cambió con los comentarios). Google contesta por correo, normalmente en 7 días. Si lo rechaza, la prueba cerrada se reinicia con los mismos testers.

### 7. Prueba abierta 👤
*Pruebas → Prueba abierta*: países (empezá por Argentina), **tope** (sin límite o desde 1.000), subí el AAB y enviá a revisión completa. Va a aparecer con la etiqueta «Acceso anticipado». En cuentas personales nuevas esta pista puede aparecer recién después de tener acceso a producción: **confirmalo en tu consola**. Los testers no dejan reseñas públicas; sus comentarios te llegan en privado.
Buenas prácticas del lanzamiento: respondé los comentarios en 48 horas; mirá *Android vitals* (cierres) cada día; si el servidor muestra «mucha demanda» seguido, frená el ritmo bajando `MAX_NEW_USERS_PER_DAY` antes de invitar más gente.

### 8. Producción escalonada 👤
*Producción → Crear versión*: lanzá primero al 5 %, luego 20 %, 50 % y 100 %, mirando fallos y comentarios en cada escalón.

## Lo que ya está hecho en el repositorio 🤖
- Botón **Reportar** en cada respuesta del asistente (motivos: ofensiva, peligrosa o engañosa, parece recomendación de inversión, otro) que funciona **aunque la persona haya rechazado las estadísticas**; llega al panel como «reporte».
- **Eliminar mi cuenta y mis datos** en la app y en el servidor (borra las 7 tablas con datos de la persona); página web `eliminar-cuenta.html`.
- Política de privacidad pública, coherente con lo que dice la app (con pruebas que lo verifican).
- Workflow del **AAB firmado** (`release-aab.yml`), con versión creciente y sin escribir contraseñas en ningún archivo.
- Recursos gráficos y script para regenerarlos.
- La app apunta a Android 36 y requiere Android 7 o superior (`minSdk 24`).
