# ERP Creditek — Cartera, caja e inventario por costo tienda

**Fecha:** 24 de julio de 2026  
**Estado:** diseño aprobado en conversación; pendiente revisión del documento escrito  
**Base de trabajo:** `codex/erp-remisiones-seguridad`

## Objetivo

Cerrar las observaciones finales de Mayte y Andrea sin alterar la operación vigente:

- mostrar en inventario el costo que corresponde a la tienda;
- permitir que Auditoría verifique y aplique abonos;
- controlar por separado la cartera de tiendas con Creditek y la cartera de Creditek con proveedores;
- mover la deuda junto con la mercancía cuando un traslado es aceptado;
- corregir el cierre y la acumulación diaria de caja;
- completar el detalle de compras a proveedores;
- crear un libro de ventas con costo tienda y utilidad tienda;
- incorporar las ubicaciones administradas `CK-12 · Oscar` y `CK-13 · Luis`.

Quedan fuera de alcance Sofía, clientes, OTP, convenios, el histórico 2026 ya importado y el costo interno de Creditek visible para tiendas.

## Diagnóstico confirmado

1. `inventario.html` usa `costo_remision` y `costo_promedio` cuando el usuario es central, aunque Mayte necesita liquidar la existencia de una tienda usando `precio_tienda`.
2. Accesorios solo ofrece la casilla “Solo agotados”; no tiene el mismo selector de disponibilidad que celulares.
3. `cuenta-corriente.html` dibuja “Verificar” únicamente para Gerencia y `verificar_abono_y_aplicar(uuid)` también rechaza el rol Auditoría.
4. La cuenta corriente actual controla deuda de tienda, pero no registra la aplicación del dinero recibido a una factura de proveedor.
5. Los traslados mueven inventario, pero no crean el movimiento compensado de deuda entre tienda origen y destino.
6. `proveedores.html` lista facturas, pero no abre una compra con sus productos, cantidades, costos y soporte.
7. `compra-proveedor.html` declara dos veces `BUCKET_SOPORTES`; el error de sintaxis puede impedir la ejecución completa de la pantalla.
8. El cálculo web de caja usa `contado + iniciales - gastos`, pero no arrastra saldo de apertura. El cierre guardado muestra una diferencia de `-$1.000` cuando `623.000 - 1.504.000 = -881.000`, por lo que la función transaccional de cierre no conserva la misma fórmula.
9. La tienda puede cerrar con diferencia si escribe una nota. El negocio exige bloquearla y reservar la excepción para Auditoría o Gerencia.
10. No existe un libro de ventas accesible a tienda que detalle costo tienda y utilidad tienda sin revelar el costo interno de Creditek.

## Alternativas consideradas

### A. Corregir solo la interfaz

Cambiar etiquetas, agregar botones y recalcular la diferencia en JavaScript. Es rápido, pero no corrige saldos, permisos de base de datos, doble aplicación ni conciliación. Se descarta.

### B. Ampliar las tablas actuales sin un libro común

Agregar campos a abonos, traslados y facturas. Reduce trabajo inicial, pero duplica reglas de saldo y dificulta comprobar que tienda, proveedor y caja coincidan. Se descarta.

### C. Libro contable con referencias idempotentes

Mantener las tablas operativas existentes y añadir movimientos contables inmutables enlazados a cada operación. Las vistas calculan saldos desde esos movimientos y las funciones transaccionales crean todos los efectos relacionados una sola vez. Es la opción aprobada.

## Arquitectura

### 1. Cuentas y movimientos

Se añadirá un libro de movimientos con:

- `cuenta_tipo`: `tienda`, `proveedor` o `caja`;
- `cuenta_id`: código de tienda, UUID de proveedor o código de tienda para caja;
- `naturaleza`: `cargo` o `abono`;
- `monto`;
- `fecha_operacion`;
- `referencia_tipo` y `referencia_id`;
- `contrapartida_tipo` y `contrapartida_id`;
- usuario, nota y fecha de creación.

La combinación de cuenta, referencia y naturaleza será única. Una repetición de la misma función devolverá el resultado existente y no duplicará saldos.

Las tablas actuales seguirán disponibles durante la transición. Las vistas de cartera consolidarán el libro nuevo y los movimientos históricos ya conciliados.

