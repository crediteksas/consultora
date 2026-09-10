# Correctivos autorizados y aclaración de históricos — 10 septiembre 2026

## Base confirmada

Producción https://kora.crediteksas.com. Su `/config/kora-environment.generated.js` devuelve `https://jfkmiyvcdfbsbwchyvol.supabase.co`. El API de administración identifica ese proyecto como **KORA**, ACTIVE_HEALTHY. No es AURA ni una base de pruebas.

## Aplicado

Migración `auditoria_controles_roles_ventas_pagos` confirmada por Supabase el 10/09/2026.

- Gerencia conserva gestión de perfiles y funciones de negocio. Maite conserva rol Auditoría y capacidad revisora; puede consultar perfiles, pero no modificarse roles. No se cambiaron perfiles ni capacidades asignadas.
- `rol_actual` y `tienda_actual` exigen perfil activo; `es_central` falla cerrado ante sesión/perfil ausente.
- Se revocó escritura directa de ventas/ítems desde roles API. `registrar_venta` sigue disponible y comprueba tienda, disponibilidad del IMEI y stock bajo bloqueo transaccional. Se cerró además el caso de administrador activo sin tienda asignada.
- Trigger común exige comprobante existente con formato/tamaño válidos al pasar un pago no histórico a pagado. Autorización individual de Gerencia permanece obligatoria; no se reutilizó la aprobación del lote como autorización del pago.
- PayJoy/ALO conservan utilidad negativa calculada y reportan una novedad no bloqueante. Se retiró también el CHECK que impedía guardar la pérdida. PAGAMOS, pago al beneficiario y bonos siguen sin admitir importes negativos. No se cambió la base ni porcentaje de PayJoy.

No se ejecutaron ventas, liquidaciones ni pagos en producción para probar. Las huellas completas de ventas, perfiles, liquidaciones, operaciones, bonos y órdenes de pago fueron idénticas antes/después. No hubo recálculo de importes existentes.

Pruebas: 28 controles/regresiones seleccionados aprobados, incluyendo cuatro pruebas nuevas con PGlite y la definición real de registrar_venta. La suite amplia no está completamente verde: detectó fallos en pruebas existentes de interfaz/expectativas de versiones, fuera de estos cambios; no se afirma que toda KORA haya pasado pruebas. La prueba de pérdida nueva verifica el reemplazo del guard y el CHECK; las regresiones ALO verifican el motor previo. No se simuló un lote real negativo en producción.

## PayJoy: fechas de venta cuya política descrita difiere de la base aplicada

| Fecha 2026 | Créditos |
|---|---:|
| 24 agosto | 3 |
| 26 agosto | 6 |
| 29 agosto | 4 |
| 30 agosto | 5 |
| 1 septiembre | 6 |
| 2 septiembre | 5 |
| 3 septiembre | 8 |
| 4 septiembre | 5 |
| 5 septiembre | 6 |
| 6 septiembre | 1 |
| 7 septiembre | 4 |
| 8 septiembre | 4 |
| Total | 57 |

No se afirma que estén mal pagados. Se debe validar qué base representa purchaseAmount antes de cambiar números: la política guardada dice valor_comercial, pero el motor usa monto_credito/monto_base para PayJoy. Se conservaron todas estas cifras.

## Los 17 históricos: aclaración importante

El usuario confirma que Mayte ya los liquidó y pagó. **Ausencia de cálculo en la tabla de consulta no significa ausencia de pago.** No deben volver a liquidarse ni generar obligaciones.

| Plataforma | Fecha venta 2026 | Créditos |
|---|---|---:|
| PayJoy | 31 agosto | 7 |
| ALO | 20 abril | 2 |
| ALO | 21 abril | 2 |
| ALO | 22 abril | 3 |
| ALO | 23 abril | 1 |
| ALO | 16 junio | 2 |

Procedencia comprobada: los 7 PayJoy se incorporaron el 8/09 UTC desde `20323-D-20260901.xlsx`; 8 ALO desde `al del 20 al 26 abril 2026.xlsx`; 2 desde `ALO TER  DEL 15 AL 21 JUNIO 2026.xlsx`. Las filas conservan modo_importacion=solo_consulta y no_generar_pagos=true. Según el documento de carga, no se ejecutaron cálculos históricos de bonos/utilidad. Por eso esos campos están vacíos, aunque el usuario indique que el pago ya fue gestionado.

Cruce adicional: los 8 ALO de abril coinciden por IMEI, fecha y plataforma con el histórico Retail en `KREDISINU 2026`, `Creditel coveñas 2026`, `Creditel store chinu 2026` y `Creditel store corozal 2026`. Allí sí existe utilidad Retail, que NO debe copiarse como utilidad del negocio financiero. El importador de esas filas no está registrado, por lo que no se atribuye documentalmente a Mayte solo por coincidencia.

No se encontró vínculo por código/IMEI entre los 17 y las operaciones de liquidación actuales, créditos actuales o detalle de importaciones financieras. Eso impide confirmar aquí el comprobante exacto del pago indicado; no contradice que se haya pagado en el flujo anterior o en archivos. Para cerrar la trazabilidad se necesita identificar el lote/archivo/soporte usado por Mayte, sin repetir pagos ni inventar estados de conciliación.

## Fuera de esta modificación

Fecha Colombia en resolución de políticas, conciliación bancaria e integración Addi no se modificaron. Las cifras PayJoy y los 17 históricos permanecen intactos a la espera del cruce documental.
