import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../creditek/erp/tablero.html', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261002213529_cierre_informativo_utilidades_negocio.sql', import.meta.url), 'utf8');

test('el cierre es informativo, privado y no escribe en libros de dinero', () => {
  assert.match(migration, /generated always as \(utilidad_neta - retiro_declarado\) stored/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /es_controlador_financiero/);
  assert.doesNotMatch(migration, /\b(?:insert|update|delete)\s+(?:into\s+|from\s+)?(?:public\.)?(?:banco_creditek_movimientos|movimientos_caja_tienda|movimientos_tesoreria_central|financial_entries)\b/i);
});

test('el tablero muestra separado el resultado de septiembre y el disponible en cero', async () => {
  const source = html.slice(html.indexOf('async function cargarCierreSeptiembre()'), html.indexOf('async function cargarSerieUtilidadAcumulada('));
  const section = { hidden:true };
  const detail = { innerHTML:'' };
  const nodes = { cierreUtilidadesSeptiembre:section, cierreUtilidadesSeptiembreDetalle:detail };
  const data = [
    {negocio:'retail',utilidad_neta:7806649.56,retiro_declarado:7806649.56,disponible:0},
    {negocio:'b2b',utilidad_neta:8026178,retiro_declarado:8026178,disponible:0},
    {negocio:'aliados',utilidad_neta:33026532.09,retiro_declarado:33026532.09,disponible:0},
  ];
  const context = {
    document:{getElementById:id=>nodes[id]},
    sb:{from:table=>{assert.equal(table,'utilidades_cierres_negocio');return {select:()=>({eq:async()=>({data,error:null})})};}},
    Intl,Number,Map,Array,console,
  };
  vm.runInNewContext(`${source}; globalThis.loadClose = cargarCierreSeptiembre;`, context);
  await context.loadClose();
  assert.equal(section.hidden,false);
  assert.match(detail.innerHTML,/Retail/);
  assert.match(detail.innerHTML,/B2B/);
  assert.match(detail.innerHTML,/Aliados/);
  assert.equal((detail.innerHTML.match(/Disponible por retirar:/g)||[]).length,3);
  assert.match(detail.innerHTML,/Retiro informado/);
});
