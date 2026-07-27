# Changelog

Los cambios notables de Creditek Design System se registran en este archivo.
El proyecto utiliza versionado semántico.

## KORA Visual Transformation v1.0.0 - 2026-07-27

### Added

- Superficie visual compartida para las 34 pantallas ERP, Agentes y portales.
- Adaptador progresivo para tablas accesibles, controles, estados y overlays.
- Integración consistente del KORA Navigation Shell en el ERP autenticado.
- Responsive validado para escritorio, tablet y móvil.

### Changed

- Las pantallas existentes consumen tokens, tipografía, controles, tablas,
  estados y navegación del Creditek Design System.
- Los estilos heredados quedan aislados bajo la capa visual compartida.

## [1.0.0] - 2026-07-27

### Added

- Tokens centralizados de color, tipografía, espaciado, radios, sombras,
  transiciones, capas, breakpoints, opacidad, iconos, alturas y anchos.
- 34 componentes base estables para acciones, formularios, feedback, contenido,
  navegación y capas flotantes.
- Contratos de foco visible, teclado, estados disabled y loading, ARIA y
  reducción de movimiento.
- Utilidades responsive para móvil, tablet, laptop y escritorio.
- Adaptador para Lucide fijado en la versión 1.27.0.
- Documentación normativa, ejemplos, buenas prácticas y restricciones.
- 15 pruebas del Design System, junto con 46 pruebas ERP y 19 de seguridad
  aprobadas al cerrar la versión.
- Compatibilidad con la arquitectura multipágina actual de Creditek.
- Publicación reproducible de CSS, módulos JavaScript y manifiestos mediante el
  build existente.

### Changed

- El build público reconoce los recursos ejecutables del Design System y
  mantiene fuera la documentación interna.

### Security

- La verificación del artefacto público inspecciona también archivos CSS y MJS.

### Limitaciones conocidas

- Inter Variable y Montserrat se cargan desde Google Fonts.
- Lucide debe cargarse desde una URL fijada o desde una futura copia local.
- Los breakpoints se reflejan como valores estáticos en `@media` por una
  limitación nativa de CSS.
