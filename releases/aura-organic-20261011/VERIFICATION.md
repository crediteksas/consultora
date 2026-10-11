# Verificación real · 11 octubre 2026

Código guardado y subido a `codex/aura-organic-calendar-20261011`: `69239af`.
Claude aprobó explícitamente el parche de navegación; 22/22 pruebas, build/verify y dry-run correctos.

## Instalado y comprobado

- R2 Standard: `aura-organic-media`, creado después de la activación del usuario.
- API Meta: `b2dd4650-f952-4909-a17a-2451b4b8a013`; bundle remoto idéntico al local, SHA-256 `e6adca8675ac3cd74102803b7632c9a8fdd753ead1d73ac58221d934f969da22`.
- AURA final de esta sesión: `44b4b8e8-c774-4e30-9ac2-d6cba48b9228`; bundle remoto idéntico al local, SHA-256 `607f10ac992f105915feadedbbde64ca8bcdd4ecd9b9cac5c340d0a275b594f7`.
- El estudio está disponible en https://aura.crediteksas.com/creditek/agentes/aura-organic-studio.html. Verificada pantalla de acceso con navegador nuevo sin errores JavaScript. Oscar confirma que la tiene abierta.
- API health 200; connection/calendars sin sesión 401 LOGIN_REQUIRED.
- Secretos y bindings previos preservados; namespaces originales RATE_LIMITER y PUBLISH_COORDINATOR sin cambios. Automatización remota comprobada en `false` después de ambos despliegues.
- Inicio, calendario, aura-auth.mjs y aura-image-client.mjs mantienen sus hashes originales de contenido servido.
- No publicaciones reales, no calendario aprobado, no generación pagada durante la verificación.

## Limitaciones comprobadas (no declarar terminado)

1. **Navegación:** Cloudflare aceptó el despliegue con `keep_assets` y `assets.config.run_worker_first`, pero la versión remota conserva `raw_run_worker_first:false`; el enlace inyectado NO aparece en inicio/calendario. El acceso directo sí funciona. No atribuirlo a caché: el runtime remoto confirma que no adoptó esa configuración. El test local valida el código, no la aplicación efectiva de esa opción en Cloudflare. No sustituir el conjunto activo por dist/aura para forzarlo. Falta resolver actualización segura de configuración/manifest del conjunto existente.
2. **Meta real:** falta leer «Conexión y controles» desde la sesión de Gerencia. La sesión de Oscar no es accesible por las herramientas de este chat. Se solicitó texto o captura, nunca contraseña/token.
3. Falta contenido real aprobado; después, habilitación autorizada y verificación de primera publicación/medición por cada red. Primera entrega limitada a imágenes de feed; no reels/carruseles.

El preflight 10042 de DEPLOYMENT.md/PREFLIGHT.json es histórico y quedó resuelto. El resultado actual es este documento; no afirmar que R2 sigue bloqueado ni que el menú ya quedó integrado.
