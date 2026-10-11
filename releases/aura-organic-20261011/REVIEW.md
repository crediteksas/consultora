# AURA · Publicaciones orgánicas · revisión 2026-10-11

## Estado honesto

Implementación local, **no desplegada y sin publicaciones reales**. Oscar eligió aprobar el calendario completo y automatizar exclusivamente esa versión. Claude Code no tiene sesión (`loggedIn: false`); REGLAS.md exige su revisión antes de publicar cambios. No se modificaron KORA, Sofía, campañas de pago, fichas ni permisos.

## Incluido

- Estudio en AURA para redactar hasta siete piezas por llamada de IA o crear manualmente; hasta 31 piezas por calendario. Usa el proxy Anthropic/Gemini existente, sin claves en el navegador. Cada imagen requiere una acción explícita, sin regeneración automática.
- Imagen JPEG de feed (cuadrada al cargar/generar), texto, tema, Facebook/Instagram, fecha y hora Colombia. Sin reels, stories ni carruseles en esta entrega; no se disfrazan portadas de videos.
- Almacenamiento inmutable por SHA-256 en R2. Una revisión aprobada incluye texto, imagen, redes, horarios, usuario, fecha y destinos Meta.
- Un Durable Object SQLite por página. Persistencia de calendario y alarmas; aprobación solo Gerencia `aura.owner`. Permisos de pauta no bastan.
- El usuario debe pausar un calendario aprobado antes de editarlo; una versión iniciada es inmutable. El servidor invalida la aprobación al guardar cambios. No se adelantan publicaciones atrasadas más de una hora.
- Estados por red: programada, preparación, enviada, aceptada sin verificar, publicada verificada, fallida, incierta, cancelada y bloqueada. Nunca reenvía automáticamente una escritura ambigua. Un éxito en Facebook no se repite porque falle Instagram.
- Lecturas de métricas a 24 h, 72 h y siete días. Valores ausentes = `null`, nunca cero inventado. Datos parciales y errores visibles. No hay atribución de leads.
- Aprendizaje exploratorio: compara likes/alcance de la misma red en ventanas de 24–30 h; al menos ocho publicaciones y dos temas con tres ejemplos cada uno. Alimenta la siguiente generación, no altera contenido aprobado ni garantiza crecimiento.
- Registro interno SQLite de aprobación, cambios, pausas y solicitudes de envío. No contiene tokens Meta.

## Pruebas realizadas

`npm run test:organic`: **20/20** (modelos, API, Workers real local con Meta simulada y navegador Chrome escritorio/móvil).

Pruebas críticas: aprobación concurrente, revisión exacta, cambios invalidantes, pausa, programación vencida, kill switch, denegación a lectores/gestores de pauta, cuerpos acotados, imagen inmutable, éxito parcial FB/IG, incertidumbre sin reenvío, aceptación distinta de publicación y métricas sin efectos de publicación.

`npm run build:aura:organic`: compilación y verificación AURA + overlay preservando baseline aprobadas.

`wrangler deploy --dry-run --config creditek/workers/aura-meta-ads-api/wrangler.toml`: bundle válido; **no despliega**.

Regresión general: 138/146. La misma suite en HEAD sin cambios da 119/127: **los ocho fallos son previos** (títulos, compuerta compartida, sesión/iconos y dos aserciones del frontend Sofía/Meta). No se arreglaron ni se omitieron para ocultarlos. El vigésimo test nuevo está en `tests/e2e`.

El runtime de Wrangler incluido soporta hasta 2026-07-29 y no ejecuta la fecha de compatibilidad del Worker existente. Las pruebas usan Miniflare 5.20261006.1-alpha fijado, con red totalmente simulada; la compilación sigue verificándose con Wrangler del repo. No se cambió la fecha productiva.

## Preservación de producción

El repositorio era distinto de producción. **No desplegar `dist/aura` completo ni el antiguo `index.js` Meta.**

