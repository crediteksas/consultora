# Tesorería: clientes y cuentas

## Alcance

Botón **Clientes y cuentas** en Tesorería, sin abrir un lote. El directorio incluye todos los comercios aliados activos, también los que aún no tienen beneficiario o cuenta. No es el directorio de consumidores de crédito ni el de proveedores B2B.

- Búsqueda por comercio, código, ciudad, titular e identificación; estados de datos pendientes; páginas de diez comercios.
- Formulario para nombre/razón social e identificación del titular, banco, tipo y número de cuenta.
- Relación de un titular nuevo o previamente no relacionado con el comercio seleccionado. No traslada titulares de otro comercio ni fusiona nombres similares.
- Cuenta actual enmascarada en la lista; número completo en el editor; cuentas anteriores consultables.
- Acceso sujeto a la capacidad bancaria existente `tiene_capacidad_aliados('revisor')`, que también incluye al aprobador. Sin ampliación de RLS ni permisos directos de escritura.

## Historial y seguridad

El nuevo RPC solo escribe el maestro de beneficiarios, cuentas y auditoría. No llama a `aliados_completar_pagos_beneficiario`, no actualiza órdenes, no aprueba liquidaciones y no modifica saldos.

Los titulares anteriores se conservan inactivos al sustituirlos. Los números de cuenta distintos conservan su registro anterior. Las órdenes conservan sus snapshots; Tesorería usa la identidad del snapshot antes que la del maestro actualizado.

Se rechaza una edición de identidad o datos bancarios que afectaría una orden sin snapshot suficiente. Se rechaza una relación de titular que cambió desde que se abrió el formulario. No se permite cambiar de comercio un titular ya asociado a otro.

La guía de Supabase influyó en la decisión de usar una operación bancaria atómica con la capacidad existente, `search_path` fijo, ejecución denegada a `PUBLIC`/`anon` y auditoría. El asesor señala la exposición autenticada de la función SECURITY DEFINER (intencional para esta operación; la autorización se comprueba dentro). [Referencia del aviso](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Otros avisos generales del proyecto no se corrigieron en este cambio.

## Validación

- 252 pruebas locales aprobadas.
- Build de KORA y verificación del artefacto aprobados usando la configuración existente.
- Navegador sobre HTML real con datos ficticios: entrada desde Tesorería, búsqueda, páginas, cuenta faltante, número con ceros iniciales, error y reintento, cierre con Escape y anchos 390, 768 y 1280 px sin desbordamiento lateral del directorio/editor.
- Prueba SQL transaccional con rollback: alta, edición, asociación, cuenta anterior, identificaciones cruzadas, relación obsoleta, verificación, usuario sin capacidad, anónimo y órdenes intactas.
- Tras rollback: 0 comercios y 0 titulares de prueba; 18 beneficiarios, 17 cuentas y 26 órdenes reales, sin cambios de cantidades. El hash del contenido completo de las órdenes no cambió durante la prueba.

## Estado de publicación

La migración `tesoreria_clientes_cuentas` está instalada en Supabase. La interfaz está implementada y probada localmente. **No se desplegó KORA**: pendiente la revisión de Claude exigida por `REGLAS.md`, o autorización explícita de Oscar para omitirla. La ruta publicada anterior sigue siendo Liquidaciones → Cuenta bancaria.

No se hicieron altas bancarias reales ni se dedujeron titulares desde los formularios de empleados. A TECH MOVIL y A CREDICELULARES siguen siendo comercios separados.
