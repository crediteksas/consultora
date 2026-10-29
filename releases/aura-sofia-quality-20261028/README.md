# Calidad y consumo de Sofía dentro de AURA

El panel completo ahora se abre desde Sofía, con el botón **Calidad y consumo** o la pestaña **IA**, sin una segunda contraseña. Conserva presupuesto, propuestas, revisión, correcciones activas e historial con reversión. Cerrar el panel devuelve a la conversación sin recargarla.

La interfaz reutiliza las funciones de sesión existentes del CRM. El iframe no recibe la contraseña ni almacena credenciales. Sus solicitudes pasan por una lista cerrada de rutas del mismo origen y se validan en el servicio existente con la sesión de AURA y el permiso de propietario. No se reenvía un secreto compartido que pueda sustituir esa identidad. Las mutaciones mantienen la validación de revisión y el límite máximo existente de US$15.

El cambio vive en un módulo adicional del shell de AURA. La publicación conserva byte a byte sus seis módulos anteriores, configuración, activos, autenticación y los Workers Sofía y NOVA. No crea usuarios, permisos, claves, mensajes a clientes ni llamadas al proveedor de IA.

Validación: nueve pruebas de proxy, autenticación, límites del cuerpo, métodos y rutas, transporte real con Miniflare, integridad de scripts y composición del panel. Prueba visual con datos ficticios: apertura sin login, consumo renderizado, cierre de vuelta a la conversación y ajuste a 390×844. La consulta en la sesión real se registra después de publicar.

La página pública anterior se usa únicamente como plantilla de origen versionada; la nueva interfaz elimina el formulario y el flujo de contraseña. No se modifica el Worker del bot ni se reemplaza su control de presupuesto. Su contador sigue cubriendo desde la activación del control, por mes de Colombia, y no equivale a una factura histórica completa del proveedor.

`release.mjs` valida sin publicar por defecto. `--apply` exige el predecesor exacto, respalda los módulos y conserva las demás rutas. Rechaza la publicación si detecta cambios concurrentes. Se hicieron las comprobaciones locales descritas; Claude CLI no tenía una sesión disponible y no se abrió una cuenta ni una API de pago para revisión.
