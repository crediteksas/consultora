# AURA: visibilidad durante la carga y marca lateral

La captura del usuario mostró «Sofía» en el encabezado mientras el Panel general seguía visible. `openModule` cambiaba el título y quitaba el iframe, pero no ocultaba el panel hasta recibir `load`. Ahora se muestra inmediatamente un estado «Abriendo Sofía…» y el preflight tiene un límite de 15 segundos. Se conservan permisos, detección de respuestas tardías, reintentos y retorno al panel.

La marca y el botón lateral se superponían: en la sesión real, la marca ocupaba y=32,5–76,5 y el botón y=60–104. El botón tenía 44px de alto aunque su posición se había calculado con un tamaño menor. El encabezado lateral pasa a una cuadrícula: marca y botón separados. En menú compacto se muestra AURA y el logo completo de Creditek con `object-fit:contain`, sin recortes ni modificaciones del archivo.

La publicación agrega un único módulo al `creditek-aura-shell` real. Conserva byte a byte los cuatro módulos anteriores, incluidas la corrección interna de Sofía y la desactivación del dictado. No cambia rutas, permisos, enlaces, presupuesto, Sofía backend ni NOVA.

Nueve pruebas: carga pendiente, permiso denegado, error, cancelación, integridad de scripts/logo, contrato de entrada, shell completo, preservación de Sofía/dictado y archivos de sesión. Verificación visual local a 1200 y 390px con menú abierto/cerrado y scripts operativos retirados. Respaldo privado no versionado: `backups/aura-shell-visibility-20261028/`.

`release.mjs` es de solo lectura por defecto. `--apply` exige el predecesor exacto de cuatro módulos y comprueba la fuente publicada, los dos accesos del inicio, configuración y respuestas ajenas. La revisión autenticada quedó terminada el 28/10/2026 a las 8:38 p. m. Colombia: menú abierto/cerrado sin solape; marca y botón separados por 8px en compacto; al pulsar Sofía se observó «Abriendo Sofía…» con el Panel general oculto, y después el módulo visible con el estado de carga retirado. Captura privada: `/tmp/aura-visibilidad-corregida-20261028.jpg`. Versión productiva `3b19268f-b40f-4d5c-9681-f2d7be0f2754` al 100%. Fuente nueva `49a396408a81736a4553f6c2cc45c37f9a793e66668ff2abd240dcc725a47f81`.
