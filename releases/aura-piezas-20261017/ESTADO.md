# Mejoras de Piezas comerciales — 17 octubre 2026

Estado: implementado y compilado localmente; ocho pruebas pasan. NO publicado.

Cambios: titulares con contexto comercial y estilo explícito, una única solicitud concurrente, descarte de respuestas de contextos anteriores, eliminación de dos regeneraciones automáticas, caché de corrección ortográfica, resultados visuales independientes por proveedor, reglas de escena subordinadas al encargo y protección contra recorte silencioso de prompts Recraft.

Protección: pipeline del logo y seis estilos idénticos byte a byte. Wrapper conserva el Worker activo completo y sólo sustituye el documento de Piezas si el HTML upstream coincide con el hash auditado. No cambia autenticación, bindings, rutas ni otros agentes.

Validación: sintaxis de scripts y Worker; concurrencia de titulares; descarte de resultado atrasado; caché del texto; ausencia de llamadas automáticas; preservación del encargo; primera imagen disponible antes que segunda; selección del usuario no se sobrescribe. No se ejecutaron generaciones pagadas: la calidad creativa final requiere comparación visual real.

Pendiente: revisión Claude exigida por REGLAS.md. La revisión automática rechazó enviar el diff a Claude por falta de autorización explícita para compartir este código con ese proveedor. Pedir autorización específica. Después: revisión, resolver hallazgos, guardia de versión vigente, commit/push según autorización, despliegue aislado y verificación UI/hash. No desplegar la copia antigua si producción cambia.

Fuera de este parche: galería de cuatro propuestas, biblioteca persistente, edición por capas y cambio de tamaño exacto. Se conserva el formato actual para no introducir cambios visuales sin prueba.
