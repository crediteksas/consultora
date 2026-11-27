# Cartera: cierre R6

Este archivo describe el estado actual; los documentos R1–R5 conservan las etapas anteriores.

Código revisado por Claude: aprobado, condicionado a las comprobaciones alojadas. El dictamen final y sus predecesores se conservan en `reviews/`. Las fuentes de cada envío tienen un manifiesto con SHA-256. Las identidades existentes del código fueron sustituidas por valores ficticios en los últimos envíos; los hashes originales y transmitidos se distinguen.

Validaciones completas antes de la instalación:

- Suite general de KORA: 1.765 pruebas aprobadas, cero fallos.
- PostgreSQL 17.6, Auth 2.198 y PostgREST 14.5 oficiales: 35 comprobaciones por escenario, tanto upgrade como reconstrucción restrictiva. Datos ficticios y dependencias reducidas; no es una copia de producción.
- API iniciado antes de instalar: se observa la RPC nueva tras recargar esquema/configuración, sin reinicio; ajustes efectivos del cliente 8s/2s.
- Guarda diaria activa: tienda sin confirmar bloqueada, bootstrap ordinario explícito, Gerencia conservada y tienda confirmada permitida.
- Particiones legítimas inaccesibles toleradas; permisos ampliados o particiones separadas cierran Cartera. Un rol residual aislado también falla el gate.
- Cuatro casos visuales, 390/1440 píxeles y Gerencia/Cartera; sin desbordamiento y diálogo contenido.
- Gate de permisos: 34 escenarios, conservando evidencia anterior. Los 190 archivos de la propuesta original permanecen idénticos.
- Los tres perfiles autorizados se verificaron con sesiones aisladas antes del cambio: acceso actual a Cartera, pestaña Calidad y ausencia de desbordamiento en computador. No se escribieron pagos, gestiones, solicitudes de provisión ni saldos.

Producción todavía no recibe las migraciones ni la interfaz R6. No se ha convertido el perfil de tienda ni se ha asignado el rol dedicado. El contrato se instalará desactivado; el fondo y su autorizador se habilitan individualmente después de verificar el despliegue.

La publicación oficial necesita el checkout canónico limpio. Sigue pendiente la confirmación humana directa para apartar temporalmente `backups/` y la carpeta de SOFIA; existen copias verificadas con contenido y metadatos. No se elude la negativa anterior mediante un stash global, rename indirecto, exclusiones de Git o cambio de la política de publicación.

Orden restante: instalar fund/R6, recargar API, repetir comprobación ordinaria de los tres perfiles, publicar por pipeline oficial, verificar versión y presentación, realizar transición individual de la operadora (con revocación/expiración comprobadas), habilitar su contrato y vincular al único autorizador del fondo. Limpiar solo las sesiones de prueba por su pareja usuario/session_id exacta, sin cerrar otros dispositivos.

No se fabrican cortes comparables, pagos históricos ni fondos conciliados. Si falta un segundo corte o evidencia de dinero disponible, la herramienta debe mostrar el estado real. NOVA no se activa con este paquete.
