# SMS excepcional de NOVA: selección y costo, 30/10/2026

**Seleccionaría Inalambria Express, paquete Starter 500, como transporte del OTP propio de NOVA.** Su entrada publicada es COP19.500 con IVA, saldo sin vencimiento y API REST documentada. La elección es por costo verificable y bajo desembolso para este volumen; no demuestra ser el proveedor más barato de Colombia ni garantiza una ruta que aún no hemos probado. No se creó cuenta, compró saldo, contactó proveedores ni envió ningún mensaje.

## Comparación de costo real para poco volumen

Supuestos: un SMS corto por operación, sin reintentos, OTP generado y validado por NOVA. Los importes USD no se convierten usando una TRM inventada; la tarjeta/proveedor determina el cambio y los impuestos aplicables.

| Opción | 100 SMS/mes: consumo | 500 SMS/mes: consumo | Dinero inicial y condiciones |
|---|---:|---:|---|
| Inalambria Express Starter 500 | COP3.900 | COP19.500 | Paquete publicado menor: COP19.500 por 500, IVA incluido; no cuota mensual; saldo no vence. A100/mes cubre5meses. Recarga no reembolsable. |
| Hablame tarifa anunciada COP6* | COP600 **solo si aplica** | COP3.000 **solo si aplica** | Recarga mínima publicada COP50.000, IVA incluido, saldo no vence. El asterisco exige volumen mensual mínimo sin precisar cuál; no permite confirmar esta tarifa para100/500. |
| Altiria Colombia | No confirmado públicamente | No confirmado públicamente | Prepago sin mensualidad y sin caducidad; calculadora publica precios sin IVA pero no renderizó valores/minimum. DLR/API avanzados pueden tener sobrecargo. |
| AWS SMS, manteniendo OTP propio | USD5,087 | USD25,435 | Tarifa CSV Colombia All Networks USD0,05087/segmento, más impuestos/cargos aplicables. |
| Twilio SMS, manteniendo OTP propio | USD5,92 | USD29,60 | USD0,0592/segmento Colombia; posibles costos de número/operador e impuestos adicionales. |
| AWS OTP administrado | USD9,587 | USD47,935 | Incluye USD0,045 por verificación exitosa además de un SMS por caso. |
| Twilio Verify administrado | USD10,92 | USD54,60 | Incluye USD0,05 por verificación exitosa además de un SMS por caso. |

Para100 SMS del primer mes, distinguir **consumo COP3.900** de **desembolso COP19.500**. Quedan400 SMS. La recarga inicial supera el costo nominal de100 SMS de AWS si el cambio efectivo fuera menor de COP3.833,30/USD; el consumo amortizado de Express es menor que AWS siempre que ese cambio supere COP766,66/USD. Son puntos de equilibrio matemáticos, no cotizaciones de divisas.

