# Novedades: ejecutivo o Retail

## Alcance

El pendiente «aliado sin ejecutivo» abría una justificación genérica. Ahora abre el selector de ejecutivos activos y la opción «Retail · tienda propia» en la misma pantalla de Liquidaciones. Los pendientes de titular/cuenta enlazan al directorio único de Tesorería.

## Uso

1. Liquidaciones → lote → Novedades → Asignar ejecutivo.
2. Aliado: escoger el ejecutivo real y guardar. Se usa la asignación canónica de Tesorería, con comparación del valor anterior y auditoría. Después, «Actualizar cálculo del lote» incorpora su comisión. Si ya se guardó el ejecutivo, se muestra su nombre y el paso de recalcular, sin volver a asignarlo.
3. Tienda propia: escoger «Retail · tienda propia», elegir una tienda propia activa y confirmar la pertenencia de la venta. «Guardar Retail y recalcular lote» vincula únicamente esa operación y recalcula el borrador atómicamente.

No se seleccionan responsables automáticamente. La reclasificación no traslada clientes, cuentas o aliases del catálogo ni cambia otras operaciones a Retail. Las futuras importaciones siguen usando el catálogo y sus aliases existentes.

## Controles

- Roles y RPC existentes para la asignación de ejecutivos; no hay otro escritor del maestro.
- Nueva RPC `tesoreria_vincular_operacion_retail`: wrapper invoker, implementación privada con autenticación/capacidad revisora y `search_path` vacío.
- Bloqueo de lote, comparación de origen anterior, tienda propia activa, protección de lotes aprobados/congelados, aprobaciones históricas y órdenes autorizadas o en gestión.
- Bonos manuales requieren revisión antes de reclasificar; los automáticos se regeneran por el motor vigente.
- Se reutilizan la conciliación Retail y el cálculo existentes. Un error revierte toda la reclasificación. El archivo fuente, maestros y movimientos reales de caja no son editados.
- ALO retorna a cálculo/revisión. Krediya conserva su envío de revisión por lote cuando cumple los controles. Ninguno se aprueba por Gerencia ni se paga por esta acción.
- La migración instala funciones, no ejecuta reclasificaciones ni modifica filas operativas.

## Verificación

- Suite oficial KORA: pruebas SQL del cálculo, clasificación, idempotencia, permisos, auditoría, rollback y protección de pagos.
- `tests/e2e/liquidaciones-ejecutivo-local.test.mjs`: HTML real, servidor simulado, perfil Gestión, Chrome/WebKit, cuatro tamaños de pantalla, lista de ejecutivos y tiendas, selector vacío, fallos recuperables, cuenta correcta, recálculo explícito y protección de lotes congelados.
- Regresiones de los formularios existentes de comercios y preparación de pagos, en ambos navegadores.
- Publicación mediante `npm run deploy:kora:production`, después de commit; verificación del manifiesto y hashes de los archivos publicados.
