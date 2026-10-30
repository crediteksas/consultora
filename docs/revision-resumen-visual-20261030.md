**APPROVED**

Verificación de especificidad confirma que el fix es robusto independientemente del orden de carga:

- Regla contaminante: `.kora-product-page :where(button,...):not(.secondary):not(.ghost):not(.danger)` → especificidad (0,4,0) (`:where()` aporta 0, solo cuentan `.kora-product-page` + 3 `:not()`).
- Nueva regla: `body[data-kora-dashboard] button.kora-summary-open:not(...):not(...):not(...)` → (0,5,2); mismo cálculo para `.kora-drilldown-link` → (0,5,2).
- (0,5,2) > (0,4,0) en el segundo componente (5>4), por lo que gana sin depender del orden de los `<link>` en `<head>`. Correcto.
- El botón real (`button.kora-summary-open[data-summary-explore="sales"]`) y los botones inyectados `.kora-drilldown-link` matchean ambos selectores y ninguno tiene `.secondary/.ghost/.danger`, así que los `:not()` no bloquean la anulación.
- `padding:0` en la regla combinada sí pisa el `padding:2px 0` de `.kora-drilldown-link` (especificidad (0,1,0) < (0,5,2)), pero `min-height:36px` (preexistente, no rediseño) sigue garantizando el área mínima — no es un defecto nuevo.

Test: espera de CSS estable antes de medir (`waitForFunction` sobre `backgroundColor transparent`), validación de recorte en KPIs y en todas las celdas/botones de la fila inyectada, chequeo de contraste (`color != transparent`) y foco visible, extracción de `<head>`/stylesheets ya corregida y resuelta vía `base href` + interceptor por hostname. PASS reportado en 390 y 1280 sin señales de flakiness.

Sin defectos concretos bloqueantes.
