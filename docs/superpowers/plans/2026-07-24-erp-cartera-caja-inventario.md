# ERP Creditek: cartera, caja e inventario — plan de implementación

> **Ejecución:** aplicar este plan en una rama y un worktree aislados. Ejecutar cada cambio con prueba roja, implementación mínima y prueba verde. No tocar Sofía, clientes, OTP, convenios ni la importación histórica de ventas.

**Objetivo:** corregir los hallazgos de Mayte y Andrea sin interrumpir el ERP actual: costos visibles correctos, cartera contable trazable, abonos verificables por Auditoría, deuda en traslados, compras detalladas, caja acumulada y libro de ventas por tienda.

**Arquitectura:** mantener las tablas operativas existentes y añadir un libro mayor inmutable e idempotente. Las operaciones críticas se harán mediante RPC `security definer`, con autorización por rol dentro de PostgreSQL, bloqueo de filas y referencias únicas. Las páginas HTML seguirán siendo clientes delgados; cálculos y presentación testeables vivirán en módulos `*-domain.js`.

**Tecnologías:** HTML/JavaScript sin framework, Node test runner, Supabase/PostgreSQL, Cloudflare Workers/Wrangler.

---

## Preparación segura

### Tarea 1: aislar y establecer línea base

**Archivos:** ninguno.

- [ ] Crear la rama `codex/erp-cartera-caja-integrada` en `.worktrees/erp-cartera-caja-integrada` desde el commit que contiene esta especificación y este plan.
- [ ] Confirmar que `.worktrees/` está ignorado por Git.
- [ ] Instalar dependencias solo si `node_modules` no existe.
- [ ] Ejecutar `npm test` y guardar el número exacto de pruebas aprobadas. Si una prueba en vivo falla únicamente por red restringida, repetirla con acceso de red; no aceptar fallos funcionales.
- [ ] Ejecutar `npm run build` y comprobar que `scripts/verify-public-artifact.mjs` no detecta secretos ni archivos fuera de la lista permitida.

Comandos:

```bash
git check-ignore -q .worktrees
git worktree add .worktrees/erp-cartera-caja-integrada -b codex/erp-cartera-caja-integrada
cd .worktrees/erp-cartera-caja-integrada
npm test
npm run build
```

Resultado esperado: rama aislada, conjunto base en verde y artefacto público válido.

---

## Inventario visible para tiendas

### Tarea 2: mostrar el costo de tienda y filtrar accesorios por disponibilidad

**Archivos:**

- Modificar: `creditek/erp/inventario-domain.js`
- Modificar: `creditek/erp/inventario.html`
- Modificar: `tests/erp/inventario-domain.test.mjs`

- [ ] Añadir primero pruebas que demuestren que una tienda ve `precio_tienda`, nunca `costo_remision` ni `costo_promedio`, y que Bodega Central conserva su información administrativa separada.
- [ ] Añadir pruebas para `filtrarStockPorDisponibilidad(filas, estado)`, con estados `disponibles`, `agotados` y `todos`; `cantidad > 0` es disponible y `cantidad === 0` es agotado.
- [ ] Ejecutar `node --test tests/erp/inventario-domain.test.mjs` y comprobar que las nuevas pruebas fallan por la función/interfaz aún inexistente.
- [ ] Implementar la función pura y reemplazar la casilla `chkAgotados` por un selector de tres opciones.
- [ ] En contexto tienda, rotular el valor como `Costo para la tienda`; ocultar por completo el costo interno de Creditek. En contexto central, mantener ambos valores con permisos actuales.
- [ ] Ejecutar de nuevo la prueba específica y después `npm test`.
- [ ] Commit: `fix: corregir costo y disponibilidad de inventario`

Resultado esperado: Cellfiao y las demás tiendas ven únicamente el valor que realmente adeudan a Creditek, y los accesorios se pueden consultar disponibles, agotados o todos.

---

## Libro mayor y puntos centrales

### Tarea 3: crear la base contable inmutable y CK-12/CK-13

**Archivos:**

- Crear: `creditek/erp/migrations/20260724_cartera_integrada_prepare.sql`
- Crear: `creditek/erp/tests/smoke_test_cartera_integrada.sql`

