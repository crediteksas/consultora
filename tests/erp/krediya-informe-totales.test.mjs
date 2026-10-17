import test from 'node:test';
import assert from 'node:assert/strict';
import T from '../../creditek/erp/krediya-tarifario.js';

test('diferencias Krediya: cierre por fase, centavos, pérdidas y datos ausentes',()=>{
 const context={impacto_bruto:100.25,pagamos:800.5,inicial:100.25,bonos:20.25,utilidad_neta:-5.5,impacto_neto:-10.25,gasto_financiero:2.25,provision:3.5};
 const rows=[{contexto:{...context,pvp_guardado:2000,pvp_liquidado:2100.25}},{contexto:{...context,bono_ejecutivo_pendiente:true}},{preliminar:true,contexto:{...context,impacto_neto:900}}];
 const before=JSON.stringify(rows),result=T.diferenciasRows(rows),final=result.at(-2),preliminary=result.at(-1);
 assert.equal(JSON.stringify(rows),before);assert.equal(result.length,6);
 assert.match(final[0],/NO PRELIMINAR · 2/);assert.match(preliminary[0],/PRELIMINAR · 1/);
 assert.equal(final[6],200.5);assert.equal(final[7],1601);assert.equal(final[8],200.5);assert.equal(final[9],1400.5);
 assert.equal(final[12],-20.5);assert.equal(preliminary[12],900);
 for(const c of [4,5])assert.equal(final[c],'','no sumar precios unitarios');
 for(const c of [10,11,18])assert.match(final[c],/Pendiente: 1 sin dato/);
 assert.match(final[11],/-5,50/);assert.match(final[14],/No acredita pago/);
 assert.equal(T.diferenciasRows([]).length,1);
});
