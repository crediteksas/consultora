# Revisión de retiros por inventario — KORA-2026-000072

Inventario físico cerrado y resultado económico pendiente son estados distintos.
Cada corte conserva su utilidad por retirar y su pérdida por cubrir. Consultar un
mes muestra todos sus cortes cerrados, no solo el último por tienda.

Ruta para Mayte/Óscar: Gastos y retiros → Liquidación de socios por inventario →
Consultar inventarios → Retiros anteriores por identificar → Revisar retiro anterior.
El formulario muestra importe/período del retiro y exige elegir explícitamente
inventario anterior o este inventario, explicar la comprobación y confirmarla.
No modifica el retiro original ni registra otro pago. La clasificación queda
inmutable, con responsable y fecha. Un corte que ya tuvo retiro o recibió aporte
no admite una nueva clasificación desde este flujo.

Solo los controladores financieros activos existentes pueden revisar. La tabla
nueva es privada, RLS sin políticas directas, sin permisos de tabla para roles API.
El wrapper público mantiene SECURITY INVOKER; no aumenta sus permisos.

Las discordancias de fecha comercial solo son aviso si ambas fechas están
estrictamente dentro del mismo tramo. Se conserva la selección por registro,
la fórmula y los bloqueos por bordes, nulos, costos/gastos u otras fuentes.
Un resultado previamente válido o ya cerrado conserva su huella/contenido.

## Verificación

- Pruebas sintéticas del consumidor: clasificación anterior/actual, centavos,
  reintento, contradicción, actores, historial inmutable, huella por fila,
  doble imputación y cortes independientes; cálculo real antes/después.
- Navegador local sin red externa: selección bloqueada solo para inspección,
  revisión explícita/reintento y flujo parcial/total existente;390/768/1280px.
- PG17.6:76 comprobaciones únicas, dos modelos nuevos sin red, puertos o mounts;
  catálogo completo vacío con espejo ACL finito y39 sustituciones declaradas.
  Lote real de tres fuentes desde baseline40d sin cambiarla; actualización,
  reconstrucción acotada y reversión exacta después de commit antes del uso.
  Prueba nativa de retiro previo pagado, dos cortes de una tienda y pérdida de
  otra; clasificar no altera la fila financiera ni crea movimientos de dinero.
- Esto no certifica una reconstrucción mínima global de KORA/Sofía ni completa
  la adaptación general de Supabase.

Producción debe aplicar únicamente20261027192103_socios_revision_retiros_por_corte.sql.
Socios original y SELECT del tarifario ya existen: el lote de pruebas NO autoriza
reaplicarlos en producción. Los catálogos de prueba contienen metadatos, sin filas.

## Reversión

`docs/rollbacks/socios-revision-retiros.sql` restaura los cuatro cuerpos anteriores
y retira objetos nuevos solo antes del primer uso. Se niega si existen revisiones,
retiros o aportes del módulo; nunca borrar registros para satisfacer esa guarda.
Si ya se utilizó, conservar el historial y publicar una corrección hacia adelante.
