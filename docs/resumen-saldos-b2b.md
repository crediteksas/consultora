# Resumen de saldos B2B

Pantalla: `creditek/erp/resumen-saldos-b2b.html`. Solo consulta para Gerencia y Auditoría; no sustituye el dashboard de ventas ni crea movimientos.

## Fuentes y alcance

- Tiendas propias: `origenes` y `cuenta_corriente`, con el cálculo existente de `CreditekCuentaCorrienteDomain.calcularResumenPorTienda`. Cargos menos abonos aplicados de todo el historial, incluidos saldos iniciales. Las tiendas inactivas con movimientos siguen visibles.
- Clientes externos B2B: `v_cartera_clientes_b2b`, la misma fuente de Cartera clientes B2B. Esta vista comprende clientes y cuentas activos; al validar no existían clientes inactivos con saldo en `v_saldos_cartera`.
- Proveedores: `proveedores` y `facturas_proveedor.saldo`, igual que Proveedores y cartera. No se vuelven a restar pagos: ya están incluidos en el saldo. Proveedores inactivos con deuda siguen visibles.
- Diferencia: saldo neto de cartera menos saldo pendiente de proveedores. No es utilidad, efectivo disponible ni capital de trabajo completo: excluye inventario, caja, bancos y otras obligaciones.

Consulta actual, no un corte histórico ni compras del mes. La fecha indica cuándo se completó la lectura. Todas las consultas se paginan; un error invalida el resumen completo en vez de mostrar ceros o mezclar datos anteriores. Las búsquedas filtran únicamente su tabla y muestran subtotal; los indicadores mantienen el total general.

## Validación

Comparación de solo lectura con las fuentes en producción el 16 de septiembre de 2026: cartera tiendas 238.663.618; clientes 3.550.000; cartera total 242.213.618; proveedores 167.740.625; diferencia 74.472.993 COP. Estos importes son evidencia de la revisión, no valores incrustados en la aplicación. Sin facturas huérfanas ni saldos negativos de proveedor en esa consulta.

Pruebas: `tests/erp/resumen-saldos-b2b.test.mjs` y `tests/e2e/resumen-saldos-b2b-local.test.mjs`. Cubren conciliación, saldos a favor, inactivos, paginación, errores, permisos, búsqueda y presentación móvil. Las pruebas locales usan datos ficticios, no conexiones de producción.
