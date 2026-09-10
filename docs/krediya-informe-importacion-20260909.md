# Informe de diferencias al importar Krediya

## Implementado

- El evento `liquidation.imported`, al final del RPC de importación, guarda una comparación única por lote en `krediya_import_reports`.
- Utiliza el mismo resolver de contexto que la liquidación: tarifa por fecha de venta, PVP original recibido y PAGAMOS pactado. No recalcula ni modifica importes.
- Resumen por equipo y pareja de precios: cantidad, PVP KORA, PVP recibido, diferencia individual y suma. No promedia precios diferentes ni interpreta datos ausentes como cero.
- Destinatarios confirmados: gestion@crediteksas.com y comercial@crediteksas.com.
- La interfaz abre el informe después de importar. El detalle largo queda plegado.
- Los errores del informe no revierten la importación. La diferencia de PVP es seguimiento, no bloqueo de aprobación.
- No se reenvían importaciones antiguas ni se alteran pagos, bonos, tarifas o autorizaciones existentes.

## Pendiente — no prometer entrega automática

No hay Edge Functions, secretos de correo en el Worker KORA, ni configuración de correo en Vault. Se almacena `email_status=sin_configurar`, no `enviado`.
Falta conectar un remitente autorizado y un consumidor durable con reintentos/idempotencia y confirmación del proveedor. Gmail de la conversación no es una credencial de correo de la aplicación.
Se consultó si se autoriza Google Workspace comercial@crediteksas.com como remitente. No se ha enviado ningún correo de prueba ni contratado servicios.

## Pruebas

Pruebas ejecutables PGlite: snapshot único; otras plataformas no afectadas; fallo del contexto no revierte evento; permisos RLS y escritura; diferencias PVP no bloquean; destinatarios exactos; no falso estado enviado.
Pruebas de resumen: dos diferencias de -280100 suman -560200; precios distintos no se mezclan; faltantes y HTML no confiable.
Prueba visual aislada del resumen: 360, 768 y 1440 px sin desbordamiento de ventana.
