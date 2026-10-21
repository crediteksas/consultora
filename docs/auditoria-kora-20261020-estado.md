# KORA · Estado de correcciones de auditoría

Fecha: 20 de octubre de 2026, Colombia. Estado: migraciones autorizadas aplicadas; publicación de la interfaz en preparación.

## Resultado

Se implementaron correcciones de lógica, permisos, totales, fechas, presentación y carga del catálogo en la rama aislada `codex/kora-audit-20261020`, basada en `02e186a8d97f936c2f36b195fe006eb30ab7c533`.

No se modificaron saldos, deudas, clientes, existencias, conteos, incidencias ni otros registros operativos reales. Con autorización expresa se aplicaron únicamente las dos migraciones de funciones y permisos. No se realizó push ni despliegue de la interfaz al momento de este registro. El checkout autorizado integró la rama por avance rápido, sin sobrescribir cambios.

## Seguimiento de los hallazgos

| ID | Corrección o decisión | Estado |
|---|---|---|
| L01 | Lecturas paginadas y orden estable para Ventas, categorías, crecimiento y productos. Las bajas de inventario también se paginan en Reportes y Tablero. Un fallo de página no entrega un total parcial. | Implementado; pruebas ficticias de más de 1.000 filas. |
| L02 | Solo los responsables autorizados pueden iniciar un inventario normal o ciego. Las tiendas conservan carga/corrección de conteos sin ajustar existencias. Se puede retomar un corte existente. | Control del servidor aplicado y comprobado por metadatos; interfaz pendiente de publicación. |
| L03 | Las bajas no monetarias se descuentan de la utilidad individual y consolidada. Los gastos generales quedan separados de la utilidad individual. | Implementado y probado localmente. |
| L04 | Conteo ciego exige perfil activo, rol permitido, asignación cuando corresponde, sesión vigente y máximo de dos intentos. Bloqueo transaccional para intentos; no se modifica Kardex. | Aplicado tras pruebas en PostgreSQL embebido con usuarios ficticios; permisos y guardas verificados en metadatos productivos sin registrar conteos. |
| L05 | Fecha comercial de Colombia en compras y gastos Aliados; filtro diario de Validación con inicio incluido y siguiente medianoche excluida. Tablero ancla sus rangos a Colombia. | Implementado; pruebas de cambio de año y límite diario. |
| L06 | Comparación del mes contra el mes anterior; semana contra los mismos días anteriores; rango libre contra período anterior contiguo. Se muestran las fechas de referencia. | Implementado; incluye febrero bisiesto. |
| L07 | Costos ausentes o ventas sin artículos no se convierten en costo cero. Utilidad/costo pendientes se identifican como «Por confirmar». Cero explícito sigue siendo válido. | Implementado y probado localmente. |
| V01 | Totales al pie en cartera Retail, cartera B2B, rentabilidad por tienda/categoría. Margen porcentual calculado sobre los totales, no sumando porcentajes. | Implementado; respeta filtros y centavos. |
| V02 | Categorías: gráfico encima del detalle. Incidencias: estado y prioridad junto al código. Catálogo: datos legibles en móvil, sin esconder el costo a la derecha. | Implementado. Verificación visual local del catálogo; falta aceptación visual en producción. |
| V03 | El menú ya dice «Registrar cliente» en la base vigente. | No se creó un directorio nuevo ni se alteraron clientes. |
| V04 | Remisiones e Incidencias tienen etiquetas específicas visibles y nombres accesibles para los filtros. | Implementado. No constituye certificación WCAG. |
| V05 | Rechazo de gastos identificado como acción de riesgo; devolución y cierre sin aplicar como acciones secundarias. | Implementado. El rediseño general de densidad sigue siendo una mejora visual por validar, no un fallo financiero cerrado. |
| V06 | Auditoría cruzada distingue historial de sesiones activas/expiradas y completa nombres históricos sin reactivar perfiles. Apertura condicionada al permiso autorizado. | Implementado. |
| V07 | «Confirmada» y «En desarrollo» diferenciados; etiquetas sin partir palabras; nombres legibles de entradas por compra y despachos de CENTRAL. | Implementado. |
| V08 | Stock positivo de la bodega virtual se informa como «Pendiente de despacho», sin presentarlo como pérdida o descuadre real. | Implementado; no cambió el stock ni el cálculo. |
| V09 | Retirada la restricción de ampliación del formulario público. | Implementado; no se registró ningún usuario. |
| V10 | Importes monetarios conservan hasta dos decimales en las vistas corregidas y sus totales/exportaciones. | Implementado en los módulos afectados; no recalcula saldos. |
| R01 | Catálogo presenta 100 referencias por página e imágenes diferidas. El informe mantiene todas las referencias filtradas, no solo la página visible. | Implementado; prueba de 3.084 referencias. |
| S01 | Cinco funciones con ruta de búsqueda mutable reciben una ruta explícita con `pg_temp` al final. | Migración aplicada; los cinco avisos desaparecieron del asesor de seguridad. |

