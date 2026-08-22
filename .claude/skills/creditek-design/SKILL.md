---
name: creditek-design
description: >
  Sistema de diseño de Creditek SAS para interfaces UI (KORA, AURA),
  piezas publicitarias (Meta Ads, Instagram, WhatsApp), material POP
  y contenido orgánico. Aplica principios Apple de jerarquía, espacios,
  tipografía y animaciones, con la identidad visual de Creditek
  (azul profundo + turquesa + blanco). Usar cuando se diseñe cualquier
  interfaz, pieza gráfica, anuncio, landing, presentación o material
  visual de Creditek. Complementa apple-design con reglas de marca,
  formatos Meta Ads y reglas de contenido financiero colombiano.
---

# Creditek Design System

Sistema de diseño oficial de Creditek SAS.
Combina principios de diseño Apple (ver skill `apple-design`) con la
identidad visual y reglas de negocio de Creditek.

## 1. Identidad visual

### Paleta de colores

| Color                | HEX       | Uso                                          |
|----------------------|-----------|----------------------------------------------|
| Azul profundo        | `#0B1E3D` | Fondos institucionales, titulares, confianza  |
| Turquesa Creditek    | `#00C4CC` | CTAs, botones, checks, badges, aprobación     |
| Blanco               | `#FFFFFF` | Fondos limpios, contraste, respiración visual |
| Negro de apoyo       | `#000000` | Uso mínimo: textos técnicos, documentos       |
| Gris interfaz        | `#F5F5F5` | Fondos secundarios, cards, separadores        |
| Gris texto           | `#666666` | Texto secundario, metadata, timestamps        |
| Verde éxito          | `#22C55E` | Confirmaciones, aprobado, stock disponible     |
| Rojo alerta          | `#EF4444` | Errores, rechazado, stock agotado              |
| Amarillo precaución  | `#F59E0B` | Advertencias, en proceso, pendiente            |

### Regla de color dominante

- Azul + turquesa + blanco SIEMPRE dominan cualquier pieza.
- Colores de marcas de celulares (Samsung azul, Xiaomi naranja, etc.)
  pueden aparecer en el render del producto pero no superar el 20%
  de la composición total.
- El turquesa es SIEMPRE el color de acción: botones, CTAs, checks.
- NO usar degradados fuertes, neones ni colores fuera de la paleta.

### Tipografía

| Nivel       | Font              | Peso     | Tamaño     | Tracking     | Line-height |
|-------------|-------------------|----------|------------|--------------|-------------|
| Display     | Inter / system-ui | Bold     | clamp(2rem, 5vw, 3.5rem) | -0.02em | 1.05 |
| Heading 1   | Inter / system-ui | SemiBold | 1.75rem    | -0.01em      | 1.15        |
| Heading 2   | Inter / system-ui | SemiBold | 1.25rem    | -0.005em     | 1.2         |
| Body        | Inter / system-ui | Regular  | 1rem       | 0            | 1.5         |
| Caption     | Inter / system-ui | Regular  | 0.875rem   | 0.01em       | 1.4         |
| Label       | Inter / system-ui | Medium   | 0.75rem    | 0.02em       | 1.3         |

Usar `system-ui, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif`.
Para piezas comerciales y presentaciones: Montserrat o Poppins Bold en títulos.

### Espaciado (sistema de 8px)

`4px | 8px | 12px | 16px | 24px | 32px | 48px | 64px | 96px`

Usar rem: `0.25 | 0.5 | 0.75 | 1 | 1.5 | 2 | 3 | 4 | 6`

### Bordes y sombras

```css
/* Bordes */
--border-radius-sm: 6px;
--border-radius-md: 12px;
--border-radius-lg: 16px;
--border-radius-xl: 24px;
--border-color: rgba(11, 30, 61, 0.08);

/* Sombras (estilo Apple) */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
--shadow-xl: 0 16px 48px rgba(0, 0, 0, 0.16);

/* Glassmorphism para paneles flotantes */
--glass-bg: rgba(255, 255, 255, 0.72);
--glass-blur: blur(20px) saturate(180%);
--glass-border: 1px solid rgba(255, 255, 255, 0.4);
```

## 2. Componentes UI (KORA / AURA)

### Principios de interfaz

