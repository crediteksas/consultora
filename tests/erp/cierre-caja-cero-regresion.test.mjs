import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const domainPath = path.join(root, 'creditek/erp/caja-piloto-domain.js');
const migrationPath = path.join(
  root,
  'creditek/erp/migrations/20260727_cierre_caja_idempotente.sql'
);

test('permite cerrar cuando efectivo contado y esperado coinciden', async () => {
  const context = { window: {} };
  vm.runInNewContext(await readFile(domainPath, 'utf8'), context);

  const resultado = context.window.CreditekCajaPiloto.validarCierre({
    efectivoContado: 1030000,
    efectivoEsperado: 1030000,
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(resultado)),
    { ok: true, diferencia: 0, mensaje: '' }
  );
});

test('rechaza una diferencia y muestra la causa', async () => {
  const context = { window: {} };
  vm.runInNewContext(await readFile(domainPath, 'utf8'), context);

  const resultado = context.window.CreditekCajaPiloto.validarCierre({
    efectivoContado: 1029000,
    efectivoEsperado: 1030000,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.diferencia, -1000);
  assert.match(resultado.mensaje, /diferencia/i);
});

test('permite cerrar el caso reportado con efectivo exacto de 1.658.000', async () => {
  const context = { window: {} };
  vm.runInNewContext(await readFile(domainPath, 'utf8'), context);
  const caja = context.window.CreditekCajaPiloto;
  const esperado = caja.calcularEfectivoEsperado({
    apertura: 1000000,
    ventasContado: 500000,
    financiadoRecibido: 0,
    saldoPorCobrar: 465000,
    iniciales: 158000,
    otrosIngresos: 0,
    gastosEfectivo: 0,
    salidasExplicitas: 0,
  });

  assert.equal(esperado, 1658000);
  assert.deepEqual(
    { ...caja.validarCierre({ efectivoContado: 1658000, efectivoEsperado: esperado }) },
    { ok: true, diferencia: 0, mensaje: '' }
  );
});

test('mantiene bloqueado el cierre cuando existe una diferencia real', async () => {
  const context = { window: {} };
  vm.runInNewContext(await readFile(domainPath, 'utf8'), context);
  const resultado = context.window.CreditekCajaPiloto.validarCierre({
    efectivoContado: 1657999,
    efectivoEsperado: 1658000,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.diferencia, -1);
});

test('el cierre servidor reutiliza el cálculo, bloquea y es idempotente', async () => {
  assert.equal(existsSync(migrationPath), true, 'falta la migración mínima de cierre');
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /create or replace function public\.cerrar_caja_piloto/);
  assert.match(sql, /public\.calcular_efectivo_esperado_tienda/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /for update/);
  assert.match(sql, /cierre_idempotency_key/);
  assert.match(sql, /on conflict \(tienda_codigo, fecha\)/);
});

test('la interfaz abandona el RPC legado y conserva la llave al reintentar', async () => {
  const html = await readFile(path.join(root, 'creditek/erp/caja.html'), 'utf8');

  assert.match(html, /const rpc = cicloNuevo \? 'validar_arqueo_caja' : 'cerrar_caja_piloto'/);
  assert.match(html, /sb\.rpc\(rpc, payload\)/);
  assert.match(html, /dataset\.idempotencyKey/);
  assert.doesNotMatch(html, /sb\.rpc\('cerrar_caja',/);
});

test('cierre y arqueo eligen su RPC, conservan la llave tras error y no autorizan automáticamente',async()=>{
  const html=await readFile(path.join(root,'creditek/erp/caja.html'),'utf8');
  const from=html.indexOf('async function cerrarCajaAccion('),to=html.indexOf('function compartirCuadritoWA(',from);
  assert.ok(from>=0&&to>from);
  for(const [fecha,rpc] of [['2026-09-01','cerrar_caja_piloto'],['2026-10-09','validar_arqueo_caja']]){
    const nodes={efectivoContado:{value:'100'},notaDiferencia:{value:''},cierreErr:{classList:{add(){},remove(){}}},btnCerrarCaja:{dataset:{},textContent:'Cerrar'}};
    const calls=[],banners=[];let fail=true;
    const context={document:{getElementById:id=>nodes[id]},crypto:{randomUUID:()=> 'test-key'},confirm:()=>true,
      cajaPiloto:{validarCierre:({efectivoContado,efectivoEsperado})=>({ok:efectivoContado===efectivoEsperado,mensaje:'Diferencia real'})},
      sb:{rpc:async(name,payload)=>{calls.push({name,payload});return fail?{error:{message:'Error simulado'}}:{data:{ok:true,diferencia:0}};}},
      mostrarBanner:message=>banners.push(message),fmtCOP:String,cargarCuadrito(){}};
    vm.runInNewContext(html.slice(from,to),context);
    await context.cerrarCajaAccion('TEST',fecha,100,'2026-10-01');
    assert.equal(nodes.btnCerrarCaja.dataset.idempotencyKey,'test-key');assert.equal(nodes.btnCerrarCaja.disabled,false);assert.equal(banners.length,0);
    fail=false;await context.cerrarCajaAccion('TEST',fecha,100,'2026-10-01');
    assert.ok(calls.every(c=>c.name===rpc&&c.payload.p_idempotency_key==='test-key'));
    assert.equal(calls[0].payload.p_autorizar,rpc==='validar_arqueo_caja'?false:undefined);
    assert.equal(nodes.btnCerrarCaja.dataset.idempotencyKey,undefined);assert.equal(banners.length,1);
    const count=calls.length;nodes.efectivoContado.value='99';await context.cerrarCajaAccion('TEST',fecha,100,'2026-10-01');
    assert.equal(calls.length,count);assert.equal(nodes.cierreErr.textContent,'Diferencia real');
  }
});
