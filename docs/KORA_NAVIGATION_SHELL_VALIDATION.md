# Validación visual de KORA Navigation Shell v1.0.0

Producto: KORA

Empresa: Creditek

Design System: Creditek Design System para KORA v1.0.0

Estado: bloqueada por autenticación segura y captura local

## Entorno local verificado

El mecanismo oficial utilizado es el servidor de desarrollo de Cloudflare:

```bash
npm run build
npx wrangler dev --ip 127.0.0.1 --port 8787
```

URL base: `http://127.0.0.1:8787`

Las siguientes rutas respondieron HTTP 200:

- `/creditek/erp/tablero.html`
- `/creditek/erp/utilidad-creditek.html`
- `/creditek/agentes/`

El proceso se detuvo después de la comprobación y no se realizó upload, deploy
ni modificación de producción.

## Autenticación de prueba

El repositorio no contiene fixtures, mocks, usuario de pruebas, sesión de
desarrollo ni credenciales aisladas para las pantallas piloto.

`tablero.html` y `utilidad-creditek.html` requieren una sesión Supabase y un
perfil activo. El portal de agentes dispone de una puerta que solicita una
sesión a un servicio remoto; utilizarla conectaría la validación local con
servicios y datos reales. Por seguridad no se utilizó.

No se desactivó autenticación, no se alteraron permisos y no se añadieron
credenciales, tokens ni bypasses.

## Bloqueo de capturas automatizadas

El navegador de automatización disponible rechaza por política tanto
`localhost`/`127.0.0.1` como `file://`. El servidor local sí funciona, pero no
puede ser abierto desde esa superficie de captura.

No se generaron capturas simuladas ni se modificó el ERP para eludir esta
restricción. La carpeta prevista para la evidencia es:

`docs/evidence/kora-shell-v1.0.0/`

## Guía manual segura de validación

Se requiere un usuario de pruebas Supabase activo, sin acceso a datos reales y
con perfiles representativos de gerencia y tienda.

1. Ejecutar los dos comandos del entorno local.
2. Abrir las tres rutas en un navegador autorizado para acceder a
   `127.0.0.1`.
3. Iniciar sesión con el usuario aislado.
4. Capturar Tablero en 1440, 1280, 1024, 768 y 390 px.
5. Capturar Utilidad Creditek y Agentes en 1440, 1024, 768 y 390 px.
6. Capturar Sidebar expandido y colapsado, módulo activo, tooltip, selector de
   tienda, perfil, breadcrumb, foco visible y drawer abierto.
7. Abrir el drawer con teclado, cerrarlo con Escape y comprobar que el foco
   vuelve al botón de apertura.
8. Revisar la consola en las tres pantallas y guardar cualquier error junto a
   la captura correspondiente.
9. Guardar imágenes optimizadas en la carpeta de evidencia indicada.
10. Detener Wrangler con `Ctrl+C`.

## Resoluciones y resultado

| Pantalla | Resoluciones requeridas | Resultado |
| --- | --- | --- |
| Tablero | 1440, 1280, 1024, 768, 390 px | Pendiente de sesión de pruebas y captura autorizada |
| Utilidad Creditek | 1440, 1024, 768, 390 px | Pendiente de sesión de pruebas y captura autorizada |
| Portal de agentes | 1440, 1024, 768, 390 px | Pendiente de sesión de pruebas y captura autorizada |

## Checklist de aprobación

- [x] Build público reproducible.
- [x] Servidor local oficial identificado y probado.
- [x] Tres rutas piloto disponibles localmente.
- [x] Sin cambios de lógica, autenticación, roles o permisos.
- [x] Sin deploy ni cambios en producción.
- [ ] Evidencia visual de todas las resoluciones.
- [ ] Navegación por teclado validada en navegador autenticado.
- [ ] Consola validada en las tres pantallas.
- [ ] Responsive y ausencia de desplazamiento horizontal confirmados.
- [ ] Lucide, Inter Variable y Montserrat confirmados visualmente.

La Fase 3.1 no se considera aprobada hasta completar los puntos pendientes con
un usuario de pruebas aislado y una superficie de captura autorizada.
