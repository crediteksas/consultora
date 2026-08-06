# AURA — recuperación integral, control previo al despliegue

Fecha: 2026-08-06 (America/Bogota)

Estado: **BUILD CORREGIDO; PRODUCCIÓN NO MODIFICADA; DESPLIEGUE BLOQUEADO HASTA APROBACIÓN DEL INFORME**

## Aislamiento y fuente

- Repositorio canónico inspeccionado: `/Users/oscarpacheco/consultora`
- Worktree usado: `/Users/oscarpacheco/consultora/.worktrees/aura-integral-recovery-20260806`
- Rama: `fix/aura-integral-recovery-20260806`
- Base: `8ca1cc6cc054530e80d53d871c0ce84dec0642c7` (`AURA-2026-08-06-FIX-03-STABLE`)
- El checkout principal tenía cambios ajenos en `creditek/agentes/agente3-meta-ads.html`, `creditek/erp/reportes.html` y `supabase/`; no fueron tocados.
- Se identificaron 28 worktrees adicionales. No se reutilizó ni modificó ninguno.

## Causas raíz comprobadas

| Área | Causa raíz | Corrección en el build |
|---|---|---|
| Panel general | Las versiones posteriores a la base volvieron a inyectar el shell lateral de KORA dentro de AURA. | El Hub vuelve a ser la única shell y ya no carga contexto, navegación ni pie de KORA. |
| Sofía | El módulo standalone/embedded dependía del cargador compartido de KORA y podía devolver al Panel; los KPI consultaban endpoints del bot que exigen un secreto retirado. | Bootstrap canónico y lecturas autenticadas por Supabase/RLS para KPI y tiendas. La mensajería e idempotencia no se modificaron. |
| Agente 1 | El contenedor embebido usaba clases incompatibles (`visible`/`show`) y terminaba con contenido oculto; además el Worker esperaba autenticación distinta al cliente. | Contrato embedded único y generación de imágenes por Worker con JWT AURA. |
| Agente 3 | La shell duplicada y la restauración de sesión competían con la navegación del Hub. | Solo se renderiza el contenido interno; el Hub conserva sesión, encabezado y sidebar. |
| Calendario | Cargaba shell KORA, hacía llamadas OpenAI desde el navegador y usaba una ruta absoluta de logo que no existía en el artefacto. | Shell interna retirada, OpenAI pasa por Worker/JWT y logo corregido a un asset publicado. |
| Nombres/rutas | Había nombres escritos por separado en sidebar, tarjetas, breadcrumbs y redirecciones. | `aura-module-config.js` centraliza rutas y nombres funcionales. |

## Arquitectura recuperada

- Una shell: `creditek/agentes/index.html`.
- Una configuración: `creditek/agentes/aura-module-config.js`.
- Un bootstrap embedded/standalone: `creditek/agentes/aura-agent-bootstrap.js`.
- Embedded: agrega `embedded=1`, muestra solo el contenido del módulo y no monta sidebar interno.
- Standalone: retorna al Hub canónico mediante `return_to`; después de Auth abre el módulo solicitado.
- No se publica `kora-agent-context.js`.

## Nomenclatura

Se conservaron: Panel general, Sofía, Agente 1 · Piezas comerciales, Agente 3 · Publicación y métricas, Calendario de contenido, Portal B2B, Google Business, Convenios de Aliados y Configuración de AURA.

El repositorio no contiene un módulo funcional independiente de “Reels orgánicos”: ese nombre fue aplicado históricamente sobre el calendario. Para no presentar una función inexistente, el build mantiene **Calendario de contenido**. Hace falta una decisión explícita antes de renombrarlo otra vez.

## Pruebas

- Suite completa: **95/95 aprobadas**.
- Build: aprobado.
- Verificación del artefacto público: aprobada.
- Rutas productivas de solo lectura: aprobadas.
- Navegación standalone: redirige al Hub con `return_to`, sobrevive recarga y no muestra KORA.
- Navegador real sobre build local:
  - Login AURA visible y estable.
  - Agente 1: formulario completo visible; no queda en blanco.
  - Sofía: CRM visible; una sesión limpia muestra error recuperable, no pantalla blanca.
  - Agente 3: una sesión limpia vuelve al login AURA, no queda vacío.
  - Calendario: contenido completo, controles e iconos visibles; logo ya no está roto.
- Navegador real en producción actual, solo lectura:
  - Sofía cargó 85 chats, 500 clientes y 329 registros legales.
  - Meta Ads cargó datos reales: $89.544 de gasto, 17.374 impresiones, 11.151 de alcance y 42 conversiones.