- [ ] Escribir primero un smoke test transaccional que falle porque todavía no existen:
  - `cuentas_cartera`;
  - `movimientos_cartera`;
  - `v_saldos_cartera`;
  - los orígenes `CK-12` (`Oscar`) y `CK-13` (`Luis`).
- [ ] El test debe comprobar débitos, créditos, saldo, rechazo de montos no positivos, inmutabilidad y duplicado idempotente por `(referencia_tipo, referencia_id, efecto, cuenta_id)`.
- [ ] Implementar `cuentas_cartera` con tipos `tienda`, `proveedor` y `caja`.
- [ ] Implementar `movimientos_cartera` append-only con `efecto` (`debito`/`credito`), monto positivo, referencia, fecha efectiva, creador y metadatos JSON.
- [ ] Añadir triggers que rechacen `UPDATE` y `DELETE`; una corrección se registra como contrapartida.
- [ ] Crear `v_saldos_cartera`, donde saldo = débitos − créditos.
- [ ] Activar RLS. Tiendas solo leen su propia cuenta; `gerencia` y `auditoria` leen todas; ninguna escritura directa se concede a `authenticated`.
- [ ] Insertar o actualizar idempotentemente los orígenes `CK-12` y `CK-13` como ubicaciones activas administradas por central, sin crear usuarios de tienda.
- [ ] Dar a `gerencia` y `auditoria` acceso operativo a estas dos ubicaciones sin convertirlas en Bodega Central.
- [ ] Ejecutar el smoke dentro de `BEGIN ... ROLLBACK`, después `npm test`.
- [ ] Commit: `feat: crear libro mayor de cartera`

Contrato de datos principal:

```sql
unique (cuenta_id, referencia_tipo, referencia_id, efecto)
check (monto > 0)
check (efecto in ('debito', 'credito'))
check (tipo_cuenta in ('tienda', 'proveedor', 'caja'))
```

Resultado esperado: existe una fuente única y auditable para saldos, sin reescribir movimientos históricos.

---

## Abonos y pagos a proveedores

### Tarea 4: permitir verificación por Auditoría y asignación a una factura

**Archivos:**

- Crear: `creditek/erp/cartera-domain.js`
- Crear: `tests/erp/cartera-domain.test.mjs`
- Crear: `creditek/erp/migrations/20260724_cartera_integrada_abonos.sql`
- Modificar: `creditek/erp/cuenta-corriente.html`
- Modificar: `creditek/erp/tests/smoke_test_cartera_integrada.sql`

- [ ] Escribir pruebas JS para permisos de botones, etiquetas de estado y construcción del payload. `auditoria` y `gerencia` pueden verificar; `tienda` no.
- [ ] Escribir pruebas SQL que cubran: abono pendiente, verificación una sola vez, reducción de deuda de tienda, asignación opcional a una factura, reducción de deuda al proveedor y salida de caja cuando el soporte confirma pago físico.
- [ ] Comprobar que las pruebas fallan con la función actual, que solo admite `gerencia`.
- [ ] Crear `verificar_abono_y_aplicar_v2(p_abono_id uuid, p_factura_proveedor_id uuid default null, p_registrar_salida_caja boolean default true)`.
- [ ] Validar dentro del RPC: rol `gerencia` o `auditoria`, estado pendiente, tienda activa, factura válida y con saldo cuando se indique, y consistencia del monto.
- [ ] Bloquear el abono y las cuentas implicadas; escribir los movimientos idempotentes y marcar el abono verificado en la misma transacción.
- [ ] Si no se elige factura, registrar `Pendiente de asignar` sin disminuir ninguna cuenta de proveedor.
- [ ] Revocar ejecución pública y anónima; concederla solo a `authenticated`, manteniendo la autorización real dentro de la función.
- [ ] Cambiar `cuenta-corriente.html` para que Mayte vea `Verificar`, elija una factura o `Pendiente de asignar` y confirme si el dinero salió de caja física.
- [ ] Mantener temporalmente el RPC antiguo para compatibilidad, pero retirar su uso de la interfaz.
- [ ] Ejecutar las pruebas JS, el smoke SQL y `npm test`.
- [ ] Commit: `feat: integrar abonos con cartera y proveedores`

