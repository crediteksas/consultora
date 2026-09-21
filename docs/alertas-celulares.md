# Alertas de celulares

Resumen ejecutivo (Gerencia/Gestión): debajo de alertas operativas. Resumen de mi tienda: al comienzo del dashboard. Solo gerencia, auditoría y administradores activos.

Lectura de ventas no anuladas, productos CELULAR, inventario disponible por IMEI o cantidad según tipo. Ventana móvil de hasta 30 días, desde el 2 de septiembre de 2026 mientras se completa. No se mezclan históricos agregados ni se supone demanda de referencias sin ventas.

Prioridad: sin stock; cobertura inferior a 7 días (stock / venta media diaria del período); reposición en gestión; resto. La pestaña Más vendidos ordena por unidades del período. El período es propio de la alerta, independiente de los filtros de informes, y está rotulado. Actualizar vuelve a consultar las fuentes. No genera pedidos ni movimientos.

Pendientes son una señal booleana, no una cantidad prometida: pedidos solicitados/en compra/parciales con faltantes, remisiones borrador/despachadas y traslados despachados/pendientes de aprobación. Central además consulta órdenes enviadas/parciales con faltantes. Una tienda no accede a órdenes privadas de proveedor; debe confirmar con Gestión las compras que no provengan de su pedido. No se suman documentos superpuestos.

Se conserva RLS y se filtra explícitamente la tienda de su perfil. La guía de Supabase orientó el uso de vistas de lectura existentes, sin costos internos ni IMEI, sin migraciones ni cambios a permisos. Todas las consultas están paginadas con orden estable; un error de cualquier fuente deja advertencia y opción de reintentar, nunca un stock cero inventado.

Pruebas: `node --test tests/erp/alertas-celulares.test.mjs` y pipeline local KORA.