No fue posible autenticar el build local con la sesión productiva porque Supabase almacena la sesión por origen. Por eso la navegación completa sidebar/tarjeta de los cinco módulos sobre **este build exacto** debe repetirse en staging o inmediatamente después del único despliegue, con rollback automático ante cualquier fallo.

El servidor estático usado para el control local validó HTML, JavaScript, rutas y dimensiones, pero no publica por sí solo los assets compartidos bajo `/design-system/*`; algunas capturas locales no son una referencia visual completa. Esos assets sí pertenecen a las rutas compartidas de producción. La comparación visual definitiva también queda dentro de la prueba productiva obligatoria.

## Evidencia visual

- `/private/tmp/aura-integral-recovery-20260806/01-login-local-build.png`
- `/private/tmp/aura-integral-recovery-20260806/03-agente1-final-build.png`
- `/private/tmp/aura-integral-recovery-20260806/04-sofia-final-build.png`
- `/private/tmp/aura-integral-recovery-20260806/04b-sofia-production-data.png`
- `/private/tmp/aura-integral-recovery-20260806/05-agente3-final-build.png`
- `/private/tmp/aura-integral-recovery-20260806/05b-agente3-production-data.png`
- `/private/tmp/aura-integral-recovery-20260806/06-calendario-final-build.png`

## Seguridad

No hay coincidencias en el código AURA ni en el build para:

- `WORKER_SHARED_SECRET`
- `X-Worker-Secret`
- `service_role`
- `OPENAI_API_KEY`
- llamadas directas del navegador a `api.openai.com`

El Worker de imágenes valida JWT, usuario activo, `app_id`, permiso y origen. Los errores no devuelven el token.

Riesgo heredado no corregido en esta intervención: Agente 1 y Calendario todavía permiten una clave Anthropic guardada en `localStorage` para generación de texto. No se introdujo ahora, pero debe migrarse posteriormente a backend para alcanzar cero credenciales de proveedor en frontend.

## Centro corporativo de incidencias

No se crearon `aura_incidents` ni tablas duplicadas. La decisión más reciente establece una sola incidencia corporativa administrada en KORA y AURA como punto de captura.

En la fuente canónica solo existe el formulario AURA que sanitiza y exporta un reporte; no existe el contrato de persistencia corporativa ni las tablas de KORA. Integrarlo exige primero localizar o exponer ese contrato backend. No se modificó KORA para inventarlo.

## Archivos fuente del cambio

- `creditek/agentes/index.html`
- `creditek/agentes/aura-module-config.js`
- `creditek/agentes/aura-agent-bootstrap.js`
- `creditek/agentes/creditek-agente-redes.html`
- `creditek/agentes/creditek-agente-respuestas.html`
- `creditek/agentes/agente3-meta-ads.html`
- `creditek/agentes/creditek-agente-calendario.html`
- `creditek/agentes/kora-agent-context.js` (retirado del build)
- `creditek/workers/aura-hub/src/index.js`
- `creditek/workers/gemini-proxy/index.js`
- `creditek/workers/gemini-proxy/auth.mjs`
- `creditek/workers/gemini-proxy/wrangler.toml`
- `scripts/build-aura-hub.mjs`
- pruebas de seguridad y regresión AURA.

No hay cambios en `creditek/erp`, KORA, `creditek-bot`, bases de datos, Supabase ni datos de clientes.

## Rollback exacto

Producción no fue modificada.

- aura-hub actual: deployment `3277faa4-d323-49a4-b86d-af6b5981232b`, version `b43467ef-d159-4719-b637-0fd272a7a0f5`.
- gemini-proxy actual: deployment `0651dffc-3768-4c60-ae99-8e182ae92772`, version `83acf5d6-142f-4eb8-9f07-42130b291121`.
- Base Git recuperable: `AURA-2026-08-06-FIX-03-STABLE` / `8ca1cc6cc054530e80d53d871c0ce84dec0642c7`.

Si la validación productiva falla, restaurar ambos deployment/version anteriores sin cambiar código ni datos.

## Puerta de despliegue

No desplegar hasta aceptar expresamente:

1. Mantener “Calendario de contenido” mientras no exista un módulo real de Reels.
2. Ejecutar una liberación coordinada de aura-hub y gemini-proxy, porque el arreglo seguro de imágenes afecta ambos.
3. Validar inmediatamente en producción los cinco módulos y ejecutar rollback ante el primer fallo.
4. Tratar la persistencia corporativa de incidencias y la migración de Anthropic como tareas posteriores separadas.
