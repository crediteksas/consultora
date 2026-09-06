# Clientes con varios locales y cuenta compartida — 6 de septiembre de 2026

## Alcance autorizado y ejecutado

Oscar autorizó expresamente habilitar el modelo para todos los aliados y agrupar
los siete locales indicados para futuras liquidaciones. La autorización se recibió
después de que el control automático solicitara aclarar el alcance financiero.

Migración instalada: `20260906213857_clientes_multilocal_cuenta_compartida`.
Cliente → varios locales → titular reutilizable → cuenta bancaria.
No se deduce la identidad legal del cliente a partir del titular bancario.

Grupo configurado en producción:

- A DKCHE.
- A CREDICEL LA GRANJA.
- A CELUVENTAS CERETE.
- A CELUVENTAS MONTERIA.
- A TECH MOVIL.
- A CREDICELULARES.
- A MOVIL FLEX.

Resultado comprobado: **7 locales, 1 cliente, 1 titular**, Bancolombia ahorros
terminada en **3299**. Se reutilizó la ficha de Celuventas Montería. Los seis
maestros anteriores se conservaron, sin borrar información ni relaciones históricas.
Nombre, ciudad, dirección, código y ventas permanecen por local.

## Ruta de uso

Tesorería → Clientes y cuentas → Ver ficha y cuenta.

- Datos del cliente: datos generales compartidos y datos propios del local.
- Cuenta de pago: titular existente o nuevo; muestra los locales afectados.
- Locales del cliente: consulta del grupo y relación explícita de otro local,
  con confirmación del cliente y cuenta destino.

El mismo componente se utiliza desde Aliados. El formulario no traslada al titular
de otro comercio ni crea otra copia de su cuenta al reutilizarlo.

## Protección financiera

La asociación no llamó a motores de cálculo de lotes reales, aprobación ni pago.
No alteró las cuentas existentes, incluidas las antiguas del local DKCHE.
Los cambios del maestro se usan en futuros cálculos; órdenes anteriores conservan
su destinatario y cuenta. Las órdenes autorizadas/cerradas tienen protección adicional
mediante trigger de inmutabilidad.

Antes y después coincidieron exactamente las huellas de:

| Registros | Huella MD5 |
| --- | --- |
| Órdenes | 35cac56145a08521ded897862098c0ce |
| Cuentas bancarias | b1e0ae456fa038102a8281d674de81bf |
| Saldos de Tesorería | c4bfc3bd2f5fa45b11e7c6f27d3f40ba |
| Movimientos de Tesorería | 54f5f69006f584422194b6188ee591fe |
| Liquidaciones | 2ca78d753cf56c1b86aadebbf607b123 |

La transacción también comprobó que ninguna sede fuera de los siete códigos
cambiara. Los seis cambios y la verificación quedaron en `audit_log`, identificados
como ejecución administrativa autorizada; no se suplantó una sesión de Oscar.

Respaldo mínimo de relaciones anteriores, sin datos bancarios:
`/private/tmp/kora-multilocal-vinculos-20260906.json`.

## Pruebas

- 291 pruebas locales aprobadas.
- PGlite: siete locales, cuenta sin duplicar, identidad, concurrencia, permisos
  y protección de órdenes.
- SQL real Krediya: dos locales, mismo cliente y titular, una orden agrupada;
  cálculo, bonos, diferencias y restricciones conservados. ROLLBACK completo.
- SQL real PayJoy: dos locales, misma cuenta y una orden agrupada, política diaria;
  lotes reales intactos. ROLLBACK completo.
- SQL real: usuario sin capacidad rechazado; anónimo sin EXECUTE.
- Navegador con HTML real y datos ficticios: selección y vinculación, edición,
  fallo/reintento, navegación y anchos 390/768/1280 px sin desbordamiento.
  No se llamó a RPC de pagos.

Supabase Advisors detectó un aviso nuevo, esperado para la RPC administrativa
`tesoreria_vincular_local_cliente`: SECURITY DEFINER accesible a authenticated.
Es intencional; requiere sesión y capacidad revisor, usa search_path vacío y
rechaza accesos sin capacidad. No tiene acceso anónimo.
[Descripción del aviso](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
No se modificaron avisos preexistentes ajenos al alcance.

## Publicación

Este commit contiene la interfaz, migración y pruebas. Publicar exclusivamente con
`npm run deploy:kora:production`, que construye, verifica el artefacto KORA aislado,
publica y comprueba el manifiesto runtime; conserva rollback de la versión anterior.
La evidencia final del despliegue se guarda automáticamente en
`/tmp/kora-production-deployment-<commit>.json` y en el manifiesto público de KORA.
AURA no se modifica y no se hace push a GitHub desde esta tarea.