Resultado esperado: Mayte puede revisar y aplicar abonos con trazabilidad completa, sin dobles aplicaciones y sin perder pagos aún no asignados.

---

## Traslados y deuda entre tiendas

### Tarea 5: mover la deuda al aceptar un traslado

**Archivos:**

- Crear: `creditek/erp/migrations/20260724_cartera_traslados.sql`
- Modificar: `creditek/erp/tests/smoke_test_cartera_integrada.sql`
- Modificar: `tests/erp/traslados.test.mjs` si el archivo existe; de lo contrario crear `tests/erp/traslados-cartera.test.mjs`

- [ ] Añadir una prueba SQL con tienda origen, tienda destino y dos artículos a valores de tienda congelados.
- [ ] Comprobar que antes de la recepción no cambia la cartera; al aceptar, el origen recibe un crédito y el destino un débito por el mismo total; un segundo intento no duplica movimientos.
- [ ] Comprobar cancelación/rechazo sin efecto contable.
- [ ] Envolver o reemplazar de forma compatible `ejecutar_traslado_recepcion(p_traslado_id)` para calcular el total desde las líneas aceptadas usando el `precio_tienda` ya asignado, nunca el costo interno.
- [ ] Escribir ambos movimientos dentro de la misma transacción que cambia inventario y estado del traslado.
- [ ] Usar como referencia única el traslado y como metadatos los códigos de origen/destino.
- [ ] Ejecutar el smoke, la prueba JS asociada y `npm test`.
- [ ] Commit: `feat: trasladar deuda con el inventario`

Resultado esperado: aceptar un traslado disminuye exactamente la deuda del origen y aumenta la del destino; el total de Creditek no cambia.

---

## Compras y detalle de facturas

### Tarea 6: mostrar el detalle real de cada compra a proveedor

**Archivos:**

- Crear: `creditek/erp/proveedores-domain.js`
- Crear: `tests/erp/proveedores-domain.test.mjs`
- Crear: `creditek/erp/migrations/20260724_proveedores_detalle.sql`
- Modificar: `creditek/erp/proveedores.html`
- Modificar: `creditek/erp/compra-proveedor.html`
- Modificar: `creditek/erp/tests/smoke_test_cartera_integrada.sql`

- [ ] Añadir una prueba que detecte la declaración duplicada `const BUCKET_SOPORTES`, actualmente capaz de impedir que cargue la página de compras.
- [ ] Añadir pruebas de presentación para cabecera, líneas, cantidades, costo unitario, subtotal, pagos, saldo, nota y soporte.
- [ ] Añadir al smoke una compra con producto serializado y producto por cantidad.
- [ ] Antes de crear el RPC, ejecutar una auditoría de esquema con `information_schema.columns` y `pg_get_functiondef` para confirmar el contrato de `facturas_proveedor`, `unidades`, `movimientos`, `stock_cantidad_lotes` y `registrar_compra_proveedor`; detener la migración si faltan las relaciones ya usadas por `20260724_inventario_lotes_factura.sql`.
- [ ] Crear `obtener_detalle_factura_proveedor(p_factura_id uuid)` para devolver:
  - cabecera desde `facturas_proveedor` y `proveedores`;
  - líneas serializadas agrupadas desde `unidades.factura_proveedor_id`;
  - líneas por cantidad desde movimientos `compra_entrada`/`stock_cantidad_lotes`;
  - pagos desde `movimientos_cartera`;
  - saldo calculado.
- [ ] Limitar el RPC a `gerencia` y `auditoria`; no exponer costos de proveedor a tiendas.
- [ ] Eliminar la declaración duplicada de `BUCKET_SOPORTES`.
- [ ] Reemplazar la lista-resumen de `Ver compras` por un detalle expandible con soporte y pagos.
- [ ] Ejecutar pruebas JS, smoke SQL, una validación sintáctica del script embebido y `npm test`.
- [ ] Commit: `feat: detallar compras y saldos de proveedor`

Resultado esperado: cada factura permite explicar qué se compró, cuánto costó, cuánto se pagó y cuánto falta, sin filtrar información interna a tiendas.

