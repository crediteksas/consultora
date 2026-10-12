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
