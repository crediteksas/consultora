# Restauración de indicadores AURA

La consulta autenticada del panel devuelve 503; la llamada interna a creditek-clientes devuelve 404. La ruta `/internal/kpis/inscritos` existe en el código anterior del repositorio, pero no en el Worker activo SHA256 `2d0cf3c24e87634c8b85686d1bd835645d4379d01ae23bf406c206ab0597eb43`. La comprobación OPTIONS del servicio de indicadores admite el dominio AURA; la sesión del panel se restaura.

Se restaura únicamente la ruta y sus funciones sobre una copia exacta del Worker activo. No se reutiliza el Worker antiguo completo. El token de acceso interno se mantiene. Se devuelven solo conteos agregados, con no-store. Se rechazan métodos distintos de GET. Un Content-Range sin total válido devuelve error, nunca cero ficticio. Las peticiones a la fuente tienen timeout de 10 segundos.

Validación: token ausente/incorrecto, rango inválido, resultado válido, no-store, totales inválidos y fuente con error. Comprobación de que quitar las inserciones recupera exactamente el baseline. Sintaxis ES module válida. Importación del Worker completo y ejecución de GET sin token (401) y POST (405) correctas.

La publicación requiere revisión y comprobación final del panel. No considerar reparado solo por tener código o pruebas locales.
