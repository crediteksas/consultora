# Sofía: falso aviso de pregunta repetida — 30 octubre 2026

El detector de AURA clasificaba cualquier respuesta de salida duplicada en 30 minutos como una pregunta repetida. En la conversación de prueba del propietario, dos remisiones informativas al mismo asesor activaban el aviso sin contener una pregunta.

Se exige ahora una interrogación explícita o una solicitud de datos reconocible para esa regla. Se mantienen los otros motivos: cliente sin respuesta, remisión incompleta, contacto fallido y SLA vencido. No se borran mensajes ni se cambia la atención de Sofía.

La fuente HTML local incorpora la misma regla que el módulo selectivo publicado. La publicación conserva los siete módulos anteriores, las configuraciones y las páginas ajenas. No se despliegan los Workers creditek-aura, creditek-bot ni creditek-nova.

Validación: 13 comprobaciones dirigidas, sintaxis y comparación exacta del HTML publicado; comprobación visual en la sesión activa de AURA. El caso del propietario ya no muestra el aviso. El total visible pasa de 53 a 49 al eliminar cuatro falsos avisos informativos.

Despliegue, hashes y comprobantes: verification.json. release.mjs es de solo lectura salvo --apply, valida los predecesores exactos y falla ante cambios concurrentes. No ejecutar otra vez sobre el despliegue corregido.
