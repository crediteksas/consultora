# Informe de diferencias al importar Krediya

## Implementado

- El evento `liquidation.imported`, al final del RPC de importación, guarda una comparación única por lote en `krediya_import_reports`.
- Utiliza el mismo resolver de contexto que la liquidación: tarifa por fecha de venta, PVP original recibido y PAGAMOS pactado. No recalcula ni modifica importes.
- Resumen por equipo y pareja de precios: cantidad, PVP KORA, PVP recibido, diferencia individual y suma. No promedia precios diferentes ni interpreta datos ausentes como cero.
- Destinatarios confirmados: gestion@crediteksas.com y comercial@crediteksas.com.
- La interfaz abre el informe después de importar. El detalle largo queda plegado.
- Los errores del informe no revierten la importación. La diferencia de PVP es seguimiento, no bloqueo de aprobación.
- No se reenvían importaciones antiguas ni se alteran pagos, bonos, tarifas o autorizaciones existentes.

## Envío instalado — 9 de septiembre de 2026

- Remitente OAuth interno autorizado: comercial@crediteksas.com. Permisos Gmail únicamente de envío; identidad de correo para verificar la cuenta. Credenciales en secretos de Supabase, nunca frontend/Git.
- Función `krediya-report-mail` publicada en el proyecto KORA `jfkmiyvcdfbsbwchyvol`. No se modificó AURA ni Sofía.
- Cola privada por lote, creada sólo para informes nuevos. Cron cada minuto; errores de entrega no participan en la transacción de liquidación.
- Autenticación propia de la función: capacidad aleatoria por trabajo validada mediante RPC exclusiva de service_role, claim atómico. Un lote reclamado no puede enviarse concurrentemente. Destinatarios fijos, nunca aceptados del request.
- Reintenta fallos previos al envío y rechazo 429, hasta cinco intentos. Timeout/error incierto después de llamar a Gmail queda `mail_ambiguous`, sin reenvío automático. Requiere comprobar la entrega antes de cualquier reintento manual.
- `enviado` sólo tras respuesta con ID de Gmail. Es aceptación del proveedor, no confirmación de lectura o llegada a bandeja principal.
- Prueba técnica sin datos financieros aceptada por Gmail: mensaje `1a089719104a67e9`, a los dos destinatarios confirmados. No se enviaron informes históricos ni se crearon liquidaciones de prueba en producción.
- Verificación producción: cron activo y ejecución exitosa; endpoint rechaza token incorrecto con 403; RPC no ejecutables por anon/authenticated. La primera importación real posterior aún no ha ocurrido: cola y snapshots estaban vacíos al verificar.
- Revisión de seguridad siguiendo la skill Supabase: sin avisos para los objetos nuevos. Persisten avisos de objetos ajenos a este cambio; no se alteraron sus permisos.

## Pruebas

Pruebas ejecutables PGlite: snapshot único; otras plataformas no afectadas; fallo del contexto no revierte evento; permisos RLS y escritura; diferencias PVP no bloquean; destinatarios exactos; no falso estado enviado.
Pruebas de resumen: dos diferencias de -280100 suman -560200; precios distintos no se mezclan; faltantes y HTML no confiable.
Prueba visual aislada del resumen: 360, 768 y 1440 px sin desbordamiento de ventana.
Pruebas adicionales de correo: MIME con destinatarios fijos, HTML escapado, diferencias por crédito/total, datos incompletos, éxito y errores de Gmail; cola real en PGlite con permisos, claim único y expiración segura. Suite local: 386 aprobadas.
