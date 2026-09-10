# Krediya: datos por referencia en Liquidaciones

- Tarjeta cerrada: PVP recibido, PVP KORA, PAGAMOS, giro y utilidad calculada.
- Giro estimado = PAGAMOS menos inicial; no representa utilidad ni autorización.
- Editor por referencia para operaciones reconocidas en lotes no congelados, sin depender de una novedad.
- Alta explícita: PVP, PAGAMOS y vigencia por fecha de venta; permisos de revisor, auditoría y protección de duplicados.
- Edición utiliza el RPC existente y su control de versión. Vigencias históricas terminadas se muestran en consulta: no se sobrescriben desde este formulario.
- Filtros de precios faltantes y diferencias; acceso al cálculo existente del lote. No se calcula una utilidad ficticia antes de completar tarifas y bonos.
- Guardar datos no recalcula ni aprueba ni paga. Después de completar referencias, se debe calcular el lote para actualizar sus resultados.

Validación: 412 pruebas locales; 20 pruebas focalizadas después de incorporar el aviso de vigencia histórica.
Aplicada únicamente la migración `20260910204018_krediya_tarifa_desde_operacion.sql` en KORA (`jfkmiyvcdfbsbwchyvol`). Sin altas reales de precios como parte de la instalación.
La rectificación histórica PayJoy `20260910202627` permanece pendiente de autorización; no forma parte de esta publicación de interfaz.
