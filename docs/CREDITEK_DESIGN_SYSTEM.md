# Creditek Design System 1.0

## Propósito

Creditek Design System define la infraestructura visual común del ERP, agentes,
acceso, configuración, reportes, dashboards y módulos futuros. Esta primera
versión no reemplaza estilos existentes ni modifica lógica funcional.

## Instalación

Cada pantalla migrada cargará una única hoja:

```html
<link rel="stylesheet" href="/design-system/styles/index.css">
```

Los comportamientos progresivos son opcionales:

```html
<script type="module">
  import { initCreditekDesignSystem } from
    "/design-system/components/index.mjs";
  initCreditekDesignSystem();
</script>
```

Las pantallas no migradas continúan funcionando sin estos recursos.

## Principios

1. Todos los valores visuales deben venir de tokens `--ctk-*`.
2. No se escriben colores directamente en componentes.
3. La separación usa la cuadrícula de 8 px; 4 px se reserva para ajustes mínimos.
4. Inter Variable es la fuente de interfaz y Montserrat la fuente institucional.
5. Lucide es la única librería de iconos de interfaz.
6. Los componentes deben funcionar desde móvil hasta escritorio.
7. Cada control debe tener nombre accesible, foco visible y estado deshabilitado.
8. Las mejoras visuales no pueden cambiar cálculos, permisos, consultas o flujos.

## Tokens

### Colores

`tokens/index.css` contiene:

- `primary`: escala azul Creditek basada en `#0B1E3D`.
- `secondary`: escala turquesa Creditek basada en `#00C4CC`.
- `accent`: énfasis visual complementario.
- `success`, `warning`, `danger` e `info`: estados semánticos.
- `neutral`: fondos, superficies, bordes y texto.
- Alias semánticos: `background`, `surface`, `border`, `muted`, `disabled`,
  `hover`, `active`, `focus`, `text` y `overlay`.

Los componentes consumen alias semánticos. Las escalas numéricas se utilizan
cuando el contraste o la jerarquía requieren un nivel específico.

### Tipografía

| Rol | Token |
| --- | --- |
| Interfaz | `--ctk-font-family-ui` |
| Institucional | `--ctk-font-family-brand` |
| Display | `--ctk-font-size-display` |
| H1–H4 | `--ctk-font-size-h1` a `--ctk-font-size-h4` |
| Body | `--ctk-font-size-body` |
| Caption | `--ctk-font-size-caption` |
| Small | `--ctk-font-size-small` |
| Label | `--ctk-font-size-label` |
| Button | `--ctk-font-size-button` |
| Table | `--ctk-font-size-table` |

### Espaciado

La escala `--ctk-space-*` parte de 8 px. `--ctk-space-0-5` representa la
excepción de 4 px. No se deben crear separaciones arbitrarias.

### Radios

`--ctk-radius-xs`, `sm`, `md`, `lg`, `xl` y `full`.

### Sombras

Solo existen cuatro niveles:

- `--ctk-shadow-1`: separación mínima.
- `--ctk-shadow-2`: tarjeta elevada.
- `--ctk-shadow-3`: dropdown o toast.
- `--ctk-shadow-4`: modal o drawer.

### Movimiento

Duraciones permitidas:

- `--ctk-duration-1`: 120 ms.
- `--ctk-duration-2`: 180 ms.
- `--ctk-duration-3`: 220 ms.
- `--ctk-duration-4`: 300 ms.

`styles/animations.css` respeta `prefers-reduced-motion`.

### Capas

La escala `--ctk-z-*` define base, sticky, dropdown, drawer, modal, toast y
tooltip. No se permiten valores `z-index` arbitrarios.

### Breakpoints

| Dispositivo | Token | Inicio |
| --- | --- | --- |
| Mobile | `--ctk-breakpoint-mobile` | 30 rem |
| Tablet | `--ctk-breakpoint-tablet` | 48 rem |
| Laptop | `--ctk-breakpoint-laptop` | 64 rem |
| Desktop | `--ctk-breakpoint-desktop` | 80 rem |

CSS no permite variables dentro de `@media`; los valores declarados en las
consultas deben reflejar exactamente estos tokens.

### Otros

- Opacidad: `--ctk-opacity-*`.
- Iconos: `--ctk-icon-xs` a `--ctk-icon-xl`.
- Alturas: controles, topbar y filas.
- Anchos: sidebar, contenido, formularios y modales.

## Componentes

### Acciones

#### Button

Clase `.ctk-button`. Variantes: `primary`, `secondary`, `outline`, `ghost` y
`danger` mediante `data-variant`. Tamaños `sm`, estándar y `lg`.

```html
<button class="ctk-button" data-variant="primary">Guardar</button>
```

#### IconButton

Clase `.ctk-icon-button`. Debe incluir `aria-label` y `title`.

```html
<button class="ctk-icon-button" aria-label="Actualizar" title="Actualizar">
  <i data-lucide="refresh-cw"></i>
</button>
```

### Formularios

#### Input

Usa `.ctk-field`, `.ctk-label`, `.ctk-input`, `.ctk-help` y `.ctk-error`.
Los errores se comunican con `aria-invalid` y `aria-describedby`.

#### Textarea

Usa `.ctk-textarea`. Se permite redimensionamiento vertical.

#### Select

Usa `.ctk-select` sobre un `<select>` nativo.

#### Checkbox

Usa `.ctk-checkbox` dentro de `.ctk-choice`. El texto debe estar asociado
mediante `<label>`.

#### Switch

Usa `.ctk-switch` sobre `input[type="checkbox"]` con etiqueta visible.

