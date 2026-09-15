# Comparativo de Móvil Shopping al 6 de septiembre de 2026

Cargado por solicitud de Óscar el 15 de septiembre. ID: `0ecc4068-54af-48ee-8cda-d19c4fd26095`.

Estado: comparativo histórico pendiente de revisión. No se ha aplicado ningún ajuste, modificado costos ni reconocido utilidad B2B.

## Fuente y fechas

Óscar confirmó el 6 de septiembre como fecha de corte y conteo. Los Resumen originales dicen 7 de septiembre a las 09:10:41 y 09:11:32. Se preservan las dos evidencias en `revision_fuente`; no se reescriben los archivos ni se presenta la fecha del sistema como independientemente comprobada. La fecha interna del corte usa las 00:00 del día 6 solo para ordenamiento, y la interfaz muestra la fecha sin inventar una hora física.

Las diferencias comparan exclusivamente Cantidad y Conteo de los archivos. No se usa el inventario actual como base ni se recalculan ventas posteriores. Actual se muestra solo como consulta. Aplicar requiere resolver las observaciones, validar base documental y una revisión posterior autorizada; este registro está bloqueado contra aplicación accidental en servidor.

## Resultado

381 líneas identificadas: 23 equipos individuales y 358 líneas por cantidad. Los 23 IMEI/seriales coinciden con su producto en la base. Cuatro diferencias:

| Código | Referencia | Base | Conteo | Diferencia |
|---|---|---:|---:|---:|
| 2GE0026 | CABEZOTES SAMSUNG 25W | 7 | 6 | -1 |
| 4YA0007 | PROTECTOR TIPO 17 PRO MAX | 4 | 3 | -1 |
| 2GE0193 | SIM CLARO | 3 | 10 | +7 |
| 2GE0201 | VIDRIO ANTIESPIA | 250 | 499 | +249 |

Dos filas adicionales conservadas separadas, sin inventar correspondencias:

- Fila 54 de accesorios: `2GE0047`, CABLE HARVIC CB-129, base 1 / conteo 1, costo escrito 4.600. El código no existe en el catálogo actual.
- Fila 361: SIM TIGO PAQUETE sin código, base escrita 42 / conteo 42, costo escrito 1.000. Hay dos referencias de igual nombre ya incluidas con 7 y 11 unidades; no se presupone que las 42 sean adicionales ni se elige una referencia por nombre aproximado.

Los totales, filas vacías y una celda aislada fuera de la tabla de celulares no se convirtieron en productos. La fuente original queda preservada. Hash compuesto de ambos archivos: `821c2581387c17b828e5c2e0be20ef82f34ad9dd06ef1916f8581285b9c2802f`.

## Controles verificados

- Carga transaccional e idempotente por tienda y hash. Identidad de tienda/productos y fórmulas validadas antes de insertar.
- Igualdad del inventario completo de la tienda antes/después de la carga, con bloqueo compartido durante la transacción. No se insertaron movimientos.
- 566 pruebas locales aprobadas. Prueba SQL de bloqueo de aplicación y reversión integral, incluso intentando borrar metadatos en el mismo UPDATE.
- Prueba Chrome de consulta histórica, filas pendientes visibles, descarga del comparativo y del informe, sin formulario de autorización/subida para este registro.
- Mismas reglas por tienda; ninguna política de acceso ni rol fue ampliada.
