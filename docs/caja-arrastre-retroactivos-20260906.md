# Caja: movimientos registrados después del cierre

Autorización: Oscar solicitó corregir la lógica para todas las tiendas, hacer commit y desplegar. El 6 de septiembre autorizó expresamente omitir la revisión de Claude para este arreglo.

## Causa y alcance

La validación de una consignación ya crea una sola salida de efectivo y un abono de cartera. Si su fecha estaba cerrada, Caja tomaba el contado del último cierre posterior sin incorporar esa salida. Móvil Shopping tenía dos salidas, por $1.000.000 y $500.000, con fecha 3 de septiembre y registradas el 6. El saldo automático del 6 seguía en $5.202.900.

La comprobación previa de todos los cierres encontró una única diferencia de componentes de movimientos: CK-02, 3 de septiembre, -$1.500.000. No se corrigen importes por nombre de tienda ni mediante un descuento fijo.

## Solución común

`calcular_efectivo_esperado_tienda` compara, para la tienda consultada, el neto de los movimientos de cada fecha cerrada con los componentes guardados al cerrar esa fecha. La apertura incluye únicamente la diferencia que no se haya incorporado ya en el cierre anterior.

Cada cierre nuevo guarda `arrastre_movimientos_incorporado`. Esto evita descontar de nuevo el mismo movimiento después de cerrar o al volver a consultar. La comparación usa los componentes realmente calculados y guardados, no supone que `created_at` coincida con el momento del commit de una transacción.

Fórmula: contado del último cierre + diferencia acumulada actual de movimientos − diferencia que ese cierre ya había incorporado.

La página identifica el ajuste de días anteriores y separa el esperado actualizado del registro del cierre original. La distinción también aparece en el consolidado y el texto para compartir.

## Conservación y controles

- No se insertan, actualizan ni eliminan abonos, movimientos de caja, cartera, pagos o comprobantes.
- No se modifican los valores, responsables, fechas ni notas de los cierres existentes.
- Los abonos sin afectación de efectivo continúan sin descontarse de Caja.
- La autorización por rol y tienda permanece; no se otorga ejecución anónima.
- Los cierres conservan validación de diferencia cero e idempotencia.
- No se incluyen créditos financiados como efectivo de tienda.
- No se cambia la lógica de precios, liquidaciones, inventario, Sofía ni AURA.

## Verificación reproducible

`node --test tests/erp/caja-arrastre-retroactivos.test.mjs` ejecuta la migración PL/pgSQL real en PostgreSQL aislado con PGlite 0.5.8, fijado como dependencia solo de desarrollo. Primero reproduce el saldo erróneo con la función anterior y luego prueba el arreglo, nuevos cierres, nuevas salidas tardías, ingresos, idempotencia, precisión decimal y aislamiento de roles/tiendas. Está incluido en `npm run test:local`.

Caso de referencia del 6 de septiembre: $4.490.900 − $1.500.000 + $712.000 = $3.702.900. Es saldo calculado, no certificación de un arqueo físico. El contado histórico $5.202.900 se conserva como registro original.

Pruebas previas a publicar: 267 pruebas del pipeline local aprobadas, seis pruebas adicionales de dominio/utilidad y una prueba de navegador del componente real a 390, 768 y 1280 píxeles. La prueba de navegador usa datos sintéticos y comprueba que etiquetas e importes no se superponen; la validación de producción se realiza por separado. Compilación con la configuración del publicador y verificación del artefacto KORA aprobadas.

La revisión de dependencias identificó siete avisos preexistentes, ninguno asociado a PGlite. No se ejecutó actualización masiva de dependencias por ser ajena al arreglo.

## Publicación y reversión

Migración instalada en Supabase: `supabase/migrations/20260906191354_caja_arrastre_movimientos_retroactivos.sql`. El nombre local coincide con el identificador asignado al aplicarla.

Validación productiva del 6 de septiembre: Caja recargada en la sesión autenticada muestra $3.702.900 para Móvil Shopping; las otras nueve tiendas del consolidado no cambiaron. Las huellas antes/después coinciden exactamente para los cinco cierres (excluyendo la nueva columna), dos movimientos de caja, dos abonos y 23 movimientos de cuenta corriente. Respaldo de funciones y huellas: `/private/tmp/kora-caja-respaldo-S5JqHB`.

La comprobación de seguridad confirma que anónimos no pueden ejecutar las dos funciones. El aviso de Supabase sobre funciones `SECURITY DEFINER` accesibles a usuarios autenticados corresponde al diseño existente e intencional: ambas validan usuario activo, rol y tienda antes de operar. No se amplió acceso. Referencia: [aviso 0029 de Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Al instalar la migración, el frontend continúa pendiente de publicación: el pipeline completo también incluiría el directorio «Clientes y cuentas» del commit `58ae9b9`, aún no desplegado. Se solicitó autorización expresa para incluir ese alcance; no se ha publicado silenciosamente.

El frontend se publica solo por el pipeline `deploy:kora:production`, que construye, valida y comprueba hashes y permite rollback de la versión del Worker. Antes de migrar se respalda la definición real de ambas funciones y una huella de los registros financieros involucrados. Si fuera necesario revertir la base, deben revisarse primero los cierres creados con la nueva marca de arrastre: volver ciegamente al cálculo antiguo recuperaría el error. No se debe quitar la columna ni alterar cierres para hacer rollback.
