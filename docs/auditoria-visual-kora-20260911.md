# Auditoría visual KORA — 11 de septiembre de 2026

## Estado: abierta, NO validada al 100%

Alcance solicitado: todas las pantallas de KORA, incluidos sus formularios,
pestañas, ventanas y estados, en escritorio y móvil y por los roles autorizados.
No incluye modificar cálculos, pagos, permisos ni registros operativos.

La inspección de una vista inicial **no** acredita toda la página. Las pruebas
automatizadas existentes tampoco sustituyen la inspección visual.

## Evidencia de esta sesión

Capturas locales guardadas e inspeccionadas en
`/private/tmp/kora-auditoria-visual-DxCIsb`.
Sesión de producción: Gerencia. Tamaños usados: 1280×900 y 390 px de ancho;
las primeras capturas de escritorio a 1366 requieren repetir a tamaño estable.
Las capturas full-page con artefactos de composición y las capturas de carga
se rechazaron: no se cuentan como revisión.

## Hallazgos confirmados en producción

| ID | Vista | Hallazgo | Evidencia | Estado |
|---|---|---|---|---|
| V01 | Inventario Retail | Importes de tarjetas parten el último dígito en otra línea | 08-inventario-desktop.png | Pendiente de corregir y repetir |
| V02 | Resultado/Dashboard B2B | Campo de fecha corta el año; selección de comparación recortada | 13-dashboard-b2b-desktop.png | Pendiente de corregir y repetir |
| V03 | Pedidos B2B y Cartera B2B | Encabezado del shell tiene tamaño y distribución diferentes; ocupa dos líneas | 14-pedidos-desktop.png, 19-cartera-b2b-desktop.png | Pendiente de aislar estilos y repetir |
| V04 | Proveedores | Acción de última columna recortada en vista inicial | 16-proveedores-desktop.png | Pendiente de comprobar scroll y corregir presentación |
| V05 | Clientes, Cartera de créditos, Resultado B2B | Cabeceras planas sin superficie redondeada consistente | 05-clientes-desktop.png, 12-creditos-cartera-desktop.png, 13-dashboard-b2b-desktop.png | Pendiente |
| V06 | Ejecutivos, Plataformas, Presupuesto, Bonificaciones, Reportes Aliados | Etiquetas pegadas a controles en línea, sin separación uniforme | 26-ejecutivos-desktop.png a 28-presupuesto-aliados-desktop.png, 32-bonificaciones-desktop.png, 34-reportes-aliados-desktop.png | Pendiente |
| V07 | Compras | Inputs numéricos demasiado estrechos en tabla editable | 15-compras-desktop.png | Pendiente de comprobar edición sin guardar |

## Matriz de páginas

`Inicial` significa únicamente primer encuadre, NO página aprobada.
Todas mantienen pendiente recorrido completo, estados, móvil y roles cuando
no se indica evidencia adicional. Ninguna se declara cerrada todavía.

