# Histórico de ventas 2026 — diseño aprobado

Fecha: 24 de julio de 2026  
Proyecto: Creditek ERP  
Estado: aprobado conceptualmente por el usuario; pendiente revisión del documento antes de implementar.

## 1. Objetivo

Incorporar al ERP toda la información ejecutada de ventas de Creditek disponible en las hojas compartidas por Maite, sin alterar inventario, caja operativa, conciliación, clientes ni Sofía.

El histórico servirá para:

- comparar tiendas y periodos;
- calcular ventas, créditos, costos, utilidad y gastos;
- alimentar presupuestos futuros;
- conservar trazabilidad hasta el día anterior al inventario inicial;
- separar los datos reales de las pruebas actuales del ERP.

## 2. Regla de corte operativo

La información previa a la carga del inventario inicial se registrará como **histórico ejecutado** y no generará movimientos de existencias.

El día en que se cargue el inventario inicial de cada tienda será la fecha oficial de inicio de la operación transaccional del ERP. Desde esa fecha, las ventas nuevas sí deberán descontar inventario y alimentar los módulos operativos.

Antes de definir esa fecha se hará una carga complementaria con las ventas que falten entre el 24 de julio y el día anterior al inventario inicial.

## 3. Fuentes incluidas

Carpeta compartida: `Tiendas`  
ID de Drive: `1WUwCewSu-MOUYFQcA2pcdb9b2sM1_HpW`

Mapeo confirmado:

| Código ERP | Tienda ERP | Hoja de origen |
|---|---|---|
| CK-01 | Cellfiao Tolú | Celfiao tolu 2026 |
| CK-02 | Movil Shoping | Movilshopping 2026 |
| CK-03 | Celfiao Tecnologia | Celfiao corozal 2026 |
| CK-04 | Creditel Store | Creditel store corozal 2026 |
| CK-05 | Chinu Cell | CHINUCELL 2026 |
| CK-06 | Creditel Chinu.com | Creditel store chinu 2026 |
| CK-07 | Sonivox Chinu | Sonivox 2026 |
| CK-08 | Orocell | OROCEL 2026 |
| CK-09 | Kredisinu | KREDISINU 2026 |
| CK-10 | Creditek Tolú 02 / Celestarking | CELESTAR 2026 |
| CK-11 | Creditel Coveñas | Creditel coveñas 2026 |

## 4. Exclusión expresa

La subcarpeta `PERFUMERIA` queda fuera de este trabajo.

La perfumería maneja inventario y ventas por gramos, por lo que deberá estudiarse después como un módulo independiente. Ningún archivo de esa carpeta se importará, modificará ni vinculará con las tiendas CK-01 a CK-11.

## 5. Alcance de los datos

La auditoría encontró:

- 11 hojas de tiendas;
- 1.949 días con movimiento entre enero y el 23 de julio de 2026;
- 835 créditos contabilizados;
- $932.959.145 en ventas de contado;
- $1.392.476.831 en ventas totales;
- $428.632.331 en utilidad bruta reportada;
- $366.289.777 en gastos reportados;
- $62.342.554 en utilidad neta reportada.

Las pestañas mensuales contienen totales diarios. No permiten reconstruir clientes o productos individuales de las ventas de contado. Esos datos no se inventarán.

La pestaña `CREDITOS` sí contiene información adicional por operación, como plataforma, IMEI, costo, cuota inicial, saldo pendiente, utilidad y notas. Esa información se conservará en una tabla histórica separada.

## 6. Modelo de datos

### 6.1 Resumen diario

Se ampliará la tabla existente `historico_importado`. Su llave única seguirá siendo:

`tienda_codigo + fecha`

Además de `creditos`, `contado` y `utilidad`, almacenará:

- cantidad, venta, costo y utilidad de equipos de contado;
- cantidad, venta, costo y utilidad de accesorios;
- cantidad de créditos;
- iniciales, costo, saldo pendiente y utilidad de créditos;
- venta total, efectivo del día y valor enviado a caja;
- utilidad bruta, gastos, descripción de gastos y utilidad neta;
- archivo, pestaña y fila de origen;
- fecha de importación y estado de calidad.