### 2. Cartera de tiendas

- Una remisión aceptada o un traslado recibido aumenta la deuda de la tienda receptora por el costo tienda asignado.
- Un traslado aceptado disminuye la deuda de la tienda que entrega y aumenta, por el mismo valor, la deuda de quien recibe.
- Un abono verificado disminuye la deuda de la tienda.
- `CK-12 · Oscar` y `CK-13 · Luis` funcionarán como tiendas administradas. No tendrán usuarios de tienda; solo Auditoría y Gerencia podrán comprar, recibir, trasladar, vender o registrar abonos en su nombre.
- Bodega Central conserva su modelo actual y no se duplica como tienda.

El valor de un traslado será el costo tienda ya congelado en el artículo o lote. No se recalculará margen durante el traslado.

### 3. Cartera de proveedores

- Cada factura de compra aumenta la cuenta por pagar al proveedor.
- Al verificar un abono de tienda, Mayte elegirá un proveedor de destino o “Pendiente de asignar”.
- Una asignación a proveedor disminuirá el saldo de esa factura o proveedor y quedará enlazada al abono original.
- Una asignación no podrá superar el monto verificado ni el saldo de la factura elegida.
- “Pendiente de asignar” permitirá verificar el ingreso sin inventar un proveedor; Auditoría o Gerencia podrán asignarlo después.
- Un abono extraordinario podrá registrarse directamente en cartera de proveedor, con soporte y nota, sin afectar la deuda de una tienda.

La primera versión asignará un abono completo a un solo proveedor o lo dejará pendiente. No se implementarán divisiones parciales entre varios proveedores.

### 4. Flujo seguro de abonos

1. La tienda registra monto y soporte. El abono queda pendiente y no afecta saldo.
2. Auditoría o Gerencia abre el soporte.
3. Selecciona proveedor/factura o “Pendiente de asignar”.
4. Confirma.
5. Una función transaccional:
   - marca el abono como verificado;
   - disminuye la cartera de la tienda exactamente una vez;
   - registra la asignación a proveedor cuando exista;
   - registra la salida de caja de la tienda si el dinero provino de su caja física;
   - guarda quién y cuándo aprobó.

Los abonos históricos “aplicados antes del control” se conciliarán, no se volverán a aplicar.

### 5. Caja acumulada

Cada día tendrá:

- saldo de apertura;
- ventas de contado;
- cuotas iniciales;
- gastos aprobados;
- consignaciones o retiros verificados;
- efectivo esperado;
- efectivo contado;
- diferencia;
- aprobación excepcional, usuario y motivo.

La fórmula será:

`esperado = apertura + contado + iniciales - gastos - salidas verificadas`

El saldo de apertura será el efectivo contado del último cierre anterior. Si no existe cierre anterior, Auditoría o Gerencia debe registrar el saldo inicial.

Una tienda solo podrá cerrar con diferencia cero. Auditoría o Gerencia podrá autorizar una diferencia distinta de cero mediante una acción separada, motivo obligatorio y registro de auditoría. La función de base de datos recalculará todos los importes; nunca confiará en el valor enviado por la pantalla.

### 6. Inventario

Cuando se seleccione una tienda:

- “Valor asignado a tienda” cambiará a “Costo total tienda”.
- La tabla de celulares mostrará “Costo tienda”.
- La tabla de accesorios mostrará “Costo tienda unitario” y “Costo total tienda”.
- Los cálculos usarán `precio_tienda`.
- El costo interno Creditek quedará fuera de esta vista operativa. Continuará protegido y disponible en los paneles centrales de utilidad que correspondan.
- Accesorios tendrá el selector `Disponibles`, `Agotados` y `Todos`.

### 7. Proveedores y compras

- El encabezado “Número” será “Factura de compra”.
- Cada factura tendrá “Ver detalle”.
- El detalle mostrará proveedor, factura, fecha, productos, cantidades, costo unitario, subtotal, total, saldo, pagos aplicados, nota y soporte.
- La fila del proveedor y “Ver compras” abrirán el mismo panel de forma consistente.
- No se eliminarán automáticamente `FYPRUEBA3`, `FYPRUEBA4` ni otros datos de prueba. Se identificarán para una limpieza posterior autorizada.
- Se eliminará la declaración duplicada que rompe `compra-proveedor.html`.

