# Formulario local con endpoints simulados

Desde la raíz de este release:

```sh
python3 ui-tests/browser-fixture/serve-browser-mock.py
```

Abrir `http://127.0.0.1:8787/?t=synthetic-link` en un navegador de prueba.
El servidor escucha solo en loopback y sirve una copia del formulario con el
SHA de `../manifest.json`. El original permanece sin cambios. Las rutas de
lectura de origen y manifest se resuelven desde este script, no desde el cwd.

La copia quita recursos externos. Un fetch cerrado responde en memoria a los
endpoints conocidos; no conserva una función de salida a la red. Turnstile
es un stub explícito. CSP usa `connect-src 'none'`, `form-action 'none'` y
permite únicamente los recursos locales necesarios. Ningún caso debe usar
datos reales, enviar OTP ni solicitar permisos de cámara o micrófono.

1. Introducir cédula `999999999999`, nombre `PRUEBA LOCAL NOMBRE CONSERVADO`
   y celular `3000000000`. Son datos ficticios y solo llegan a los mocks.
2. Pulsar **Cargar foto sintética y fijar control**. El botón crea File y
   DataTransfer nativos y guarda las referencias para compararlas después.
3. Probar WhatsApp incierto y consultar el mismo UUID como accepted.
4. Avanzar seis minutos simulados; probar SMS fallido, consultar fallo terminal
   y solicitar otro SMS explícitamente después del control de 15 segundos.
5. Probar SMS incierto y consultar accepted. Comparar conservación después
   de cada paso usando el botón visible de comprobación.
6. Tras vencer ese accepted, iniciar otro SMS incierto y consultar
   **Ya verificado en otra pestaña (409)**. Confirmar que no se ofrece otro
   envío/consulta ni se habilita verificar, incluso tras avanzar el TTL.

Cada reporte muestra el SHA, igualdad de objeto File y nodo, conservación de
los tres campos, operaciones/consultas simuladas y ausencia de tráfico real.
La tabla de resultados visible es la fuente de los recibos copiados en
`../evidence/`. Los controles de reloj solo afectan esta página.

Este fixture se conserva para reproducibilidad. No añade capacidades de
administración, acceso a clientes ni transporte real del proveedor.


La capacidad simulada ahora acepta únicamente el celular sintético
`3000000000` cuando la casilla de permiso del fixture está activa. Cambiar el
celular dispara la consulta después de 350 ms; desactivar la casilla durante
un intento incierto debe ocultar solo SMS y conservar Consultar con su UUID.

Este fixture lee el formulario actual del release. Los recibos y capturas
copiados de ocho comprobaciones corresponden exclusivamente a la BASE
3a87…4ce2; no son evidencia de que este delta se haya probado en Chrome.
El intento suplementario no produjo resultado por timeout de CUA.
