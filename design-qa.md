# Design QA — Dashboard Retail responsive

## Referencia

- Captura reportada: ventana de Chrome reducida, con el valor de inventario cortado en la cuarta tarjeta.
- Pantalla validada: `https://kora.crediteksas.com/creditek/erp/reportes#retail`.

## Viewports y comportamiento

- Escritorio amplio (>1200 px): 4 indicadores por fila.
- Ventana intermedia (521–1200 px): 2 indicadores por fila.
- Móvil (≤520 px): 1 indicador por fila.
- Selector de período: conserva desplazamiento horizontal cuando no cabe.

## Resultado visual

- Los cuatro valores se muestran completos.
- El valor largo de inventario ya no se corta.
- Las tarjetas mantienen jerarquía, espaciado y estilo KORA.
- La gráfica y la tabla permanecen alineadas y legibles.

## Validación automática

- Pruebas responsive específicas: 2 aprobadas, 0 errores.
- Suite de diseño: 77 aprobadas, 0 errores.
- Suite ERP: 358 aprobadas, 2 históricas omitidas, 0 errores.

## Estado final

Passed.
