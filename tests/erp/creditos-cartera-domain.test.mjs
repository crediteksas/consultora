import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../creditek/erp/creditos-cartera-domain.js', import.meta.url), 'utf8');
const context = { globalThis: {}, Intl };
vm.runInNewContext(source, context);
const domain = context.globalThis.KoraCreditPortfolioDomain;

const rows = [
  { cliente_nombre:'Ana',cliente_documento:'123',external_credit_id:'PJ-1',tienda:'Corozal',plataforma:'payjoy',origen_codigo:'C-1',status:'current',original_amount:100,validated_repayments:40,outstanding_amount:60,pre_nova:true,nova_status:'pre_nova',broken_promises:0 },
  { cliente_nombre:'Luis',cliente_documento:'456',external_credit_id:'KR-1',tienda:'Tolú',plataforma:'krediya',origen_codigo:'T-1',status:'late',original_amount:200,validated_repayments:20,outstanding_amount:180,pre_nova:false,nova_status:'approved',broken_promises:1 },
];

test('resume cartera sin confundir pagos del cliente con saldo', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(domain.summarize(rows))), {
    credits:2,original:300,outstanding:240,paid:60,current:1,risk:1,closed:0,
    preNova:1,novaApproved:1,brokenPromises:1,
  });
});

test('filtra por cliente, plataforma, estado y tienda', () => {
  assert.equal(domain.filter(rows,{query:'tolú'}).length,1);
  assert.equal(domain.filter(rows,{platform:'payjoy'}).length,1);
  assert.equal(domain.filter(rows,{status:'late',origin:'T-1'})[0].cliente_nombre,'Luis');
});

test('presenta estados pre-Nova explícitamente', () => {
  assert.equal(domain.statusLabel('pre_nova'),'Anterior a Nova');
  assert.equal(domain.statusLabel('approved'),'Autorizado');
});
