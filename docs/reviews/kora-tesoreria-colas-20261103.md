# Tesorería: autorización y soportes

Se separan las tarjetas de aliados y ejecutivos por autorización existente. Al autorizar, la recarga ya existente las traslada a la sección inferior de soportes. No se cambian RPC, pagos, saldos ni autorizaciones. Los pagos realizados sin soporte aparecen en esa sección; los cerrados permanecen en histórico. Se actualizan contadores y versiones de scripts.

Validación: 32 pruebas específicas aprobadas; suite test:local 1418 aprobadas; node --check y git diff --check correctos.

Claude revisó el diff sin datos reales: aprobado sujeto a comprobar que paymentGroups/paymentCards no tienen otros consumidores. Búsqueda en aliados-tesoreria-app.js confirma que solo se usan en las listas y sus contadores; no intervienen en exportaciones, totales financieros ni acciones de pago.

No se ejecutaron autorizaciones ni pagos reales durante la validación.
