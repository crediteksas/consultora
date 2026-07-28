# KORA — Filtros de Análisis e informes v1.0.0

## Objetivo

Reducir el peso visual de los filtros de período y tienda en `reportes.html`, manteniendo intactos sus valores, eventos, consultas y resultados.

## Diseño aprobado

### Períodos

- Presentar los períodos como un selector segmentado claro.
- Usar superficie blanca o gris muy suave para las opciones inactivas.
- Reservar el azul oscuro para la opción activa.
- Usar el turquesa únicamente como acento de selección o foco.
- Reducir altura, relleno y separación frente a los botones actuales.
- Mantener visibles las nueve opciones rápidas.
- Conservar `Personalizado` como control secundario con icono de calendario.

### Tiendas

- Presentar `Todas las tiendas` como selector claro con borde sutil.
- Evitar que parezca una acción primaria.
- Mantener exactamente las mismas opciones y comportamiento.

### Responsive

- Permitir una distribución ordenada en varias líneas cuando falte espacio.
- Mantener alineados rótulos, controles y rango de fechas.
- Evitar desbordamiento horizontal y amontonamiento.
- En móvil, permitir desplazamiento horizontal contenido para los períodos si resulta más legible que comprimirlos.

### Estados

- Inactivo: fondo neutro, texto azul oscuro y borde sutil.
- Hover: superficie ligeramente más marcada.
- Activo: azul oscuro, texto blanco y acento turquesa discreto.
- Foco: anillo visible conforme al Design System.
- Transiciones: 180 ms y respeto por `prefers-reduced-motion`.

## Límites

- No cambiar filtros disponibles.
- No cambiar fechas calculadas.
- No cambiar consultas, permisos, exportaciones ni resultados.
- No modificar otros módulos.
- No introducir colores, radios, sombras o espaciados fuera de los tokens existentes.

## Validación

- Verificar todos los períodos rápidos.
- Verificar rango personalizado.
- Verificar selector de tiendas.
- Verificar estado activo.
- Validar 1440, 1024, 768 y 390 px.
- Confirmar ausencia de errores de consola y regresiones funcionales.
