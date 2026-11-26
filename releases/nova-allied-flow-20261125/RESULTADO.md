Publicado y verificado el 25 de noviembre de 2026 (Colombia). Commit de implementación bb49a230.

Versiones al 100%: creditek-nova 941e2744-bc08-403c-97ab-528ce1bc9907; creditek-clientes adb86c45-e962-4bed-9de0-ea562345b190. Postflight confirma código idéntico al commit y preservación de bindings, variables, secretos, rutas y cron. Las páginas de gestión/supervisión coinciden con el HTML publicado; el formulario servido incluye los tres orígenes.

Migraciones aplicadas explícitamente en KORA y AURA. Veinte funciones verificadas contra la definición original, con solo las ampliaciones de origen aprobadas. Propietario, ACL y security invoker/definer preservados. Los dos CHECK nuevos están validados. El resto de la política SMS conserva el mismo hash, con doce orígenes admitidos.

Distritoys, Club Seven BM e Izzy Móvil tienen cada uno un acceso activo, un enlace activo y un vendedor activo. OTP/SMS habilitado y cupo disponible para los tres, sin anomalía de coste. Los teléfonos/roles de acceso existentes no fueron modificados. Distritoys conserva su vendedor y enlace; se completaron los faltantes mediante el script de datos separado y revisado.

28 pruebas aprobadas, incluidas las de mora previas y un recorrido de cada aliado con Postgres aislado, funciones reales y respuestas externas simuladas. El comercio ajeno y el expediente cerrado están bloqueados; el recibo de cierre es mínimo y temporal. No se enviaron SMS, mensajes a referencias ni consultas a plataformas con clientes reales durante esta validación. No es una confirmación de entrega real de códigos o respuesta real de proveedores para estos tres aliados.

La revisión de seguridad de Supabase no añadió avisos respecto a la línea base: KORA mantiene cinco y AURA seis avisos preexistentes, fuera del alcance de esta corrección. No se cambiaron RLS ni concesiones de roles.

Capturas SQL conservan literalmente el espacio final preexistente dentro de una definición. La comprobación de Git ignoró únicamente ese tipo de espacio en el comando, sin alterar las capturas ni la configuración global de Git.
