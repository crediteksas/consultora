# KORA — refinamiento visual, 30 octubre 2026

Base: producción 18607295c1b53677c11a1d47df0ff143cc7defc1. Publicación exclusiva de presentación, sin SQL, datos, reglas financieras ni navegación nueva.

## Cambios
- Controles de cifras transparentes y detalle/foco legible en Ejecutivo, Aliados y B2B.
- Importes Banco completos, grilla con ancho suficiente y desplazamiento para magnitudes extremas.
- Totales de Compras fuera del scroll de productos; IDs y scripts intactos. Clases summary-card/label/value conservan los tres totales en la captura genérica de informes.
- Familia compartida de métricas, espaciado, superficies, campos, selección de pestañas y acciones secundarias; alcance limitado al contenido, no al menú.
- Filtros Aliados plegables; cerrados inicialmente en móvil y disponibles mediante summary nativo.
- Fechas Gastos y encabezados sin división artificial; carga de archivos y modales ajustados.

## Evidencia
- `node scripts/check-kora-visual-refinement.mjs`: Chrome local aislado, datos ficticios, CSS e inicializador reales. 390/768/1200/1440px. Cifras completas, sin overflow de página, foco por teclado, pestaña activa distinta, tres totales y apertura inicial móvil/desktop.
- `npm run test:local`: 1389 aprobadas. El pipeline vuelve a ejecutarlas antes y después de cargar el candidato.
- Comparación de scripts inline e IDs de compra contra producción: idénticos.
- Pruebas adicionales de exportación, Compras, Banco y diseño: 55/56; fallo preexistente en kora-dashboard.test.mjs (mock sin cargarCierreSeptiembre). Tanto prueba como tablero.html son idénticos a la base productiva. No se cambia ese flujo.
- Revisión Claude: primera revisión pidió evidencia de integración/exports; segunda aceptó el producto y pidió prueba de inicialización; tercera revisa la cobertura completa.

## Alcance de validación
Este parche resuelve componentes compartidos y defectos concretos; no constituye certificación de todos los roles, estados, pestañas, Safari/Edge o teclado móvil físico. Continúan oportunidades de composición de históricos, metadatos y estados de carga descritas en la auditoría. No se declaran implementadas las 18 propuestas completas.
## Revisión final

**Veredicto: APROBADO.** El fix al único pendiente de la ronda anterior queda resuelto correctamente.

**Verificación del punto que generó "cambios requeridos":**
El fixture ahora carga el script real vía `<script src="/design-system/components/kora-product.js" defer>`, y como `page.goto` espera el evento `load` por defecto, los scripts `defer` ya se ejecutaron antes de que el test continúe — no hay condición de carrera entre `initialize()` y la aserción `panel.open === (width>700)`. Correcto.

**Diff de `kora-product.js`:**
- Cambio mínimo y acotado: solo cierra `details.kora-filter-disclosure` en mobile (`≤700px`) dentro de `initialize()`, sin tocar lógica de filtros, overlays ni tablas.
- El comentario explica el *por qué* (mostrar resultados primero en mobile), no el *qué* — consistente con las convenciones del repo.
- No hay cambios de producto adicionales desde la segunda revisión, como se indica.

**Cobertura del test:**
- Aislamiento de red confirmado (`route.abort()` para todo lo que no sea `127.0.0.1`) y servidor restringido a `.css/.js` dentro del repo con protección de path traversal.
- Los 4 anchos (390/768/1200/1440) validan: estado inicial de `open` según breakpoint, toggle funcional en ambas direcciones, ausencia de overflow horizontal, contraste de botones/tabs, `nowrap` y no-clipping en todas las cifras, y foco visible.
- Capturas se toman con animaciones finalizadas y `reducedMotion: reduce`, evitando falsos negativos por timing visual.

**Observación menor, no bloqueante:** la línea `await page.keyboard.press('Tab')` antes de `.focus()` es redundante (el `.focus()` programático ya dispara el estado `:focus-visible` en Chromium) — no afecta la validez del test, es solo código muerto que se podría limpiar en un futuro ajuste, no amerita otra ronda.

No tengo objeciones adicionales de alcance ni de seguridad sobre el script de prueba (solo local, solo datos ficticios, sin tocar Supabase ni producción). Queda lista para fusionar según lo que decida Oscar.
