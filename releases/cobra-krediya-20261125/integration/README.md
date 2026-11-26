# Conexión COBRA / KrediYA: candidato separado

`creditos-cartera-app.patch` muestra el cambio mínimo sobre el consumidor existente. La copia `.candidate.js` permite inspeccionar/compilar sin editar el archivo activo. `source-manifest.json` fija el origen; si cambia, renovar el diff y revisar antes de aplicar.

El lector añade `operation_id`. `mapEventsToPortfolio` asocia únicamente operaciones con filas financieras ya existentes; retiene `source_obligation_id` y no escribe al servidor. Referencias contradictorias bloquean el historial. Las operaciones sin ficha financiera se mantienen en la nueva cola de calidad, no se inventan filas de cartera.

Antes de cargar el consumidor se deben incluir `quality-domain.js` y `quality-persistence.js`, después de aplicar y verificar las dos migraciones revisadas. No habilitar esta copia antes de disponer del esquema requerido. Las funciones servidoras anteriores de registrar pagos/gestiones no se modifican. El consumidor reserva sus controles a Gerencia/Auditoría; el permiso de gestión del seguimiento nuevo no habilita esos controles financieros.

La copia HTML añade «Calidad KrediYA»: importación revisada, cortes guardados, consulta completa de observaciones, cola paginada y formulario de gestión. Reutiliza el cliente de sesión del shell. El controlador fija el JWT verificado por petición, cancela resultados de la identidad anterior, exige Web Locks y conserva solo UUID/huellas del intento pendiente y, para cortes, mes y fecha de corte. La recuperación compara el contenido del registro guardado; una coincidencia de identificador por sí sola no confirma la gestión. Los rechazos confirmados permiten corregir el intento y los resultados inciertos conservan su identidad. Si una reimportación pierde su respuesta y el corte estaba guardado por otra solicitud, se busca por huella de archivo/mes/corte y se comprueba el contenido antes de confirmarlo. No se conservan nombres de archivo, filas, notas ni documentos en el diario de recuperación.

Cambiar archivo, fecha de corte o mes invalida la revisión. Solo se guarda tras confirmación explícita. La cola usa operaciones existentes; una gestión sigue siendo una observación, nunca un pago. Las pestañas anteriores conservan su lector, con el adaptador mínimo descrito arriba. Las notas por operación se incluyen en la cobertura del historial antiguo únicamente cuando hay una ficha de cartera existente.

Pruebas actuales separadas: 89 comprobaciones PG17.6, 27 de API con PostgREST 16.5, 56 de conexión cliente, 20 de persistencia, 18 de navegador y 16 de convivencia con el consumidor anterior. Los grupos solapan escenarios: no sumarlos como cobertura distinta. 10.000 filas ficticias se guardaron por HTTP en 1,503 s con timeout SQL de 8 s intacto. El modelo tiene políticas ficticias; no demuestra el rendimiento productivo. La renovación usa el SDK real contra un endpoint Auth ficticio, no Supabase Auth gestionado.

El navegador de convivencia carga el HTML candidato y ambos consumidores, intercepta el shell y las lecturas antiguas con datos ficticios y consulta el modelo real aislado para la pestaña nueva. No certifica todo el shell ni todas las sesiones de producción.

Claude R4 pidió corregir una carrera entre rechazo y envío anterior aún en curso, y desbloquear avisos locales inválidos. Ambas están corregidas y cubiertas: R6 dio PASS acotado al cliente/integración/construcción; el SQL optimizado y rollback actuales recibieron PASS acotado en revisión separada. Los intentos R2/R3 por límite de uso no son dictámenes. La sesión de Óscar fue comprobada antes en lectura, no se ejecutaron RPC nuevos ni importaciones reales. El cotejo privado de caminos soportados y las referencias únicas se completó con el alcance documentado; debe renovarse antes de aplicar. Se requiere la revisión de Óscar antes de integrar, asignar acceso a Andrea o publicar.