---

## Caja acumulada y cierre seguro

### Tarea 7: corregir fórmula, arrastre y cierre excepcional

**Archivos:**

- Modificar: `creditek/erp/caja-domain.js`
- Modificar: `tests/erp/caja-domain.test.mjs`
- Crear: `creditek/erp/migrations/20260724_caja_acumulada.sql`
- Modificar: `creditek/erp/caja.html`
- Crear: `creditek/erp/tests/smoke_test_caja_acumulada.sql`

- [ ] Escribir primero la regresión exacta del documento: esperado `$1.504.000`, físico `$623.000`, diferencia `-$881.000`.
- [ ] Añadir pruebas para:
  - apertura igual al último cierre físico anterior;
  - ventas de contado y cuotas iniciales como entradas;
  - gastos y salidas verificadas como egresos;
  - tienda bloqueada con diferencia distinta de cero;
  - `auditoria`/`gerencia` autorizando excepción con motivo obligatorio.
- [ ] Ejecutar `node --test tests/erp/caja-domain.test.mjs` y observar el fallo de la fórmula actual, que no incluye apertura.
- [ ] Implementar `calcularCuadre({ apertura, contado, iniciales, gastos, salidasVerificadas, efectivoFisico })`.
- [ ] Crear `obtener_cuadre_caja(p_tienda_codigo text, p_fecha date)` y `cerrar_caja_segura(p_tienda_codigo text, p_fecha date, p_efectivo_fisico numeric, p_nota text default null, p_autorizar_diferencia boolean default false)`.
- [ ] La apertura debe salir del último cierre anterior de esa tienda; si no existe, usar cero o la apertura inicial registrada explícitamente.
- [ ] Bloquear por tienda/fecha, recalcular en servidor y no confiar en totales enviados por navegador.
- [ ] Rechazar diferencias para rol tienda. Admitir excepción solo a `gerencia`/`auditoria`, con motivo no vacío y registro de usuario/fecha.
- [ ] Mantener lectura compatible del historial de cierres existentes; la página nueva usa exclusivamente los RPC seguros.
- [ ] Cambiar `caja.html` para mostrar apertura, entradas, egresos, esperado, físico y diferencia; separar el botón normal del flujo excepcional.
- [ ] Ejecutar pruebas JS, smoke SQL y `npm test`.
- [ ] Commit: `fix: asegurar cierre y arrastre de caja`

Resultado esperado: el valor esperado y la diferencia coinciden con la operación real, y una tienda no puede ocultar un descuadre.

---

## Libro de ventas por tienda

### Tarea 8: congelar el costo de tienda y calcular utilidad comercial

**Archivos:**

- Crear: `creditek/erp/libro-ventas-domain.js`
- Crear: `tests/erp/libro-ventas-domain.test.mjs`
- Crear: `creditek/erp/migrations/20260724_libro_ventas_tienda.sql`
- Crear: `creditek/erp/libro-ventas.html`
- Modificar: `creditek/erp/sidebar.js`
- Crear: `creditek/erp/tests/smoke_test_libro_ventas.sql`

- [ ] Añadir pruebas de cálculo por línea: `utilidad_tienda = precio_venta - costo_tienda_congelado`, multiplicada por cantidad cuando aplique.
- [ ] Añadir pruebas que impidan incluir `costo_remision`, `costo_oscar`, costo de proveedor o margen interno en columnas/payload de tienda.
- [ ] En el smoke, crear una venta y luego cambiar el precio actual del producto; comprobar que el libro conserva el costo congelado del momento de la venta.
- [ ] Auditar las columnas reales de ventas/ítems y añadir `costo_tienda_congelado` a la línea de venta que representa el artículo, sin reemplazar históricos existentes.
- [ ] Crear trigger para futuras ventas que tome `precio_tienda` de la unidad/lote que realmente se vende.
- [ ] Para históricos sin trazabilidad inequívoca, dejar el costo como `null` y estado `requiere_revision`; no inventar márgenes.
- [ ] Crear `consultar_libro_ventas(p_desde date, p_hasta date, p_tienda_codigo text default null)` con RLS/rol: tienda solo la propia; central todas.
- [ ] Crear la página con filtros, totales de costo de tienda, ventas y utilidad. Central puede elegir tienda; tienda no.
- [ ] Añadir entrada `Libro de ventas` al menú autorizado.
- [ ] Ejecutar pruebas JS, smoke SQL y `npm test`.
- [ ] Commit: `feat: agregar libro de ventas por tienda`

