# Confirmación contra banco en un paso

Gerencia puede confirmar la recepción total desde el corte o desde su cobro esperado. La RPC crea una recepción identificada como `confirmacion_gerencia` y la aplica al corte en la misma transacción. Guardar únicamente el esperado sigue sin confirmar ingresos.

Se exige declaración explícita y coincidencia con el esperado existente; diferencias, parciales o abonos sin aplicar requieren revisión. Las repeticiones no duplican ingresos. La confirmación queda con actor y fecha de registro; no inventa fecha bancaria, banco ni cuenta. El detalle y CSV distinguen estas recepciones de abonos documentados. No cambia saldos contables, utilidades ni órdenes de pago.

La regularización histórica autorizada se limita a los 24 cobros activos PayJoy de 24/08 a 20/09/2026, por $65.615.770, después de comprobar que no tengan aplicaciones ni depósitos previos. No se confirma ALO o Krediya por inferencia.
