# Inventario de tablas de informes KORA

Corte: 2026-10-16. Inventario estático, no certificación de descargas ni de datos. Los contratos describen qué se debe sumar; no prueban por sí solos permisos, consulta, precisión o filtros. Se incluyen componentes auxiliares. Ver auditoria-informes-2026-10-16.md.

| Fuente | Tabla / encabezados | Control encontrado |
|---|---|---|
| ajustes.html:205 | tbodyAjustes | Contrato explícito |
| aliados-liquidaciones-app.js:920 | Concepto / Guardado en KORA / Recibido de Krediya / Diferencia | Indicadores no aditivos |
| aliados-liquidaciones.html:103 | batches | Contrato explícito |
| aliados-liquidaciones.html:104 | addiFollowupRows | Cierre HTML |
| aliados-liquidaciones.html:125 | previewIssues | Revisión manual / componente dinámico |
| aliados-tesoreria-app.js:83 | ${esc(x)} | Revisión manual / componente dinámico |
| aliados-tesoreria-app.js:1437 | N.º / Beneficiario / Cuenta destino / Concepto y fecha / Valor | Revisión manual / componente dinámico |
| aliados-v1-1-app.js:50 | ${esc(labels[x] \|\| x)} | Revisión manual / componente dinámico |
| auditoria-cruzada.html:358 | Tienda / Admin / Estado / Vigencia hasta / Acción | Revisión manual / componente dinámico |
| b2b-cierres.js:10 | Pedido / destino / Referencia / Cantidad / Proveedor / Costo unitario / Precio retail / Total costo | Contrato explícito |
| b2b-cierres.js:33 | Cierre / Fecha / Correo / Consultar | Revisión manual / componente dinámico |
| b2b-comparativo.js:118 | Referencia / Ofertas de proveedores / Selección y precios unitarios / Validación | Cierre HTML |
| b2b-comparativo.js:120 | Proveedor / Referencia original / Costo / Precio propuesto / Estado / motivo / Línea | No aditivo / aclaración |
| b2b-comparativo.js:120 | Proveedor / Estado / Fecha en KORA / Archivo / trazabilidad | Revisión manual / componente dinámico |
| b2b-listas-resumen.js:88 | Proveedor / Sin dudas / Dudas / Productos excluidos / Estado / Acciones | Contrato explícito |
| b2b-listas-ui.js:26 | Incluir / Referencia / Proveedor / Costo real / Precio retail / Margen / Origen / motivo | No aditivo / aclaración |
| b2b-whatsapp-ui.js:77 | Referencia / Proveedor ganador / Costo / Precio retail | No aditivo / aclaración |
| bodega-central.html:304 | tbody-despacho | Cierre HTML |
| bodega-central.html:373 | tbody-alerta | Contrato explícito |
| bodega-central.html:413 | tbody-movimientos | Contrato explícito |
| bodega-central.html:435 | tbody-unidades | Contrato explícito |
| caja-libro-ui.js:56 | Registro / movimiento / Responsable y soporte / Saldo anterior / Entrada / aumento / Salida / disminución / Saldo resultante | Cierre HTML |
| caja.html:209 | tbodyConsolidado | Contrato explícito |
| caja.html:505 | tbodyMovimientosCaja | Contrato explícito |
| cartera-b2b.html:28 | rows | Contrato explícito |
| cartera-b2b.html:30 | dRows | Contrato explícito |
| catalogo.html:153 | tbodyProductos | No aditivo / aclaración |
| cierre-periodo.html:476 | tbodyBloques | Contrato explícito |
| cierre-periodo.html:776 | Persona / Rol / % / Base ventas / Comisión | Contrato explícito |
| compra-proveedor.html:227 | tbody-items | Cierre HTML |
| conciliacion.html:187 | tbodyHistorial | Contrato explícito |
| conciliacion.html:198 | tbodyEquivalencias | Revisión manual / componente dinámico |
| conciliacion.html:225 | tbodyCruzados | Contrato explícito |
| conciliacion.html:237 | tbodySinCruce | Contrato explícito |
| confirmaciones-deuda.html:4 | filas | Contrato explícito |
| conteos-ui.js:234 | Referencia / IMEI / Diferencia / Antes / Después / Costo tienda / Valor ajuste / Clasificación / movimiento | Cierre HTML |
| conteos-ui.js:493 | conteos-lineas | Contrato explícito |
| creditos-cartera-app.js:35 | Cliente / Crédito / Tienda / Original / Pagado / Saldo / Estado / Nova / Acciones | Contrato explícito |
| creditos-cartera-app.js:39 | Cliente / Plataforma / Crédito / Decisión / Regla / Origen | Revisión manual / componente dinámico |
| cuenta-corriente.html:236 | tbodyTiendas | Contrato explícito |
| cuenta-corriente.html:257 | tbodyInstrucciones | Contrato explícito |
| cuenta-corriente.html:314 | tbodyAbonosPendientes | Contrato explícito |
| cuenta-corriente.html:328 | tbodyDetalle | Contrato explícito |
| documento-remision.html:206 | tbody-items | Cierre HTML |
| finanzas-programadas-app.js:121 | Fecha / ${view==='retail'?'Tienda':'Negocio'} / Movimiento / Beneficiario / Valor / Estado / Acción | Revisión manual / componente dinámico |
| finanzas-programadas-app.js:122 | ${view==='retail'?'Tienda':'Negocio'} / Obligación / Beneficiario / Periodicidad / Valor / Estado / Acción | Revisión manual / componente dinámico |
| finanzas-reportes.js:40 | Fecha / movimiento / Concepto / negocio / Beneficiario / identificación / Banco / tipo / Cuenta destino / Valor COP | Revisión manual / componente dinámico |
| gastos.html:207 | tbodyGastos | Contrato explícito |
| incidencias.html:43 | Código / Fecha / Título / Tienda / Módulo / Prioridad / Estado / Reportado por / Responsable / Versión / Tiempo abierto | Revisión manual / componente dinámico |
| inventario.html:235 | tbodyCelulares | Contrato explícito |
| inventario.html:251 | tbodyAccesorios | Contrato explícito |
| inventario.html:472 | Producto / Tienda / Cantidad / Devolución / Referencia | Contrato explícito |
| kardex.html:178 | tbodyKardex | Contrato explícito |
| kora-date-picker.js:121 | ${day.slice(0,2)} | Revisión manual / componente dinámico |
| krediya-tarifario.js:47 | Equipo / Créditos / PVP KORA / PVP archivo / Diferencia por crédito / Diferencia total | Contrato explícito |
| pedidos-b2b.html:117 | Pedido / Fecha / Estado / Correo a administración / Productos / Unidades / Total retail | Contrato explícito |
| pedidos-b2b.html:134 | Pedido / Tienda / Estado histórico / Fecha | Revisión manual / componente dinámico |
| pedidos-b2b.html:135 | Referencia / Proveedor elegido / Costo real / Margen / Precio retail | No aditivo / aclaración |
| pedidos-b2b.html:136 | Elegir / Pedido / tienda / Referencia / proveedor / Pendiente / Costo proveedor / Precio tienda | Contrato explícito |
| pedidos-b2b.html:139 | Orden / Proveedor / Fecha / Estado / Total estimado / Acciones | Contrato explícito |
| pedidos-b2b.html:143 | Ciudad / Referencia / Cantidad total / Costo unitario / Total | Contrato explícito |
| pedidos-b2b.html:144 | Destino interno / Referencia / Pedido / Recibido / Costo cotizado / Costo factura / Precio tienda / Motivo del cambio | Contrato explícito |
| proveedores.html:198 | tbody-vencimientos | Contrato explícito |
| proveedores.html:203 | tbody-proveedores | Contrato explícito |
| proveedores.html:226 | tbody-facturas | Contrato explícito |
| proveedores.html:256 | tbody-detalle-lineas | Contrato explícito |
| proveedores.html:271 | tbody-detalle-pagos | Contrato explícito |
| proveedores.html:287 | tbody-aplicaciones-fifo | Contrato explícito |
| remisiones.html:213 | tbodyRemisiones | Contrato explícito |
| reportes.html:723 | tbody-comparativo-kpis | Indicadores no aditivos |
| reportes.html:744 | tbody-ventas | Contrato explícito |
| reportes.html:775 | tbody-cartera | Cierre HTML |
| reportes.html:812 | tbody-inventario | Contrato explícito |
| reportes.html:842 | tbody-presupuesto | Contrato explícito |
| reportes.html:873 | tbody-rent-tienda | Contrato explícito |
| reportes.html:905 | tbody-rent-categoria | Contrato explícito |
| reportes.html:953 | tbody-crecimiento | Contrato explícito |
| reportes.html:982 | tbody-top-vendidos | Contrato explícito |
| reportes.html:989 | tbody-slow-movers | Contrato explícito |
| reportes.html:1010 | tbody-proveedores | Contrato explícito |
| resumen-saldos-b2b.html:37 | tiendasRows | Cierre HTML |
| resumen-saldos-b2b.html:42 | proveedoresRows | Cierre HTML |
| tablero.html:150 | tbodyTiendas | Cierre HTML |
| tablero.html:228 | tbodyEjecutivos | Contrato explícito |
| traslados.html:231 | tbodyTraslados | Contrato explícito |
| utilidad-creditek.html:244 | brand-rows | Cierre HTML |
| ventas.html:448 | tbodyVentas | Contrato explícito |
| ventas.html:839 | Producto / Cant. / Precio / Subtotal | Contrato explícito |
| ventas.html:926 | Producto / Cant. / Precio / Subtotal | Contrato explícito |
