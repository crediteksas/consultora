# Sofía: historial completo y respuesta siempre visible

El contenedor `#chat-area` no participaba en la distribución vertical del panel. El historial usaba un máximo calculado contra toda la ventana, aunque la cabecera y el aviso consumen espacio dentro del iframe. Con conversaciones largas, el campo de respuesta quedaba fuera del área visible.

La corrección distribuye el espacio disponible con flex, deja el desplazamiento en el historial y conserva cabecera, aviso y respuesta. Solo añade CSS a las dos rutas existentes de Sofía. No cambia scripts de atención, clientes, permisos ni envíos.

Validación: tres pruebas del Worker real con Miniflare, páginas de demostración de 35 mensajes en 1200×997, 1058×800 y 390×844. En las tres el historial tiene desplazamiento y el campo de respuesta queda dentro de la ventana. La comprobación publicada debe incluir una conversación autenticada.

`release.mjs` es de lectura por defecto. `--apply` exige los hashes de los cinco módulos productivos anteriores, los conserva byte a byte y añade un módulo. Comprueba configuración, páginas ajenas y Workers AURA, Sofía y NOVA. No llama endpoints de mensajes ni ejecuta pruebas pagadas.

La sesión local de Claude no estaba autenticada; no se abrió una sesión nueva ni se utilizó una API de pago para la revisión. La validación ejecutada se documenta arriba sin atribuirla a Claude.
