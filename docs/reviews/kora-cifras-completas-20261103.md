# Cuadros con cifras completas

Corrección visual autorizada por Óscar. Sin cambios de datos, cálculos, permisos ni acciones financieras.

Causa: Liquidaciones genera `.grid > .metric` con columnas mínimas de 170px. La capa compartida incrementaba la fuente a 28px y aplicaba nowrap/scroll horizontal, pero solo ensanchaba `.metrics`. En producción los importes requerían 160px y tenían 124px disponibles.

Cambio: incluir `.grid:has(> .metric)` en la cuadrícula adaptable de 280px y una columna bajo 700px; eliminar desplazamiento horizontal en cifras de métricas, KPI y totales de compra. En valores extremos se permite envolver para conservar todos los dígitos.

Validación: CUA/Chrome, fixture exacto del checker con datos ficticios, anchos 320/390/768/1200/1440. Ninguna cifra ni página desborda. Columnas observadas: 230; 300; 319x2; 356.664x3; 323.5x4. Otra fixture también comprobó 1024px. Se verificó captura visual.

`npm run test:local`: 1418 pruebas aprobadas. Suite adicional design-system: 101/106; 5 expectativas preexistentes de versiones de shell quedaron desactualizadas, fuera del pipeline oficial y ajenas al CSS modificado. No se alteraron esas pruebas para esconder fallos.

Claude Code revisó el diff completo y aprobó, después de reforzar el checker para validar anchura mínima real y columna única móvil. Resultado final: APROBADO, sin defectos bloqueantes de sintaxis/especificidad/correspondencia con markup.

La auditoría anterior recorrió las 39 entradas de navegación; no certifica todos los estados ocultos o formularios de negocio. Esta corrección cubre los componentes compartidos identificados.