Fuentes de costos: [Inalambria Express precios](https://www.inalambria.express/co/precios), [FAQ de pago y saldo](https://www.inalambria.express/co/preguntas-frecuentes), [Hablame](https://www.hablame.co/sms/), [Altiria calculadora](https://www.altiria.com.co/comprar-paquetes-de-sms/), [Altiria condiciones de contratación](https://www.altiria.com.co/como-contratar-el-envio-de-mensajes-sms/), [AWS precios OTP](https://aws.amazon.com/end-user-messaging/pricing/), [CSV oficial AWS SMS](https://d1.awsstatic.com/onedam/marketing-channels/website/aws/en_US/business-applications/approved/documents/End-User-Messaging-SMS-Prices.ebc340b4d416d90832dd59629c4792b0deb6f8bc.csv), [Twilio Colombia](https://www.twilio.com/en-us/sms/pricing/co), [Twilio Verify](https://www.twilio.com/en-us/verify/pricing).

## Contrato verificable del seleccionado

La [página API oficial](https://www.inalambria.express/co/api-sms) vincula su [OpenAPI público](https://github.com/InalambriaExpress/inalambria-express-api-docs/blob/main/openapi.yaml). Base `https://api.inalambria.express/v1`; autenticación `Authorization: Bearer <API_KEY>` y JSON.

Envío propuesto, sin ejecutarlo:

```http
POST /v1/messages/send
Content-Type: application/json

{"recipients":["+573000000000"],"content":"Creditek: tu codigo NOVA es 123456. No lo compartas.","async":false}
```

La modalidad síncrona limita30peticiones/minuto y devuelve200 con `consumptionId`, `ok`, `credits`, `messages`; la asíncrona devuelve202 con `jobId`. Consultas: `GET /messages/job/{jobId}`, `/messages/history`, `/messages/balance`. El historial documenta `isSent` y el job estados `PENDING/RUNNING/COMPLETED/FAILED`; esto prueba procesamiento, no lectura del SMS.

**Idempotencia y DLR:** no hay `Idempotency-Key` ni webhook de entrega de operadora documentados en este OpenAPI Express. La web comercial sí ofrece estado entregado/pendiente/fallido en el panel, pero el contrato publicado no define cómo leer DLR individual por API. No extrapolar funciones de Inalambria Verify empresarial: ese es otro producto. NOVA debe conservar reserva única por desafío y estado incierto sin reintento automático cuando una solicitud pudo salir; no hay garantía de deduplicación del proveedor documentada. La prueba decisiva del OTP es que el usuario lo introduzca correctamente.

Las llaves API se habilitan después de la primera recarga. La [oferta transaccional oficial](https://www.inalambria.express/co/sms-transaccional) contempla códigos OTP, envío de una vía mediante código corto y límites de presupuesto por llave. [Su FAQ](https://www.inalambria.express/co/preguntas-frecuentes) declara cobertura de operadores colombianos y OMV. Estas son capacidades declaradas, pendientes de verificar con un piloto autorizado.

## Otros locales revisados

**Hablame:** [RESTv5](https://docs.hablame.co/reference/envio-sms-post), `POST https://www.hablame.co/api/sms/v5/send`, header `X-Hablame-Key`, `priority:true`, arreglo `messages`. [Consulta por ID](https://docs.hablame.co/reference/consulta-sms-id) diferencia fallo, en proceso y entrega al operador, con entrega al móvil cuando aplica. [Generalidades](https://docs.hablame.co/reference/generalidades-del-servicio) describen OTP prioritarios y certificado con costo adicional. No encontré deduplicación de envíos REST por llave documentada. Su web principal dice sin recarga mínima, pero su página detallada dice mínimoCOP50.000: usar la condición detallada hasta aclarar. La [documentación SMPP nueva](https://developers.hablame.co/sms-smpp) exige cuenta comercial/IP fija y no publica tarifas. No usarla como si fuera la API RESTv5.

**Altiria:** [API REST](https://apidocs.altiria.com/es/) con credenciales y envío JSON; DLR genéricos por `notificationUrl`. El servicio/precio de confirmación y su cobertura Colombia no quedan garantizados por el esquema general. No encontré idempotencia documentada. Su compra mínima depende del país; sin cotización o calculadora operativa no comparo un costo inventado.

**Masiv/Cellvoz:** [Masiv](https://www.masiv.com/sms/) documenta OTP/cobertura local y [Cellvoz](https://cellvoz.com/pdf/Terminos-y-condiciones-032020.pdf) describe API y cobro por consumo; no obtuve tarifa pública actual aplicable100/500 con mínimo/IVA, por lo que no desplazan al candidato de precio completo verificable.

## Criterio de salida a producción

Preparar un transporte Express deshabilitado hasta contar con cuenta y llave autorizadas; no comprar por inferencia de esta investigación. Piloto con un número expresamente autorizado, comprobando cargo de un SMS, recepción y validación del mismo desafío. Preservar WhatsApp como canal principal; habilitar SMS solo por solicitud explícita del usuario o fallo terminal comprobado, nunca por ausencia de lectura. Mantener cooldown, un único OTP, límites por número, límite global y presupuesto; bloquear en incertidumbre sin bucles. No mandar solicitudes, fotos ni documentos al proveedor SMS, únicamente destino y código mínimo.
