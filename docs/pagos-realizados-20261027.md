# Registro de pagos realizados — 27 octubre 2026

Solicitud de Óscar: permitir adjuntar soporte de pagos ya ejecutados, con fecha real (21 octubre), sin exigir saldo contable suficiente ni duplicar débitos.

- RPC nuevo con autorización de controlador, comprobante existente, fecha real, bloqueo de fila e idempotencia.
- El saldo de control puede quedar negativo y se presenta como pendiente de conciliación. No modifica la apertura ni inventa ingresos.
- Rutas públicas anteriores retiradas; las pantallas antiguas deben actualizarse.
- Una fecha anterior al corte bancario requiere conciliación específica y se rechaza sin modificar pago ni saldo. No se restringe por fecha de creación/aprobación.
- 1.372 pruebas locales aprobadas; 104 comprobaciones nativas PostgreSQL 17.6 aprobadas (upgrade/rebuild, permisos, reintentos, fecha real, saldo negativo y rechazo antes de apertura).
- La prueba nativa usa esquema vacío con identidades ficticias y fixture de existencia de objetos Storage; no prueba un upload real ni cambia registros de producción.
- Evidencia y hashes: tests/fixtures/supabase-compat/kora-pagos-reales-native17 y config/kora-permission-release.json.
- Autorización explícita de Óscar para enviar código y SQL a Claude recibida en este chat. No se enviaron comprobantes ni datos de clientes.

## Revisión Claude

**Veredicto: APROBADO**

Revisé el flujo completo de `finanzas_registrar_pago_real` y su interacción con el trigger `banco_creditek_finanzas_trigger` / `kora_private.banco_creditek_asentar`, que es el punto central del hallazgo original.

Confirmación del cierre del hallazgo:
- El bloqueo por fecha anterior al corte ocurre **antes** de la actualización de `financial_entries` (la comprobación `for update` sobre `banco_creditek_cuentas` + `raise exception` está en el mismo bloque `else` que precede al `update ... set status='pagado'`). Como todo corre en una sola transacción de función, el `raise` aborta la transacción completa: no queda la entrada marcada `pagado` sin el débito correspondiente. Esto es justo lo que exige el test nativo `'before opening does not debit twice'`, que verifica que ni el `financial_entries.status`, ni `banco_creditek_movimientos`, ni `saldo_actual` cambian tras el rechazo.
- El segundo chequeo dentro de `banco_creditek_asentar` (`p_ocurrido_at<=corte → return false`) queda como defensa en profundidad para otras rutas que pudieran insertar un `UPDATE` directo; no es el mecanismo primario y no contradice el primero.
- Las rutas públicas legadas (`finanzas_registrar_pago_con_origen`, `finanzas_registrar_pago`) quedan con `revoke all` de `public/anon/authenticated/service_role`, y ambos puntos de entrada JS (`aliados-tesoreria-app.js`, `finanzas-programadas-app.js`) ya solo invocan el recorder unificado que llama a `finanzas_registrar_pago_real`. No quedan llamadas residuales a las funciones retiradas.
- Permitir fecha anterior a `created_at/approved_at` (pago real del miércoles 21) sigue intacto y es coherente con el requisito explícito de Óscar; el único freno real es el corte de apertura (1 de octubre), no la fecha de creación del registro.
- El candado `for update` sobre la cuenta se toma antes de la comparación de corte y se reutiliza (misma fila, misma transacción) dentro del trigger disparado por el mismo `UPDATE`, sin riesgo de deadlock ni de lectura obsoleta.

Hallazgo menor, no bloqueante: en `finanzas-programadas-app.js` el input `f_payment_date` no tiene `max` (a diferencia de `aliados-tesoreria.html`, que sí fija `max` a la fecha de hoy en Bogotá). No es un problema de seguridad porque tanto el wrapper JS (`tesoreria-pagos-unificados.js`) como el RPC rechazan fechas futuras server-side, pero conviene agregar el mismo `max` en esa vista por consistencia de UX la próxima vez que se toque ese archivo.

No se encontraron fallos concretos que bloqueen el merge.
