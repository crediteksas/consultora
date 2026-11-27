# Cartera: candidato aislado, no publicado

Base actual de Git: `094306a29e8d2306a15e4a9b95b2df6739d86353`. Se avanzó por fast-forward desde `46383350`; los dos commits posteriores son de NOVA y no modifican los archivos compartidos de este candidato. Checkout canónico intacto.

Esta carpeta contiene código de preparación. No se copiaron sus candidatos a los archivos activos; no se asignaron perfiles ni se ejecutó SQL de escritura en producción. La propuesta original de otro chat sigue intacta. `source-copy.json` documenta su copia inicial.

## Preparado y probado localmente

- Inicio con respuesta JSON fija antes de consultar perfiles. Solo `restricted:false` permite seguir por el arranque anterior; errores, respuestas incompletas y perfiles desactivados no permiten esa alternativa.
- Perfil restringido con menú Aliados → Créditos y cartera; conserva el alcance clásico por origen. No abre ventas, otras áreas ni catálogos de otras tiendas.
- Rol técnico sin inicio de sesión, sin heredar roles y sin omitir RLS. Consultas por conjuntos fijos, permisos por columna y límites de paginación.
- Gestiones y solicitudes de provisión idempotentes. El perfil restringido no importa cortes, concilia fondos, autoriza, libera reservas, registra usos ni crea pagos.
- Registro privado conserva las cuentas restringidas incluso tras cambiar su rol, identificador o eliminar su perfil. Políticas restrictivas cubren tablas públicas, Storage y Realtime.
- Controles de deriva del catálogo y contador de solicitudes terminadas; los errores controlados conservan el contador y revierten solo la operación interna. El contrato permanece desactivado. No se cachea la comprobación en un GUC modificable por el cliente. Las cancelaciones y los rechazos de protocolo requieren además límites externos del proveedor.
- Excepción mínima del arranque nuevo para permitir que las tiendas abran la confirmación diaria. La guardia original de deuda queda intacta y sigue bloqueando las demás acciones pendientes.
- Vista local para 390 y 1440 px, Gerencia y perfil de Cartera. Datos ficticios, sin red ni guardados. Las fuentes externas se sustituyen solo en esa vista local por las fuentes de reserva instaladas.

## Bloqueos comprobados: no instalar ni publicar todavía

1. **Revision de codigo con Claude: APROBADA LA PREPARACION.** R5 cerro los hallazgos de R4 sobre los cuatro casos de aislamiento y el procedimiento. El veredicto exacto es `APPROVED PREPARATION`, exclusivamente para R4 mas el delta R5; no certifica proveedor, sesiones ni publicacion. Respuesta completa: `reviews/code-r5-review.txt`. Se verificaron despues de la revision los hashes de las 47 fuentes/diffs y el SHA-256 del envio `f068f5fa27b2479abca9d66f21217d4e885e1f69c461bb63693773fd6d9c5de4`. Solo se compartieron codigo, pruebas ficticias e inventario tecnico autorizado. **Todavia no instalar, activar ni publicar**: permanecen los bloqueos de servidor y sesiones descritos abajo.
2. **Identidad sin ampliar permisos:** se retiró la necesidad de conceder `USAGE` sobre `auth`. Un enlace SQL estándar `SECURITY INVOKER`, resuelto al definirlo, llama a la función oficial `auth.uid()` y devuelve solo el UUID del llamante. No copia la lógica de claims ni eleva privilegios. Cuatro funciones existentes de Cartera y dos del borrador de provisiones cambian únicamente esa llamada de identidad, con precondiciones exactas. Las pruebas nativas conservan los permisos efectivos de los roles anteriores y el rol técnico sigue sin acceso al esquema protegido. La instalación local también pasó con un instalador sin superusuario ni opción de conceder permisos en `auth`. Falta confirmar el conjunto en el entorno compatible del proveedor; esto no certifica por sí solo una instalación administrada.
3. **Certificación del servidor:** falta ejecutar el conjunto revisado contra un entorno compatible que reproduzca permisos del proveedor, catálogo completo, funciones transitivas, triggers, reglas, claves foráneas y políticas efectivas. PGlite usa dependencias ficticias reducidas y no certifica Supabase administrado.
4. **Superficies reales:** faltan pruebas de raíz/OpenAPI, OPTIONS con y sin sesión, HEAD y plan, exposición de esquemas, JWT previo/revocación, Storage/Realtime, vida de enlaces firmados anteriores y los dos backends desplegados. La guardia SQL solo protege solicitudes que llegan a SQL; no se afirma que controle CORS o enlaces ya emitidos.
5. **Andrea:** falta sesión real para comprobar el flujo autorizado. No se solicitaron contraseñas ni se extrajeron tokens. No se modificó su cuenta.
6. **Datos del fondo:** la exportación de septiembre recibida anteriormente estaba vacía. Sigue faltando un archivo válido, soportes de usos anteriores y un segundo corte comparable. La búsqueda acotada en el correo comercial no encontró otro corte utilizable; esto no prueba su inexistencia en otras ubicaciones.
7. **NOVA:** no se integra ni activa en este paquete. Siguen pendientes vínculos cliente-operación verificados, condiciones de uso y validación de la pasarela vigente. El historial de cortes no equivale a un puntaje, aprobación o pago confirmado.

