# KORA · Acabado visual y auditoría · 19 noviembre 2026

Base de comparación: `9137b6c9`. Alcance: presentación de KORA, sin cambios de lógica, permisos, navegación, SQL o datos.

## Cobertura y significado de las comprobaciones

- 52 HTML inventariados; 51 documentos publicables incluidos, con 494 botones, 462 campos y 22 declaraciones HTML de diálogo. `registro.html` está excluido por el build de KORA y no se cambia.
- Renderizado estructural local de los 51 documentos a 390, 768 y 1440 px: 153 vistas. Se deshabilitan los scripts de negocio y todo acceso a backend. No equivale a probar los datos o las acciones de cada pantalla.
- El auditor conserva una matriz por archivo, campos, controles y límites de evidencia; las pantallas que generan contenido por JavaScript se identifican expresamente.
- Inspección productiva de Ventas, Proveedores y su diálogo nuevo/cancelar, Compras, Ejecutivo, Plataformas, Calidad, Bonificaciones, Banco, Ajustes, Pedidos y Presupuestos. Se rechazan capturas iniciales en blanco o incompletas como evidencia de pantalla terminada. No se guardan formularios ni se autorizan movimientos.
- Pruebas de navegador locales con datos ficticios: navegación móvil, calendario Chromium/WebKit, proveedores, saldos B2B, traslados, pagos, notificaciones, inventarios, presupuesto y exportación Excel/PDF.

No se afirma certificación de accesibilidad, validación de todos los estados de todos los roles ni prueba de operaciones financieras reales. El estilo no depende del rol ni modifica sus restricciones.

## Cambios de presentación

Tipografía nativa con Inter de respaldo; superficies opacas y sobrias; encabezados con menos envoltorios; tablas con encabezados de marca y contraste AA de texto; cifras tabulares; acciones de consulta secundarias y cancelación distintas de guardar; foco visible; pestañas adaptables; modales coherentes y movimiento reducido. Estados de peligro, éxito y selección quedan fuera de la normalización de acciones de tabla.

Hoja nueva `creditek/erp/kora-finish.css`, limitada por `data-kora-finish` y `@media screen`. Cada HTML de KORA la activa explícitamente; las reglas base requieren además el shell kora-product-page para conservar el acceso y la instalación independientes. AURA no carga ni activa esta hoja. Se conservan los estilos de impresión; las exportaciones Excel/PDF se comprueban por separado. Los PDF capturados desde pantalla pueden reflejar la tipografía de interfaz.

## Hallazgos y controles

1. Jerarquía: demasiados marcos y encabezados que desplazaban los datos. Acabado compartido y títulos sin tarjeta redundante.
2. Acciones: Guardar/Cancelar podían tener idéntico tratamiento. Cancelar secundario sin cambiar handlers.
3. Tablas: encabezados oscuros repetidos y acciones de consulta dominantes. Se conservan encabezados oscuros y estilos secundarios acotados a acciones reconocidas.
4. Móvil: pestañas de Créditos y periodos de Reportes fuera de la vista. Permitir que se distribuyan en más de una fila.
5. Contextos especiales: conservar selección del calendario, variantes de peligro/éxito, campos deshabilitados, foco, impresión y cifras exactas en exportaciones.
6. Deuda técnica de pruebas: siete aserciones de diseño existentes también fallan sobre la base sin este cambio (versiones antiguas y contratos previos). No se reescribe AURA para satisfacerlas. La prueba de redondeo de confirmaciones también falla antes del cambio: espera `$120,8`, mientras la implementación vigente muestra `$121`. No se altera esa regla financiera.

## Reproducción

Preparar los recursos públicos que usan las páginas para la auditoría offline (Tailwind 2.2.19 y Lucide 1.27.0) en `/tmp/kora-audit-tailwind.css` y `/tmp/kora-audit-lucide.js`. No contienen credenciales ni datos.

`node scripts/audit-kora-finish.mjs` genera cobertura y capturas en `/tmp/kora-finish-audit` y compara el HTML con la base indicada por `KORA_FINISH_BASELINE` (por defecto 9137b6c9), permitiendo solo atributos de presentación y el enlace de estilos.

`node --test tests/design-system/kora-visual-contract.test.mjs` comprueba cobertura, aislamiento y controles. El runner habitual incluye estas pruebas sin alterar el runner firmado de permisos.

Para la batería E2E, indicar `KORA_TEST_EXCELJS` y `KORA_REPORT_EXCELJS_PATH` con la copia local oficial de ExcelJS. Las pruebas locales no ejecutan operaciones de usuario.

## Resultados finales

Suite obligatoria: 1495/1495. Batería de navegador de flujos principales: 38/38. Navegación con shell real en Chromium y WebKit; errores, franja de marca comparada con/sin acabado y acciones de anulación/cierre conservados. Auditoría estructural: 153 vistas sin desbordamiento de página.

Revisión de código sin datos de negocio: https://claude.ai/chat/a5f42b70-2f22-4412-853f-f327f8259553 . Se corrigieron los seis bloqueos de la primera revisión antes de obtener aprobación.