## Validación y revisión

- Suite local: 1.240 pruebas aprobadas, cero fallos. La prueba del manifiesto usa una configuración ficticia independiente del entorno de trabajo.
- Compilaciones `build:public` y `build:kora` completadas, con configuración ficticia de staging. No son artefactos autorizados para producción.
- Se renuevan las versiones de los archivos corregidos en el artefacto para evitar reutilización de caché antigua.
- Claude recibió solo código y pruebas ficticias. Detectó paginación faltante de bajas; se corrigió en ambos consumidores. Aprobó la segunda revisión y la revisión final de rótulos/columnas, sin hallazgos de código pendientes. Las observaciones condicionales de columnas se comprobaron con el renderizador real y una prueba adicional; también se alinearon los nombres accesibles y se sustituyó un selector CSS frágil por un estado explícito.
- La coincidencia del punto de inserción de la migración se contrastó con metadatos vivos en solo lectura. Sigue siendo obligatoria una comprobación fresca antes de aplicarla.
- Prueba visual local de paginación/búsqueda y formato móvil del catálogo; rótulos, estados y orden de columnas de Incidencias comprobados con datos ficticios. No hubo conexión a sistemas reales. Esto no equivale a validar todas las pantallas con todos los roles.

## Lo que no queda cerrado con este trabajo local

1. Las dos migraciones ya se aplicaron con autorización; falta publicar y verificar la interfaz. El control de apertura del servidor ya está activo.
2. La rama aislada ya integró `origin/main` (`4547604b`) sin conflictos mediante `72b026e3b0930d136ade83aa6028a5bd4563b0e3`. Los seis archivos entrantes son exclusivamente de AURA; los archivos KORA revisados por Claude no cambiaron. Falta promover esta integración al checkout autorizado antes de publicar; no se ha realizado push.
3. La protección de contraseñas filtradas es configuración real de Auth: permanece sin cambiar. Requiere revisar compatibilidad y autorizar el cambio de configuración.
4. El índice duplicado de caja se dejó intacto. No se elimina por un aviso automático sin revisar dependencias y beneficio medido.
5. Las observaciones operativas de la auditoría original siguen separadas: no se anularon cortes, gastos ni ajustes reales para ocultar avisos.
6. La auditoría original inventarió 50 rutas: 42 navegadas y 8 inspeccionadas estáticamente o condicionadas para evitar escrituras. No se afirma una certificación funcional o visual del 100%.

## Paso seguro de publicación

El usuario autorizó publicar únicamente KORA y aplicar las dos migraciones revisadas. Se repetirá el preflight del checkout autorizado, se aplicarán primero los controles de servidor, se construirá con configuración productiva válida y se verificará la versión publicada. No probar aplicando ajustes ni pagos reales. Esta autorización no incluye desplegar AURA, cambiar Auth ni eliminar índices.

## Integración y comprobaciones adicionales

- Después del merge: nuevamente 1.240 pruebas locales aprobadas, cero fallos; compilaciones de KORA y verificación de aislamiento aprobadas con configuración ficticia.
- Ocho definiciones de funciones contrastadas con Supabase en solo lectura: sin cambios respecto de las revisadas. Los cinco avisos de ruta de búsqueda siguen presentes hasta aplicar la migración.
- Comprobación adicional de dos archivos de pruebas de AURA: dos pruebas aprobadas y cinco fallidas. Las cinco pertenecen a `aura-shell.test.mjs`, incorporado desde el remoto, y esperan un acceso y unos iconos incompatibles con los archivos actuales de AURA. Esos archivos de aplicación no fueron cambiados por esta auditoría ni por el merge. Se documenta para el ciclo independiente de AURA; no se cambia su autenticación ni se certifica o despliega ese producto.
- Ambos artefactos independientes se construyeron y pasaron sus verificadores. Esto prueba aislamiento de archivos, no funcionamiento completo de AURA.
- El índice duplicado de caja ocupa 32 kB, tiene uso registrado y no respalda una restricción. Se conserva: no hay justificación para mezclar su eliminación con esta publicación de permisos y reportes.

## Migraciones aplicadas

Supabase asignó las versiones `20261021012248` (control de apertura y permisos) y `20261021012310` (rutas de búsqueda). Los archivos locales se renombraron a esas versiones sin cambiar su SQL, y las dos pruebas ficticias apuntan a los nombres efectivos. Ambas pruebas volvieron a aprobar. La revisión adicional de Claude cubre únicamente esos cambios de rutas.

Las funciones de apertura, API de inventario y registro de bloques no son ejecutables por `anon`. Las guardas esperadas y las cinco rutas explícitas se comprobaron mediante consultas de metadatos. No se invocaron operaciones de inventario reales para probarlas. Los avisos restantes de Auth, extensión y revisión de políticas/funciones no se presentan como corregidos por este parche.
