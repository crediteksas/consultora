# Auditoría de informes KORA — 16 de octubre de 2026

## Dictamen y alcance

**Auditoría integral no certificada como terminada ni publicada. Lote corregido y aprobado localmente por Claude.** Se encontraron defectos adicionales a la auditoría anterior. Los cambios de este lote están en código local; siguen pendientes los caminos indicados en la matriz y la aceptación en producción. La revisión independiente del lote se completó en tres dictámenes acotados, no sobre todos los módulos.

La inspección inventarió 89 plantillas de tabla en `creditek/erp` y 46 páginas que cargan el shell. No son 89 informes diferentes: incluyen modales, catálogos, tablas de control y componentes dinámicos. El inventario estático no sustituye ejecutar las descargas nativas, comprobar permisos ni reconciliar contra la base de datos.

Reproducción del inventario: `node scripts/audit-report-surfaces.mjs` (o `--json`). REVIEW significa revisar manualmente; no significa necesariamente un defecto. Las tablas cuyos encabezados contienen expresiones JavaScript requieren el adaptador o una prueba en navegador.

## Hallazgos confirmados y cambios locales

1. **Producción B2B sin cierres de sección.** La pantalla y los documentos mostrados no tenían los totales requeridos. Había una corrección local anterior aún no publicada. Se conservó y se agregaron subtotales por tipo de tienda/cliente.
2. **Reglas dependían de `.html`.** La ruta real de KORA puede no llevar extensión; por ello no encontraba el contrato de totales. Ahora ambas rutas aplican las mismas reglas.
3. **Tablas monetarias sin contrato.** Se ampliaron contratos explícitos para ventas, proveedores, conciliación, caja, inventario, movimientos, pedidos y otras tablas. Se excluyen precios unitarios, tasas y saldos corridos.
4. **Números exactos interpretados como texto colombiano.** Los números de adaptadores ahora conservan sus decimales. `Margen` monetario no se interpreta automáticamente como porcentaje; `%` sigue siendo porcentaje.
5. **Notas pegadas a importes o perdidas.** Las notas de celdas con valor exacto se conservan separadas en PDF/Excel detallado. Se omiten identificaciones individuales del resumido.
6. **Consulta fallida aparentaba cero registros.** Se comprueba ausencia real de datos antes de generar cierres automáticos.
7. **Consolidado nativo de pedidos sin total general/proveedor.** Se agregaron cierres en CSV y contratos del adaptador común. Costos faltantes permanecen pendientes, no cero. El adaptador no exporta una consulta anterior mientras carga o después de fallar.
8. **Neto B2B presentado como por cobrar.** El KPI ahora se llama «Saldo neto de tiendas y clientes». El cierre separa deuda positiva, saldos a favor y neto; los subtotales por canal se identifican como netos. No cambia el cálculo de saldos ni compensa deudas de clientes distintos.

No se modificaron RPC, registros contables, pagos, saldos, kardex ni autorizaciones de operación. Las pruebas usan datos ficticios y consultas simuladas; no envían correos ni crean movimientos reales.

## Criterios mínimos de aceptación

- Identificar nombre, período/corte, negocio, filtros, moneda y cobertura (completa, limitada o paginada).
- Presentar totales por sección y subtotales útiles. El resumido debe responder a la pregunta del informe, no sustituir dinero por un contador de filas.
- Deudas y saldos a favor separados; no compensar terceros distintos. Un neto debe estar rotulado como neto.
- Conservar centavos, signo y tipo. Identificaciones, cuentas e IMEI son texto.
- No sumar porcentajes, precios unitarios, promedios, saldos corridos ni componentes que duplican un resultado.
- No convertir errores, falta de costo o ausencia de consulta en cero. Declarar pendientes y límites.
- PDF/Excel deben usar la misma fuente, filtros y cierre. Notas legibles, sin texto pegado, botones ni columnas de acciones.
- No acreditar por una exportación que un pago fue recibido, que hay efectivo disponible o que una liquidación equivale a ingreso bancario.
- Probar permisos, rutas con/sin extensión, detalle/resumen, filtro vacío, error, negativos, decimales y ausencia de datos.

## Matriz de evidencia

| Familia | Verificación local de este lote | Qué falta para cerrar |
|---|---|---|
| Resumen de saldos B2B | Descarga PDF y Excel real, lectura del libro, centavos, créditos separados, subtotales por canal, filtros, error y tamaños 390/768/1280 | Repetir descarga publicada con permisos reales; conciliación de origen no sustituida por pruebas sintéticas |
| Ventas, proveedores, conciliación, caja, kardex, inventario, tablero, remisiones, gastos, traslados, cierre de período | HTML real de 18 tablas, filas sintéticas, ambas rutas, cierre numérico y resumen sin detalle | Consulta real, precisión de origen y todas las variantes de permisos/filtros por pantalla |
| Banco y directorio | Adaptadores, centavos, estados, consulta completa del directorio sin limitar página visual y bloqueo de consulta no terminada | Aceptación publicada; banco mantiene el límite declarado de 200 solicitudes |
| Presupuesto Retail | Centavos diarios, mensual y resumen; no duplicar días en agregado | Otros caminos nativos, cartas y todas las variantes de negocio |
| Cartera B2B y dashboard Aliados | Pruebas de período, detalle, filtros, puente de utilidad, resumen y fuentes comunes | Aceptación publicada y comparación con fuente autorizada |
| Liquidaciones y compensaciones | Contratos de importes/operaciones; exclusión de saldo repetido de tienda; pruebas existentes de fórmulas y filas incluidas | Descargas nativas y casos reales por plataforma, estado y rol |
| Pedidos/cierres B2B | Totales por proveedor y general, faltantes de costo; pruebas de contrato y CSV | Descargar desde UI actual/histórico, carga/error; revisión del cambio concurrente del adjunto de correo, que no pertenece a este lote |
| Catálogos, tarifas y comparativos unitarios | Revisión de no aditividad; costos/precios unitarios no deben totalizarse | Conteo y cobertura declarados en cada exportador nativo |
| Finanzas/órdenes de pago | Revisión estática: documentos nativos contienen total; periodicidades distintas no sumables | Descargar todos los formatos con filtros y roles; no certificado por prueba de tabla genérica |
| Incidencias, equivalencias, permisos, historial de cierres | Tablas de control: conteo, no suma monetaria | Revisión de exportabilidad y permisos; no son reportes financieros |

