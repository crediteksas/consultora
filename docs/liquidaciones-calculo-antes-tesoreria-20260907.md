# Liquidación antes de preparación de Tesorería

## Regla confirmada por Gerencia

Los comercios FULL ACCESORIOS LA 72, Lachescel soluciones y CREDITEK COVEÑAS son aliados. Las tiendas propias se identifican en el catálogo Retail. No se relaciona CREDITEK COVEÑAS con Creditel Coveñas por parecido de nombre.

La identificación usa código, nombre o alias exacto normalizado del catálogo. Sin coincidencia se registra un local aliado mínimo y su ficha/sede mediante el sincronizador existente. Ambigüedad o un comercio inactivo no se resuelven inventando una relación. Ciudad, ejecutivo, titular y cuenta nunca se inventan.

## Flujo implementado

1. **Liquidar lote** prepara el catálogo y calcula principal y bonos conocidos en una sola transacción. El botón anterior **Validar** llama al mismo cálculo. No exige ejecutivo o cuenta para calcular el principal.
2. **Tesorería → Preparación de pagos** muestra neto calculado, porcentaje y los faltantes de cliente, ejecutivo, titular y cuenta. La cuenta se administra en la ficha única; la asignación de ejecutivo valida concurrencia y queda auditada.
3. Después de completar datos, **Actualizar cálculo del lote** incorpora las comisiones/órdenes faltantes. Si el borrador estaba revisado, invalida esa revisión conservando su auditoría. No recalcula lotes aprobados ni órdenes autorizadas/en gestión.
4. Revisión y aprobación son por lote. **No se congela como utilidad final un bono cuyo ejecutivo no está identificado.** Las órdenes deben seguir cuadrando con los importes del lote; esta entrega no elimina esos controles ni permite pagar sin destinatario y cuenta verificados.
5. Los pagos requieren su autorización y soporte por el flujo existente. Ningún botón de cálculo ejecuta transferencias.

## Importes y alcance

- ALO conserva la fórmula que está instalada: PAGAMOS = crédito financiado × porcentaje; neto = PAGAMOS − inicial. No se modifica silenciosamente la base de cálculo.
- Políticas vigentes del lote ALO del 06/09: aliados 77 %, propia 76 %. En el ensayo con los seis importes del lote: neto aliados $1.965.370 y compensación propia $378.012, antes de agregar bonos.
- Krediya conserva PAGAMOS pactado, PVP recibido, bonos operativos, gasto financiero de 0,4 % y provisión de 28 %. El informe señala bono ejecutivo pendiente y no exporta utilidad definitiva inventada.
- El lote Krediya del 30/08 ya estaba aprobado al iniciar esta intervención; no se recalcula. No se aprueba ni registra ningún pago al instalar la migración.
- Falta real de una regla o importe necesario no se sustituye por cero. Los controles monetarios, duplicados e inmutabilidad siguen vigentes.

## Comprobación

345 pruebas locales y 6 pruebas de interfaz aprobadas antes de publicación.

Pruebas SQL ejecutables con PGlite y las funciones/columnas inspeccionadas: seis operaciones ALO con faltantes, clasificación exacta, creación única de sedes, cálculo repetible, controles de acceso, revisión invalidada, actualización de ejecutivo, referencias a bonos y órdenes sin duplicación, Krediya con datos de pago incompletos.

Pruebas de interfaz en Chrome y WebKit: 390×844, 844×390, 768×1024 y 1280×900; consultas separadas de acciones, acceso a Tesorería, búsqueda y guardado con error de concurrencia visible. Publicación mediante el pipeline oficial de KORA; AURA/Sofía no están en el alcance.
