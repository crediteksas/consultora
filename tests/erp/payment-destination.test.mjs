import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const destination=require('../../creditek/erp/payment-destination.js');

test('destino bancario completo conserva banco, tipo y número',()=>{
  const value=destination.format('Bancolombia','Ahorros','00123456789');
  assert.equal(value,'Bancolombia · Ahorros · 00123456789');
  assert.deepEqual(destination.parse(value),{
    bank:'Bancolombia',accountType:'Ahorros',number:'00123456789',complete:true,
  });
});

test('un número solo no inventa banco ni tipo de cuenta',()=>{
  assert.deepEqual(destination.parse('69228312835'),{
    bank:'',accountType:'',number:'69228312835',complete:false,
  });
  for(const args of [['','Ahorros','69228312835'],['Nequi','','69228312835'],['Nequi','Billetera digital','abc'],['Banco · falso','Ahorros','69228312835']])
    assert.throws(()=>destination.format(...args),/banco|tipo|número/i);
});
