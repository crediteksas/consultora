# KORA-2026-000014 — Instrucciones de consignación y destino bancario

## Alcance

Corregir el flujo de abonos para que la cuenta destino sea definida previamente
por Maythe mediante una instrucción administrativa. La tienda no selecciona ni
modifica el banco, la cuenta, el tipo de destino, el proveedor ni el valor
esperado. No se modifica la navegación, el layout, los estilos ni módulos ajenos.

Oscar conserva control total. Maythe es la operadora habitual para crear,
aprobar y rechazar. La tienda solo consulta instrucciones de su tienda, confirma
el valor consignado y adjunta el comprobante.

## Modelo de datos

Se incorporan tres entidades de proceso, sin crear una contabilidad paralela:

1. `instrucciones_consignacion`: conserva el snapshot inmutable de tienda,
   fecha, banco, número de cuenta, valor esperado, tipo `PROVEEDOR` u `OSCAR`,
   proveedor interno opcional, estado y auditoría.
2. `comprobantes_consignacion`: conserva cada evidencia enviada, valor
   confirmado, versión, estado, decisión y auditoría. Los intentos rechazados no
   se sobrescriben.
3. `aplicaciones_consignacion_proveedor`: vincula una instrucción validada con
   cada pago aplicado a una factura para hacer visible el reparto FIFO.

Las operaciones contables continúan en las entidades existentes:

- `cuenta_corriente`: abono único a la cartera de la tienda.
- `abonos`: registro y soporte del abono validado.
- `pagos_proveedor` y `facturas_proveedor`: afectación FIFO para PROVEEDOR.
- `movimientos_caja_tienda`: salida de efectivo de la tienda.
- `movimientos_tesoreria_central`: salida interna B2B para OSCAR.

Los abonos históricos siguen consultándose aunque no tengan instrucción ni
cuenta destino.

## Flujo

### Creación

Maythe u Oscar selecciona tienda, fecha, banco, cuenta, valor esperado, tipo de
destino y proveedor cuando el tipo es PROVEEDOR. Varias instrucciones pueden
compartir tienda y fecha, permitiendo dividir el efectivo disponible.

La creación valida que la suma pendiente de instrucciones no exceda el efectivo
disponible confirmado de la tienda. Cada instrucción queda en estado `pendiente`.

### Envío de comprobante

La tienda ve únicamente banco, cuenta, fecha, valor esperado y estado de sus
instrucciones. Confirma el valor realmente consignado y carga una fotografía.
El servidor crea una versión de comprobante y cambia la instrucción a
`en_validacion`. La tienda no puede alterar el snapshot.

### Decisión

Maythe u Oscar puede aprobar o rechazar. La aprobación se ejecuta mediante una
única función transaccional, con bloqueo de fila y llave de idempotencia:

- crea una sola salida en `movimientos_caja_tienda`;
- crea un solo `abono` y un solo movimiento en `cuenta_corriente`;
- para PROVEEDOR, aplica el valor a facturas con saldo del proveedor ordenadas
  por `fecha`, luego `created_at` e `id`, de la más antigua a la más nueva;
- para OSCAR, no toca proveedores y crea una salida interna vinculada en
  `movimientos_tesoreria_central`;
- marca la instrucción y el comprobante como validados.

Si el valor confirmado difiere del esperado, la aprobación se bloquea. La
operadora debe rechazar para que la tienda envíe una nueva versión.

Un rechazo no produce efectos contables y conserva la evidencia. La instrucción
queda `rechazada` hasta un nuevo envío permitido.

## Cartera de proveedores

La vista existente de Cartera de Proveedores mantiene su estructura. En el
detalle de factura se muestra el origen de cada pago proveniente de una
instrucción y la secuencia FIFO aplicada. Oscar y Maythe pueden consultar el
reparto completo por proveedor y factura.

## Cuenta Corriente

La pantalla existente incorpora únicamente los campos y acciones necesarios:

- central: efectivo disponible por tienda, creación de instrucciones y revisión;
- tienda: instrucciones propias, banco, cuenta, valor, fecha, comprobante y
  estado `pendiente`, `validado` o `rechazado`;
- historial: los movimientos anteriores sin cuenta destino muestran `—`.

La tienda no recibe proveedor, clasificación interna, gasto OSCAR ni información
de cartera B2B en las respuestas del servidor.

## Seguridad

RLS y funciones `security definer` aplican estas reglas:

- tienda: solo lectura de proyección segura de instrucciones propias y creación
  de comprobantes mediante RPC;
- Maythe (`auditoria`) y Oscar (`gerencia`): lectura interna, creación y decisión;
- solo Oscar y Maythe pueden aprobar o rechazar;
- las tablas internas no permiten escritura directa a usuarios autenticados;
- el storage de comprobantes exige pertenencia a una instrucción visible;
- las funciones verifican perfil activo, tienda, estado, monto e idempotencia.

## Pruebas

Se validan:

1. varias instrucciones para una tienda el mismo día;
2. destino PROVEEDOR con reparto FIFO;
3. destino OSCAR sin afectación de proveedor;
4. abono único a cartera y salida única de efectivo;
5. visibilidad segura por perfil;
6. comprobante rechazado sin efectos contables;
7. aprobación duplicada sin duplicar movimientos;
8. Cuenta Corriente con banco y cuenta;
9. abonos históricos sin destino;
10. Cartera de Proveedores con trazabilidad FIFO.

## Despliegue

La migración se aplica primero en el proyecto Supabase autorizado. Luego se
publican únicamente la migración y los archivos de Cuenta Corriente y Cartera de
Proveedores que resulten modificados. Se verifica producción con los perfiles de
tienda, Maythe y Oscar, sin crear datos operativos reales.
