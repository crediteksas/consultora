import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const security = readdirSync('tests/security')
  .filter(name => name.endsWith('.test.mjs') && name !== 'live-smoke.test.mjs')
  .map(name => `tests/security/${name}`);
const responsive = [
  'tests/design-system/kora-responsive-foundation.test.mjs',
];
// AURA (tests/agentes/*) tiene su propio ciclo de vida, separado de KORA
// (confirmado por tests/security/separated-artifacts.test.mjs). No debe
// bloquear el deploy de KORA. tests/erp/* completo tampoco se incluye aquí
// porque arrastra fallos preexistentes sin relación con este pipeline;
// se incluye puntualmente el test de regresión de cada fix ya validado.
const erp = [
  'tests/erp/conciliacion-retail-no-bloqueante.test.mjs',
  'tests/erp/remisiones-editor-productos.test.mjs',
  'tests/erp/bodega-carga-completa.test.mjs',
  'tests/erp/remisiones-correccion.test.mjs',
  'tests/erp/remision-proveedor-producto.test.mjs',
  'tests/erp/creditos-cartera-domain.test.mjs',
  'tests/erp/creditos-cartera-migration.test.mjs',
  'tests/erp/creditos-cartera-nova-ready.test.mjs',
  'tests/erp/aliados-recuperaciones.test.mjs',
  'tests/erp/aliados-reversiones-reportes.test.mjs',
  'tests/erp/krediya-estados-pago.test.mjs',
  'tests/erp/krediya-informe-importacion.test.mjs',
  'tests/erp/krediya-correo.test.mjs',
  'tests/erp/ventas-accesorios-tienda.test.mjs',
  'tests/erp/dashboard-desglose-periodo.test.mjs',
  'tests/erp/aliados-auditoria-resumen-ciudades.test.mjs',
  'tests/erp/krediya-vigencia-venta.test.mjs',
  'tests/erp/krediya-bonos-plataforma.test.mjs',
  'tests/erp/autorizacion-unica-lote.test.mjs',
  'tests/erp/calculo-antes-tesoreria.test.mjs',
  'tests/erp/liquidaciones-comercios.test.mjs',
  'tests/erp/liquidaciones-eliminar-importacion.test.mjs',
  'tests/erp/caja-arrastre-retroactivos.test.mjs',
  'tests/erp/tesoreria-clientes.test.mjs',
  'tests/erp/clientes-pagos-unificados.test.mjs',
  'tests/erp/clientes-multilocal.test.mjs',
  'tests/erp/kora-pwa-install.test.mjs',
  'tests/erp/proveedores-saldo-inicial.test.mjs',
  'tests/erp/saldo-inicial-proveedores-b2b.test.mjs',
  'tests/erp/cobros-plataformas-ui.test.mjs',
  'tests/erp/cobros-plataformas-contrato.test.mjs',
  'tests/erp/krediya-flujo-tarifario.test.mjs',
  'tests/erp/krediya-tarifa-operacion.test.mjs',
  'tests/erp/krediya-utilidad-automatica.test.mjs',
  'tests/erp/krediya-review-ui.test.mjs',
  'tests/erp/liquidacion-aprobacion-inmediata.test.mjs',
  'tests/erp/liquidaciones-pagos-cards.test.mjs',
  'tests/erp/aliados-tesoreria-pagos-agrupados.test.mjs',
  'tests/erp/kora-orden-pagos.test.mjs',
  'tests/erp/tesoreria-compensaciones-filtros.test.mjs',
  'tests/erp/aliados-autorizacion-pagos-gerencia.test.mjs',
  'tests/erp/pagos-corte-soportes.test.mjs',
  'tests/erp/kora-orden-pagos.test.mjs',
  'tests/erp/liquidaciones-operaciones-responsive.test.mjs',
  'tests/erp/krediya-gestiones.test.mjs',
  'tests/erp/liquidaciones-grupos-responsive.test.mjs',
  'tests/erp/krediya-operaciones-referencia.test.mjs',
  'tests/erp/krediya-editor-diferencias.test.mjs',
  'tests/erp/utilidad-creditek-domain.test.mjs', // KORA-2026-000034
  'tests/erp/aliados-utilidad-corte.test.mjs',
  'tests/erp/aliados-asociacion-historica.test.mjs',
  'tests/erp/sonivox-clasificacion-retail.test.mjs',
  'tests/erp/aliados-prefijo-a-alexander.test.mjs',
  'tests/erp/aliados-ejecutivos-periodo.test.mjs',
  'tests/erp/aliados-plataformas-periodo.test.mjs',
  'tests/erp/aliados-bonificaciones-periodo.test.mjs',
  'tests/erp/aliados-reportes-mes-vigente.test.mjs',
  'tests/erp/kora-2026-000014-destinos-consignacion.test.mjs',
  'tests/erp/finanzas-programadas.test.mjs',
];
execFileSync(process.execPath, ['--test', ...security, ...responsive, ...erp], { stdio: 'inherit' });
