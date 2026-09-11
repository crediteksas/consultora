# Corrección previa a recepción — KORA 3.3.2

## Alcance

Maite (perfil activo de Auditoría, correo verificado `gestion@crediteksas.com`) y Gerencia pueden corregir precio, cantidad y referencia de remisiones despachadas antes de que la tienda las acepte. No concede el permiso al resto de Auditoría. Aplica a todas las tiendas.

- Botón «Corregir remisión» en Remisiones; motivo obligatorio.
- Conserva número, destino y fecha de despacho.
- Precio: conserva unidad, factura y costo original.
- Cantidad/referencia: libera reservas y vuelve a reservar contra stock real, conservando la procedencia por unidad/lote. Stock insuficiente revierte la transacción completa.
- Líneas antiguas sin trazabilidad suficiente se rechazan; no se inventa costo o proveedor.
- Guarda revisión, usuario, motivo y líneas anteriores/posteriores en historial privado.
- La aceptación y la corrección bloquean la misma cabecera. Una pantalla anterior a la corrección debe actualizarse antes de aceptar.
- No crea cargos, pagos ni aceptaciones al corregir. Las remisiones recibidas no se editan desde esta acción.

## Verificación local

445 pruebas de KORA aprobadas, incluidas tres pruebas funcionales PostgreSQL/PGlite: autorización y precio; reservas/cantidades y rollback; bloqueo de acceso directo, revisión antigua y recepción posterior. No se editaron remisiones reales como prueba.

## Publicación pendiente de autorización explícita

El control de seguridad rechazó aplicar la migración en producción por su impacto sobre recepción e inventario. **No se aplicó la migración ni se desplegó esta versión.** La versión productiva permanece en 3.3.1.

La migración crea permiso e historial privados, agrega revisión, reutiliza la reserva canónica, protege las escrituras directas y envuelve la recepción para validar la revisión. Tras autorización: aplicar migración, verificar permiso/seguridad sin operar remisiones reales, publicar únicamente KORA con `npm run deploy:kora:production` y verificar interfaz y versión activa. No desplegar el frontend antes de la migración.

La auditoría visual global no está cerrada por este cambio.
