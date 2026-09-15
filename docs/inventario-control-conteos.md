# Conteos, ajustes e informes de inventario

Implementación: 15 de septiembre de 2026. Mismo módulo y mismas reglas de servidor para todas las tiendas propias activas; no hay habilitaciones por tienda piloto.

Continúa las reglas autorizadas por Gerencia el 12 de septiembre: el retiro de la carga inicial se conserva mediante la migración `20260912144724`, sin reabrir esas operaciones ni modificar registros históricos. La migración de conteos aplicada es `20260915162101`. Este informe cubre inventarios; no presupone que todos los demás módulos del sistema tengan sus informes completos.

## Flujo operativo

1. La tienda o administración abre **Inventario → Conteos, ajustes e informes**, selecciona la tienda y crea un corte.
2. El servidor guarda una fotografía fechada e identificada del disponible completo. Descarga un solo Excel con equipos individuales y accesorios por cantidad, sin depender de los filtros de la pantalla. El conteo ciego omite cantidades y costos.
3. Se completa **Cantidad reportada al corte**, incluso los ceros. Los accesorios no llevan IMEI; los equipos van individualmente. Los sobrantes se agregan con un código de catálogo válido. No se deben borrar filas, duplicar IMEI ni identificar artículos por coincidencia aproximada.
4. La tienda reconstruye manualmente lo que había al corte: al físico contado suma las ventas y otras salidas posteriores, y resta las entradas posteriores. En equipos se reconstruye por IMEI. Se anotan las aclaraciones en Observación. Al subir confirma que el Excel contiene ese resultado, no el físico actual. No hay una segunda modalidad por fecha posterior.
5. El servidor conserva el nombre y SHA256 del archivo, filas, fecha de referencia (el corte), fecha real de subida y responsable. Compara **únicamente contra la fotografía original**: no suma ni resta ventas/entradas del sistema para calcular diferencias. No modifica existencias. Queda **Pendiente de Mayte / Óscar**.
6. Únicamente las identidades activas verificadas de Mayte y Óscar pueden autorizar o cerrar sin aplicar. Se exige motivo, soporte/referencia documental y clasificación. El ajuste se registra a la hora de autorización, no retroactivamente a la fecha del corte.
7. La autorización aplica una vez la diferencia sobre el disponible actual. Registra entradas/salidas, valoración al costo de la tienda, antes/después y responsable. Un conteo sin diferencias también queda cerrado en el historial, sin movimientos artificiales.
8. El historial se consulta por fecha del corte, tienda y responsable. Su Excel incluye fecha de referencia del conteo, fecha de subida y autorización, detalle completo, motivos, soporte y valoración. Kardex permite consultar y descargar los movimientos por fecha de registro.

## Ejemplo y fórmula

Regla aclarada y autorizada por Óscar el 15 de septiembre, aplicada mediante la migración `20260915163724`: el dato entregado por la tienda siempre está referido al corte. Se verificó la configuración activa para las diez tiendas; no había conteos ni movimientos de ajuste del método anterior al cambiar la regla.

`reportado al corte = físico contado + salidas posteriores − entradas posteriores`

Esta reconstrucción la hace la tienda; el sistema no la calcula usando sus ventas.

`diferencia = reportado al corte − sistema al corte`

`saldo después de autorizar = disponible actual + diferencia`

Si el sistema tenía 250 vidrios y se contaron 499 en ese corte, la diferencia es +249. Si luego se vendieron 17, el sistema actual tiene 233; aplicar +249 deja **482**, no 499.

Ejemplo sin diferencias: corte 100, físico 90 y diez vendidos después. La tienda entrega 100. Diferencia cero; el sistema deja intacto el disponible actual de 90.

Ejemplo con faltante: corte 100, reconstruido al corte 98, tres ventas posteriores. Diferencia −2; si el sistema actual tiene 97, la autorización deja 95.

Ejemplo con entrada: corte 100, físico 115 y quince recibidos después. La tienda entrega 100 y no genera ajuste. Las entradas posteriores permanecen en el disponible.

Al autorizar solo se aplica la diferencia al disponible actual: no se reemplaza por el conteo ni se registra de nuevo una venta. Los eventos posteriores se conservan para trazabilidad y para impedir ajustes duplicados, **no para recalcular la base del conteo**. El servidor no puede comprobar que una reconstrucción manual sea físicamente correcta; la revisión y su soporte siguen siendo obligatorios.

## Controles

- Fotografía y aplicación protegidas frente a escrituras concurrentes de stock y unidades.
- Una tienda no puede leer, subir ni autorizar el conteo de otra. Ocultar botones no es el control: se valida también en servidor.
- Un ajuste posterior invalida cortes anteriores de esa tienda para impedir duplicar diferencias. Se cierra el corte obsoleto y se crea otro.
- No se permiten saldos negativos ni duplicar, revivir o anular automáticamente equipos ya vendidos o trasladados.
- Las rutas anteriores de ajuste directo quedan inhabilitadas. Sus solicitudes históricas se revisan mediante un corte nuevo o se cierran sin aplicar, conservando el registro.
- No se exponen costos del proveedor. Un costo de tienda ausente lo confirma administración; no se toma del precio sugerido ni se calcula un margen ficticio.
- Una diferencia se valora como movimiento de inventario. No genera automáticamente utilidad B2B, ganancia ocasional, cartera ni pago. Su eventual clasificación contable es una revisión distinta; no recalcula cierres financieros históricos.
- La carga inicial permanece retirada. No se modifica ningún inventario histórico por activar el módulo.
- Los archivos formato 1 se deben volver a descargar en formato 2 antes de subir. Los conteos ya enviados con la modalidad anterior no se convierten silenciosamente: se conservan y pueden cerrarse sin aplicar; una nueva revisión usa el corte fijo.

## Archivos anteriores de Móvil Shopping

Los dos Excel denominados “CORTE SEP 6” contienen fechas de descarga del **7 de septiembre de 2026, 09:10:41 y 09:11:32 (Colombia)**. El nombre del archivo no sustituye su fecha de corte ni identifica la hora real del conteo físico.

No pertenecen al nuevo formato `KORA-CONTEO-2`; se concilian de forma asistida, conservando su base original y los movimientos posteriores. No se han aplicado sus diferencias con este cambio. Antes de hacerlo falta confirmar que las cantidades entregadas están reconstruidas al corte y aclarar las filas adicionales, especialmente las 42 SIM Tigo y la referencia de cable sin correspondencia confirmada.

## Verificación

- Pruebas SQL con ambas migraciones: corte 100/reportado 100/actual 90 sin ajuste; corte 100/reportado 98/actual 97 deja 95; corte 250/reportado 499/actual 233 deja 482; ingresos posteriores, permisos, aislamiento, doble aplicación, costos y archivos incompletos.
- Prueba de navegador con descarga/subida de Excel combinado, comparación y autorización; escritorio y móvil.
- Ensayo transaccional contra el esquema productivo para las diez tiendas activas, revertido: no deja cortes ni cambios de stock.
- Pruebas de paginación de inventario por encima de 1.000 referencias. Historial con paginación por fecha e identificador; Kardex sin el antiguo límite de 300 movimientos.
