# Servidor de FinAgent (beta)

La app **se abre y funciona**: no pide ni la clave de Gemini ni ningún código. En el primer arranque el teléfono crea solo su cuenta (gratis) en este servidor,
que pone la clave del negocio, aplica el **modelo fijo y los límites de cada plan** y registra el uso. La clave de Gemini vive solo en el servidor.

```
Teléfono (app)  ──►  Servidor de FinAgent (Cloudflare)  ──►  Gemini
  · datos de mercado (Yahoo, DolarAPI…)   · cuenta automática · plan y modelo fijo · límites · cuidado del cupo · clave
  · verificador de cifras
```
Los **datos de mercado se siguen pidiendo desde el teléfono** (Yahoo bloquea los servidores en la nube, lo medimos). El servidor solo hace de puente con la IA.

## Qué ve cada persona
- **Plan Gratis:** *Gemini 3.5 Flash-Lite · 3 conversaciones por día.* El chat y Ajustes lo dicen, y ofrecen los **planes de pago como "próximamente"** (Plus y Pro: modelo más potente y más conversaciones) con un botón **"Avisame"**. Todavía no se pueden contratar: el botón solo anota el interés (lo ves en el panel).
- Si le das un **código de plan** a un tester (panel → "Crear códigos"), lo canjea en *Ajustes → Tengo un código* y su cuenta pasa a Plus o Pro.
- Cuando no hay capacidad, la app **explica qué pasó** ("Hay mucha demanda… probá en 30 segundos", "Hoy se agotó la capacidad gratuita…") y aclara que **la conversación no se descontó**. No hay "reintentando…" en el modo servidor.

## Con la clave gratuita de Gemini (lo que vas a usar por ahora)
- **Es posible para una beta chica**, con tres consecuencias que ya están resueltas en el código:
  1. **Privacidad:** con el nivel gratuito, Google puede usar lo que escriban para mejorar sus productos. La app lo avisa sola (chat y Ajustes) mientras `GEMINI_TIER = "free"`. **Al pasar al nivel de pago, cambialo a `"paid"`** y el aviso desaparece.
  2. **Capacidad limitada:** el servidor se cuida a sí mismo para no chocar contra el límite de Google (`GEMINI_RPM` pedidos por minuto, `GLOBAL_DAILY_ANSWERS` conversaciones por día, entre todos). Los números de `wrangler.toml` son conservadores; el panel muestra cuántas veces faltó cupo para que los ajustes con datos reales.
  3. **Un solo modelo en el plan gratis:** no salta a otros modelos (los de pago sí tienen respaldo). Si Gemini no tiene cupo de Flash-Lite, se explica como falta de capacidad.
- **No sirve para un lanzamiento público** (cupos mínimos y los datos de los usuarios en manos de Google). Para eso hay que pasar al nivel de pago.

## Antes de invitar a nadie (checklist)
- [ ] **Beta chica, cerrada y gratis.** Los datos de mercado salen de Yahoo, que no permite uso comercial. Antes de cobrar o de publicar en Google Play hace falta una licencia de datos.
- [ ] Avisales a los testers que el nivel gratuito de Gemini usa sus consultas (la app ya lo dice).
- [ ] Dictamen de un abogado de mercado de capitales (la app es informativa: no recomienda comprar ni vender).
- [ ] La política de privacidad debe decir que las consultas se envían a un proveedor de IA externo (Google).

## Puesta en marcha (una sola vez, ~20 minutos)
**A. Cloudflare** (gratis, sin tarjeta)
1. Creá una cuenta en cloudflare.com.
2. En *Workers & Pages*, registrá tu **subdominio de workers.dev** (te lo pide la primera vez; el despliegue falla sin él).
3. Copiá tu **Account ID** (aparece en *Workers & Pages*, a la derecha).
4. *My Profile → API Tokens → Create Token*: plantilla **"Edit Cloudflare Workers"** y agregale el permiso **Account · D1 · Edit**. Copiá el token (se muestra una sola vez).

**B. Secretos en GitHub** (*Settings → Secrets and variables → Actions → New repository secret*)

| Nombre | Valor |
|---|---|
| `CLOUDFLARE_API_TOKEN` | el token del paso A.4 |
| `CLOUDFLARE_ACCOUNT_ID` | el Account ID del paso A.3 |
| `GEMINI_API_KEY` | tu clave de Gemini (la gratuita sirve por ahora) |
| `JWT_SECRET` | 40 o más caracteres al azar (usá el generador de tu administrador de contraseñas) |
| `ADMIN_TOKEN` | otros 40 o más caracteres al azar: es la contraseña de tu panel |

