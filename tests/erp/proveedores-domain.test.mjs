import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const source = await readFile(path.join(root, 'creditek/erp/proveedores-domain.js'), 'utf8');
const proveedoresHtml = await readFile(path.join(root, 'creditek/erp/proveedores.html'), 'utf8');
const compraProveedorHtml = await readFile(path.join(root, 'creditek/erp/compra-proveedor.html'), 'utf8');
const sidebarJs = await readFile(path.join(root, 'creditek/erp/sidebar.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const proveedores = context.window.CreditekProveedoresDomain;

test('normaliza factura, líneas y pagos sin alterar sus totales', () => {
  const detalle = proveedores.normalizarDetalle({
    factura: { id: 'f1', total: '150000', saldo: '50000' },
    lineas: [
      { cantidad: 2, costo_unitario: '50000' },
      { cantidad: 1, costo_unitario: '50000' },
    ],
    pagos: [{ monto: '100000' }],
  });

  assert.equal(detalle.factura.total, 150000);
  assert.equal(detalle.factura.saldo, 50000);
  assert.equal(detalle.totalLineas, 150000);
  assert.equal(detalle.totalPagado, 100000);
});

test('valida un pago positivo que no supera el saldo', () => {
  const pago = proveedores.validarPago({
    monto: '25000',
    saldo: 50000,
    fecha: '2026-07-27',
  });
  assert.equal(pago.monto, 25000);
  assert.equal(pago.fecha, '2026-07-27');
  assert.throws(
    () => proveedores.validarPago({ monto: 50001, saldo: 50000, fecha: '2026-07-27' }),
    /supera el saldo/
  );
  assert.throws(
    () => proveedores.validarPago({ monto: 0, saldo: 50000, fecha: '2026-07-27' }),
    /mayor que cero/
  );
});

test('conserva el día contable de una fecha SQL en la zona local', () => {
  assert.equal(
    proveedores.normalizarFechaLocal('2026-07-27'),
    '2026-07-27T00:00:00'
  );
  assert.equal(
    proveedores.normalizarFechaLocal('2026-07-27T15:30:00Z'),
    '2026-07-27T15:30:00Z'
  );
});

test('genera la fecha del formulario con el calendario local', () => {
  assert.equal(
    proveedores.fechaCalendarioLocal(new Date(2026, 6, 27, 23, 30)),
    '2026-07-27'
  );
});

test('resume la cartera filtrada sin duplicar facturas', () => {
  const resumen = proveedores.resumirCartera({
    facturas: [
      { id: 'f1', proveedor_id: 'p1', total: 100000, saldo: 40000, fecha_vencimiento: '2026-07-30' },
      { id: 'f1', proveedor_id: 'p1', total: 100000, saldo: 40000, fecha_vencimiento: '2026-07-30' },
      { id: 'f2', proveedor_id: 'p1', total: 90000, saldo: 30000, fecha_vencimiento: '2026-07-20' },
      { id: 'f3', proveedor_id: 'p1', total: 80000, saldo: 0, fecha_vencimiento: '2026-07-10' },
      { id: 'f4', proveedor_id: 'p2', total: 70000, saldo: 10000, fecha_vencimiento: '2026-07-31' },
    ],
    proveedorIds: ['p1'],
    hoy: '2026-07-27',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(resumen)), {
    totalPorPagar: { cantidad: 2, valor: 70000 },
    porVencer: { cantidad: 1, valor: 40000 },
    vencidas: { cantidad: 1, valor: 30000 },
    pagadas: { cantidad: 1, valor: 80000 },
    sinVencimiento: { cantidad: 0, valor: 0 },
  });
});

test('separa facturas pendientes sin vencimiento sin inventar su estado', () => {
  const resumen = proveedores.resumirCartera({
    facturas: [{ id: 'f1', proveedor_id: 'p1', total: 50000, saldo: 50000, fecha_vencimiento: null }],
    proveedorIds: ['p1'],
    hoy: '2026-07-27',
  });

  assert.equal(resumen.totalPorPagar.valor, 50000);
  assert.equal(resumen.porVencer.cantidad, 0);
  assert.equal(resumen.vencidas.cantidad, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(resumen.sinVencimiento)), { cantidad: 1, valor: 50000 });
});

test('una factura que vence hoy permanece por vencer', () => {
  const resumen = proveedores.resumirCartera({
    facturas: [{
      id: 'f-hoy',
      proveedor_id: 'p1',
      total: 120000,
      saldo: 45000,
      fecha_vencimiento: '2026-07-27',
    }],
    proveedorIds: ['p1'],
    hoy: '2026-07-27',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(resumen.porVencer)), {
    cantidad: 1,
    valor: 45000,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(resumen.vencidas)), {
    cantidad: 0,
    valor: 0,
  });
});

test('agenda ordena vencidas, hoy, próximas y sin fecha, sin incluir pagadas ni otros proveedores', () => {
  const facturas = [
    {id:'sin',proveedor_id:'p',saldo:20,fecha_vencimiento:null},
    {id:'futura',proveedor_id:'p',saldo:40,fecha_vencimiento:'2026-09-30'},
    {id:'vencida',proveedor_id:'p',saldo:10,fecha_vencimiento:'2026-09-15'},
    {id:'hoy',proveedor_id:'p',saldo:30,fecha_vencimiento:'2026-09-16'},
    {id:'pagada',proveedor_id:'p',saldo:0,fecha_vencimiento:'2026-09-01'},
    {id:'otro',proveedor_id:'otro',saldo:50,fecha_vencimiento:'2026-09-01'},
  ];
  const copia = JSON.stringify(facturas);
  const args = {facturas:[...facturas,facturas[2]],proveedorIds:['p'],hoy:'2026-09-16'};
  const filas = proveedores.ordenarVencimientos(args);
  assert.equal(filas.map(f=>f.id).join(','),'vencida,hoy,futura,sin');
  for(const estado of ['vencidas','porVencer','sinVencimiento']){
    const seleccion = proveedores.ordenarVencimientos({...args,estado});
    const resumen = proveedores.resumirCartera(args)[estado];
    assert.equal(seleccion.length,resumen.cantidad);
    assert.equal(seleccion.reduce((s,f)=>s+f.saldo,0),resumen.valor);
  }
  assert.equal(JSON.stringify(facturas),copia,'no muta fechas, saldos ni facturas');
});

test('consulta todas las páginas y propaga errores sin devolver totales parciales',async()=>{
  const data = Array.from({length:1205},(_,id)=>({id})), llamadas=[];
  const filas = await proveedores.leerTodas(()=>({range:async(a,b)=>{llamadas.push([a,b]);return {data:data.slice(a,b+1)};}}));
  assert.equal(filas.length,1205); assert.deepEqual(llamadas,[[0,499],[500,999],[1000,1499]]);
  await assert.rejects(()=>proveedores.leerTodas(()=>({range:async a=>a===0?{data:data.slice(0,500)}:{error:{message:'fallo'}}})),/fallo/);
});

test('la pantalla integra detalle y pago de cuentas por pagar', () => {
  assert.match(proveedoresHtml, /proveedores-domain\.js/);
  assert.match(proveedoresHtml, /obtener_detalle_factura_proveedor/);
  assert.match(proveedoresHtml, /registrar_pago_proveedor/);
  assert.match(proveedoresHtml, /data-detalle-factura/);
  assert.match(proveedoresHtml, /Registrar pago/);
});

test('el módulo se presenta como Proveedores y cartera', () => {
  assert.match(proveedoresHtml, /<title>Proveedores y cartera · Creditek<\/title>/);
  assert.match(proveedoresHtml, />Proveedores y cartera<\/h1>/);
  assert.match(sidebarJs, /label: 'Proveedores y cartera', href: 'proveedores\.html'/);
});

test('B2B ofrece una sola entrada de proveedores con cartera, sin ampliar permisos', async () => {
  const ctx={window:{}};
  vm.runInNewContext(await readFile(new URL('../../creditek/erp/kora-access-control.js',import.meta.url),'utf8'),ctx);
  for(const rol of ['gerencia','auditoria']){
    const links=ctx.window.KoraAccessControl.navigationFor({rol,activo:true},{}).flatMap(s=>s.items).filter(i=>i.href.startsWith('proveedores.html'));
    assert.equal(links.length,1);
    assert.equal(links[0].label,'Proveedores y cartera');
    assert.equal(links[0].href,'proveedores.html');
  }
  const store=ctx.window.KoraAccessControl.navigationFor({rol:'admin_tienda',activo:true,tienda_codigo:'CK-02'},{}).flatMap(s=>s.items);
  assert.equal(store.some(i=>i.href.startsWith('proveedores.html')),false);
  for(const id of ['btn-nuevo-proveedor','btn-vencimientos','card-total-por-pagar'])assert.ok(proveedoresHtml.includes('id="'+id+'"'));
});

test('la interfaz incluye las cuatro tarjetas y captura el vencimiento al comprar', () => {
  assert.match(proveedoresHtml, /id="card-total-por-pagar"/);
  assert.match(proveedoresHtml, /id="card-por-vencer"/);
  assert.match(proveedoresHtml, /id="card-vencidas"/);
  assert.match(proveedoresHtml, /id="card-pagadas"/);
  assert.match(compraProveedorHtml, /id="fecha-vencimiento"/);
  assert.match(compraProveedorHtml, /registrar_compra_proveedor_operativa/);
});