Resultado esperado: cada tienda conoce su ganancia real por venta sin acceder a costos internos de Creditek.

---

## Integración, migración y despliegue

### Tarea 9: activar reglas y validar datos existentes

**Archivos:**

- Crear: `creditek/erp/migrations/20260724_cartera_integrada_enforce.sql`
- Crear: `creditek/erp/tests/reconcile_cartera_integrada.sql`
- Modificar: `docs/DEPLOY.md`

- [ ] Ejecutar en staging/producción solo las migraciones `prepare`, `abonos`, `traslados`, `proveedores`, `caja`, `libro_ventas` y finalmente `enforce`, en ese orden.
- [ ] Antes de `enforce`, ejecutar conciliación de:
  - total deuda tiendas antes/después;
  - total facturas proveedores frente a pagos;
  - traslados aceptados frente a pares contables;
  - cierres de caja existentes;
  - ventas históricas con/sin costo trazable.
- [ ] La conciliación debe emitir filas de excepción sin modificar datos. Cualquier diferencia no explicada bloquea `enforce`.
- [ ] En `enforce`, retirar permisos de RPC antiguos que permitan saltarse las nuevas reglas y conservar wrappers compatibles únicamente cuando deleguen al flujo seguro.
- [ ] Ejecutar todos los smoke tests dentro de transacciones con rollback.
- [ ] Ejecutar `npm test`, `npm run build` y `wrangler deploy --dry-run`.
- [ ] Commit: `chore: activar controles integrados del ERP`

Resultado esperado: reglas del servidor activas, saldos conciliados y reversión posible antes de publicar.

### Tarea 10: desplegar y hacer prueba operativa controlada

**Archivos:** ninguno, salvo correcciones surgidas de pruebas.

- [ ] Crear una versión de respaldo/verificar versión actual de Cloudflare antes de publicar.
- [ ] Publicar el Worker desde el commit verificado.
- [ ] Probar en producción, con datos de prueba identificables:
  - inventario de tienda y selector de accesorios;
  - abono creado por tienda y verificado por Mayte;
  - abono asignado y no asignado;
  - traslado entre dos tiendas y efecto neto cero;
  - detalle de una factura real;
  - caja con diferencia bloqueada y excepción administrativa;
  - libro de ventas sin costo interno.
- [ ] Confirmar que CK-12 Oscar y CK-13 Luis son administrables por Mayte/Gerencia y no tienen usuario propio.
- [ ] Revisar logs de Cloudflare y Supabase después de la prueba.
- [ ] Eliminar solo los datos de prueba creados por esta ejecución mediante contrapartidas o rollback previsto; no borrar FYPRUEBA3/FYPRUEBA4 ni datos anteriores.
- [ ] Entregar al usuario: URL, commit desplegado, migraciones aplicadas, pruebas aprobadas, saldos conciliados y cualquier histórico marcado `requiere_revision`.

Comandos finales:

```bash
npm test
npm run build
npx wrangler deploy --dry-run
npm run deploy
git status --short
```

Resultado esperado: ERP publicado sin interrupción, con verificación funcional y financiera documentada.

---

## Criterios de terminación

- Todas las pruebas automatizadas y smoke tests SQL pasan.
- El build público no contiene secretos ni archivos no autorizados.
- Los roles de tienda no pueden ver costos internos ni ejecutar cierres excepcionales.
- Auditoría y Gerencia pueden verificar abonos, administrar CK-12/CK-13 y autorizar excepciones trazables.
- Cada operación financiera crítica es atómica e idempotente.
- La suma de deuda transferida conserva efecto neto cero.
- El ejemplo de caja produce exactamente `$1.504.000`, `$623.000` y `-$881.000`.
- No se modificaron Sofía, clientes, OTP, convenios ni la carga histórica de ventas.