### 8. Libro de ventas

Se añadirá una vista “Libro de ventas” con filtros de fecha y tienda:

- fecha y factura;
- producto;
- cantidad;
- costo tienda congelado;
- precio de venta;
- utilidad tienda;
- totales diarios.

Una tienda verá únicamente sus movimientos y su costo tienda. Auditoría y Gerencia podrán seleccionar cualquier tienda. El costo interno de Creditek no formará parte de la respuesta para perfiles de tienda.

Para ventas nuevas, el costo tienda se congelará al registrar la venta. Los registros anteriores solo se completarán cuando exista una fuente inequívoca; si no, mostrarán “Costo no disponible” en vez de inventar una cifra.

## Seguridad

- Todas las escrituras contables se harán mediante funciones `security definer` con `search_path` fijo y validación explícita del rol.
- Auditoría y Gerencia podrán verificar abonos, autorizar excepciones y administrar `CK-12`/`CK-13`.
- Admin de tienda podrá registrar solicitudes, cerrar únicamente con diferencia cero y consultar solo su tienda.
- Los movimientos contables serán inmutables para usuarios autenticados. Las correcciones usarán contramovimientos, nunca edición o borrado.
- Cada función verificará montos positivos, referencias existentes, saldos suficientes e idempotencia.
- Ninguna consulta de tienda incluirá costo interno Creditek.

## Migración y reversibilidad

1. Crear tablas, restricciones, vistas y funciones sin retirar las rutas actuales.
2. Sembrar `CK-12` y `CK-13` inactivas para ventas públicas, pero activas como ubicaciones administradas.
3. Conciliar movimientos históricos en una transacción de ensayo con `ROLLBACK`.
4. Comparar saldos actuales contra saldos reconstruidos por tienda y proveedor.
5. Activar la lectura del libro nuevo solo cuando las diferencias estén explicadas.
6. Desplegar la interfaz después de aplicar y probar las funciones.
7. Conservar las tablas actuales durante el periodo de estabilización para poder volver a la lectura anterior sin perder información.

No se corregirán cifras históricas automáticamente. Toda diferencia previa quedará señalada para revisión.

## Pruebas

### Unitarias

- inventario resume por tienda usando costo tienda;
- accesorios filtra disponibles, agotados y todos;
- caja arrastra apertura y calcula `623.000 - 1.504.000 = -881.000`;
- libro de ventas calcula utilidad tienda sin costo interno;
- proveedor agrupa una compra y abre su detalle.

### SQL transaccionales

- Auditoría y Gerencia verifican; admin de tienda no;
- doble confirmación no duplica movimientos;
- abono pendiente no cambia saldos;
- abono verificado reduce cartera de tienda;
- asignación reduce proveedor una sola vez;
- traslado aceptado mueve deuda con suma neta cero;
- cierre de tienda con diferencia falla;
- excepción central queda auditada;
- saldo de apertura proviene del último cierre;
- RLS impide a una tienda leer otra tienda o costo interno.

### Producción

- comparar conteos y sumas de inventario antes y después;
- comparar ventas, clientes, abonos, gastos y caja antes y después;
- verificar flujos con Gerencia, Mayte y una tienda;
- confirmar que Sofía, clientes, histórico 2026 y convenios no cambiaron;
- desplegar una versión candidata, revisar y luego activar.

## Criterios de aceptación

- Mayte puede verificar un abono y asignarlo a un proveedor.
- Ningún abono o traslado puede afectar dos veces una cartera.
- La suma del traslado entre cuentas de tiendas es cero.
- Una tienda no puede cerrar caja con diferencia.
- El cierre del ejemplo muestra esperado `$1.504.000` y diferencia `-$881.000`.
- La apertura del día siguiente conserva el efectivo del cierre anterior.
- Inventario por tienda muestra costo tienda y no costo interno Creditek.
- Proveedores permite abrir factura, líneas, soporte y pagos.
- Libro de ventas muestra costo y utilidad de la tienda.
- `CK-12 · Oscar` y `CK-13 · Luis` funcionan solo bajo administración central.
- Las pruebas existentes y nuevas pasan antes de cualquier publicación.
