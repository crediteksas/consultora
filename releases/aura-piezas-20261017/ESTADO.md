# Mejoras de Piezas comerciales — 17 octubre 2026

Estado: PUBLICADO el 17 octubre 2026. Versión 7ac9e038-8338-4086-bb5d-c257063cdd7c, 100% tráfico. Ocho pruebas pasan. Verificación posterior de hash, ambas URLs, rutas y bindings correcta.

Cambios: titulares con contexto comercial y estilo explícito, una única solicitud concurrente, descarte de respuestas de contextos anteriores, eliminación de dos regeneraciones automáticas, caché de corrección ortográfica, resultados visuales independientes por proveedor, reglas de escena subordinadas al encargo y protección contra recorte silencioso de prompts Recraft.

Protección: pipeline del logo y seis estilos idénticos byte a byte. Wrapper conserva el Worker activo completo y sólo sustituye el documento de Piezas si el HTML upstream coincide con el hash auditado. No cambia autenticación, bindings, rutas ni otros agentes.

Validación: sintaxis de scripts y Worker; concurrencia de titulares; descarte de resultado atrasado; caché del texto; ausencia de llamadas automáticas; preservación del encargo; primera imagen disponible antes que segunda; selección del usuario no se sobrescribe. No se ejecutaron generaciones pagadas: la calidad creativa final requiere comparación visual real.

Revisión Claude: APROBADO tras neutralizar el nombre de marca en el prompt de Recraft sin borrar la escena. También se corrigió el prompt inicial de titulares para no presuponer ingresos ni deudas, y respetar el estilo en seis alternativas. Autorización específica del usuario recibida antes de compartir el diff. Rama respaldada en GitHub: codex/aura-piezas-mejoras-20261017. Commit de código ca52546. Reversión disponible: versión anterior cb3ba036-6ada-4c89-9c81-eb2d1a671fe8.

Fuera de este parche: galería de cuatro propuestas, biblioteca persistente, edición por capas y cambio de tamaño exacto. Se conserva el formato actual para no introducir cambios visuales sin prueba.
