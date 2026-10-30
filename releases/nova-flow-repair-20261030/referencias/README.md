# REF01 / REF02 — reparación acotada de referencias

Preparado sobre Worker vigente NOVA SHA256 232513ce40c043e43c530ebad9bb9b3dbfc7d8061cae109f07fd82f841c411fb y cinco definiciones SQL leídas de DITI el 30/10/2026. No se hicieron escrituras en producción ni llamadas a Meta/proveedores.

## Composición
- Importar `transformNova(source)` de `transform.mjs`. Solo transforma `processReferenceMessage`, cuya huella debe coincidir. Rechaza deriva, dobles definiciones o doble aplicación. Se puede componer con transformaciones ajenas a esa función.
- SQL propuesto: `../sql/aura-reference-repair.sql`. Aplicar ANTES del Worker, porque habilita `send_state=uncertain`. El SQL verifica los cuerpos anteriores y aborta ante deriva.
- `build-sql.mjs` genera de forma determinista el SQL desde `baseline-rpcs.sql`. Es una propuesta; root genera el nombre de migración con Supabase CLI.
- No se agregan RPC ni parámetros. `nova_reference_send_ack` conserva su contrato boolean: true=accepted, false=failed definitivo, NULL=uncertain.
- CREATE OR REPLACE conserva ACL, SECURITY INVOKER y search_path vacío. No se alteran roles, RLS ni permisos en la propuesta.

## REF01
El callback bloquea la fila actual por mensaje/destinatario. Conserva la cronología del proveedor para sent/failed y da prioridad a delivered/read. Un sent antiguo o empatado no borra un fallo posterior, su error ni la posibilidad de recuperación. La evidencia positiva de entrega puede superar un fallo, sin convertirla en consentimiento/validación. Un sent estrictamente posterior al fallo sí describe el estado posterior del mismo mensaje. Los eventos viejos se conservan para auditoría; el replay exacto no inserta otra fila. Mensajes de un intento anterior, otro destinatario o una referencia cancelada no cambian el intento actual.

## REF02
Un timeout, 5xx, redirect, JSON inválido o respuesta sin recibo válido es uncertain, no stopped. Solo una respuesta 4xx explícita con error Graph y sin mensajes cuenta como rechazo confirmado. Un recibo de aceptación continúa siendo aceptación del proveedor, no entrega.

El siguiente mensaje real de la referencia puede continuar sobre el estado y plazo originales. Ni replay del MetaID ni volver a tocar la invitación reenvían la pregunta. Consentimiento y OTP siguen siendo pasos distintos: entrar por la invitación no autoriza nada automáticamente.

Si la invocación termina después de reservar el turno pero antes de guardar el ACK, un evento NUEVO puede liberar reserved tras un minuto, bajo el mismo lock de diálogo. No hay cron ni reenvío automático del turno incierto; la reserva vigente sigue protegida. El ACK de un intento antiguo no afecta al nuevo.

Los resultados de OTP sin confirmación tampoco cierran el diálogo. Esto no transforma un OTP uncertain en verificado ni vuelve a emitir códigos automáticamente; no se modificó su protocolo de prueba.

## Recuperación histórica
No se reabren stopped/failed existentes porque el registro previo no distingue timeout de rechazo definitivo. La auditoría no encontró diálogos stopped actuales. No se cambia expires_at, consentimiento, respuestas ni decisiones existentes. Una autorización vencida o revocada sigue bloqueada. No se modificó Sofía ni un reenviador externo: estos dos defectos están en NOVA/SQL.

## Validación
`node --test referencias/repair.test.mjs`, desde el directorio del release; opcional `PGLITE_MODULE=/ruta/al/modulo/index.js`.

22/22 pruebas pasan usando el receptor transformado y las RPC reales capturadas en PGlite. Incluyen timeout y continuación explícita sin reenvío, duplicados, reserva abandonada, ACK antiguo, conflicto de replay, expiración/revocación, rechazo, cronología de callbacks, errores, intentos anteriores y preservación de ACL.

Los mocks sustituyen transporte y emisión OTP para no contactar personas. No acreditan una entrega real ni una prueba humana, y PGlite no equivale a concurrencia multiproceso. `test-results.tap` conserva el resultado. `fixtures.mjs` y las pruebas no deben incluirse en el despliegue del Worker.

