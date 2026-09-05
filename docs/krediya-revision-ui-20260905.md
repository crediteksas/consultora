# Krediya: revisión operativa y presentación

## Alcance

- Operaciones en páginas de 8, búsqueda por referencia/cliente/IMEI y filtro por tienda.
- Tipografía y estilos compartidos de KORA; altura natural y desglose desplegable.
- «Ver novedad» muestra referencia, IMEI y comparación monetaria; no solicita una respuesta sin contexto.
- Informe «Gestión y Gerencia»: vista preliminar desde datos importados, exportable; el cálculo exitoso genera el informe definitivo.
- Instrucciones vinculadas por identificador de operación y lote, no por posición en la lista. Navegación en ambos sentidos.
- Consultas antiguas no reemplazan una pestaña recién seleccionada.
- Aprobación explícita del lote completo y continuación a las órdenes de pago. No cambia controles financieros.

## Verificación

- Pruebas locales completas: 245 aprobadas.
- Prueba visual aislada con 29 operaciones sintéticas, los activos reales de KORA y sin escrituras.
- Anchos de contenido comprobados: 390, 760 y 1100 px; sin desbordamiento horizontal ni superposición de tarjetas.
- Todas las pestañas revisadas a 390 px; novedad con referencia y valores legibles en diálogo adaptable.
- Pruebas de coherencia Redmi/Samsung por identificador, precios congelados y respuestas tardías.

## Estado financiero: pendiente, no pagado

La lectura de producción del corte Krediya 2026-08-30 encontró 29 operaciones reconocidas, 0 cálculos y 0 diferencias definitivas. Faltan beneficiarios activos vinculados a 13 comercios (22 operaciones de aliados).

La pantalla identifica estos destinatarios antes de intentar crear las órdenes. No solicita confirmar nuevamente PVP o bonos. La vista preliminar no sustituye cálculos ni crea una aprobación, plazo definitivo, movimiento bancario o pago.

La instrucción existente del Redmi 15C está vinculada al mismo Redmi por operación, lote e IMEI. El Samsung de la otra vista corresponde a otra operación; no se reasignaron instrucciones.

No se cambiaron saldos, precios, bonos, beneficiarios, órdenes o estados de liquidación durante esta revisión. No se ejecutaron pagos ni se instalaron migraciones SQL.