1. **Simplicidad sobre densidad.** Las tiendas usan KORA en celulares y tablets.
   Botones grandes (min 44px touch target), texto legible, acciones claras.
2. **Feedback inmediato.** Toda acción muestra resultado: loading, éxito, error.
   Nunca dejar al usuario sin saber qué pasó.
3. **Jerarquía clara.** La acción principal es siempre turquesa.
   Acciones secundarias en outline. Acciones destructivas en rojo.
4. **Zero tolerancia visual.** Alineación perfecta, espaciado consistente,
   sin elementos huérfanos ni cortes de texto.

### Botones

```css
/* Primario */
.btn-primary {
  background: #00C4CC;
  color: white;
  border: none;
  border-radius: 12px;
  padding: 12px 24px;
  font-weight: 600;
  transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.btn-primary:hover { background: #00B0B8; transform: translateY(-1px); }
.btn-primary:active { transform: scale(0.97); }

/* Secundario */
.btn-secondary {
  background: transparent;
  color: #0B1E3D;
  border: 1.5px solid rgba(11, 30, 61, 0.15);
  border-radius: 12px;
}

/* Destructivo */
.btn-danger {
  background: #EF4444;
  color: white;
  border-radius: 12px;
}
```

### Cards

```css
.card {
  background: white;
  border-radius: 16px;
  box-shadow: var(--shadow-md);
  padding: 24px;
  transition: box-shadow 0.3s ease, transform 0.3s ease;
}
.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Tablas (estilo KORA)

```css
.table th {
  background: #0B1E3D;
  color: white;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  padding: 12px 16px;
}
.table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}
.table tr:hover td {
  background: rgba(0, 196, 204, 0.04);
}
```

## 3. Formatos publicitarios (Meta Ads)

### Dimensiones por formato

| Formato       | Ratio | Resolución    | Uso                              |
|---------------|-------|---------------|----------------------------------|
| Feed          | 4:5   | 1080 × 1350   | Facebook/Instagram Feed          |
| Cuadrado      | 1:1   | 1080 × 1080   | Carousel cards, Marketplace      |
| Stories/Reels | 9:16  | 1080 × 1920   | Stories, Reels (principal)       |
| Landscape     | 16:9  | 1920 × 1080   | YouTube, banners web             |

### Estructura de pieza publicitaria

Toda pieza de Creditek debe tener estos elementos en orden de jerarquía:

1. **Gancho visual** (primer segundo): producto grande + precio/cuota visible
2. **Propuesta de valor**: "Estrena hoy, págalo fácil" o variante
3. **Ciudad/tienda**: "Disponible en [ciudad]" o "Estamos en [ciudad]"
4. **CTA**: botón turquesa "Escríbenos por WhatsApp" o "Consulta tu crédito"
5. **Disclaimer**: "Sujeto a estudio de crédito" (siempre visible, tamaño caption)

### Zonas seguras

STORIES/REELS (9:16):
┌────────────────────┐
│ ▓▓ ZONA SEGURA ▓▓ │ ← 14% superior: no texto crítico (interfaz del OS)
│ │
│ PRODUCTO GRANDE │
│ CUOTA/PRECIO │
│ │
│ PROPUESTA VALOR │
│ CIUDAD/TIENDA │
│ │
│ [CTA TURQUESA] │
│ │
│ ▓▓ ZONA SEGURA ▓▓ │ ← 10% inferior: no texto (controles de la app)
└────────────────────┘


### Reglas de contenido financiero

OBLIGATORIO en toda pieza que mencione crédito o cuotas:

- ✅ "Desde $X por cuota" (la palabra "desde" es obligatoria)
- ✅ "Sujeto a estudio de crédito"
- ✅ Mostrar precio total del producto si se muestra cuota
- ❌ NUNCA "Aprobado para todos"
- ❌ NUNCA "Sin requisitos"
- ❌ NUNCA "Crédito garantizado"
- ❌ NUNCA ocultar condiciones
- ❌ NUNCA usar cuota como si fuera el precio total

### Regla multimarca

Los celulares de Samsung, Xiaomi, Motorola, etc. tienen identidades
visuales propias. Regla: el render del producto puede usar su estética
(colores del celular, ángulo oficial), pero el MARCO de la pieza
(fondo, título, CTA, texto, bordes) SIEMPRE es Creditek:
azul profundo + turquesa + blanco.

## 4. Animaciones y transiciones

Usar los valores de la skill `apple-design` como base:

```css
/* Transiciones estándar */
--transition-fast: 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
--transition-normal: 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
--transition-slow: 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94);

