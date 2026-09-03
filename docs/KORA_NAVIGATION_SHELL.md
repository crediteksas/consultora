# KORA Navigation Shell

Producto: KORA

Empresa: Creditek

Design System: Creditek Design System para KORA v1.0.0

Versión de producto: KORA v3.1

Versión: 1.0.0

## Comportamiento preservado de `sidebar.js`

- La sesión de las pantallas ERP continúa validándose con el cliente Supabase compartido.
- La visibilidad conserva las listas de roles y las rutas existentes.
- Gerencia y auditoría conservan el selector informativo de tienda y su preferencia `creditek_sidebar_tienda`.
- Los usuarios de tienda conservan su tienda fija.
- Cerrar sesión sigue ejecutando `signOut` y recargando el destino.
- Las pantallas ERP autenticadas usan el mismo shell y la misma política de navegación.
- El portal de agentes conserva su autenticación, navegación interna e iframe existentes.

## Alcance v1.0.0

El shell compartido aporta Sidebar, Topbar, breadcrumbs, estado activo,
colapso de escritorio, drawer móvil con foco controlado, perfil, rol y puntos
de extensión visuales para notificaciones y conectividad.

Se activa en todas las pantallas ERP autenticadas. No rediseña su contenido interno.

No implementa sincronización offline, PWA, sonidos, notificaciones reales ni
monitoreo real de conectividad.
