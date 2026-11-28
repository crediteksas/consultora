# NOVA: demora de Krediya y alertas operativas

Alcance autorizado: mantener progreso reciente en la misma reserva; alertar demoras mayores a dos minutos en NOVA y al supervisor habilitado. No solicita créditos, no inicia pruebas con clientes, no repite consultas guardadas ni cambia reglas, consentimientos, referencias, fotos o decisiones.

## Implementación

Krediya1.0.21 usa inactividad desde último envío confirmado, conservando el límite210s; límite absoluto calculado una sola vez: mínimo entre inicio+285s y reserva cloud menos15s, con margen de reloj HTTP Date. Rechaza diferencias>5s, muestras antiguas o reservas vencidas. Conserva recuperación y presupuesto anteriores. Evita cortar un documento enviado al segundo206 por el tiempo del saludo anterior.

Scanner separado waitUntil, abortable35s, máximo3avisos por minuto. Umbral120s evaluado por cron existente de un minuto. No se promete llegada al segundo120. Inicio inicial: job.created_at; reconsulta: query_requested_at del batch actual. Proyección y alerta usan mismo helper. Hora Colombia[08:00,20:00); se suprimen avisos de trabajos iniciados fuera de horario y anteriores a la activación, sin backfill histórico. Tabla AURA privada única por solicitud+batch. Envíos inciertos no se repiten automáticamente; rechazos explícitos permiten hasta3intentos. Webhooks firmados distinguen aceptado/entregado/leído; fallo tardío no degrada recibido ni reencola.

Aviso al único supervisor can_review: tienda, radicado, validación demorada, minutos y revisión concreta, enlace a ficha autenticada. Plantilla utility existente con2parámetros de cuerpo y1botón; valida contenido exacto antes del envío. Sin datos de cliente/importes. Tiendas ven «Validación demorada», responsable Creditek y ninguna plataforma. Supervisión ve conector concreto. liveJobs es transitorio y no se persiste/fingerprint/decisión. Formulario público y Worker de registro quedan byte idénticos al baseline.

Migración AURA aislada db-aura; sin DDL KORA ni cambios a políticas existentes. RLS sin políticas de usuario; revocaciones explícitas PUBLIC/anon/authenticated, funciones invoker/search_path vacío/service_role. No Realtime. Pruebas PGlite ficticias con reloj controlado solo en base efímera; HTTP/recepción simulados no prueban entrega real.

## Reversión

Interruptor sin despliegue: KV NOVA_EVENTS clave nova:platform-delay-alerts:v1, JSON enabled:false conservando activatedAt; propagación eventual KV. Se comprueba también antes de enviar. No afecta consultas.
Worker previo: b306927b-456d-4f67-892f-8c04e33f32d0, módulos/config baseline/live.json. Revertir mediante Wrangler manteniendo bindings/vars. No borrar tabla/recibos.
Nativo previo1.0.20: native-manifest.json detalla SHA256 y modos de engine/client/runner/manifest. Copia original native-backup fuera de Git. Para restaurar, verificar destinos siguen en hash after, restaurar exclusivamente4originales, modos y hash before; recargar misma extensión/id. No tocar config/state/journal/hosts/perfiles. Recarga solo sin reserva activa.

No hay pruebas nuevas con clientes ni mensajes de prueba reales. Próxima solicitud real permitirá confirmar comportamiento del proveedor y recepción efectiva. Commit/push y Claude antes de DDL/deploy; pre/postflight verifican código/config/rutas/cron. Trabajos ajenos preservados.

Revisión final: sin FK sobre recibos (evita locks implícitos y no cambia borrado/retención). Candidatos filtran ventana/hora/activación y ordenan recientes primero; fuentes definitivamente no elegibles quedan suprimidas por batch, fallos transitorios de lectura solo esperan siguiente revisión. Un aviso cancelado/suprimido no se repite en ese batch; una nueva reconsulta genera otro batch. Las pruebas reales de ensamblaje usan createRetailRuntime, prepareTemplates/templateHealth, parser, evidence, HTTP progress y scheduled, sustituyendo solo el límite de red por respuestas ficticias. No afirman una consulta externa real.

Gates finales: no se suprime cuando aún no existe caso o recibo, ni si falla su lectura; se reevalúa después. Reconsulta usa su fecha real KORA para umbral y mismo día; orden de candidatos usa updated_at para reconsulta, created_at para inicial. Capacidad de alertas3/min: una caída masiva puede demorar WhatsApp; la alerta visual en aplicación no espera la cola de mensajes. Verificar checkedAt de plantilla en dos ciclos reales y configuración PREPARE=true antes de habilitar el interruptor.
