# Prioridad: aplicación AURA instalada

Oscar indicó que primero debe funcionar dentro de la aplicación, no una página externa. Calendario, publicaciones y permisos Meta quedan pendientes mientras se verifica esto.

Evidencia (11 octubre 2026):

- El plist de AURA · Creditek confirma inicio en `https://aura.crediteksas.com/creditek/agentes/?source=pwa`.
- El panel publicado tiene visor `#main-iframe` y cargador `openModule`. No tenía tarjeta ni menú para el estudio orgánico.
- La primera integración agregaba un nav antes del contenedor fijo; además Cloudflare mantiene asset-first, por lo cual ese nav nunca llegó a servirse. No equiparar página accesible con integración terminada.
- El nuevo parche inserta tarjeta y menú dentro del panel, reutiliza el atributo `data-aura-owner-only` y `openModule`, sin pestaña externa ni modificación de los otros módulos.
- Prueba con HTML público real + parche local y sesión/APIs simuladas: clic en tarjeta, Actualizar, crear borrador solo en memoria, escribir, bajar 1933 px, subir a 0, Volver al panel. Correcto. Las solicitudes de indicadores y telemetría se bloquean deliberadamente en esta prueba; no son evidencia de fallos productivos.
- 22/22 pruebas orgánicas pasan y build/verify pasan. El primer intento dentro del sandbox falló por EPERM al abrir puertos locales; reejecución autorizada fuera del sandbox correcta.
- La prueba no controla la ventana instalada de Oscar y no reproduce ni resuelve por sí sola su congelación. No dar ese bloqueo por cerrado sin comprobación en esa ventana.

Despliegue alternativo preparado: `scripts/deploy-organic-app-preserved.mjs`, endpoint oficial PUT script, mismos bindings y conjunto de assets; preflight de hash remoto fijo, sin uploads de assets ni cambios a KORA, Sofía o API de Meta. Requiere revisión y commit antes de `--apply`. Si no aplica routing, detener intentos especulativos y preservar producción; nunca sustituir dist/aura genérico.

La captura aportada por Oscar confirma Facebook Creditekco, Instagram creditekco, automatización apagada y permiso `read_insights` faltante. No es autorización de publicación ni motivo para habilitarla ahora.

## Resultado real del intento controlado

- Claude aprobó los cuatro archivos de código, con condición de detener intentos si tampoco funcionaba el PUT. Commit revisado y subido: `10f5160`.
- PUT realizado el 11 octubre, 19:22 Colombia. Versión activa al 100%: `e7891427-89c9-4140-b8f4-9d77bde3f373`; deployment `ca8b743c-f4e5-470e-854b-ed56098a2326`.
- Bundle remoto coincide: `81dddfb9d550de148cffecd83d4524c12b3b32ff219c7b521525cdb8969a3b72`.
- **Integración NO entregada:** runtime conserva `raw_run_worker_first:false`, `serve_directly:true`. Home devuelve 200 pero sin `data-organic-app-card` ni `data-organic-app-nav`. No afirmar resolución de congelamiento.
- HTML del panel conservado byte por byte: `7fd3fa9663b863c2fe32e6906392acd78e8dc44567e9887087c390d1a23aeacf`; calendario original: `1eb0d3ce5d22a3ff0ca64764f88cdc1c5701d909c1aed44de1e474a8ed1400ba`.
- ASSETS, REGISTRATION_SERVICE y WORKER_SHARED_SECRET conservados. API no redesplegada; `ORGANIC_AUTOMATION_ENABLED=false` confirmado por lectura.
- No más intentos de despliegue ni reemplazo genérico de assets. Requiere resolver preservación/configuración de assets con Cloudflare o una copia completa y verificada del asset-set productivo; contactar soporte requiere autorización del usuario. No se ha contactado soporte.
