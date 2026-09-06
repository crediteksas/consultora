# KORA — ficha única, cuentas y cierre con soporte

## Decisiones implementadas

- Directorio común en Aliados y Tesorería. Datos generales y cuenta de pago en dos secciones de la misma ficha. Actividad y documentos conservan su vista propia.
- Reutilización de `aliados`, `aliados_sedes` y `origenes`, vinculados por código exacto. Sin fusionar comercios por similitud, sin inventar NIT ni convertir al titular bancario en identidad legal del comercio.
- Los comercios futuros también reciben su ficha al ser activados como aliados. Contactos, dirección, ciudad y observaciones se pueden completar sin registrar cuentas ni pagos.
- Un formulario bancario para Aliados, Liquidaciones y Tesorería, también accesible para cuentas de ejecutivos. Un escritor bancario valida y reutiliza cuentas sin duplicarlas.
- Destinos de órdenes autorizadas, cerradas o de lotes aprobados protegidos contra cambios. Editar el maestro no actualiza esas órdenes ni sus saldos. Un cambio de destino de una orden ya autorizada requiere revisión específica; no se reaprueba automáticamente.
- Grupos de pago únicamente con órdenes listas y el mismo titular, banco, tipo y número de cuenta. Máximo 50 por transacción. Un lote no aprobado se presenta separado, con plataforma y corte.
- Adjuntar imagen o PDF cierra operativamente el pago y lo lleva al historial. La conciliación bancaria permanece como control posterior independiente. Si el pago ya estaba registrado sin soporte, adjuntarlo no genera otro débito.
- Se comprueba la existencia, formato y tamaño del objeto en Storage. Cierre transaccional e idempotente; no se borran comprobantes usados si se pierde una respuesta de red.
- Instalador con enlace permanente `/instalar` y versión consultada en el manifiesto publicado, sin depender de `?v=1.0.1`.

## Migración y datos

Migración registrada en Supabase: `20260906205155_clientes_unificados_y_pagos_seguros`.

Comprobación posterior: 43 comercios aliados activos, ninguno sin ficha vinculada. Las 28 sedes existentes se conservaron; no se sobrescribieron sus direcciones. No se marcó documentación como formalizada.

Las huellas completas antes y después resultaron idénticas:

| Tabla | Registros | MD5 de contenido ordenado |
|---|---:|---|
| payment_orders | 26 | 07d37d010e42ccf733575d6562af25bf |
| liquidations | 9 | 55c3d8316186a1476a400ace5cbb4867 |
| treasury_unit_balances | 2 | a4194d46f8a44d397bde56745f6ccb38 |
| treasury_movements | 31 | 6d4ace481dc24aaba686acbe07b8e84a |

Respaldo previo local: `/private/tmp/kora-clientes-respaldo-20260906.json`. Contiene información privada del directorio; no se incorpora al repositorio ni al despliegue.

## Verificación

- 284 pruebas locales aprobadas, incluyendo 11 nuevas pruebas funcionales de agrupación, migración, permisos, concurrencia de ficha, comprobantes, idempotencia y errores.
- PostgreSQL aislado ejecuta la migración real. La transición contable se sustituye por un doble de prueba para comprobar atomicidad y cantidad de débitos del nuevo orquestador; no es una prueba de transferencias bancarias reales.
- Navegador local con HTML real y datos ficticios: ficha compartida, guardado general independiente, validación bancaria, errores/reintentos, enlace a ejecutivo, paginación y anchuras 390/768/1280. Capturas revisadas; no se probó un pago real en producción.
- Build y verificación de artefactos independientes de KORA aprobados. AURA no se despliega ni modifica.
- RLS de maestros y sedes se conserva. Nuevas RPC requieren usuario autenticado y capacidad `revisor`; `anon` no puede ejecutarlas. Se revoca además la ejecución anónima de los escritores bancarios tratados.
- Advisors: eliminada la advertencia de ejecución anónima del escritor bancario. Las dos advertencias nuevas de [RPC SECURITY DEFINER ejecutables por authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) corresponden a las API intencionales de ficha y soporte: tienen validación explícita de capacidad, search_path fijo y pruebas de denegación. No se ampliaron permisos directos de escritura. Los hallazgos preexistentes ajenos a este alcance permanecen pendientes de auditoría separada.

## Pendiente operativo, no aprobado por esta intervención

El lote al que se refería la pregunta 3 es **PayJoy, corte 1 de septiembre de 2026**, no Krediya. Incluye $80.000 de Luis Rivera y $2.057.000 de Ingrid Cristina Ramos. Sus órdenes estaban autorizadas, pero el lote no estaba aprobado/congelado; la agrupación anterior las mezclaba con cortes aprobados.

La corrección separa esos importes. No aprueba ese lote, no registra comprobantes ficticios y no ejecuta pagos para hacer desaparecer el aviso. Gerencia debe completar la aprobación del lote real antes del cierre de esas órdenes.
