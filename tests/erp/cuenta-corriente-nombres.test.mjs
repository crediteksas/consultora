import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html=readFileSync(new URL('../../creditek/erp/cuenta-corriente.html',import.meta.url),'utf8');
const script=html.split('<script>').at(-1).split('</script>')[0];
test('cuenta corriente mantiene JavaScript válido',()=>{new vm.Script(script)});

test('consignaciones muestran nombres para todas las tiendas, sin cambiar códigos internos ni valores',async()=>{
 const elements=new Map();
 const element=id=>elements.get(id)||elements.set(id,{style:{},innerHTML:'',querySelectorAll:()=>[]}).get(id);
 const rows=[{id:1,tienda_codigo:'CK-02',valor_esperado:1000000,estado:'validado',fecha:'2026-09-03'},
  {id:2,tienda_codigo:'CK-08',valor_esperado:500000,estado:'validado',fecha:'2026-09-03'},
  {id:3,tienda_codigo:'CK-10',valor_esperado:100,estado:'pendiente',fecha:'2026-09-03'}];
 const context=vm.createContext({document:{getElementById:element},sb:{rpc:async()=>({data:rows})},esCentral:()=>true});
 for(const [start,end] of [['function nombreTienda','\nlet tiendaDetalleActual'],['function fmtCOP','\nfunction mostrarBanner'],['function etiquetaEstadoInstruccion','\nfunction abrirNuevaInstruccion']]){
  vm.runInContext(script.slice(script.indexOf(start),script.indexOf(end,script.indexOf(start))),context);
 }
 vm.runInContext("var instrucciones=[]; var nombresTiendas=new Map([['CK-02','Móvil Shopping'],['CK-08','Orocel'],['CK-10','Creditek Tolú 02']]);",context);
 await vm.runInContext('cargarInstrucciones()',context);
 const rendered=element('tbodyInstrucciones').innerHTML;
 assert.match(rendered,/Móvil Shopping/);assert.match(rendered,/Orocel/);assert.match(rendered,/Creditek Tolú 02/);
 assert.doesNotMatch(rendered,/CK-02|CK-08|CK-10/);
 assert.match(rendered,/1\.000\.000/);assert.equal(rows[0].tienda_codigo,'CK-02');
 assert.equal(vm.runInContext("nombreTienda('inexistente')",context),'Nombre de tienda no disponible');
 assert.match(html,/tiendasCache = \(tiendas \|\| \[\]\)\.filter\(t => t.activo\)/);
 assert.doesNotMatch(html,/escapeHtml\(i\.tienda_codigo\)/);
});
