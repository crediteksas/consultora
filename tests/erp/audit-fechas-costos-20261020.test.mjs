import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=name=>fs.readFileSync(`creditek/erp/${name}`,'utf8');
const block=(file,start,end)=>{const s=read(file),a=s.indexOf(start),b=s.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return s.slice(a,b);};

test('Compras usa fecha comercial de Colombia después de las 19h y al cambiar de año',()=>{
  const ctx=vm.createContext({});
  const source=read('compra-proveedor.html').match(/function fechaHoyColombia\([\s\S]*?\n\}/)[0];
  vm.runInContext(source,ctx);
  assert.equal(ctx.fechaHoyColombia(new Date('2026-10-21T00:30:00Z')),'2026-10-20');
  assert.equal(ctx.fechaHoyColombia(new Date('2027-01-01T04:59:59Z')),'2026-12-31');
  assert.equal(ctx.fechaHoyColombia(new Date('2027-01-01T05:00:00Z')),'2027-01-01');
  assert.doesNotMatch(read('compra-proveedor.html'),/fecha-factura'\)\.value = new Date\(\)\.toISOString/);
  assert.match(read('aliados-v1-1-app.js'),/expenseDate.*\.value = approvalDay\(new Date\(\)\)/);
});

test('Validación filtra un día completo en Colombia e incluye los últimos milisegundos',async()=>{
  const filters=[],query={select(){return this},order(){return this},eq(){return this},gte(k,v){filters.push(['gte',k,v]);return this},lt(k,v){filters.push(['lt',k,v]);return this},then(resolve){resolve({data:[],error:null});}};
  const ctx=vm.createContext({sb:{from:()=>query},document:{getElementById:id=>id==='filtroFecha'?{value:'2026-12-31'}:{value:id==='filtroEstado'?'todos':'',innerHTML:''}},actualizarContador(){},renderList(){}});
  vm.runInContext('let solicitudesCache=[];'+block('validacion.html','async function cargarSolicitudes()','function renderList()'),ctx);
  await ctx.cargarSolicitudes();
  assert.deepEqual(filters,[['gte','created_at','2026-12-31T00:00:00-05:00'],['lt','created_at','2027-01-01T00:00:00-05:00']]);
  assert.ok(Date.parse('2027-01-01T04:59:59.999Z')<Date.parse(filters[1][2]));
});

test('comparaciones del Tablero usan rangos claros y respetan febrero',()=>{
  const ctx=vm.createContext({});vm.runInContext(block('tablero.html','function rangoComparacion(','let creditosLiquidacionesPromise'),ctx);
  const compare=(r,kind)=>JSON.parse(JSON.stringify(ctx.rangoComparacion(r,kind)));
  assert.deepEqual(compare({desde:'2026-10-01',hasta:'2026-10-20'},'mes'),{desde:'2026-09-01',hasta:'2026-09-20'});
  assert.deepEqual(compare({desde:'2028-03-01',hasta:'2028-03-31'},'mes'),{desde:'2028-02-01',hasta:'2028-02-29'});
  assert.deepEqual(compare({desde:'2026-10-19',hasta:'2026-10-20'},'semana'),{desde:'2026-10-12',hasta:'2026-10-13'});
  assert.deepEqual(compare({desde:'2026-10-01',hasta:'2026-10-20'},'rango'),{desde:'2026-09-11',hasta:'2026-09-30'});
  assert.doesNotMatch(read('tablero.html'),/vs\. misma semana pasada/);
});

test('costo ausente no equivale a cero; costo explícito cero sí es conocido',()=>{
  const ctx=vm.createContext({});vm.runInContext(block('reportes.html','function costoConocido(','function totalesReporte('),ctx);
  for(const value of [null,undefined,'',NaN,Infinity,-1])assert.equal(ctx.costoConocido(value),false);
  for(const value of [0,'0',1,12.35])assert.equal(ctx.costoConocido(value),true);
  assert.doesNotMatch(read('reportes.html'),/Number\((?:item|vi)\.costo_congelado \|\| 0\)/);
});
