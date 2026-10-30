# SQL local · OTP cliente por canal

**Candidato sin aplicar a producción.** Policy SMS inicial `enabled=false`, máximo
10 reservas/día, 100/mes, 39 COP reservados por SMS y 3900 COP/mes. WhatsApp mediante
el wrapper funciona aunque SMS esté pausado. Los fallidos e inciertos retienen
todo el costo reservado; un costo reportado inferior no produce reembolso.
La tarifa está fijada por CHECK a 39 COP; no se permite bajar la reserva mediante
configuración. Otra tarifa requiere revisión y migración.
Si el costo reportado supera la reserva, se conserva la aceptación y el costo
real, pero options deshabilita SMS y reserve rechaza SMS_COST_ANOMALY hasta revisión
administrativa. No modifica enabled ni requiere UPDATE policy para el servicio.

`../../../supabase/migrations/20261030165534_nova_client_sms_otp_budget.sql` añade dos tablas con RLS, un trigger acotado y seis funciones
SECURITY INVOKER con `search_path=''` y ejecución solo para service_role. No cambia
las funciones originales de reserva, verificación, registro, resume o seed.
service_role puede leer la policy, pero no editarla, activar SMS ni elevar caps.

## Contrato para Worker

```
nova_client_otp_reserve(
 p_cedula text,p_celular text,p_enlace_registro_id uuid,p_request_id uuid,
 p_channel text,p_selected_reason text,p_codigo_hash text,p_expira_at timestamptz)
=> {requestId,attemptId,otpId,channel,state,canSend,reservedCostCop,expiresAt}

nova_client_otp_finish(
 p_request_id uuid,p_attempt_id uuid,p_status text,
 p_provider_message_id text=null,p_error_code text=null,p_reported_cost_cop numeric=null)
=> mismo formato; canSend:false

nova_client_otp_status(p_request_id uuid,p_cedula text,p_celular text,p_enlace_registro_id uuid)
=> {found:false} o {found:true,requestId,channel,state,expiresAt,retryAfter,
                   otpId: solo cuando state=accepted}

nova_client_otp_options(p_enlace_registro_id uuid)
=> {smsEnabled,unitPriceCop,dailySmsLimit,monthlySmsLimit,monthlyBudgetCop,
    dailySmsReserved,monthlySmsReserved,monthlyCostReservedCop,budgetAvailable}

nova_client_otp_metrics(p_from timestamptz,p_to timestamptz)
=> {from,to,channels:[{channel,requested,reserved,accepted,uncertain,failed,verified,
                     budgetReservedCop,costReportedCop,costReportedCount}]}
```

El Worker debe pasar toda solicitud de envío seguro WA/SMS por el wrapper cuando
se habilite esta integración. No habilitar SMS con endpoints de registro legado.
SMS exige `selected_reason='no_whatsapp'`; WhatsApp exige reason NULL. Enlaces y
orígenes se revalidan en SQL y deben estar activos y dentro CK-01…CK-09.

Repetir requestId con el mismo contexto nunca autoriza otro envío, aunque el
retry haya generado otro hash/expiry; el código nuevo no debe enviarse. Cambiar
contexto o canal con ese ID produce conflicto. Un OTP no verificado ni consumido
que siga vigente bloquea otra reserva incluso si estaba marcado FAILED.

El trigger toma los mismos locks por celular y enlace que el RPC original. Si
existe un SMS ledger con OTP vigente no verificado, también frena al caller WA
original que estuviera en vuelo. No depende de policy.enabled y no cambia el
comportamiento WA original cuando no existe ese SMS.

Accepted exige provider ID. Uncertain puede conservar un ID de cola, pero no
escribe envio_aceptado_at ni envio_fallido_at; no permite verificar. Finish no
extiende TTL y no registra delivered. Status devuelve verified si ya se verificó;
en los demás estados deriva expired al vencer. No devuelve IDs del proveedor,
costos ni datos personales. El Worker debe exponer del options únicamente lo
necesario para la UI y tratar options como preflight; reserve es la autoridad.

## Pruebas aisladas

`PGLITE_MODULE=<ruta a @electric-sql/pglite/dist/index.js> node control.mjs`

El paquete usado es PGlite 0.5.8 (PostgreSQL 18.3 WASM). También puede resolverse
como dependencia `@electric-sql/pglite` sin la variable. No se descarga nada.
El fixture usa exclusivamente datos ficticios e importa del snapshot local sanitizado las
definiciones originales de reserva/resume/seed. Verifica que no cambien y prueba
recuperación con OTP SMS nuevo, sourceOtp antiguo, mismos IDs y fotos aprobadas.

El control deja recibo y TAP. PGlite ejecuta SQL real y ACL/RLS, pero su sesión
única **no certifica contención entre varias conexiones**. La validación nativa
usa `NOVA_SQL_NATIVE_CONTAINER=<contenedor aislado> node control.mjs` y después
`node native-concurrency.mjs` con la misma variable. Se ejecutó PostgreSQL 17.11
local sin red, puertos ni bind mounts: 19 pruebas funcionales y cinco carreras
entre dos conexiones. Los recibos nativos son separados. No usar estos recibos
como autorización de despliegue ni afirmar versión 17.6.
