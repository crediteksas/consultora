Revisión complementaria autorizada. Dictamen estático; las ejecuciones se verifican por separado. El punto de porcentajes necesita aclaración del contrato y revisión final.

He revisado estáticamente (sin ejecutar) `krediya-tarifario.js`, el fragmento de `kardex.html` y el snippet de `typedCell`, comparando cada uno contra sus pruebas declaradas.

**Krediya (diferenciasRows / export XLSX)** — consistente. Verifiqué a mano: inmutabilidad de `rows` (no hay mutación, solo `.map`/`.flatMap`), el cierre por fase separa correctamente preliminar/no-preliminar, las sumas usan centavos enteros antes de dividir (sin arrastre de flotantes — confirmé `700.25+700.25=1400.5` exacto), las columnas de precio unitario (4,5) quedan vacías en el subtotal (no se promedian PVP), y el rango de `!autofilter` excluye las filas SUBTOTAL (`A1:S2` en el caso de 1 fila de datos). El disclaimer "No acredita pago ni ingreso bancario" y la hoja de Contexto capturan búsqueda/lote/alcance tal como afirman las pruebas e2e. No encontré discrepancia entre código y aserciones.

**Kardex (CSV nativo)** — consistente. El fix de "filtros capturados, no controles editados después" está bien aplicado: `consulta()` no referencia `getElementById` ni `productoSeleccionadoId`, usa el snapshot `filtrosConsulta`/`unidadId` tomado antes del loop de paginación, y `contextoInformeKardex={...filtrosConsulta,corte:instanteConsulta}` se fija junto con `ultimoInformeKardex` al final. El total solo cierra cantidades (columna costo queda `''` en el total) y declara "No equivale a inventario disponible" — correcto, no confunde cantidad con stock. El escapado CSV neutraliza fórmulas (`=`,`+`,`@`,`-`) con comilla y duplica comillas internas, verificado contra los casos de la prueba.

**typedCell — posible inconsistencia real:**
El orden de prioridad (percentHeader antes de amountHeader) sí está corregido en ambas ramas. Pero hay una asimetría en el escalado:

```js
typedCell(15, 'Margen %')   // número nativo
// → {value:15, kind:'percent', format:'0.0%'}  → Excel muestra "1500.0%"

typedCell('15', 'Margen %') // mismo valor como string
// → number=15 → 15>1 → 15/100=0.15 → Excel muestra "15.0%"
```

La rama numérica no aplica el `value>1?value/100:value` que sí aplica la rama de texto. Si algún llamador puede entregar un número nativo en escala 0–100 (p. ej. un campo de API ya numérico) para una columna con header de porcentaje, el Excel exportado mostraría el valor ×100 de lo correcto.

Repro mínima: `typedCell(15,'Margen %')` vs `typedCell('15','Margen %')` en el mismo módulo.

Fix mínimo (si los números nativos no están garantizados como fracción 0–1):
```js
if(percentHeader.test(header))return {value:value>1?value/100:value,kind:'percent',format:'0.0%'};
```

No puedo confirmar con el snippet dado si los llamadores siempre normalizan los números nativos a fracción antes de pasar por `typedCell` (en cuyo caso el comportamiento actual sería correcto por diseño y no un bug). Esto es lo único que no pude cerrar por falta de contexto de los call sites.

**Veredicto:** Krediya y kardex (cierres nativos XLSX/CSV) quedan aprobados tal como están — no encontré bloqueante real reproducible en esos dos. El único punto abierto es la asimetría numérica en `typedCell`; si confirmas que los valores numéricos de porcentaje siempre llegan ya como fracción (0–1), apruebo también ese archivo sin cambios. Si no está garantizado, es un bloqueante real con el fix de una línea indicado arriba.

(Nota al margen, fuera del alcance pedido: en `b2b-listas-ui.js` vi `sheet['!fullref']` donde SheetJS normalmente expone `sheet['!ref']`; si es typo, el guard de "máximo 5000 filas" nunca se activaría. No lo evalúo a fondo porque no fue parte del lote solicitado — lo señalo solo por si quieres que lo revise aparte.)
