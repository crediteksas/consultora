# Cartera dedicada: plan de preparación

Base de integración: producción `46383350`. Copia anterior preservada, sin modificar el checkout canónico ni las fuentes del otro chat.

## Alcance

Preparar el perfil de aplicación `operador_cartera`, con entrada en Aliados → Créditos y cartera. Conservar el comportamiento de Gerencia, Auditoría, tiendas, otros negocios y servicios. No cambiar saldos, pagos, obligaciones, cortes ni autorizaciones durante las pruebas. La asignación del perfil real no se hará antes de cerrar la restricción completa y probar la sesión real.

## Restricción propuesta

1. Añadir el valor de perfil sin asignarlo todavía. Un helper privado, sin parámetros de identidad y con búsqueda vacía, reconocerá exclusivamente el rol propio del JWT por `auth.uid()`, incluso si el perfil se desactiva. Requiere lectura privilegiada mínima del propio rol para evitar recursión RLS. No devolverá perfiles ni datos. La autorización operativa comprobará además actividad y capacidad vigente: se deniega al desactivar o revocar, incluso con un JWT anterior.
2. Conservar exactamente la guardia actual de confirmación de deuda y encadenar una guardia exclusiva para el nuevo perfil. Denegar rutas, métodos y RPC no enumerados; denegar importación, pago manual, conciliación y autorización del fondo. Permitir lecturas y seguimiento de cartera con sus capacidades actuales. El control consulta el perfil vigente, sin confiar en metadatos editables del cliente.
3. Añadir políticas restrictivas para ese perfil a todas las tablas públicas expuestas. Las tablas ajenas quedan denegadas. Las dependencias de cartera tendrán permisos de lectura acotados y las escrituras se limitarán al seguimiento y preparación autorizados. Para los otros perfiles el predicado adicional será verdadero: no se retiran ni amplían sus grants o políticas.
4. Añadir denegación del perfil dedicado en Storage y Realtime privado, conservando políticas existentes. Antes de instalar se verificará la autorización de políticas del proveedor para el rol instalador. No modificar objetos gestionados, dueños, grants ni publicaciones. La ausencia observada de publicaciones de cambios y GraphQL no se considerará una protección permanente ni reemplazará pruebas negativas.
5. La lectura de la cartera clásica para el perfil dedicado usará un RPC invocador con JSON explícito y paginado, sin relaciones embebibles. La guardia denegará el acceso directo al viejo view y a sus tablas, aunque la consulta mínima del RPC conserve RLS. Los clientes de otros perfiles conservan su flujo anterior. Las operaciones clásicas de seguimiento necesitan un camino específico con capacidad manage y sin acceso al pago manual.
6. Las provisiones conservarán libro inmutable, idempotencia y autoridad individual. El gestor prepara solicitudes; nunca importa, concilia, autoriza ni registra usos. No se concilia el fondo inicial con archivos vacíos ni se imputan pagos del cliente como usos del fondo.

## Evidencia necesaria

- Captura de fuentes y metadatos actuales sin datos de negocio; hash previo de cada función que se sustituya y lista de tablas afectadas.
- Revisión del plan y del código. Pruebas nativas de actualización y reconstrucción con JWT ficticios: positivos, acceso ajeno, tabla/view/RPC directo, métodos, Storage, Realtime, sesión anterior, perfil inactivo y capacidad revocada; invariancia para perfiles previos y ausencia de movimientos financieros.
- Comprobar que la guardia REST no se presenta como protección de Storage o Realtime. Revisar funciones transitivas y no eludir RLS con un propietario administrador para conseguir lecturas del negocio.
- Revisar el paquete integrado y actualizar la evidencia del pipeline, conservando sus controles y el runner fijado por pruebas anteriores.
- Verificar sesión real de Andrea y NOVA, además de escritorio y móvil, antes de activar los accesos nuevos. No convertir los resultados de un modelo ficticio en certificación productiva.

## Datos e integración pendientes

El archivo recibido como septiembre estaba vacío. Faltan exportación válida, detalle documentado de usos anteriores y un segundo corte comparable. La conexión del historial con NOVA conserva su feature flag desactivado hasta conciliar las identidades, revisar la finalidad del consentimiento y probar las sesiones y el endpoint real. No crear vínculos por coincidencia de documento.

La propuesta visual y sus candidatos adicionales se integrarán en la copia actual, con verificación de huellas de las fuentes reemplazadas y revisión conjunta; las aprobaciones visuales anteriores no certifican el backend nuevo.
