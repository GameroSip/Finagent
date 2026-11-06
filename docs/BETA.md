# Beta de FinAgent: cómo medirla y cómo decidir

Esta guía explica qué se mide, dónde se ve, cómo se calcula cada número y **con qué criterios decidir si lanzar o si el mercado pide más funciones**. Los criterios están escritos *antes* de tener datos, a propósito: si los fijás después de mirar los números, tendés a elegir los que te dan la razón.

## 1. Qué se mide (y qué no)
Solo con el consentimiento de cada persona (se pregunta una vez, "Sí" y "No" con el mismo peso, y se apaga cuando quiera en *Ajustes → Beta*). El servidor **descarta los eventos de quien no aceptó**, aunque la app los mande.

| Se registra | NO se registra |
|---|---|
| Qué pantallas y funciones usa, qué activos abre (símbolo público, tipo y desde dónde) | Lo que escribe al asistente |
| Qué herramientas usó el asistente, cuánto tardó, cuántas cifras verificó, si hubo error o tope | El texto de "Mi plan" (solo si lo guardó y si es corto, medio o largo) |
| 👍 / 👎 de cada respuesta, con un motivo de una lista | Sus favoritos (solo si agregó o quitó uno) |
| Búsquedas **sin resultado** que parecen un símbolo o un nombre corto (para saber qué activos faltan) | Nombre, correo o ubicación |

El servidor solo acepta valores de listas cerradas (`src/telemetry.ts`): no existe ningún campo de texto libre en las estadísticas, así que aunque alguien manipulara la app no podría enviar lo que escribe. Lo que sí es texto libre es lo que la persona decide enviar en **"Contanos"** y en la encuesta de recomendación, y la pantalla lo dice.

Los **votos "Me interesa"** (funciones que todavía no existen) son explícitos: valen aunque la persona no haya aceptado las estadísticas.

## 2. Dónde se ve
`https://TU-SERVIDOR/admin` → pegar el `ADMIN_TOKEN` → tarjeta **"Beta: uso, retención y qué piden"**. También podés descargar los eventos en CSV (botón de la misma tarjeta) para analizarlos en una planilla.

Cada porcentaje trae entre paréntesis **cuántas personas hay detrás y su intervalo de confianza del 95 %**. Con 20 personas, un "40 %" puede ser perfectamente un 20 % o un 63 %. El panel te avisa cuando hay menos de 30 personas con datos.

## 3. Cómo se calcula cada cosa
- **Día 1 / Día 7 / Semana 2:** la cohorte de cada persona es el día de su primer uso. *Día 1*: volvió al día siguiente. *Día 7*: volvió exactamente al día 7. *Semana 2*: volvió algún día entre el 7 y el 13. Solo cuentan quienes ya cumplieron ese plazo.
- **Activos hoy / 7 días / 30 días:** personas distintas con algún evento. *Pegajosidad* = activos hoy ÷ activos en 7 días.
- **Usaron el asistente:** personas con al menos una consulta, sobre las que tienen datos.
- **Votos por función:** un voto por persona y función; la base son **todos los registrados**.
- **NPS:** promotores (9–10) menos detractores (0–6); la encuesta aparece una vez, tras 3 días distintos de uso (y hasta 3 veces espaciadas por 14 días si dice "ahora no").

## 4. Criterios de decisión (fijados antes de mirar)
Son **propuestas mías, no estándares de la industria**. Los valores de referencia de retención varían muchísimo según la fuente (para apps financieras, retención a 7 días entre ~6 % y ~18 % según Adjust 2025 u OneSignal 2024), y una beta de gente invitada retiene más que el público real. Por eso conviene usarlos como piso mínimo y ajustarlos *antes* de empezar, no después.

| Pregunta | Señal de que va bien | Señal de problema | Mínimo de personas |
|---|---|---|---|
| ¿Crean el hábito? | "Semana 2" ≥ 25 % | < 12 % (y el límite superior del intervalo < 25 %) | 30 con plazo cumplido |
| ¿Usan la IA? | ≥ 50 % usó el asistente y ≥ 30 % le hizo 5 o más consultas en el período | < 25 % lo usó | 30 |
| ¿Les sirve? | 👍 ≥ 70 % de las calificaciones | 👍 < 50 % | 30 calificaciones |
| ¿La IA se queda corta de cupo? | Pocos topes (el plan gratis son 3 por día) | Más del 30 % choca con el tope: es demanda, no un fallo | 30 |
| ¿Recomendarían? | NPS ≥ 30 | NPS < 0 | 20 respuestas |
| ¿Piden más "copiloto"? | Una función con ≥ 40 % de votos **y** al menos 3 comentarios o búsquedas sin resultado que la pidan sin que se les sugiera | Ninguna pasa de 15 % | 30 registrados |

**Sobre los votos:** la lista *sugiere* las opciones, así que sobreestima el interés. Pesa más lo que escriben sin que se les pregunte (comentarios libres y búsquedas sin resultado). Si una función gana votos pero nadie la menciona sola, es curiosidad, no necesidad.

**Cómo decidir:**
- Hábito y utilidad bien, y el copiloto no se pide solo → **lanzar tal como está** (y resolver antes lo legal y los datos con licencia; ver `server/README.md`).
- Hábito flojo pero la gente usa la IA y se queda sin cupo → el problema es el cupo o la introducción, no falta de funciones.
- Hábito flojo y poco uso de IA → antes de agregar nada, hablar con los testers: algo del núcleo no engancha.
- Una función se pide sola y con votos → recién ahí vale la pena construirla (empezando por la que menos riesgo legal tiene: "Mi cartera" manual y la calculadora de escenarios).

## 5. Qué NO podés saber con esto
- **Por qué** hacen algo: para eso están los comentarios y hablar con ellos.
- Qué hacen quienes **no aceptaron** las estadísticas (el panel muestra cuántos son).
- Si desinstalaron la app: se infiere de que no vuelven.
- Si el uso de la IA está inflado por los **códigos de plan**: quienes tienen Pro tienen más cupo. Dales Pro a pocos testers; el panel todavía no separa por plan.
- Diferencias chicas con pocas personas: mirá siempre el intervalo.

## 6. Para la política de privacidad
Incluir: qué se registra y qué no (sección 1), que es opcional y revocable, que no incluye nombre ni correo, que las consultas al asistente se procesan en el servidor y se envían a Google (Gemini), y que con el nivel gratuito de Gemini Google puede usarlas para mejorar sus productos.

## 7. Poner en marcha
1. `server/README.md`: cuenta de Cloudflare, 5 secretos y el workflow **"Servidor (Cloudflare)"**. Aplica solo las migraciones (incluida `0002_analytics.sql`, que crea las tablas de estadísticas).
2. Variable `API_BASE` y workflow **"Build APK"**.
3. Crear códigos de acceso en `/admin` (sección *Crear códigos de acceso a un plan*): dales Pro a pocos testers y dejá al resto en Gratis.