## Pendientes concretos detectados

- `krediya-tarifario.js`, `diferenciasRows`: corregido localmente en la continuación. Subtotales por preliminar/no preliminar, centavos y negativos, datos faltantes explícitos, precios unitarios sin sumar. La descarga ahora respeta búsqueda/operación y agrega hoja Contexto; los subtotales no entran en el autofiltro. Prueba de descarga y lectura real de XLSX con datos ficticios y revisión independiente aprobadas. Pendiente publicación y aceptación en producción.
- `kardex.html`, descarga CSV propia: corregido localmente en la continuación. Agrega total de cantidades (no inventario), cantidad de registros y filtros/corte capturados al consultar, sin sumar costos unitarios. Prueba de descarga real CSV con datos ficticios y revisión independiente aprobadas. Pendiente publicación y aceptación en producción.
- Rutas nativas de giros, gastos de Tesorería, gestión Krediya, cartas de presupuesto e impresión de documentos necesitan una descarga extremo a extremo documentada. No quedan aprobadas por compartir el botón de exportación común.
- En superficies DOM sin `data-kora-report-value` o adaptador numérico, la suma puede usar importes ya redondeados por la pantalla. Se requiere terminar el rastreo de precisión de origen; no se certifica exactitud universal de centavos.
- Completar controles de consulta en curso, filtros aún no aplicados y paginación en cada pantalla restante.

## Evidencia ejecutada y límites

- Tanda aislada: 28 pruebas pasadas (unidades y navegador; incluye 18 contratos en 36 variantes de ruta).
- Integrado en repositorio: 10 pruebas de navegador pasadas, con generación PDF y descarga/lectura Excel en B2B; datos sintéticos.
- Compilación completa local y verificación del artefacto: aprobadas al cargar la configuración pública existente igual que el pipeline. La primera ejecución sin entorno falló por falta de `KORA_ENV`; no se alteraron variables de producción.
- La primera batería integrada marcó un test de caché desactualizado y un artefacto público anterior al build. Se actualizó el test y se reconstruyó. Repetición integrada: **1.170 pruebas pasadas, 0 fallidas**, sin saltos. Log de sesión: `/private/tmp/kora-report-audit-SyLvLu/main-local-tests-final.log`.
- Continuación: build completo y **1.173 pruebas locales aprobadas**, 0 fallos; dos pruebas adicionales de descargas nativas también aprobadas. Log: `/private/tmp/kora-report-audit-SyLvLu/followup-build-tests.log`.
- Oscar autorizó expresamente la revisión limitada con Claude/Anthropic. Primer dictamen recibido sin bloqueantes para los siete archivos enviados; ver `revision-claude-informes-2026-10-16.md`. No certifica todo el sistema ni producción.
- Hallazgo preventivo atendido: prioridad de encabezados porcentuales sobre moneda en valores de texto. Se agregaron casos `Margen %`, `Participación costos %` y porcentaje negativo. Las advertencias de saldos desconocidos permanecen en ambos buckets deliberadamente: no se conoce el signo, y no se asigna el dato ausente a un tercero ni a un saldo ficticio. Índices del formato estructurado quedan como mejora de mantenibilidad; no se eliminó `exportRows`, que conserva consumidores/pruebas fuera del paquete revisado.
- Revisión complementaria aprobó las correcciones nativas de Krediya y kardex; ver `revision-claude-informes-nativos-2026-10-16.md`. La duda de escala porcentual se verificó contra el contrato y los consumidores: números nativos son razones Excel (1,5 = 150 %), no puntos porcentuales. Se documentó y probó sin normalizar ratios por magnitud.
- Dictamen final **APROBADO LOCAL, sin bloqueantes** para el contrato porcentual, la normalización simétrica de texto negativo (`Math.abs`) y el KPI/cierre B2B; ver `revision-claude-informes-final-2026-10-16.md`. Los tres envíos estuvieron limitados a código y pruebas, sin herramientas, MCP, personalizaciones, credenciales ni datos de clientes.
- Última compilación y batería completa tras el cambio B2B: **1.173 pruebas aprobadas, 0 fallidas**, en `/private/tmp/kora-report-audit-SyLvLu/followup-final-build-tests.log`. Después solo se añadió el comentario de contrato y aserciones de ratios nativos; las 15 pruebas focalizadas volvieron a pasar. B2B detalle/resumen se inspeccionaron visualmente y se descargó/leyó su Excel con fixtures ficticias: no es conciliación contra datos reales.
- No hay commit, push ni despliegue de este lote. El repositorio tiene trabajo concurrente de otros alcances: no incluirlo indiscriminadamente en un release.

Esta auditoría amplía la evidencia previa; no convierte una aprobación local anterior en certificación de todos los informes ni de producción.
