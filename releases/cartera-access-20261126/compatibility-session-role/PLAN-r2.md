# R6: rol de sesión dedicado a Cartera — diseño corregido

Preparación aislada. No está instalado ni cambia cuentas, Auth, saldos o permisos productivos. Se mantiene R5 sin editar hasta revisar este diseño y el delta concreto.

## Límite verificable de la sesión

La cuenta individual de aplicación operador_cartera recibiría el rol JWT/SQL kora_cartera_session mediante Auth admin desde servidor, por UUID. No hay hook global. El SDK declara ese campo; la prueba aislada con GoTrue y PostgREST oficiales verifica su efecto real. No se añade este rol a ninguna configuración de administradores de Auth.

El rol cliente es NOLOGIN, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION y NOBYPASSRLS. No es miembro, heredero ni puede asumir ningún otro rol. Se comprueba MEMBER, USAGE y SET contra cada rol, excluyendo la identidad consigo misma. Solo authenticator obtiene SET TRUE, INHERIT FALSE, ADMIN FALSE. El instalador postgres necesita administración durante la creación; al terminar conserva únicamente la concesión mínima necesaria explícitamente revisada o se elimina esa membresía creadora antes del sello, sin permitir que el cliente la asuma. Se exige PostgreSQL >=16. El ejecutor kora_cartera_operator permanece separado y no se concede su membresía al cliente, authenticator ni servicios. El grant previo de administración/SET del instalador al ejecutor se conserva exactamente como R5.

Se fija statement_timeout no mayor que authenticated y un lock_timeout finito compatible. Se comprueban pg_db_role_setting, el rol authenticator y su configuración de PostgREST. No se concede USAGE al cliente en kora_cartera_policy ni auth/kora_private/storage/realtime. El pre-request existente es SECURITY DEFINER y comprueba el contexto cliente sin dar acceso al esquema privado. El cliente solo recibe USAGE public y EXECUTE explícito sobre los cuatro RPC. Cada RPC conserva dueño ejecutor, search_path vacío y SQL fijo.

Matriz EXECUTE de los cuatro RPC: cliente sí; PUBLIC y anon no; authenticated conserva únicamente el acceso de arranque/compatibilidad revisado en R5, con denegación interna para toda identidad alguna vez registrada que use authenticated. El arranque solo devuelve restricted:false a usuarios ordinarios nunca registrados. No se amplían grants a roles existentes.

## Aclaración C1: permisos PUBLIC y frontera HTTP

NOINHERIT no elimina PUBLIC. No es posible retirar a un solo rol un permiso concedido a PUBLIC; hacerlo globalmente rompería los demás usuarios y excedería el alcance. Por tanto no se afirma que el rol tenga únicamente cuatro funciones SQL ejecutables. Puede heredar funciones PUBLIC existentes y funciones de catálogo. La garantía propuesta es más precisa: rol NOLOGIN sin SQL arbitrario, sin acceso efectivo a datos, y solo cuatro rutas RPC utilizables mediante PostgREST gracias al pre-request obligatorio. Este límite necesita aprobación expresa del diseño; si no resulta suficiente no se instala y no se modifican ACL globales para aparentar cumplimiento.

Se inventarían y fijarían por hash los permisos PUBLIC ya existentes de esquemas, rutinas y default ACL de los esquemas alcanzables (incluidos public, extensions y catálogos). Se documentan CONNECT/TEMP de PUBLIC. Ninguna nueva concesión a PUBLIC se acepta automáticamente. Se excluyen objetos temporales de otra sesión de la huella, no se usa esa exclusión para omitir esquemas persistentes. Funciones PUBLIC de aplicación solo se consideran protegidas si el protocolo real garantiza el pre-request antes de ejecutarlas. Se prueban llamadas directas a funciones ficticias PUBLIC SECURITY DEFINER que darían datos si se eludiera el pre-request, incluso POST/GET, métodos, Accept/perfiles y variantes de ruta; deben dar error sin efectos. No se autoriza GraphQL ni SQL arbitrario. Toda ruta no prevista, representación plan, root/OpenAPI, HEAD, OPTIONS autenticado y cambio de esquema sigue bajo los gates existentes. CORS/OPTIONS sin SQL no queda certificado por una prueba SQL.

Para relaciones, vistas, matviews, foreign tables, columnas y secuencias no se acepta NINGÚN privilegio efectivo del cliente, ni propiedad, ni pertenencia a roles con acceso, en esquemas persistentes de aplicación/proveedor. Los catálogos PostgreSQL de metadatos son un baseline explícito, no datos empresariales. Un grant de datos a PUBLIC también bloquea. Las rutinas SECURITY DEFINER de storage/realtime ejecutables por PUBLIC/cliente bloquean; las funciones de esos esquemas se fijan por definición/ACL/dueño/search_path. Si otro backend permite ejecutar funciones PUBLIC sin el pre-request, ese backend debe negar el rol dedicado o queda bloqueada la activación.

