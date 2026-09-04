import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {fecha}=createRequire(import.meta.url)('../../creditek/erp/aliados-liquidaciones-domain.js');

test('Krediya interpreta día/mes y conserva las ventas de septiembre en septiembre',()=>{
  for(const [source,day] of [['1/09/2026','2026-09-01'],['2/09/2026','2026-09-02'],['3/09/2026','2026-09-03'],['12/08/2026','2026-08-12'],['28/08/2026','2026-08-28'],['30-08-2026','2026-08-30']]){
    assert.equal(fecha(source),`${day}T17:00:00.000Z`);
  }
});
test('rechaza fechas imposibles y conserva timestamps ISO',()=>{
  for(const source of ['31/02/2026','32/09/2026','1/13/2026','']) assert.equal(fecha(source),null);
  assert.equal(fecha('2026-09-02T14:00:00Z'),'2026-09-02T14:00:00.000Z');
});
