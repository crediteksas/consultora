# Confirmación diaria de deuda de tienda con Creditek

Cada perfil activo `admin_tienda` confirma su propia tienda una vez al día de Colombia, incluidos fines de semana. La fuente es `cuenta_corriente`: cargos menos abonos; no son las facturas globales a proveedores externos. Un segundo administrador de la misma tienda debe dejar su propia confirmación.

Al entrar se presenta el saldo actual. Antes de las 11:00 puede posponerlo, manteniendo un recordatorio. A las 11:00 el diálogo no se puede cerrar; confirmar o reportar un saldo diferente con explicación permite continuar. Los tiempos provienen del servidor. Se vuelve a consultar al recuperar foco y cada 30 segundos, con un temporizador para las 11:00 y el cambio de día. Sin poder comprobar el estado, el diálogo obligatorio permite reintentar o cerrar sesión. Las pestañas abiertas también quedan cubiertas.

`confirmaciones_deuda_tienda` conserva usuario, tienda, día, hora, saldo mostrado, saldo declarado, diferencia y revisión. Se comprueba la versión del libro antes de guardar; un movimiento concurrente obliga a actualizar. Reintentar el mismo ID y contenido no duplica. Ninguna confirmación ni revisión inserta pagos ni modifica cartera, caja, banco o inventario.

Gestión y Gerencia tienen Administración → Confirmaciones de deuda. Ven confirmados y pendientes del día, y diferencias de cualquier fecha aún sin revisar. La campana cuenta las diferencias pendientes. Revisarlas requiere una respuesta y registra quién y cuándo; un eventual ajuste contable usa el procedimiento existente de autorización.

## Publicación

1. Aplicar `20261015011547_confirmacion_diaria_deuda_tienda.sql`. La configuración comienza al siguiente día de Colombia.
2. Publicar el frontend y verificar los activos nuevos y el shell.
3. Aplicar `20261015012303_activar_confirmacion_diaria_deuda_api.sql`, que rechaza sustituir otro pre-request existente.

El hook de PostgREST bloquea escrituras y RPC de operación de administradores pendientes después de las 11. Permite lecturas, comprobación de permisos, consulta y registro de la confirmación. No afecta otros roles ni altera RLS; Storage/Auth conservan sus permisos. El bloqueo visual se aplica a toda la pantalla. La revisión central no necesita esperar a que un administrador confirme.

Pruebas: PGlite con las funciones reales y reloj controlado (10:59/11:00, Bogotá, fin de semana, doble envío, diferencias, permisos y cartera inalterada); Chrome con el módulo real (móvil, Escape, posponer, límite, error de red y reintento).
