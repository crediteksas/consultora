import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const root=path.resolve(process.env.COP_RELEASE_DIR);
const raw=await fs.readFile(path.join(root,'candidate/index.mjs'),'utf8');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const helpers=raw.slice(raw.indexOf('function pesosDesdeCentavos('),raw.indexOf('var moneda = /* @__PURE__ */'));
const reports=raw.slice(raw.indexOf('var limpio = /* @__PURE__ */'),raw.indexOf('async function ejecutarReporteDeuda('));
const context=vm.createContext({Intl,BigInt,Map,Set,Date,Number,Error,...Object.fromEntries(['__name','__name2','__name22','__name222'].map(k=>[k,x=>x]))});
vm.runInContext(helpers+'\n'+reports,context);
const datos={fecha:'2026-11-20',corte:'2026-11-20T20:00:00Z',diarias:[
  {usuario_id:'ficticio-a',administrador:'Persona A',tienda_codigo:'F-A',tienda:'Tienda A',confirmacion:{saldo_sistema:1234.87,saldo_declarado:1234.87,diferencia:0,confirmado_at:'2026-11-20T14:00:00Z',revisado_at:null}},
  {usuario_id:'ficticio-b',administrador:'Persona B',tienda_codigo:'F-B',tienda:'Tienda B',confirmacion:null},
]};

test('the exact candidate uses integer pesos in compact and legacy reports',()=>{
  const copy=structuredClone(datos);
  const compact=context.renderizarReporteDeuda(context.prepararReporteDeudaCompacto(datos));
  const legacy=context.formatearConfirmacionesDeuda(datos);
  for(const text of [compact,legacy]){assert.match(text,/\$1\.235/);assert.doesNotMatch(text,/\$-?[\d.]+,\d/);assert.match(text,/PENDIENTE/);}
  assert.match(compact,/TOTAL PARCIAL \(1\/2 tiendas\): \$1\.235/);
  assert.match(compact,/Pendiente de confirmar: Tienda B/);
  assert.deepEqual(datos,copy);
});
test('fractional differences remain pending and distinguish sign, never negative zero',()=>{
  const data=structuredClone(datos);Object.assign(data.diarias[0].confirmacion,{saldo_declarado:1234.77,diferencia:-.10});
  const text=context.renderizarReporteDeuda(context.prepararReporteDeudaCompacto(data));
  assert.match(text,/1 con diferencia/);assert.match(text,/DIFERENCIA entre -\$1 y \$0/);assert.match(text,/Por revisar/);assert.doesNotMatch(text,/\$-0/);
  for(const [cents,want] of [[123449,'$1.234'],[123450,'$1.235'],[-123450,'$-1.235'],[0,'$0']])assert.equal(context.pesosDesdeCentavos(cents),want);
});
test('artifact and unchanged form match the reviewed manifest',async()=>{
  assert.equal(sha(raw),manifest.candidateSha256);
  assert.equal(sha(await fs.readFile(path.join(root,'baseline/index.mjs'))),manifest.baselineSha256);
  assert.equal(sha(await fs.readFile(path.join(root,'candidate/form.html'))),manifest.unchangedFormSha256);
});
