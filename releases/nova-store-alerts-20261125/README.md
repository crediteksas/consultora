# NOVA: alertas comerciales automáticas

Para todas las tiendas y aliados habilitados: aviso persistente «No puedes continuar por ahora» con pendientes y responsable, actualizado por el refresco existente de 15 segundos. Sin información de plataformas ni importes. Los estados autorizado, rechazado y entregado conservan su tratamiento y los aliados no recuperan acceso a clientes cerrados.

Sonivox: revisión de referencia familiar y validación del historial recibido. No se cambia la decisión ni se repiten consultas. Solo proyección del expediente guardado.

Guardia de aprobación en interfaz, Worker y RPC con fila bloqueada/revisión vigente: motivos existentes zero_payments, more_than_two_overdue, overdue_with_less_than_four_paid. No nuevos umbrales ni rechazo automático nuevo. historyRequired por sí solo no es rechazo. Se conservan consentimiento, fotos, referencias, tres consultas y cooldown.

Validación: `python3 build.py`, `node --test tests.mjs`, `node ui-check.mjs`, Wrangler versions upload --dry-run con cada configuración. PGlite aislado prueba la RPC completa sin escrituras de clientes reales.

Publicación: preflight del código/configuración real; commit; versions upload y versions deploy para los dos Workers; migración SQL; postflight compara código, bindings, configuración, cron y rutas. No despliega KORA/AURA/Sofía.
