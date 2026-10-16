# Excel automático del cierre B2B

Al confirmar un cierre, `b2b-pedido-mail` envía un único correo a
`gestion@crediteksas.com` y `comercial@crediteksas.com`, con el reporte HTML
y el adjunto nativo `KORA-CIE-xxxxxx-pedidos-B2B.xlsx`.

El Excel conserva la copia confirmada del cierre, sin consultar ofertas nuevas:

- Resumen por proveedor: unidades, costo, valor a tiendas, margen y total general.
- Compra por ciudad: proveedor, ciudad, referencia, cantidad, costo unitario y total.
  Las líneas con costos unitarios distintos no se mezclan.
- Detalle por tienda y pedido: distribución solicitada, cantidades, costos y precios,
  con totales generales. No se suman precios unitarios como si fueran importes.

Incluye logo Creditek, identificación del cierre, fecha de corte en hora de Colombia,
números tipados y fórmulas con valores calculados. La plantilla de estilos se generó
con Artifact Tool y solo contiene datos ficticios; los registros reales se incorporan
al preparar el correo. Los textos de las fuentes no se interpretan como fórmulas.

La validación rechaza líneas sin identificador, duplicados, cantidades inválidas o
costos/precios faltantes antes de llamar a Google. Se mantiene la autenticación
existente por capacidad aleatoria de cada trabajo y RPC exclusiva de `service_role`.
Un resultado incierto no se reenvía automáticamente. Los errores reintentables
conservan la rotación del token y el límite de cinco intentos del servidor.

La corrección no crea cortes, pedidos, órdenes de compra ni movimientos financieros.
Un reenvío correctivo de un cierre ya enviado requiere autorización expresa y un
registro de auditoría; no debe volver a ejecutarse el cierre para conseguir el Excel.

## Verificación de este cambio

- `node --test tests/erp/b2b-cierre-excel-correo.test.mjs tests/erp/b2b-cierres.test.mjs tests/erp/b2b-whatsapp.test.mjs tests/erp/b2b-correo-cierre-unico.test.mjs tests/erp/b2b-corte-ofertas-vigentes.test.mjs`
- Abrir/importar el XLSX generado y comprobar fórmulas, sumas, logo y las tres hojas.
- Publicar solo la Edge Function, manteniendo su configuración de autenticación.
- Verificar que el correo enviado incluya el adjunto y los dos destinatarios.

Revisión de Claude aprobada el 16 de octubre de 2026, sesión
`f700ec9c-20ed-40b1-b5c0-d3c256849c02`. Se compartió únicamente código y pruebas
ficticias, sin pedidos reales, costos ni datos de clientes.
