# NOVA SMS · pruebas reproducibles de interfaz

Este paquete prueba el formulario congelado del release y contiene su helper,
builder, manifest de integridad y evidencia de Chrome. El backend candidato
ya está incluido en el mismo release: `../managed-otp.mjs`,
`../inalambria-express.mjs`, `../index.mjs` y sus pruebas. Estas comprobaciones
de UI no sustituyen las pruebas SQL/HTTP/proveedor ni certifican publicación.

## Ejecutar desde la raíz de este release

```sh
python3 ui-tests/build-form-candidate.py
node --test ui-tests/form-candidate.test.mjs
```

No requieren dependencias nuevas, servicios, credenciales ni red. El builder
lee `../form-base.html`, exige su SHA y once anclajes únicos, inserta el
helper de este directorio y compara el resultado byte a byte con `../form.html`.
Escribe únicamente `generated/`, ignorado por Git. **Nunca escribe el formulario
del release ni su base.** Las pruebas leen ambos archivos mediante rutas
relativas a su módulo; funcionan desde cualquier directorio de trabajo.

`manifest.json` identifica el formulario congelado, su base y los archivos
necesarios para reproducir la prueba:

- Formulario actual: `0f95fd3046df2e74b607a6f5dd9182c02048a5571e26a2689e73d72e61379c2e`.
- Base: `72bdd44f7982ca86a8d459403541142a2fd92119a1501d48da03e8489e2c1fc2`.

## Cobertura y resultado

**21 pruebas aprobadas** del script real del formulario, en VM con DOM
simulado, objetos File sintéticos reales y transporte simulado. La
inicialización de red se omite expresamente en esa VM.

Se comprueba WhatsApp previo byte a byte cuando SMS no está habilitado,
capacidad tardía sin mezclar protocolos, SMS explícito, conservación de
File/cache/recibo y datos, exclusión de clics concurrentes, 202/reserved,
incertidumbre sin reenvío, consultas con el mismo UUID, vencimiento, fallo y
409/active_challenge. Verificar mantiene los cuatro campos originales y
retoma el expediente usando los nodos de foto existentes.

`verified` de otra pestaña es terminal: oculta Consultar y SMS, bloquea nuevos
envíos incluso al vencer el TTL y pide continuar en el formulario original.
No inventa una sesión ni marca como verificado el formulario local.

## Capacidad vinculada al celular

La capacidad SMS se consulta con `{enlace_token, celular}` después de sanitizar
el celular y aplicar debounce de 350 ms. La respuesta debe ser la última y
coincidir con el mismo celular/contexto. Un resultado antiguo no puede volver
a mostrar SMS para otro número.

`smsOtpAllowed` controla el permiso dinámico. `smsOtpEnabled` conserva el
protocolo gestionado cuando ya hay un intento. False/fallo antes del primer
intento deja WhatsApp antiguo exacto; false/fallo después de un intento solo
oculta SMS, conserva Consultar/verificar y el UUID, recibo, cache y archivos.
El backend aplica el guard del piloto; la interfaz no expone su whitelist.
Las seis regresiones nuevas cubren ese delta, sin tráfico real.

## Evidencia de Chrome: BASE anterior, no el delta actual

`evidence/chrome-browser-results.json` y `browser-summary.json` corresponden
a la BASE `3a87f636b8d173d7c883424a58cc97510d4730cf841c41465f55dc2527bf4ce2` en **Chrome 156**,
antes del delta de capacidad vinculada al celular. **No validan en Chrome el
formulario actual `0f95fd3046df2e74b607a6f5dd9182c02048a5571e26a2689e73d72e61379c2e`.** Ocho comprobaciones conservaron
el mismo objeto File de 68 bytes, el nodo del input, nombre, cédula y celular.
Cuatro envíos y cuatro consultas fueron exclusivamente simulados; cada
consulta usó el UUID de su operación. **Cero llamadas reales de API y cero
mensajes enviados a proveedores.** Todos los datos visibles son ficticios.

Las capturas inspeccionadas `sms-verified-terminal-ui.jpg` y
`file-preserved-ui.jpg` muestran el mensaje terminal y la foto conservada.
El reloj fue simulado dentro de la página; no cambió el reloj del equipo.

`browser-fixture/` permite reproducir manualmente los casos locales del formulario actual con botones
visibles, File/DataTransfer nativos, endpoints y Turnstile simulados en memoria
y CSP que bloquea toda conexión externa. No implica pruebas contra producción.

La integración con HTTP real, exclusión atómica y proveedor se verifica en
las pruebas del backend candidato del release y, cuando corresponda, en la
validación autorizada de producción. La evidencia de interfaz no demuestra
entrega de SMS o WhatsApp a un teléfono.

El suplemento Chrome del delta agotó el tiempo de CUA y reinició su kernel.
No produjo un resultado aprobado. No se repitió ni se ejecutaron nuevas
pruebas de navegador durante esta integración. Consulte `evidence/README.md`.