#### Radio

Usa `.ctk-radio`. Cada grupo debe estar dentro de `<fieldset>` con `<legend>`.

#### Search

Usa `.ctk-search-wrap` y `.ctk-search`. Debe tener etiqueta accesible.

#### DatePicker

Usa `.ctk-date-wrap` y `.ctk-date-picker` sobre `input[type="date"]`.

### Indicadores y feedback

#### Badge

`.ctk-badge` representa metadatos neutrales.

#### StatusBadge

`.ctk-status-badge` usa `data-status`: `success`, `warning`, `danger` o `info`.
El color nunca debe ser el único medio para comunicar el estado.

#### AlertCard

`.ctk-alert-card` usa los mismos estados semánticos. Los errores importantes
deben incluir `role="alert"`.

#### EmptyState

`.ctk-empty-state` combina título, descripción y una acción opcional.

#### Skeleton

`.ctk-skeleton` representa contenido pendiente. El contenedor debe indicar
`aria-busy="true"`.

#### Loading

`.ctk-loading` agrupa un Spinner y texto visible.

#### Spinner

`.ctk-spinner` es decorativo; el estado de carga se anuncia en el contenedor.

#### Progress

`.ctk-progress` se aplica al elemento `<progress>` nativo.

#### Toast

La región `.ctk-toast-region` usa `data-ctk-toast-region` y `aria-live`.
`createToast()` asigna `status` o `alert` según la severidad.

### Contenido

#### Card

`.ctk-card` agrupa contenido relacionado; no debe usarse para cada bloque sin
jerarquía.

#### MetricCard

`.ctk-metric-card` utiliza las partes `__label`, `__value` y `__comparison`.
Los valores deben provenir de las fuentes reales del módulo.

#### DataTable

`.ctk-data-table` debe estar dentro de `.ctk-table-wrap`. Encabezados con
`<th scope="col">`; estados vacíos y paginación quedan fuera de la tabla.

#### Pagination

`.ctk-pagination` contiene botones con nombres como “Página anterior” y
“Página siguiente”. La página actual usa `aria-current="page"`.

#### Avatar

`.ctk-avatar` puede mostrar imagen o iniciales. Las imágenes requieren `alt`.

### Navegación

#### Tabs

`.ctk-tabs` y `.ctk-tab` siguen el patrón ARIA tablist/tab/tabpanel. El módulo
de interacciones agrega navegación con flechas, Home y End.

#### Breadcrumb

`.ctk-breadcrumb` se usa dentro de `<nav aria-label="Ruta">`. El elemento
actual usa `aria-current="page"`.

#### Sidebar

`.ctk-sidebar` contiene navegación autorizada por la aplicación. El Design
System controla presentación y responsive, no permisos.

#### Topbar

`.ctk-topbar` reúne búsqueda, contexto, notificaciones y perfil.

#### PageHeader

`.ctk-page-header` contiene título, descripción y acciones de página.

#### FilterBar

`.ctk-filter-bar` organiza filtros responsive sin alterar sus valores ni
consultas.

### Capas flotantes

#### Modal

`.ctk-modal` usa `role="dialog"`, `aria-modal="true"`, título asociado y
`data-ctk-overlay`. El controlador restaura el foco y cierra con Escape.

#### Drawer

`.ctk-drawer` comparte el contrato accesible de Modal y se transforma en panel
inferior en móvil.

#### Tooltip

`.ctk-tooltip` complementa una etiqueta, nunca la reemplaza. Debe enlazarse
mediante `aria-describedby`.

#### Dropdown

`.ctk-dropdown` y `.ctk-dropdown__item` usan un botón con `aria-expanded`,
`aria-controls` y `data-ctk-dropdown-trigger`.

## Iconografía Lucide

`icons/lucide.mjs` adapta la API oficial de Lucide. La aplicación consumidora
debe cargar una versión fijada y pasar la API a `renderLucideIcons()`.

Los emojis no se usan para acciones, navegación, estados o métricas. Pueden
permanecer cuando forman parte del contenido creado por los usuarios.

## Utilidades

- Layout: `ctk-container`, `ctk-stack`, `ctk-cluster`, `ctk-grid`, `ctk-split`.
- Overflow: `ctk-scroll-x`.
- Accesibilidad: `ctk-sr-only`, `ctk-skip-link`, `ctk-touch-target`.
- Responsive: visibilidad específica para mobile, tablet y desktop.

## Accesibilidad obligatoria

- Todos los controles tienen nombre accesible.
- El foco visible no se elimina.
- Los botones deshabilitados usan `disabled`.
- Los procesos usan `aria-busy`.
- Los estados dinámicos usan `status`, `alert` o `aria-live`.
- Modales y drawers restauran el foco al cerrarse.
- Se respeta `prefers-reduced-motion`.
- El contraste debe validarse en cada pantalla migrada con datos reales.

## Buenas prácticas

- Importar `styles/index.css`, no archivos internos aislados.
- Utilizar HTML semántico antes de agregar ARIA.
- Mantener las reglas de permisos y negocio en el módulo consumidor.
- Probar tablas con pocos registros, muchos registros y estado vacío.
- Migrar una pantalla por commit.
- Comparar resultados funcionales antes y después de la migración.

## Restricciones

- No escribir colores, sombras, radios, opacidades o transiciones arbitrarias.
- No copiar componentes dentro de HTML.
- No mezclar librerías de iconos.
- No usar emojis como iconos de interfaz.
- No usar sonido sin consentimiento y configuración explícita.
- No conectar componentes con datos, Supabase o APIs.
- No cambiar lógica durante una migración visual.
