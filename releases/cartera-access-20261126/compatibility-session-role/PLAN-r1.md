# Compatibilidad: rol de sesión dedicado a Cartera

Propuesta de corrección del candidato R5; no está instalada ni cambia cuentas.

El perfil de aplicación `operador_cartera` seguiría igual. Su sesión usaría un rol PostgreSQL independiente, `kora_cartera_session`, en vez de compartir `authenticated` con todos los usuarios del ERP. El SDK instalado admite establecer el claim `role` mediante `auth.admin.updateUserById`; es una operación del servidor y se haría únicamente para la identidad individual autorizada, después de verificar la transición de sesiones. No se añade un hook global de Auth ni se altera el inicio de sesión de otros usuarios.

## Separación de permisos

- `kora_cartera_session`: NOLOGIN, NOINHERIT, NOBYPASSRLS, sin privilegios administrativos. Solo authenticator puede asumirlo para un JWT firmado. La membresía es SET TRUE, INHERIT FALSE, ADMIN FALSE. El usuario no puede asumir authenticated ni el rol ejecutor.
- Solo tiene USAGE en public y en el esquema del predicado booleano de Cartera, y EXECUTE en los cuatro RPC fijos. No tiene USAGE en auth, storage, realtime ni kora_private. No se le conceden permisos en tablas, secuencias ni funciones internas administradas.
- El rol ejecutor `kora_cartera_operator` conserva sus grants por columna y sus políticas mínimas. No se concede su membresía al rol de sesión ni al autenticador. Los RPC se ejecutan con ese rol, no con privilegios de postgres.
- Se mantienen las políticas restrictivas anteriores para los JWT authenticated de identidades registradas. Se añaden políticas constantes FALSE para el nuevo rol de sesión en tablas públicas y los tres objetos administrados ya previstos. No se cambian permisos de authenticated, políticas antiguas, propietarios o RLS de tablas internas del proveedor.

## Comprobación del proveedor

En las otras relaciones administradas, la condición deja de exigir RLS para authenticated. Exige que el nuevo rol de sesión no tenga ningún permiso efectivo de tabla/columna, ni sea propietario, ni herede o pueda asumir otro rol, ni tenga USAGE/CREATE en esos esquemas. Una concesión por PUBLIC también debe fallar. Las funciones administradas SECURITY DEFINER ejecutables por el nuevo rol también deben fallar; se conserva pendiente la comprobación real de los backends del proveedor.

El inventario y la huella siguen detectando cambios no revisados. No se cambia la política RLS de subscription ni de schema_migrations. El fingerprint debe incorporar también funciones/ACL administradas relevantes para detectar cambios de privilegios. La rotación de particiones y el coste de la huella continúan como condiciones de activación; no se resellan automáticamente.

## Comprobación de identidad y transición

Los RPC deben verificar simultáneamente el rol SQL seleccionado por el autenticador y el claim role firmado. Deben rechazar una identidad registrada que siga usando authenticated, y un JWT del nuevo rol sin una identidad registrada/activa. No usar user_metadata ni confiar en un campo enviado en el cuerpo de la petición. El bootstrap normal solo devuelve restricted:false para las sesiones ordinarias que nunca estuvieron registradas.

Antes de activar una cuenta real: identidad individual verificada, bloqueo temporal de inicio, revocación de refresh/sesiones y comprobación del máximo vencimiento de los JWT previos; mantener la restricción hasta que todos hayan vencido. Después, actualización individual del rol de Auth desde servidor, inicio nuevo y comprobación de rol/alcance por servidor. Cambiar el rol de Auth no invalida por sí solo los JWT anteriores. No se selecciona ni modifica ninguna cuenta en esta preparación.

## Pruebas previas a cualquier instalación

1. Modelo con las dos tablas de control sin RLS: authenticated conserva su SELECT anterior donde corresponda; la nueva sesión no puede leerlas ni usarlas a través de Storage/Realtime.
2. Cuatro RPC desde authenticator con SET ROLE: lecturas/gestiones permitidas y ninguna lectura cruda; no suponer que SET SESSION AUTHORIZATION reproduce el contexto real del API.
3. Rol SQL y claim discordantes, cuenta no registrada/inactiva, downgrade a authenticated y JWT antiguo: denegados, sin fallback.
4. Grants PUBLIC de tabla/columna/esquema/definer, membresías heredadas o SET-only, owner y BYPASS: abortan preparación/activación. Los permisos de Gerencia/auditoría/tiendas permanecen idénticos.
5. Emisión/renovación de Auth para una cuenta ficticia de un entorno separado: verificar que el rol individual llega al JWT firmado y que los roles de las demás cuentas no cambian. Sin correos, pagos ni datos reales.
6. Mantener todos los gates existentes de API raíz/OPTIONS/HEAD, perfiles de esquema, Storage/Realtime/enlaces firmados, backends y límites externos. Las pruebas SQL no certifican esos servicios.

La aprobación de este diseño solo autoriza preparar y probar código aislado; no equivale a activar identidades reales ni publicar.