La asignación individual de Óscar como autorizador del fondo, el perfil restringido y la activación del contrato se prepararán solo después de resolver estos puntos. Óscar puede preparar y autorizar sus propios casos según su instrucción; no se impone un segundo aprobador.

## Reproducción local

Con las dependencias del repositorio instaladas:

```sh
node --test releases/cartera-access-20261126/core-native.test.mjs releases/cartera-access-20261126/data-native.test.mjs releases/cartera-access-20261126/client.test.mjs releases/cartera-access-20261126/connection-native.test.mjs releases/cartera-access-20261126/shell-candidate.test.mjs releases/cartera-access-20261126/installer-native.test.mjs releases/cartera-access-20261126/r3-native.test.mjs releases/cartera-access-20261126/r5-native.test.mjs
python3 releases/cartera-access-20261126/build-client.py
python3 releases/cartera-access-20261126/build-preview.py
node releases/cartera-access-20261126/visual-browser.cjs
```

La vista está en `preview/index.html`. El resultado visual está en `preview/browser-receipt.json`. Resultados vigentes: 39 pruebas locales aprobadas y cuatro casos visuales aprobados (390/1440 px, Gerencia/Cartera). No son pruebas con una cuenta real ni validación de Safari.

El SQL completo es `candidate/scope-full.sql`; **no debe aplicarse** mientras siga pendiente la revisión y la validación administrada del conjunto. `scope-core.sql` es el subconjunto usado por la prueba de acceso, no una migración independiente para publicar. El procedimiento de publicación y recuperación está en `RECUPERACION-Y-PUBLICACION.md`. La migración definitiva aún no se creó; debe generarse con `supabase migration new` cuando el código y la instalación estén revisados.

La publicación futura requiere copia canónica limpia, revisión del código final, pruebas del conjunto, migraciones versionadas y el pipeline oficial. No mover ni descartar los pendientes ni respaldos de otros chats para conseguirlo.

## Entornos de validación de esta continuación

