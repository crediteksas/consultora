# Liquidaciones: aprobación y preparación de pagos

## Alcance implementado

- Liquidaciones: pendientes y cuatro aprobadas recientes; historial con filtros de corte desde/hasta y descarga CSV de rentabilidad sobre la base liquidada.
- Acceso al historial desde Reportes e informes. La utilidad se etiqueta provisional mientras falta ejecutivo.
- Cuadro compacto por tienda al importar, con guardar y liquidar o completar después. No asigna responsables inventados.
- Una aprobación del lote. Los botones de cálculo/revisión/aprobación desaparecen tras congelarse.
- Tesorería diferencia estado de liquidación y estado del pago.
- Migración `aprobacion_independiente_cuentas_bonos_diferidos` instalada en KORA: permite aprobar con cuenta/ejecutivo pendientes; preserva revisión y controles financieros de cálculo.
- Bono diferido calculado con el motor de políticas existente, sin borrar bonos conocidos ni duplicar comisión universal. Se conserva PAGAMOS y la aprobación original; se audita el ajuste. La utilidad pendiente no se incorpora al saldo disponible en ALO/PayJoy hasta completar el bono.
- No se ejecutaron pagos. La prueba transaccional con ALO se revirtió: continúa revisada con $120.000 de bonos y $3.148.100 de total. En la prueba de completar Luis pasó a $140.000 y $3.168.100, sin persistir esos cambios.

## Ajuste adicional autorizado e instalado

Oscar autorizó expresamente el ajuste adicional. La migración `20260907235856_completar_destinos_pendientes_tesoreria.sql` quedó instalada en KORA. Permite completar cuentas originalmente vacías en órdenes pendientes no autorizadas; no reemplaza cuentas existentes ni pagos cerrados. Ajusta además los totales de obligaciones de destinos de Tesorería para incluir importes pendientes de cuenta y bonos añadidos después. No ejecuta una actualización masiva de órdenes: opera al completar el lote desde Tesorería.

Verificación posterior: 354 pruebas oficiales y 20 pruebas SQL aprobadas. Prueba real ALO dentro de BEGIN/ROLLBACK: completar el ejecutivo actualizó el total de bonos de destinos a $140.000, sin persistir aprobación ni pago. Es un cambio de base de datos; la interfaz compatible ya estaba desplegada con `dffff0e` y no requiere otro despliegue del Worker.

Las órdenes ya pagadas/conciliadas no se amplían automáticamente. Los conceptos todavía no materializados conservan el pendiente; no se registra un pago ficticio ni se altera el soporte.

## Verificación

- Suite oficial KORA `npm run test:local`; pruebas SQL con triggers de inmutabilidad productivos.
- Chromium y WebKit: asignación compacta, responsive, historial de cuatro recientes, filtros y descarga.
- Prueba ALO en Supabase dentro de BEGIN/ROLLBACK: aprobación sin ejecutivo y preparación posterior, total esperado $3.168.100.
- Advisors: sin nuevas advertencias de seguridad; nueva nota informativa RLS sin política para la tabla privada deliberadamente inaccesible a clientes. No se abrieron permisos de tabla a anon/authenticated.
- `npm test` global incluye fallos preexistentes de AURA y pruebas antiguas ajenas al pipeline KORA; no se declara toda esa suite aprobada.

## Autorización única del lote (corrección posterior)

Se elimina la segunda autorización individual de la interfaz. La aprobación de Liquidaciones habilita la gestión de soportes en Tesorería; al registrar un soporte válido se hereda la autorización original, sin modificar beneficiario, cuenta ni valor. Se conservan los controles de cuenta completa, soporte real e idempotencia.

El PayJoy del 1 de septiembre usa el flujo anterior: sus tres órdenes conservan autorización explícita y no tienen fechas modernas de aprobación ni destinos materializados. Se reconoce esa autorización sin inventar fechas, saldos ni soportes. La excepción solo alcanza órdenes previamente programadas/autorizadas de lotes legados programados; los lotes modernos siguen exigiendo destinos.

Después de aprobar, Liquidaciones vuelve a pendientes y las últimas cuatro aprobadas, sin abrir automáticamente todo el historial. Pruebas: suite KORA y casos SQL aislados de autorización heredada, legado, cuenta incompleta, permisos y soporte repetido. La instalación no actualiza pagos ni ejecuta giros.