**C. Desplegar:** pestaña *Actions → "Servidor (Cloudflare)" → Run workflow*. Hace los tests, crea la base, la prepara, sube el servidor y carga los secretos.
Al terminar, en el registro aparece la dirección, algo como `https://finagent-api.TU-SUBDOMINIO.workers.dev`.

**D. Decirle a la app cuál es su servidor:** *Settings → Secrets and variables → Actions → Variables → New repository variable*: nombre `API_BASE`, valor la dirección de arriba (sin `/` al final).

**E. Compilar el APK:** *Actions → "Build APK" → Run workflow*. Si existe `API_BASE`, es el **APK de la beta** (se abre y funciona, sin clave ni código). Sin esa variable, es el APK de desarrollo (pide la clave de Gemini).

**F. (Opcional) Códigos de plan para testers:** abrí `https://TU-DIRECCIÓN/admin`, pegá tu `ADMIN_TOKEN`, elegí plan, cantidad y usos por código. Cada tester lo canjea en *Ajustes → Tengo un código*.
> Los códigos **no** se crean desde GitHub Actions a propósito: el repositorio es público y los registros también.

## Inicio de sesión con Google (preparado, falta el lado del teléfono)
El **servidor ya lo soporta y está probado** (verifica la firma del token de Google, conserva el plan y el uso de quien venía como invitado, y guarda solo un identificador de la cuenta: ni correo ni nombre). Para activarlo hacen falta dos cosas que dependen de tu cuenta:
1. En Google Cloud: crear el *OAuth client ID* de tipo Web y el de Android (con el SHA-1 de tu firma) y poner el ID web en `GOOGLE_CLIENT_ID` (`wrangler.toml`; acepta varios separados por coma).
2. En la app: instalar un plugin nativo de Google Sign-In y registrarlo con `registerGoogleProvider(...)`. No está incluido a propósito: sin un teléfono real y tu proyecto de Google no se puede probar, y un plugin sin probar podría romper la compilación. Mientras tanto el botón se muestra como "Próximamente".

## Operación
- **Panel (`/admin`):** respuestas, tokens y dólares por día y por modelo; cuentas; **cuántas veces faltó cupo** (de Gemini y del servidor); **cuánta gente quiere Plus y Pro** (el dato para decidir precios); bloquear o cambiar de plan.
- **Antiabuso sin pedir registro:** 5 cuentas nuevas por dirección y día, `MAX_NEW_USERS_PER_DAY` en total, freno por ráfagas y tope de gasto (`DAILY_BUDGET_USD`, importa con el nivel de pago). Una cuenta es un teléfono: reinstalar la app crea otra (otro cupo gratis); por eso los topes. **Para abrir al público hace falta inicio de sesión con Google** (1 cuenta de Google = 1 cupo) y verificar que la app es la original (Play Integrity).
- **Planes** (`src/plans.ts`, una sola fuente para la app y el servidor): Gratis 3 por día / 90 por mes con Gemini 3.5 Flash-Lite · Plus 10 y 200 con Gemini 3.8 Flash · Pro 30 y 600 con Gemini 3.8 Flash y análisis profundo con Gemini 3.1 Pro. **Plus y Pro son una propuesta preliminar** (sin precio, no contratables): ajustalos con el costo real y el interés medido.
- **Calculadora de precios** (panel → "Calculadora de precios"): cuánto cuesta atender a una persona de cada plan (uso moderado y peor caso) y qué precio conviene cobrar, con tu comisión, impuestos y margen. Usa el **costo real medido** de cada modelo cuando hay al menos 5 respuestas; si no, lo estima con el precio oficial de Gemini. Ojo: el 3.8 Flash duplica su precio el 1-ene-2027.
- **Emergencia:** poné `KILL_SWITCH = "1"` en `[vars]` y volvé a desplegar: el servidor responde "en mantenimiento".

## Qué se probó y qué no
Probado: 285 tests, la app completa contra el servidor, 40 verificaciones en un Chromium real y el servidor corriendo en el motor de Cloudflare (workerd) con D1 local.
**No probado** (no hay acceso a tu cuenta de Cloudflare): el despliegue real y los permisos exactos del token. Si el workflow falla, el mensaje dice en qué paso: lo más probable es un permiso del token (agregá el que pida) o el subdominio de workers.dev.
- El plan gratuito de Cloudflare tiene 10 ms de CPU por pedido. Debería alcanzar, pero es el primer lugar donde mirar si hay errores "CPU exceeded".
- La base D1 gratuita corta las consultas si se pasa de su cupo diario. Para una beta sobra.

## Desarrollo local
`npm run server:dev` levanta el servidor en `http://localhost:8787` con un Gemini **falso** (no gasta cupo; token de administrador `dev-admin`).
Con `GEMINI_API_KEY=… npm run server:dev` usa Gemini real. `npm run test:e2e-server` corre la app en un navegador real contra un servidor simulado.