- Se creó `cartera-validacion-20261126` sin copiar datos de producción. El proveedor devolvió `MIGRATIONS_FAILED`: solo reconstruyó 38 tablas públicas, hasta la migración `20260722035817`; no representa el catálogo actual. No se aplicó el candidato en esa rama. Tras la autorizacion expresa, se elimino esa rama y se verifico con list_branches que solo queda main. No se borro ni modifico produccion.
- Se obtuvo una copia privada de solo esquema, sin INSERT/COPY/UPDATE/DELETE de nivel superior, mediante CLI oficial. La restauración local de public/kora_private falló atómicamente por una dependencia fuera de esos esquemas. Ampliar la copia a los 17 esquemas privados fue rechazado por exceder Cartera e incluir respaldos y finanzas; no se realizó esa ampliación. No se usará una vía indirecta para eludir el rechazo.
- La imagen oficial de PostgreSQL 17.6 se inició sin red, sin puertos publicados ni montajes del host. Cuenta con postgres sin superusuario y dependencias administradas parciales; eso no es certificación de Supabase alojado. La VM preexistente estaba detenida y se inició solo para esta prueba. El contenedor temporal se detiene al cerrar esta continuación y se conserva su estado, sin instalar el candidato ni guardar registros reales.
- El código de build ya usa exclusivamente entradas del repositorio verificadas por hash. El inventario de otras relaciones administradas falla de forma cerrada ante objetos nuevos o sin aislamiento. El catálogo productivo observado aún contiene relaciones de control que no cumplen ese requisito; no se cambian sus permisos ni su RLS para pasar una prueba.

## Continuación: rol de sesión y límites comprobados

El bloqueo de R5 está identificado: exige RLS en tablas de control administradas donde el proveedor conserva otro modelo de permisos. No se alteran esas tablas para superar el control. Se preparó aparte el diseño R6 de un rol JWT/SQL individual, con ejecutor separado y transición de sesiones; **el delta que sustituirá el candidato R5 todavía no está integrado**. Los 47 archivos/diffs aprobados de R5 y los 190 archivos de la propuesta original siguen verificados sin cambios.

La prueba con GoTrue 2.198.0, PostgREST 16.5 y PostgreSQL 17.6 oficiales, en una red Docker interna y con cuentas ficticias, pasó 60 assertions (51 nombres distintos): emisión/refresh, cambio de contraseña, cambio de email por administrador, rol inalterable mediante self-update, logout/revocación, expiración más tolerancia de reloj, rol SQL dentro de DEFINER, ajustes de timeout, membresías y bloqueo del rol. Se renombraron las assertions de NOTIFY y roles inválidos para expresar sus límites: todavía no prueban recarga completada ni ausencia de fallback de un rol inválido. La versión final corregida volvió a pasar las 60 assertions (51 nombres distintos); su resultado incluye el SHA-256 del script calculado por la propia ejecución y verificado contra el archivo. Los dos servicios de correo desplegados se compararon con su código local: 11 escenarios con RPC simulado y 8 pruebas existentes pasaron sin peticiones de ejecución ni mensajes productivos. Esto **no certifica** sus rutas reales con la futura cuenta de Cartera.

La copia existente de solo estructura de public/kora_private/cobros_private volvió a fallar de manera atómica en el modelo local por dependencias de inventario_control. Se identificaron en el DDL nueve funciones trigger de cinco esquemas externos, disponibles en las migraciones del repositorio. No se exportó ningún esquema adicional ni se tomaron datos. Esta copia sigue sin representar el conjunto administrado; no se toma una reconstrucción parcial como prueba completa. La extracción amplia anterior de 17 esquemas privados había sido rechazada por exceder el alcance e incluir estructuras de respaldos y finanzas; sigue sin ejecutarse.

Una única consulta EXPLAIN ANALYZE de lectura en KORA midió el fingerprint R5 actual: 84 ms de planificación y 989 ms de ejecución. No certifica el coste del R6 ni del flujo completo. La compatibilidad de Storage/Realtime, roles degradados, servicios, enlaces anteriores, límites externos, sesiones normales/Andrea y los archivos válidos de provisiones continúan pendientes.

La revisión R6 se conserva en reviews/session-role-design-r*.txt. La última R4 acepta el diseño y exige corregir dos nombres de evidencia antes de aprobar preparación. No aprueba integración, cuentas, instalación ni publicación. Los cambios siguen aislados en compatibility-session-role/. No hay SQL productivo de escritura, cambios de cuentas, saldos o pagos, commit ni despliegue de este paquete.
