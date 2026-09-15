# Conteos, ajustes e informes de inventario

Implementación: 15 de septiembre de 2026. Mismo módulo y mismas reglas de servidor para todas las tiendas propias activas; no hay habilitaciones por tienda piloto.

Continúa las reglas autorizadas por Gerencia el 12 de septiembre: el retiro de la carga inicial se conserva mediante la migración `20260912144724`, sin reabrir esas operaciones ni modificar registros históricos. La migración de conteos aplicada es `20260915162101`. Este informe cubre inventarios; no presupone que todos los demás módulos del sistema tengan sus informes completos.

## Flujo operativo

1. La tienda o administración abre **Inventario → Conteos, ajustes e informes**, selecciona la tienda y crea un corte.
2. El servidor guarda una fotografía fechada e identificada del disponible completo. Descarga un solo Excel con equipos individuales y accesorios por cantidad, sin depender de los filtros de la pantalla. El conteo ciego omite cantidades y costos.
3. Se completa cada cantidad física, incluso los ceros. Los accesorios no llevan IMEI; los equipos van individualmente. Los sobrantes se agregan con un código de catálogo válido. No se deben borrar filas, duplicar IMEI ni identificar artículos por coincidencia aproximada.
4. Al subir se declara cuándo se contaron esas cantidades: al corte o en una fecha posterior. Todas deben representar el mismo instante físico. Si se trabaja mientras se cuenta, se debe conciliar esa actividad antes de enviar el archivo.
5. El servidor conserva el nombre y SHA256 del archivo, filas, fecha física y responsable. Calcula diferencias sin modificar existencias. Queda **Pendiente de Mayte / Óscar**.
6. Únicamente las identidades activas verificadas de Mayte y Óscar pueden autorizar o cerrar sin aplicar. Se exige motivo, soporte/referencia documental y clasificación. El ajuste se registra a la hora de autorización, no retroactivamente a la fecha del corte.
7. La autorización aplica una vez la diferencia sobre el disponible actual. Registra entradas/salidas, valoración al costo de la tienda, antes/después y responsable. Un conteo sin diferencias también queda cerrado en el historial, sin movimientos artificiales.
8. El historial se consulta por fecha del corte, tienda y responsable. Su Excel incluye fechas de conteo y autorización, detalle completo, motivos, soporte y valoración. Kardex permite consultar y descargar los movimientos por fecha de registro.

## Ejemplo y fórmula

`diferencia = físico contado − sistema al momento del conteo`

`saldo después de autorizar = disponible actual + diferencia`

Si el sistema tenía 250 vidrios y se contaron 499 en ese corte, la diferencia es +249. Si luego se vendieron 17, el sistema actual tiene 233; aplicar +249 deja **482**, no 499.

Si los 499 se contaron *después* de esas 17 ventas, el sistema al contar era 233: diferencia +266 y resultado **499**. No se descuentan dos veces las ventas. Los ingresos posteriores también se conservan.

La trazabilidad usa cambios reales de disponibilidad registrados en el servidor después del corte. No puede deducir la hora física de ventas, recepciones o conteos que se registraron tarde. Tales discrepancias requieren revisión; no se corrigen inventando fechas.

## Controles

- Fotografía y aplicación protegidas frente a escrituras concurrentes de stock y unidades.
- Una tienda no puede leer, subir ni autorizar el conteo de otra. Ocultar botones no es el control: se valida también en servidor.
- Un ajuste posterior invalida cortes anteriores de esa tienda para impedir duplicar diferencias. Se cierra el corte obsoleto y se crea otro.
- No se permiten saldos negativos ni duplicar, revivir o anular automáticamente equipos ya vendidos o trasladados.
- Las rutas anteriores de ajuste directo quedan inhabilitadas. Sus solicitudes históricas se revisan mediante un corte nuevo o se cierran sin aplicar, conservando el registro.
- No se exponen costos del proveedor. Un costo de tienda ausente lo confirma administración; no se toma del precio sugerido ni se calcula un margen ficticio.
- Una diferencia se valora como movimiento de inventario. No genera automáticamente utilidad B2B, ganancia ocasional, cartera ni pago. Su eventual clasificación contable es una revisión distinta; no recalcula cierres financieros históricos.
- La carga inicial permanece retirada. No se modifica ningún inventario histórico por activar el módulo.

## Archivos anteriores de Móvil Shopping

Los dos Excel denominados “CORTE SEP 6” contienen fechas de descarga del **7 de septiembre de 2026, 09:10:41 y 09:11:32 (Colombia)**. El nombre del archivo no sustituye su fecha de corte ni identifica la hora real del conteo físico.

No pertenecen al nuevo formato `KORA-CONTEO-1`; se concilian de forma asistida, conservando su base original y los movimientos posteriores. No se han aplicado sus diferencias con este cambio. Antes de hacerlo falta confirmar la fecha física de las cantidades contadas y aclarar las filas adicionales, especialmente las 42 SIM Tigo y la referencia de cable sin correspondencia confirmada.

## Verificación

- Pruebas SQL con la migración real: casos 482/499, posteriores ingresos, faltantes, permisos, aislamiento, doble aplicación, costos y archivos incompletos.
- Prueba de navegador con descarga/subida de Excel combinado, comparación y autorización; escritorio y móvil.
- Ensayo transaccional contra el esquema productivo para las diez tiendas activas, revertido: no deja cortes ni cambios de stock.
- Pruebas de paginación de inventario por encima de 1.000 referencias. Historial con paginación por fecha e identificador; Kardex sin el antiguo límite de 300 movimientos.
