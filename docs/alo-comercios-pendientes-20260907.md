# ALO Credit: comercios sin vincular

## Diagnóstico

El lote correcto de las 10:30 del 7 de septiembre, corte 6 de septiembre de 2026,
contiene seis operaciones. Tres no tienen comercio vinculado:

- FULL ACCESORIOS LA 72: una justificación («es un nuevo aliado») cerró la incidencia,
  pero no creó un origen, cliente ni sede.
- CREDITEK COVEÑAS: existe una posible coincidencia con Creditel Coveñas (CK-11),
  clasificada como tienda propia. Debe confirmarse la identidad, no crear un aliado
  por semejanza del nombre.
- Lachescel soluciones: no se encontró una ficha coincidente en el catálogo.

El contador anterior consultaba solo incidencias abiertas y mostraba dos. El
directorio de cuentas consulta comercios reales, por eso no mostraba los tres.
La cifra cero de operaciones provenía de totales todavía no calculados.

## Corrección

Ruta: **Liquidaciones → detalle del lote → Novedades → Vincular comercio**.
La misma acción está disponible en la operación pendiente.

1. Vincular un comercio existente, distinguiendo tienda propia y aliado, o registrar
   un nuevo local aliado con nombre, ciudad y ejecutivo Creditek verificados.
2. El registro reutiliza el sincronizador de la ficha única y sede; no crea otro
   directorio de clientes ni inventa titulares o cuentas.
3. Para un aliado, «Completar cliente y cuenta» abre su ficha en Tesorería. Un local
   de un cliente existente puede relacionarse en «Locales del cliente» y compartir
   su cuenta conforme a la regla multilocal vigente.
4. El alias del archivo queda vinculado al comercio elegido para futuras cargas.
5. La incidencia solo se resuelve después de guardar un vínculo real. El lote no
   se valida, calcula, aprueba ni paga automáticamente.

La interfaz cuenta operaciones importadas para ALO/PayJoy antes del cálculo y
mantiene el criterio de operaciones reconocidas/excluidas de Krediya. Los pendientes
se contrastan con la operación real, no solo con el estado de la incidencia.

## Seguridad y alcance

- RPC de acceso invoker con implementación privada: sesión y capacidad revisora.
- Bloqueo transaccional lote → operación → comercio; protección ante reintentos,
  nombres/alias duplicados y asignaciones concurrentes.
- No vincula después de cálculo, aprobación ni creación de órdenes; no cambia
  importes, iniciales, archivos originales, cuentas ni movimientos financieros.
- La migración reabre falsas resoluciones únicamente en borradores sin cálculo,
  órdenes ni aprobación, conservando la resolución y su autor en auditoría.
- No se decide automáticamente si Coveñas es CK-11, ni se inventa ciudad,
  ejecutivo o identidad de los dos comercios ausentes.
- El archivo ALO correcto de las 10:30 se conserva. No se elimina otra importación.

## Verificación

- 331 pruebas del circuito oficial de KORA aprobadas, incluidas 17 pruebas nuevas
  de SQL, permisos, auditoría, conservación financiera, idempotencia y contadores.
- Cuatro pruebas E2E Chrome/WebKit: nueva vinculación y regresión de eliminación
  de importaciones. Anchos comprobados: 390, 844, 768 y 1280 px.
- Datos sintéticos en pruebas de creación/vinculación; ninguna cuenta real inventada.
- Migración instalada: se reabrió únicamente la incidencia de FULL ACCESORIOS LA 72.
  Verificados los tres pendientes reales. Huellas idénticas antes/después en once
  tablas de operaciones, archivos, lotes, pagos, bonos, tesorería y directorio.
  El control de seguridad no agregó advertencias nuevas.
- Publicación mediante `npm run deploy:kora:production`; el manifiesto activo y el
  registro de despliegue identifican la versión publicada.

## Pendiente operativo de Gestión

Confirmar la tienda de Coveñas y vincularla; completar nombre/ciudad/ejecutivo de
los nuevos locales y sus fichas bancarias verificadas. Luego continuar la revisión
y aprobación habitual del lote completo. Esta corrección no sustituye esa decisión.