La capacidad explícita de gestión en el backend nuevo no concede permisos de liquidaciones ni activa automáticamente los formularios antiguos. No ampliar roles para sortear esas diferencias.

## Orden propuesto para una aplicación posterior

1. Renovar fuentes activas, permisos/visibilidad de origen, roles y rutas de borrado; detener ante diferencias. La consulta histórica debe incluir `operation_id` y conservar SELECT de las columnas nuevas.
2. Completar revisión Claude del código exacto y revisión de Óscar del alcance de datos y cambios. Actualmente NO existe autorización de aplicación de este paquete.
3. Aplicar las dos migraciones por el flujo oficial aprobado antes de habilitar el lector nuevo. Programar los locks de la segunda migración fuera de carga alta. No repetir migraciones ya registradas.
4. Copiar únicamente los activos del manifiesto a sus destinos propuestos, preservando versiones generadas y cambios concurrentes. Nunca publicar la carpeta releases completa: contiene SQL y pruebas. Mantener la licencia de SheetJS junto al vendor.
5. Verificar con sesión autorizada que los cortes/historial pueden consultarse; no registrar una venta, pago o gestión real como prueba. La primera importación real requiere la autorización correspondiente.

Rollback destructivo solo si no existe historial nuevo, con guardia transaccional previa. Con historial, conservarlo y corregir hacia adelante. Las nuevas referencias RESTRICT impiden eliminar operaciones y perfiles vinculados; esta condición debe respetarse en mantenimiento. El bloqueo TRUNCATE de la tabla de eventos también afecta al vaciado de su historial anterior.

Prueba privada adicional, separada de los fixtures enviados a Claude: proyección de cuatro helpers y políticas SELECT seleccionadas, con filas enteramente ficticias. 10.000 observaciones sobre 110.002 operaciones y 2.048 bytes sintéticos adicionales por fila se guardaron en 2,599 s bajo timeout de 8 s. Incluye 11 controles acotados, tres de fidelidad de contrato; no sumarlos a los escenarios anteriores. No reproduce todo el esquema, ACL, disparadores, Auth, hardware ni tráfico productivo. La evidencia privada permanece fuera del repositorio y nunca se envía a Claude.

## Reintentos y construcción

Un rechazo del primer envío puede resolverse como no guardado tras comprobar el servidor. Un rechazo de un reintento no resuelve el envío anterior, incluso después de una hora. La recuperación confirma contenido, no solo un UUID. Los avisos locales desconocidos se procesan por tipo sin bloquear la otra recuperación.

La liberación manual exige comprobación, espera mínima de un minuto, identidad/permiso vigentes, bloqueo entre pestañas, huella del aviso sin cambios y nueva consulta al servidor. El tiempo no prueba que haya fallado. El usuario acepta explícitamente el riesgo de que llegue tarde y se duplique una gestión; se conserva un máximo de 32 referencias por usuario/tipo con UUID, tipo y fecha, sin huellas de contenido; la vigencia de siete días se evalúa al acceder y se depura al añadir. Los intentos inciertos de una pestaña abierta también se recuerdan en memoria. La operación no cancela ni modifica nada en el servidor. Notas locales corruptas no se archivan.

Los destinos del manifiesto son archivos ERP de primer nivel y el árbol `vendor` existente; los constructores oficiales no publican un subdirectorio arbitrario. Se fija versión nueva en HTML. `test-build.mjs` construye/verifica en otra carpeta y comprueba activos/licencia y conservación del origen. El consumidor se prueba con el artefacto resultante. Son seis controles de artefacto, no el pipeline de publicación completo.

Los `.patch` son informativos para revisión. Los archivos efectivos y destinos son los candidatos fijados en el manifiesto. El constructor exige que las dos bases reemplazadas coincidan y rechaza una alteración simulada; repetir esa comprobación al aplicar.
