# NOVA: prioridad de restricciones confirmadas

Corrige la evaluación automática: cero cuotas pagadas, más de dos cuotas vencidas, o cuotas vencidas con menos de cuatro pagadas producen rechazo con los motivos existentes, canProcess=false, requiresAndrea=false y overrideAllowed=false. El número de cuotas pagadas no es necesario para rechazar si ya están confirmadas más de dos vencidas.

El agregado de Krediya se acepta únicamente como evidencia restrictiva cuando coincide el expediente/recibo/batch/autorización, la identidad está verificada, la respuesta está vigente, la plataforma coincide y la clasificación del estado de cuenta es active_arrears. No se inventan obligaciones ni cuotas pagadas, ni se marca completo un historial incompleto.

Se conservan la prioridad de consentimiento revocado y ambas constantes de política anteriores. restrictionRuleVersion se registra dentro de la decisión rechazada, que ya forma parte de la huella. Casos no restrictivos conservan exactamente la evaluación y huella anteriores. No se inicia reproceso masivo de autorizados o entregados.

Pruebas: `python3 build.py`, `node --check candidate/nova/index.mjs`, `node --test tests.mjs` (16 escenarios ficticios), Wrangler versions upload --dry-run. Publicación solo creditek-nova; creditek-clientes y las rutas/cron/bindings deben permanecer idénticos según live-guard.py. No cambia base de datos ni solicita crédito.
