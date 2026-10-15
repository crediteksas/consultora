# Informe diario de confirmaciones por WhatsApp

Todos los días a las 15:00 America/Bogota, incluidos domingos y festivos, el Worker `creditek-clientes` envía el corte de confirmaciones de deuda con Creditek a los destinatarios existentes: Óscar y Mayte. Empieza junto con la confirmación diaria, el 15 de octubre de 2026. El cron existente cada cinco minutos ya incluye las 15:00; no se crea una automatización dependiente del computador.

Incluye cada administrador activo y su tienda: saldo confirmado y hora, pendiente, o saldo KORA / saldo declarado / diferencia y revisión. Los saldos son los guardados al confirmar, no cartera recalculada después. Las confirmaciones posteriores a las 15:00 quedan fuera del corte. No se suman cifras entre administradores porque una tienda puede tener varios. El detalle y las observaciones se consultan en Administración → Confirmaciones de deuda.

Se utilizan las plantillas ordenadas aprobadas de WhatsApp, con división en mensajes si el tamaño lo exige. La reserva y el contenido congelado están en `reportes_deuda_enviados`, separados de los reportes nocturnos. Solo el servicio puede acceder. No se modifican cartera ni confirmaciones.

Los reintentos después de un rechazo explícito de Meta continúan desde las entregas pendientes (hasta 12 intentos, en la ventana 15:00–19:55). Cada parte aceptada conserva su identificador de Meta. Un timeout o una interrupción con envío en curso se registra como incierto o sending y exige revisar la entrega antes de reenviar; no se puede asegurar entrega exactamente una vez si Meta acepta y se pierde la respuesta. Consultar `status`, `last_error` y `resultados` para diagnosticar. `sent` significa aceptación de Meta, no lectura del destinatario.

Validación: suite Vitest del Worker, TypeScript, prueba SQL PGlite de permisos/corte/reserva/contenido congelado y dry-run de Wrangler. Publicar desde `creditek/workers/creditek-clientes` con configuración explícita `wrangler.toml`; no corresponde desplegar el frontend de KORA. La migración debe instalarse primero.