## Compatibilidad administrada sin alterar sus tablas

Las 13 relaciones autorizadas se inventarían exactamente. El control del nuevo cliente exige cero USAGE/CREATE en storage/realtime y cero permisos efectivos de relación/columna/secuencia, sin propiedad ni membresías. Ya no exige RLS a las tablas de control para authenticated: la ausencia de RLS no es un fallo cuando el cliente carece de acceso. No se cambia RLS, dueño, grants ni se crean nuevas políticas para el nuevo cliente en objetos administrados. No se ejecuta SQL de escritura en las dos tablas de control.

Las políticas R5 para JWT authenticated de identidades históricamente registradas siguen siendo una propuesta independiente, aún no instalada; no se da por autorizada nueva política del proveedor ni se confunde con las constantes FALSE del cliente. Sin esas defensas de tokens previos, la transición solo es posible tras bloqueo, revocación y vencimiento comprobado de TODOS los JWT antiguos. Para prevenir un downgrade posterior, la auditoría servidor rol Auth/registro y los gates de Storage/Realtime son obligatorios. Un fallo impide activar, nunca amplía authenticated ni resetea su rol para desbloquear.

Se mantienen restrictive FALSE solo en tablas de aplicación públicas si están en el delta revisado. Nunca se usan para alterar acceso de otros roles. Sus ACL y políticas previas deben permanecer idénticas. No se reemplaza ni se desactiva la confirmación diaria de deuda de otros usuarios.

## Identidad y huella

Se compara exactamente current_setting('role',true), fijado por PostgREST para la transacción, con request.jwt.claims.role firmado. current_user dentro de DEFINER es el ejecutor y no sirve de identidad. Se rechaza is_anonymous=true, sub vacío/ajeno, cuenta inactiva/no registrada, rol inválido, diferente en mayúsculas/espacios, inexistente o downgrade authenticated para sub registrado. No se confía en user_metadata ni en el cuerpo. Se ensaya con conexión authenticator y SET LOCAL ROLE, además del API real local.

El fingerprint y comprobación repetible de activación incorporan atributos y membresías de cliente/ejecutor/authenticator; configuraciones de rol y base; esquemas; todos los default ACL; definiciones, EXECUTE, proowner, prosecdef, proconfig de las rutinas alcanzables; relaciones, columnas, secuencias, políticas, triggers, dependencias y metadatos de las 13 tablas. Se comprueba antes de sellar y al activar contra el hash revisado, sin resello automático. Los cambios del proveedor, incluidas particiones, siguen bloqueando hasta revisión.

## Integridad Auth, transición y retirada

Pruebas locales oficiales: emisión inicial, refresh, cambio de contraseña, cambio de email confirmado sin correo, nuevo login y self-update malicioso no cambian el rol confiable; la cuenta ordinaria conserva authenticated. No se simula el efecto solo firmando JWT a mano. Tokens firmados manualmente se usan únicamente en pruebas negativas de rol y siempre con secreto local ficticio.

Antes de cualquier activación real se auditan sin exportar identidades: todo usuario con rol dedicado pertenece al registro activo; todo registro activo tiene rol dedicado; ningún hook/herramienta sobrescribe el rol y ningún consumidor interpreta un rol desconocido como privilegiado. Se auditan ramas role===authenticated, role!==anon y session.user.role del cliente y los dos backends. Se añaden pruebas ficticias.

Transición individual ordenada: verificar UUID autorizado; bloquear inicio; revocar refresh/sesiones; esperar máximo vencimiento de access tokens previos más margen de reloj (no asumir que revoke mata JWT); cambiar rol desde servidor; levantar bloqueo; nuevo login; comprobar rol/alcance desde servidor. No se selecciona una cuenta en esta preparación. Si se desactiva o recupera, se desactiva contrato/cuenta y revocan sesiones manteniendo registro sticky; nunca se vuelve a authenticated como medio de abrir el ERP. Cualquier reversión del rol exige mantener el bloqueo y las restricciones y una revisión independiente; no es rollback automático.

## Gates que siguen abiertos

Storage, Realtime (incluidos Broadcast/Presence públicos y caché), GraphQL, enlaces firmados anteriores, dos backends y límites externos deben negar el nuevo rol sin fallback privilegiado. Las conexiones de servicio no reciben membresía del rol. La prueba PostgREST local no certifica esos servicios ni Supabase alojado. No se habilita ningún perfil real antes de pasar esos gates y el esquema completo compatible.

R6 sigue siendo un diseño de preparación, no aprobación para instalar, asignar usuarios o publicar. El código R5 y sus 39 pruebas conservan su aprobación anterior solo dentro de su alcance original; este diseño no hereda esa aprobación para cambios nuevos.
