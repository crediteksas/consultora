Dictamen recibido mediante revisión delimitada de código, autorizada por Oscar. No sustituye pruebas ni certifica producción. El código posterior requiere revisión complementaria.

# Revisión independiente — kora-report-export.js, resumen-saldos-b2b-app.js, b2b-cierres.js + pruebas

Hice trazabilidad manual de signos, totales, ratios y sumas (sin herramientas), cruzando cada hallazgo contra las aserciones de las pruebas adjuntas para no limitarme a "pasa/no pasa".

## No encontré bloqueantes para este lote

Verifiqué específicamente y no hallé error numérico activo en:
- Signos de saldos a favor/por pagar (`completeTable`, bucket de `balances`): el multiplicador `sign` invierte correctamente solo el bucket "a favor", confirmado con decimales exactos (`100000.25` / `-20000.75` → `$ 100.000,25` / `$ 20.000,75`).
- Parseo de números colombianos con signo antes o después del `$` (`colombianNumber`, `kora-report-export.js`): ambos órdenes (`-$ 1.800.000,00` y `$ -214.939,85`) se normalizan igual.
- Mapeo de columnas de política (`tablePolicy`) a índices "kept" tras excluir Acciones/Seleccionar: todos los `ratios` declarados en `TABLE_TOTALS`/`SCHEMA_TOTALS` referencian numerador/denominador que sí están dentro de su propio `sums`, así que ningún ratio queda huérfano (`computed.get` nunca falla silenciosamente para los esquemas listados).
- `providerReportTables`/`providerExportRows` en `b2b-cierres.js`: suman unidades y costo total, nunca costo unitario ni precio retail; el total por proveedor en CSV aparece una sola vez.
- `resumen-saldos-b2b-app.js`: los totales se renderizan en `tfoot` por la propia app (no por heurística del exportador), y `completeTable` los respeta como `explicitTotals` sin recalcular — evita doble lógica de sumas divergente.

## Hallazgos no bloqueantes (para backlog, no impiden este lote)

**1. (Medio) Inconsistencia de orden de clasificación % vs. moneda — `kora-report-export.js:typedCell`**
Para valores numéricos nativos, el orden de chequeo es `textHeader → percentHeader → amountHeader`. Para valores de texto sin sufijo `%` explícito, el orden es `textHeader → percent-sufijo-en-texto → amountHeader/$ → cantidad → percentHeader`. Es decir, en la rama de texto, `amountHeader` (que incluye "comisi[oó]n", "margen", etc.) se evalúa **antes** que `percentHeader`. Con los encabezados actuales no se dispara (no hay ninguno que combine "%" con una palabra de `amountHeader` en el mismo título), pero si en el futuro se agrega un encabezado como "Participación costos %", un valor de texto plano sin `%` ni `$` se clasificaría como moneda en vez de porcentaje. Cambio mínimo: en la rama de texto, mover el chequeo de `percentHeader` antes del fallback de `amountHeader`, igual que en la rama numérica.

**2. (Bajo) Doble conteo de "Pendiente" en ambos buckets de saldo — `completeTable`, bloque `balances`**
`values.filter(n=>n===null||predicate(n))` incluye los valores `null` en **ambos** buckets ("por pagar/cobrar" y "a favor") a la vez, de modo que un dato faltante se reporta como "Pendiente" en los dos totales simultáneamente. Parece intencional (no asumir a qué bucket pertenece el dato faltante), pero vale confirmarlo con el equipo de producto para que no se interprete como duplicación de advertencia.

**3. (Bajo, mantenibilidad) Columna "Incluida" e índices de moneda fijos por posición — `structuredSheet`, `completeTable` (rama `structured`), `pdfTable`**
El filtro `row[5]==='Sí'` / columna Excel `F` y el rango de formato moneda `columna 6–22 (G:W)` están repetidos como números mágicos en tres lugares (Excel, PDF, cómputo de totales). Si una futura tabla estructurada cambia el orden de columnas sin tocar los tres sitios, los totales o el formato quedarían mal sin aviso. No es un bug activo hoy (es consistente en los tres sitios), pero es frágil.

**4. (Bajo, limpieza) Código posiblemente muerto — `creditek/erp/b2b-cierres.js:exportRows`**
La función `exportRows` está definida y expuesta en el objeto `api`, pero el botón de descarga del módulo usa `providerExportRows`, no `exportRows`. No se referencia en ninguna prueba del lote. Podría ser código muerto o quedar para otro consumidor fuera de este lote; no pude confirmarlo sin ver archivos adicionales.

## Fuera de alcance de este lote (no puedo auditarlo con lo adjunto)

- **Escape real de CSV** (comas, comillas, saltos de línea): `providerExportRows`/`exportRows` solo construyen arreglos 2D; la serialización ocurre en `KoraB2BListsUI.download`, que no fue incluido.
- **Semántica exacta de columnas en `reportes.html`** (p. ej. orden numerador/denominador de `tbody-presupuesto`, `tbody-crecimiento`): no tengo el HTML con los encabezados reales para confirmar que "crecimiento" compara en el sentido correcto (actual vs. base).
- **Contenido de la migración SQL** de auditoría: solo se referencia en una prueba, el archivo no fue adjuntado.

## Conclusión

Sobre el código y pruebas entregados, no identifiqué errores bloqueantes de totales, signos, porcentajes o filtros. Esto **no certifica** la totalidad de informes ni el comportamiento en producción (no se desplegó, y hay módulos fuera de este lote que no pude revisar). El punto 1 merece una corrección preventiva de bajo riesgo antes de ampliar encabezados con palabras de `amountHeader` combinadas con "%".
