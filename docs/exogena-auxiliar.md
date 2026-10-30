# Auxiliar anual de información exógena

Ruta: Administración → Información exógena → año → Consultar → Descargar Excel.
Acceso de pantalla para los controladores financieros activos (Óscar y Mayte), usando la sesión y las políticas RLS existentes. No incorpora nuevas funciones SQL ni cambia permisos de base de datos.

El archivo contiene una portada y seis hojas: resumen por tercero y categoría, pagos registrados, históricos declarados, otros pendientes, aplicaciones duplicadas excluidas y cobertura/alcance. Las identificaciones se exportan como texto y los importes como números. Los retiros se mantienen separados de gastos.

## Criterios

- Pagos de Tesorería en estado pagado/conciliado, gastos/retiros pagados y pagos a proveedores.
- Fechas de pago interpretadas en Colombia. Una fecha desconocida no se sustituye por la fecha de creación; se conserva como pendiente con año no confirmado.
- Aplicaciones de proveedor enlazadas a un pago de Banco pagado se excluyen para contar una sola vez el giro. Un pago marcado banco_creditek sin vínculo se deja por revisar.
- Los históricos se seleccionan por año del crédito, no por una fecha de pago inventada. Quedan separados del total de pagos fechados. La identidad solo se propone desde un origen único, su sede/aliado y el beneficiario explícitamente vinculado; debe validarse contra el giro histórico. Nunca se usa la cédula del deudor.
- Los conflictos de importe, posibles solapamientos con liquidaciones, tiendas propias e identidad/fecha faltantes se indican por registro. Versiones de un mismo correo no se suman.
- Los gastos de tienda sin beneficiario se muestran por revisar y no se suman como pagos comprobados. Pueden requerir cruce con gastos generales.
- Pagina todas las fuentes y exige respuesta completa. Un error deshabilita la descarga. Cambiar el año invalida la consulta anterior. Una consulta no es un cierre transaccional de la base.

## Límites fiscales

Es un auxiliar para revisión contable, no un archivo final DIAN. No determina conceptos fiscales, retenciones, tipos de documento, ubicaciones ni deducibilidad. No consolida todas las causaciones/devengos, ingresos, activos y saldos fiscales. Los importes pendientes son referencias, no se convierten en cero ni se suman al resumen. Los históricos sin fecha bancaria necesitan validar su año fiscal. La existencia de una ruta de soporte no valida su contenido.

Solo realiza SELECT para reunir el informe. La descarga utiliza el exportador existente y su registro de auditoría; no genera pagos ni modifica caja, Banco, cartera, ventas o liquidaciones.

## Verificación

- `node --test tests/erp/exogena.test.mjs tests/erp/kora-navigation-access.test.mjs`
- `npm run test:local` incluye las pruebas de exógena.
- Comprobación en Chrome aislado con datos ficticios: escritorio/móvil, 501 registros paginados, cambio de año, error de una fuente y descarga XLSX real con siete hojas, documento con ceros iniciales como texto y total numérico.
- Consultas de lectura del catálogo real y comprobación del modelo sobre datos actuales. No se adjuntan datos del negocio a este documento ni a las pruebas.
