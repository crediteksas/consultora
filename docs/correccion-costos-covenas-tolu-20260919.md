# Corrección de costo de inventario Coveñas → Tolú

Solicitud: corregir exclusivamente el costo de la carga de Coveñas importada en Celfiao Tolú, sin cambiar cantidades ni precios de venta.

## Evidencia y alcance

La auditoría `inventario_covenas_fusionado_tolu` identifica el archivo `plantilla-inventario-inicial-tienda COVEÑAS.xlsx`, huella SHA-256 `ebf0cb38d37759a111accd0df180e54a3438f1c4a36aeeec87628c6958542cb1`, destino CK-01. La corrección resuelve el identificador de importación a partir de esa auditoría; no depende de IDs generados fijos.

| Dato de esta carga | Valor |
| --- | ---: |
| Referencias | 114 |
| Referencias por cantidad | 104 |
| Unidades por cantidad | 1.362 |
| Equipos serializados | 10 |
| Unidades totales | 1.372 |
| Valoración errónea como costo | $28.934.000 |
| Costo original correcto | $13.107.200 |
| Diferencia | $15.826.800 |

Los costos originales siguen intactos en `movimientos.costo`, `movimientos.costo_tienda`, `stock_cantidad.costo_promedio` y `unidades.costo_remision`. El importador escribió el precio comercial en `precio_tienda`, aunque actualmente ese campo representa costo Retail. El inventario y las ventas leen ese campo como costo.

Ejemplos: ADAPT25W SM conserva costo $9.700 y precio comercial $25.000; Samsung A17 (1CO1002), costo $455.000 y precio comercial $565.000.

## Corrección y prevención

- Se modifica únicamente `precio_tienda` de los 104 registros de stock y de las 10 unidades de esta carga, usando el costo original. No se generan movimientos ni se tocan carteras, ventas, cantidades, IMEIs o precios guía.
- Una transacción bloquea brevemente las tablas, vuelve a comprobar filas/importes y cancela ante movimientos, ventas, cortes o cambios posteriores. La verificación antes/después rechaza cualquier cambio de otro campo.
- El respaldo completo se guarda en `kora_private.respaldo_costos_fusion_tolu_20260919`, con RLS y sin acceso para roles de aplicación. `audit_log` conserva solo el resumen y el vínculo al respaldo, no los registros completos.
- El importador inicial corrige las tres asignaciones erróneas, preservando la fórmula de promedio, la identidad de la función y sus permisos vigentes. `productos.precio_guia` y `movimientos.precio` siguen guardando el precio comercial.
- Ventas consulta `productos.precio_guia` para la sugerencia editable, separada de `precio_tienda` como costo. Respeta el precio digitado; si no hay precio guía válido exige ingresarlo, sin sugerir vender al costo.

## Validación

Pruebas PGlite con las 114 filas originales: corrección exacta, respaldo privado, conservación de otras tiendas, idempotencia y reversión completa ante cambios o dependencias. Pruebas del importador: nuevos productos, ponderación de existencias, controles de acceso y rechazo atómico de filas inválidas. Pruebas de ventas: costo/precio separados y conservación de promociones digitadas. Todas se incorporan al pipeline local de KORA.

La revisión también identificó tres pruebas antiguas de ventas que ya fallaban en HEAD porque esperan tablas directas en vez de vistas protegidas; no se cambian como parte de esta corrección.

Método: guía Supabase para migraciones, respaldo privado y validación; guía Wrangler para publicación mediante `npm run deploy:kora:production`, sin saltarse el pipeline de pruebas ni sus controles de rollback.
