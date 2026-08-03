# Creditek Aliados — Motor de liquidaciones V1

## Alcance implementado

Motor local para importar archivos originales PayJoy y ALO Credit, conservarlos en el bucket privado existente `soportes`, normalizar operaciones, clasificar establecimientos con `origenes`, resolver ejecutivos desde el maestro vigente, aplicar políticas versionadas, calcular liquidaciones de aliados, registrar bonos, generar pagos, controlar revisión/aprobación, auditar y publicar eventos internos seguros.

No se aplicó la migración, no se usó producción, no se enviaron mensajes y no se generaron archivos Excel.

## Reutilización

- `origenes`: establecimiento y sede; `tipo='aliado'` identifica aliados.
- `origenes.ejecutivo_id` y `ejecutivos`: asignación vigente.
- `perfiles`: identidad autenticada.
- `audit_log`: auditoría económica.
- Storage privado `soportes`: originales y soportes de pagos.
- Shell, sidebar, tipografías, tablas, tarjetas y controles actuales de KORA.

## Persistencia nueva

La migración crea solo entidades específicas de liquidación: operadores, plataformas, liquidaciones, archivos, filas fuente, operaciones, políticas versionadas, cálculos, beneficiarios/cuentas, bonos, incidencias, órdenes/ítems de pago, aprobaciones, ajustes y eventos de dominio.

## Seguridad

`aliados_operadores` asigna capacidades por UUID verificado: `revisor` o `aprobador`. El aprobador hereda revisión. No se autoriza por nombre o correo. Maite debe registrarse como revisora y Óscar como aprobador antes de staging. RLS, RPC y Storage consultan esta tabla.

## Política inicial

El 77 % se registra mediante `aliados_seed_politica_inicial(fecha)`, ejecutado por el aprobador autenticado. Crea versiones independientes para PayJoy y ALO con snapshot inmutable por cálculo. No vive en el motor JavaScript.

## Política ALO Aliados aprobada

La versión inicial de la política ALO Aliados usa `monto_credito` como base liquidable. `monto_total`, cantidad de accesorios y valor de accesorios se conservan por separado como datos originales y visibles, pero los accesorios no entran en la base del 77 %.

La conciliación histórica queda certificada en: base liquidable $3.257.600; inicial $814.400; base 77 % $2.508.352; pago neto $1.693.952; bonos $100.000; utilidad Creditek $1.463.648; total a girar $1.793.952. Una inclusión futura de accesorios requiere una nueva versión de política con vigencia hacia adelante.

## Aplicación y rollback

1. Restaurar una copia aislada del esquema de desarrollo.
2. Verificar que el bucket privado `soportes` existe.
3. Aplicar `20260802_creditek_aliados_liquidaciones_v1.sql`.
4. Insertar los UUID verificados de Maite y Óscar en `aliados_operadores`.
5. Óscar ejecuta `aliados_seed_politica_inicial` con la fecha aprobada.
6. Repetir la migración y comparar objetos/conteos para certificar idempotencia.
7. Para rollback sin operaciones, ejecutar el archivo correspondiente. Si existen liquidaciones, el rollback se bloquea deliberadamente para no borrar históricos; debe conservarse la estructura o migrar/exportar los datos mediante procedimiento aprobado.
