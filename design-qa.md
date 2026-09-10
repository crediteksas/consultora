# QA visual — Aliados

- Referencia: captura suministrada el 4 de septiembre de 2026.
- Vista validada: `https://kora.crediteksas.com/creditek/erp/aliados.html`.
- Resultado: las seis columnas caben en el ancho visible, sin desplazamiento horizontal ni contenido cortado.
- La columna `Estado / acción` conserva el botón `Gestionar` en las filas pendientes.
- Validación productiva realizada sobre el commit `cdff638`.

## Krediya

- El lote contiene 45 filas: 39 reconocidas, 2 anuladas en el archivo y 4 operaciones firmadas de comercios todavía no formalizados.
- Los cuatro comercios nuevos permanecen bloqueados para evitar una asignación financiera silenciosa.

## Cuenta bancaria de ejecutivos — 9 de septiembre de 2026

- Referencia: captura del formulario de Oscar Pacheco con la identificación interna bloqueada.
- Implementación comparada: modal de Tesorería con el mismo diseño, jerarquía y distribución.
- El campo `CC / NIT del titular` ahora queda vacío y editable cuando el valor anterior no es numérico.
- El nombre del ejecutivo continúa bloqueado y el texto aclara que el perfil y las órdenes existentes no cambian.
- Reflow validado en 390, 768 y 1280 px, sin desbordamiento horizontal.
- Interacción validada: identificación, banco, tipo, cuenta, confirmación y guardado.
- Hallazgos P0/P1/P2 pendientes: ninguno.
- final result: passed

## Sofía CRM responsive — 10 de septiembre de 2026

- Resultado: **PASSED**
- Fuente comparada: `/var/folders/pz/chb6bbmd0zg5d2f30sgq_tnh0000gn/T/codex-clipboard-9180d7c5-a11a-4380-9a24-5e3ec58d9909.png`
- Implementación revisada: `creditek/agentes/creditek-agente-respuestas.html` + `creditek/agentes/aura-responsive.css`.
- Estado reproducido: CRM sin conversación seleccionada, encabezado con seis indicadores y tres acciones.
- Ventana angosta validada en Chrome: 926 × 902 px.
- El título “Sofía · CRM WhatsApp” se muestra completo en una sola línea.
- Los botones Salir, Exportar y Actualizar permanecen visibles y no invaden el título.
- Los seis indicadores se redistribuyen sin recorte ni desplazamiento fuera de pantalla.
- En tableta los indicadores usan tres columnas; en móvil usan dos columnas.
- El área de conversaciones conserva su ancho y no genera desbordamiento horizontal.
- No se modificó lógica, datos, consultas ni acciones del CRM.
- final result: passed
