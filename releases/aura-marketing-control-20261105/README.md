# Marketing AURA: release aislado

Solo preparación; no publica automáticamente. Conserva los Workers actuales de shell/campañas y amplía el contrato de métricas. `creditek-aura`, KORA, Sofía backend, SQL y permisos no cambian.

Desde esta carpeta, con dependencias del repositorio:

```
node release-check.mjs
```

Verifica hashes de entradas, ejecuta pruebas ficticias, compila tres bundles, hace tres dry-run Wrangler y coteja los multipart. No llama endpoints de negocio ni publica. Usa Wrangler 4.114.0; configuración `unsafe.metadata` experimental fijada y comprobada. Las fechas de despliegue se conservan; la prueba HTMLRewriter utiliza una fecha local soportada, no certifica igualdad del runtime productivo.

Antes de publicar: lectura fresca e independiente de versiones, rutas y configuración de los tres Workers; detener ante diferencias, revisión Claude, aprobación de Óscar para push/publicación. No desplegar el conjunto local de assets ni el Worker general de AURA. No incluir los commits ajenos pendientes. Publicación backend primero y luego UI; comprobar versiones, sesión autorizada, navegación y campañas. Reversión: restaurar versiones de cada Worker cambiado, sin revertir bases de datos o registros.

La sesión real publicada permitió leer campañas, conexión y calendarios el 5 de noviembre. Registro orgánico vacío y permiso `read_insights` reportado faltante; automatización no habilitada. No importar publicaciones externas ni inferir cero de ausencia. El candidato no está publicado. La prueba de sesión no cubre renovación entre pestañas.

Las capturas originales completas se conservan para mantener comportamiento ajeno; nunca se envían a revisión externa ni incluyen credenciales extraídas. Las huellas de inputs se fijan en inputs.sha256.json y quedarán ancladas al commit del release. Un archivo de huellas no es atestación independiente de producción.