La carga será idempotente: repetir un archivo actualizará la misma tienda y fecha, sin crear duplicados.

### 6.2 Créditos históricos

Se creará `creditos_historicos` para conservar el detalle disponible en las pestañas `CREDITOS`.

La tabla tendrá una llave estable basada en archivo y fila de origen, además de:

- tienda y fecha;
- plataforma financiera;
- cantidad;
- IMEI;
- costo;
- cuota inicial;
- saldo pendiente;
- utilidad;
- notas;
- metadatos de origen e importación.

Esta tabla no se conectará con inventario, unidades, clientes ni conciliación porque las hojas no contienen toda la información necesaria para hacerlo de forma fiable.

## 7. Seguridad

- Los datos históricos financieros serán visibles únicamente para gerencia y auditoría central.
- Los administradores de tienda no recibirán acceso automático a costos, gastos o utilidad histórica.
- Las políticas de seguridad de Supabase se mantendrán activas.
- Los archivos consolidados de carga no se publicarán en el sitio web ni se guardarán como recursos públicos de Cloudflare.
- No se modificará Sofía.

## 8. Módulo del ERP

Se añadirá una pantalla `Histórico de ventas 2026`, accesible desde el menú central.

Incluirá:

- filtros por tienda y rango de fechas;
- ventas totales y de contado;
- créditos;
- utilidad bruta;
- gastos;
- utilidad neta;
- tabla comparativa por tienda;
- evolución mensual;
- consulta del detalle histórico de créditos;
- señal visible cuando una fila tenga una observación de calidad.

El módulo consultará exclusivamente las tablas históricas durante esta fase. Las ventas de prueba existentes del ERP no se borrarán ni se mezclarán en estos indicadores.

## 9. Calidad y excepciones

Se detectaron tres inconsistencias en las fórmulas de origen:

1. Creditel Coveñas, 13 de julio: venta total reportada de $53.900 sin componentes equivalentes.
2. Creditel Chinu, 26 de enero: componentes por $174.476 y efectivo calculado de $113.000, pero totales reportados en cero.
3. Creditel Coveñas, 17 de marzo: valor enviado a caja reportado de $85.000 frente a $28.100 calculados.

La importación conservará el valor reportado originalmente y marcará estas filas para revisión. No se corregirá ningún dato financiero de forma silenciosa.

## 10. Manejo de errores

- Una tienda sin mapeo se rechazará antes de importar.
- Una fecha inválida o una cantidad no numérica se enviará al reporte de errores.
- Las filas duplicadas se resolverán por la llave única y quedarán registradas como actualización.
- La importación mostrará cantidades insertadas, actualizadas, sin cambio y rechazadas.
- Si falla una parte de la carga, la operación completa se revertirá para evitar históricos parciales.

## 11. Pruebas y aceptación

La implementación se considerará correcta cuando:

- existan exactamente 1.949 registros diarios para las 11 tiendas;
- la suma de créditos sea 835;
- los totales financieros coincidan con la auditoría;
- no existan duplicados por tienda y fecha;
- las tres inconsistencias estén señaladas;
- Perfumería no aparezca en ninguna tabla o pantalla;
- repetir la carga no aumente el número de registros;
- inventario, caja, conciliación, clientes y ventas operativas conserven su estado;
- los usuarios de tienda no puedan leer costos o utilidad histórica;
- el nuevo módulo funcione correctamente en escritorio y móvil.

## 12. Fase posterior

Cuando se defina la fecha del inventario inicial:

1. se recibirá y cargará el histórico faltante hasta el día anterior;
2. se validarán nuevamente los totales;
3. se cargará el inventario inicial por tienda;
4. se fijará la fecha de inicio operativo;
5. a partir de ese día, las ventas reales se registrarán transaccionalmente en el ERP.