/* Springs para interacciones (Motion/Framer Motion) */
/* Estándar: damping 1.0, response 0.4 */
/* Con momentum: damping 0.8, response 0.3 */

/* Hover cards */
transform: translateY(-2px);
box-shadow: upgrade;

/* Botón press */
transform: scale(0.97);

/* Loading */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0ms !important; animation: none !important; }
}
```

## 5. Templates por tipo de pieza

### Pieza de producto individual (Meta Ads)

[Fondo: azul profundo 
#0B1E3D]
[Producto: render grande, centrado, limpio]
[Texto: "Samsung Galaxy A15" — blanco, Heading 1]
[Cuota: "Desde $45.000/mes" — turquesa, Display]
[Disclaimer: "Sujeto a estudio · Precio total $650.000" — blanco 60%, Caption]
[CTA: botón turquesa "Escríbenos por WhatsApp"]
[Ciudad: "📍 Disponible en Chinú" — blanco, Body]
[Logo Creditek: esquina inferior derecha]


### Pieza campaña multimarcas

[Fondo: gradiente azul profundo → azul medio]
[Productos: 3-4 celulares en fila o grid]
[Claim: "Estrena celular hoy y págalo fácil" — blanco, Display]
[Cuotas: "Desde $35.000/mes" — turquesa, Heading 1]
[Disclaimer: "Sujeto a estudio" — blanco 60%, Caption]
[CTA: botón turquesa]
[Logo + ciudad]


### Card de carousel

[Fondo: blanco o azul profundo]
[Producto: centrado, grande]
[Nombre: "Xiaomi Redmi Note 13" — Heading 2]
[Specs: "128GB · 6RAM · Cámara 108MP" — Caption]
[Cuota: "Desde $52.000/mes" — turquesa, Heading 1]
[Precio total: "$780.000" — Caption]


### WhatsApp comercial (formato cuadrado)

[Imagen: producto grande, fondo limpio]
[Texto superpuesto: grande, legible en miniatura]
[Cuota y condiciones visibles]
[Sin exceso de información — máximo 3 datos]


## 6. Dark mode

KORA y AURA soportan dark mode. La paleta se ajusta:

| Elemento          | Light             | Dark              |
|-------------------|-------------------|--------------------|
| Fondo primario    | `#FFFFFF`         | `#0B1E3D`          |
| Fondo secundario  | `#F5F5F5`         | `#132B4A`          |
| Texto primario    | `#0B1E3D`         | `#F5F5F5`          |
| Texto secundario  | `#666666`         | `#9CA3AF`          |
| Bordes            | `rgba(0,0,0,0.08)`| `rgba(255,255,255,0.08)` |
| CTA turquesa      | `#00C4CC`         | `#00D4DC` (ligeramente más claro) |

## 7. Checklist de calidad visual

Antes de entregar cualquier diseño, verificar:

- [ ] Colores dentro de la paleta Creditek
- [ ] Turquesa solo en elementos de acción
- [ ] Tipografía con jerarquía correcta (Display > H1 > H2 > Body > Caption)
- [ ] Espaciado en múltiplos de 8px
- [ ] Touch targets mínimo 44px
- [ ] Contraste WCAG AA mínimo (4.5:1 texto normal, 3:1 texto grande)
- [ ] Disclaimer financiero presente si hay cuota/crédito
- [ ] Logo Creditek visible
- [ ] Ciudad/tienda identificada
- [ ] CTA claro y visible
- [ ] Zonas seguras respetadas en Stories/Reels
- [ ] Producto grande y limpio
- [ ] Máximo 3 datos clave por pieza (producto, cuota, CTA)

## 8. Lo que Creditek NO es

- NO es una fintech ni un banco
- NO es una app de descarga
- NO garantiza aprobación de crédito
- NO compite por "más rápido" o "más fácil" sino por cercanía,
  confianza y acompañamiento humano en tienda física
- La ventaja es: tienda real + inventario verificable + Sofía 24/7
  + KORA para trazabilidad + vendedor que te conoce

---
