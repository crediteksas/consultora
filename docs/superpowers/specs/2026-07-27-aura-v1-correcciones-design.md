# AURA v1 — Diseño de correcciones de acceso e identidad

## Objetivo

Corregir exclusivamente AURA en `/creditek/agentes/` sin modificar KORA/ERP. El resultado debe ofrecer autenticación individual, interacción accesible con el formulario, identidad AURA consistente e iconografía semántica para sus agentes.

## Alcance

Incluye cuatro incidencias confirmadas:

1. El acceso usa una única clave compartida en lugar de correo y contraseña.
2. El campo de acceso recibe foco mediante Tab, pero no mediante clic.
3. El Dashboard interior muestra referencias visuales y textuales de KORA.
4. Las tarjetas de agentes usan símbolos genéricos o repetidos.

Fuera de alcance:

- Cualquier cambio en `creditek/erp/`.
- Cambios funcionales dentro de los agentes individuales.
- Creación o modificación de usuarios productivos.
- Despliegue automático a producción.
- Rediseño general del Dashboard fuera de identidad, acceso e iconografía.

## Enfoque técnico

### 1. Autenticación individual

AURA reutilizará el cliente de Supabase y el patrón de `signInWithPassword` ya disponible en el repositorio, pero mantendrá su propia autorización de acceso.

El formulario presentará:

- correo electrónico;
- contraseña;
- etiquetas visibles y asociadas;
- autocompletado `username` y `current-password`;
- mensajes de error claros;
- estado de envío;
- entrada con Enter.

Una sesión autenticada no bastará por sí sola para autorizar AURA. El arranque debe comprobar el perfil o rol permitido antes de revelar la aplicación. No se introducirán claves, tokens ni secretos nuevos en el HTML.

### 2. Interacción y accesibilidad

Los campos deben aceptar foco mediante:

- clic;
- Tab;
- etiqueta asociada.

El anillo turquesa de foco se conservará. Se eliminará cualquier superposición o regla de `pointer-events` que intercepte el clic. El formulario tendrá nombres accesibles, mensajes anunciables y orden de tabulación predecible.

### 3. Identidad AURA

La marca visible dentro de `/creditek/agentes/` será AURA:

- encabezado y logo textual;
- breadcrumb;
- títulos;
- metadatos del documento;
- navegación y textos de sistema.

Creditek continuará como marca corporativa subordinada. No se cambiarán referencias legítimas a Creditek ni los nombres funcionales de los agentes.

### 4. Iconografía

Se usará una sola familia de iconos lineales, con trazo y tamaño consistentes:

- Redes Sociales: megáfono o red;
- Respuestas automáticas: mensajes o bot;
- Meta Ads Intelligence: gráfico de campaña;
- Calendario de contenido: calendario.

Los iconos deberán tener etiqueta accesible cuando actúen como controles; si son decorativos, se ocultarán del árbol de accesibilidad.

## Estados y errores

- Credenciales incompletas: mensaje local sin enviar.
- Credenciales inválidas: error comprensible sin revelar detalles sensibles.
- Sesión válida sin permiso AURA: acceso denegado y cierre de la sesión de AURA.
- Fallo de red: mensaje recuperable y botón reintentar.
- Sesión activa autorizada: entrada directa al Dashboard.

## Pruebas

La implementación seguirá TDD:

1. Pruebas estáticas del contrato HTML para correo, contraseña, labels, autocomplete y ausencia del acceso legado.
2. Pruebas del controlador de autenticación con dependencias inyectables.
3. Pruebas de identidad para impedir regresiones de textos KORA dentro del shell AURA.
4. Pruebas de iconografía diferenciada.
5. Build público y verificación de que no se publican secretos ni archivos internos.
6. Revisión manual en Chrome y Safari, escritorio y móvil, con ratón y teclado.

## Seguridad

- No se almacenarán contraseñas en `localStorage` ni `sessionStorage`.
- No se publicarán service-role keys, secretos compartidos ni tokens privados.
- La autorización se comprobará además de la autenticación.
- Los mensajes no revelarán si un correo específico existe.

## Entrega

Los cambios quedarán en la rama aislada `codex/aura-v1-correcciones`. Después de pruebas y revisión visual se entregará el diff y la evidencia. El despliegue requerirá una aprobación posterior y explícita.
