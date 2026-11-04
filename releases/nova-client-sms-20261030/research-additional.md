# Ampliación: SMS excepcional en Colombia — 30/10/2026

Investigación pública, sin cuentas, contacto comercial, compras, llamadas a APIs autenticadas ni mensajes. No modifica el adaptador preparado.

**No encontré una opción publicada que reúna simultáneamente desembolso inferior a COP19.500, precio inferior a COP39/SMS, API apta para OTP y condiciones completas verificables. Esto no demuestra que no exista.** Inalambria Express sigue siendo candidato provisional para respaldo muy esporádico y menor desembolso comprobado entre las ofertas completas estudiadas. **LabsMobile sí mejora mucho el precio por uso y puede ser más económico si el uso se sostiene**, aunque tiene mínimo mayor y saldo que caduca.

## Alternativa relevante: LabsMobile

- La [lista oficial actual](https://www.labsmobile.com/es/prices/pricelist), PDF #PL20261030, página2, publica Colombia a **EUR0,0019/SMS** en el tramo pequeño (redondeado; 4.706SMS en la compra mínima). El tramo mayor no aplica a un piloto. No confundir el precio internacional por SMS con el precio de un crédito.
- [Compra mínima y vigencia](https://www.labsmobile.com/es/comprar-sms-precio): **EUR9 o USD10**, créditos válidos **18 meses**, sin cuota de alta ni mantenimiento. La tabla dice precios **sin IVA**: no confirmo qué impuesto final aplica a Creditek en Colombia ni convierto divisa con una cotización inventada.
- [OTP oficial](https://www.labsmobile.com/es/envio-sms-masivo/sms-otp): la API OTP no tiene sobrecargo; permite también su API SMS estándar. Para mantener el desafío en NOVA usaríamos transporte SMS, sin duplicar generación/validación.
- [Colombia](https://www.labsmobile.com/en/bulk-sms-sending-platform/colombia): cobertura declarada de operadores/OMV, remitente corto compartido sin prerregistro, tráfico transaccional permitido. La confirmación de Colombia es **aceptación de red del operador**, no confirmación en el teléfono ni lectura. Una ruta OTP exclusiva/prioritaria se solicita aparte; no hay aquí precio de esa ruta.
- [Contrato API](https://www.labsmobile.com/es/api-sms/versiones-api/http-rest-post-json): `POST https://api.labsmobile.com/json/send`; HTTP Basic `usuario:token`, JSON con `message`, `tpoa` y `recipient:[{msisdn:'573...'}]`. Respuesta de procesamiento con `code:0`/`'0'` y `subid`; no equivale a entrega. DLR documentados por callback con niveles `gateway/operator/handset/error`, sujetos a cobertura. No constaté idempotency key de envío; conservaríamos la reserva SQL y ausencia de reintento ciego.

### Coste a poco volumen

Un SMS corto por operación, sin reintentos. EUR son precios publicados redondeados antes de impuestos; COP de Express incluyen IVA.

| Consumo | Express Starter500 | LabsMobile tramo pequeño |
|---|---:|---:|
|100SMS/mes, importe consumido|COP3.900|aprox.EUR0,19|
|500SMS/mes, importe consumido|COP19.500|aprox.EUR0,95|
|Menor compra publicada|COP19.500 por500|EUR9 oUSD10, aprox.4.706SMS según PDF en EUR|
|Vencimiento|No vence|18 meses|

A100SMS/mes durante18meses, Express exige cuatro paquetes de500: desembolso COP78.000, conservando200SMS. LabsMobile usaría una compra deEUR9: quedarían unos2.906SMS que caducarían si no se usan, pero puede resultar menor desembolso total aun con ese saldo perdido. No puede describirse Express como la alternativa de menor costo total para100/mes sostenidos. A10/mes o demanda muy baja, prevalecen el menor desembolso de Express y que el saldo no expire. La elección cambia con volumen real, impuestos y cambio efectivo de la tarjeta.

## Otros candidatos ampliados

| Proveedor | Evidencia primaria y resultado |
|---|---|
|[SMSActivo](https://www.smsactivo.com/tarifas/)|Menor paquete publicado1.000SMS: COP30.851 «Más IVA19%» y, en el mismo bloque, «Precios IVA incluido». API y saldo sin vencimiento declarados. Si se añade19% serían COP36.712,69; la contradicción impide dar precio final confirmado. Desembolso superior incluso antes de IVA.|
|[Mensatek](https://www.mensatek.com/precios.php)|MínimoEUR10, créditos no caducan, precios sin IVA; API OTP/SMS publicada. La tarifa general de un crédito no confirma el precio por SMS a Colombia; no la traslado desde España. No reduce la entrada.|
|[SMSPubli](https://www.smspubli.com/)|API publicada y tarifa anunciada desdeEUR0,0314, sin tabla Colombia/minimo/IVA y caducidad aplicables obtenidos. No comparar como si fuera tarifa Colombia.|
|[Flashy](https://flashy.app/es/precios/)|Publica preciosSMS para cinco países; Colombia no está entre ellos. Requiere cotización; no hay prueba de menor costo paraOTP Colombia.|
|[Intico](https://intico.ai/pricing/)|Precios empresariales «Contact us», sin costo unitario/mínimo Colombia verificable.|
|[Hablame](https://www.hablame.co/sms/)|COP6 IVA incluido **sujeto a volumen mensual mínimo no precisado**, compra mínimaCOP50.000, sin caducidad. No se confirma la tarifa para100/mes y mayor entrada.|
|[SMS.es](https://sms.es/precios/)|StarterEUR5, duración6meses; menor mínimo enEUR pero no tarifa Colombia pública y vigencia corta. No cumple el criterio completo.|
|[WorldSMS](https://worldsms.io/es/sms/colombia)|USD0,0073/segmento pero depósito mínimoUSD40, muy superior al objetivo. IVA/condición tributaria final no confirmados.|
|[Localphone](https://www.localphone.com/es/sms/colombia)|Precio minorista anunciado0,1centavo USD; no encontré contrato público de API SMS saliente apta paraOTP empresarial. No sustituye a un transporte verificable.|
|[Seamtel](https://www.seamtel.com/pricing)|Al abrir la tabla completa, USD0,0058 Colombia corresponde a **WhatsApp**; SMS dice «No rates yet». No usar ese precio paraSMS.|

SMSBaratos/Mensajea: no obtuve fuente primaria operativa con contrato y precio Colombia completo; no atribuyo precios. Cellvoz/Masiv/Altiria permanecen con las limitaciones recogidas en `../research.md`.

## Decisión operativa

Mantener Express como adaptador preparado mientras el objetivo sea menor recarga y respaldo raro. Informar explícitamente la alternativa LabsMobile si se espera usar cerca de100SMS/mes: preparar su adaptador sería un cambio de proveedor que requiere contrastar precio final de la cuenta y probar ruta autorizada. No activar ningún proveedor ni comprar saldo con esta investigación.
