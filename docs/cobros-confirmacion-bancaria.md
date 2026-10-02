# Confirmación contra banco en un paso

Gerencia puede confirmar la recepción total desde el corte o desde su cobro esperado. La RPC crea una recepción identificada como `confirmacion_gerencia` y la aplica al corte en la misma transacción. Guardar únicamente el esperado sigue sin confirmar ingresos.

Se exige declaración explícita y coincidencia con el esperado existente; diferencias, parciales o abonos sin aplicar requieren revisión. Las repeticiones no duplican ingresos. La confirmación queda con actor y fecha de registro; no inventa fecha bancaria, banco ni cuenta. El detalle y CSV distinguen estas recepciones de abonos documentados. No cambia saldos contables, utilidades ni órdenes de pago.

La regularización histórica autorizada se limita a los 24 cobros activos PayJoy de 24/08 a 20/09/2026, por $65.615.770, después de comprobar que no tengan aplicaciones ni depósitos previos. No se confirma ALO o Krediya por inferencia.

## Anulación de ingresos en Banco Creditek

Desde la integración del libro bancario, una recepción posterior al corte sí genera
un ingreso en Banco. Al anularla, se conserva ese asiento y se agrega un
`reverso_ingreso_plataforma`, relacionado con el movimiento original. No se
registra como gasto ni se modifica la liquidación, la utilidad o los pagos.

Gerencia debe anular primero las aplicaciones del depósito. El reverso y el
cambio de saldo son atómicos; la cuenta queda bloqueada durante la operación
para evitar concurrencia, y la fuente única impide descontar dos veces. Si no
existía asiento bancario (por ejemplo, un cobro anterior a la apertura), no se
descuenta Banco. Si el saldo no permite el reverso, la anulación del depósito
falla sin cambiarlo. No se reactiva un depósito anulado: cuando realmente llegue
el dinero se registra una nueva recepción verificada.

Si la confirmación errónea creó también un neto esperado equivocado, se anula
ese esperado después de sus aplicaciones. El corte reaparece como pendiente de
validar el neto, conservando la liquidación aprobada y el historial de anulación.