- `production-baseline-20261011.mjs`: código Meta capturado en lectura, intacto excepto exports de tres helpers. Preserva miniaturas y correcciones WhatsApp existentes. SHA-256 original `2df367dab1a48d6b3dc06bd02d6de31d71148f5b85d7e356f7b042e4a1eee3fb`.
- `organic-entry.mjs`: intercepta exclusivamente `/v1/organic/`; todas las demás rutas delegan al baseline anterior. Conserva los dos DO anteriores y añade solo un DO y un bucket.
- `baseline/`: módulos AURA originales. `entry.mjs` + `src/aura-organic-overlay.mjs` sirven tres archivos nuevos e insertan un acceso a Contenido orgánico en inicio/calendario. Todo lo demás delega exactamente al Worker anterior.
- El build comprueba hashes del baseline. Antes de desplegar hay que volver a compararlos con los módulos **activos**, no asumir que siguen iguales.
- La publicación AURA debe conservar `ASSETS`, `REGISTRATION_SERVICE` y `WORKER_SHARED_SECRET`. La configuración genérica del repositorio no conserva todas esas vinculaciones.

## Pasos pendientes para activación real

1. Oscar inicia sesión en Claude Code; Claude revisa este código, pruebas, configuración y diferencias contra producción. No hay revisión aprobada todavía.
2. Con revisión aprobada, seguir REGLAS.md: commit local, push por Oscar y despliegue controlado. La nueva infraestructura R2 `aura-organic-media` todavía **no se creó**. No se escribieron secretos.
3. Preparar la versión Meta preservando variables/secretos/bindings existentes, con `ORGANIC_AUTOMATION_ENABLED=false`. Verificar que no cambia la configuración de pauta. Crear el bucket y el DO nuevo cuando corresponda al despliegue aprobado.
4. Publicar únicamente el overlay AURA conservando el asset set activo y los bindings. Volver a verificar endpoints de registro y Sofía en lectura, sin contactos ni publicaciones.
5. Con sesión AURA de Oscar, comprobar `/v1/organic/connection`: página Creditek, Instagram conectado y permisos orgánicos. **Permisos, cuota y disponibilidad reales de Meta aún no verificados.** La existencia del token de pauta no demuestra acceso orgánico. Resolver permisos faltantes antes de activar.
6. Habilitar el publicador; preparar el primer calendario con fechas futuras, revisar imágenes/textos/cuentas y obtener aprobación explícita de ese contenido. La preferencia por aprobación mensual NO equivale a aprobar piezas aún no vistas.
7. Primera publicación real aprobada: verificar por red ID, permalink y visibilidad; después verificar métricas reales. Si queda `uncertain`, consultar Meta y conciliar manualmente; nunca pulsar/reintentar creando otra pieza a ciegas.

## Límites y revisión obligatoria

- La API puede devolver métricas no soportadas o denegar permisos. Se muestran como no disponibles. El nombre de métrica de alcance Facebook y las capacidades Meta deben confirmarse con la cuenta real antes de certificar medición.
- No hay prueba real de generación ni envíos en este turno; las pruebas simulan proveedores para evitar costo y publicaciones accidentales.
- Las métricas reportadas por Meta pueden incluir efectos de promociones hechas fuera de este módulo. No hay inferencia causal ni afirmación de alcance orgánico incremental.
- Sin generación masiva ni gasto de pauta. La generación explícita usa APIs de pago ya existentes y no incluye un presupuesto monetario servidor nuevo.
- Los calendarios anteriores no se importan automáticamente, no se cambian sus estados ni se publican retroactivamente.
- Hay un tope de 200 calendarios por página; el archivado y la conciliación gráfica de envíos inciertos quedan como mejoras, no deben resolverse con reenvíos automáticos.

## Referencias consultadas

- Cloudflare Durable Objects, alarmas: https://developers.cloudflare.com/durable-objects/api/alarms/
- Workers/R2 documentación y tipos actuales 5.20261011.1; guías locales Cloudflare, Durable Objects y Workers best practices.
- Colección oficial Meta Instagram: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- Las páginas de documentación developers.facebook.com no estuvieron disponibles (429). Por ello los permisos/contratos se validan localmente, pero no se presenta esa prueba como certificación del servicio real.
