# AURA: visibilidad durante la carga y marca lateral

La captura del usuario mostró «Sofía» en el encabezado mientras el Panel general seguía visible. `openModule` cambiaba el título y quitaba el iframe, pero no ocultaba el panel hasta recibir `load`. Ahora se muestra inmediatamente un estado «Abriendo Sofía…» y el preflight tiene un límite de 15 segundos. Se conservan permisos, detección de respuestas tardías, reintentos y retorno al panel.

La marca y el botón lateral se superponían: en la sesión real, la marca ocupaba y=32,5–76,5 y el botón y=60–104. El botón tenía 44px de alto aunque su posición se había calculado con un tamaño menor. El encabezado lateral pasa a una cuadrícula: marca y botón separados. En menú compacto se muestra AURA y el logo completo de Creditek con `object-fit:contain`, sin recortes ni modificaciones del archivo.

La publicación agrega un único módulo al `creditek-aura-shell` real. Conserva byte a byte los cuatro módulos anteriores, incluidas la corrección interna de Sofía y la desactivación del dictado. No cambia rutas, permisos, enlaces, presupuesto, Sofía backend ni NOVA.

Nueve pruebas: carga pendiente, permiso denegado, error, cancelación, integridad de scripts/logo, contrato de entrada, shell completo, preservación de Sofía/dictado y archivos de sesión. Verificación visual local a 1200 y 390px con menú abierto/cerrado y scripts operativos retirados. Respaldo privado no versionado: `backups/aura-shell-visibility-20261028/`.

`release.mjs` es de solo lectura por defecto. `--apply` exige el predecesor exacto de cuatro módulos y comprueba la fuente publicada, los dos accesos del inicio, configuración y respuestas ajenas. Antes de dar la revisión por terminada falta observar la sesión autenticada tras recargar.