| Archivo | Escritorio | Móvil | Pendiente específico |
|---|---|---|---|
| tablero.html | Repetir captura de carga | Pendiente | Tablero y drill-down |
| reportes.html | Inicial; repetir tamaño estable | Inicial | Pestañas, gráficos y reportes desplegados |
| presupuestos.html | Inicial | Inicial | Calendario completo y formularios |
| ventas.html | Inicial; repetir tamaño estable | Inicial | Venta/detalle y estados |
| registro-interno.html | Inicial; repetir tamaño estable | Repetir transición | Formularios y búsquedas |
| caja.html | Inicial; repetir tamaño estable | Pendiente | Pestañas y ventanas |
| catalogo.html | Inicial; repetir tamaño estable | Pendiente | Productos y edición |
| inventario.html | Inicial, V01 | Pendiente | Pestañas, historial y detalle |
| gastos.html | Inicial | Pendiente | Formularios y estados |
| cuenta-corriente.html | Inicial Retail y consignaciones | Pendiente | Historial, abonos y soporte |
| creditos-cartera.html | Inicial, V05 | Pendiente | Cuatro pestañas y ventanas |
| utilidad-creditek.html | Inicial dashboard/reportes, V02/V05 | Pendiente | Gráficos, filtros y tablas inferiores |
| pedidos-b2b.html | Inicial, V03 | Pendiente | Pedido, orden y documento |
| compra-proveedor.html | Inicial, V07 | Pendiente | Líneas de compra y ventanas |
| proveedores.html | Inicial, V04 | Pendiente | Compras, cartera y ficha |
| bodega-central.html | Inicial | Pendiente | Despacho, búsqueda y recepción |
| remisiones.html | Inicial | Pendiente | Crear, recibir y detalle |
| cartera-b2b.html | Inicial, V03 | Pendiente | Movimientos y detalle |
| aliados-dashboard.html | Inicial | Pendiente | Gráficos y secciones inferiores |
| aliados.html | Inicial | Pendiente | Fichas y formularios |
| aliados-ejecutivos.html | Inicial, V06 | Pendiente | Detalles y filtros |
| aliados-plataformas.html | Inicial, V06 | Pendiente | Acordeones |
| aliados-presupuesto.html | Inicial, V06 | Pendiente | Metas y filtros |
| aliados-liquidaciones.html | Inicial | Pendiente | Tarifario, lote, todas sus pestañas y estados |
| aliados-tesoreria.html | Inicial; repetir tamaño estable | Pendiente | Todas sus pestañas, tablas, cuentas y autorización |
| aliados-calidad.html | Inicial | Pendiente | Histórico y estados |
| aliados-bonificaciones.html | Inicial, V06 | Pendiente | Gráficos inferiores y filtros |
| aliados-gastos.html | Inicial | Pendiente | Formulario, lista y estados |
| aliados-reportes.html | Inicial, V06 | Pendiente | Informes y filtros |
| compartir-instalacion.html | Inicial | Pendiente | Distribución y estados |
| incidencias.html | Pendiente | Pendiente | Lista, filtros y detalle |
| documento-remision.html | Pendiente | Pendiente | Recibida/pendiente, IMEIs, impresión |
| traslados.html | Pendiente | Pendiente | Ruta directa y estados |
| cierre-periodo.html | Pendiente | Pendiente | Ruta y estados sin ejecutar cierres |
| auditoria-cruzada.html | Pendiente | Pendiente | Ruta y reportes |
| finanzas-programadas.html | Pendiente | Pendiente | Nueva página de otro trabajo |
| ajustes.html | Pendiente | Pendiente | Configuración y ventanas |
| validacion.html | Pendiente | Pendiente | Ruta y estados |
| conciliacion.html | Pendiente | Pendiente | Ruta y estados |
| kardex.html | Pendiente | Pendiente | Historial y filtros |
| app.html | Pendiente | Pendiente | Entrada y variantes de rol |
| index.html | Pendiente | Pendiente | Acceso/entrada |
| registro.html | Pendiente | Pendiente | Registro |
| cambiar-clave.html | Pendiente | Pendiente | Formulario, errores y éxito en pruebas |
| instalar.html | Pendiente | Pendiente | Instalación y dispositivos |

## Condiciones para cerrar al 100%

1. Clasificar todas las rutas anteriores como publicadas, internas o retiradas;
   conservar también las rutas no presentes en el menú.
2. Capturar y revisar cada pantalla completa, sus pestañas, formularios y ventanas
   en escritorio y móvil. Verificar zoom, scroll, importes completos, IMEI,
   botones, títulos, márgenes y bordes.
3. Repetir las vistas afectadas después de cada corrección compartida.
4. Verificar variantes de Tienda, Gestión y Gerencia con usuarios autorizados.
5. Probar estados posteriores a guardar/aprobar/recibir en un entorno de pruebas,
   no creando movimientos financieros ni recepciones ficticias en producción.
6. Ejecutar pruebas, guardar cambios propios y desplegar mediante el procedimiento
   oficial sin incluir ni descartar modificaciones de otros trabajos.
7. Verificar la versión desplegada y registrar evidencia posterior.

Se solicitó al usuario entorno/usuarios de pruebas, o autorización para preparar
una copia local con datos ficticios. Pendiente de respuesta. No se ejecutaron
pagos, aprobaciones ni recepciones como parte de esta auditoría.
