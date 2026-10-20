import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../../creditek/erp/conteos-ui.js',import.meta.url),'utf8');
const start=source.indexOf('    async function crear(ciego) {');
const end=source.indexOf('    async function guardarFoto(',start);
assert.ok(start>=0&&end>start,'La prueba debe ejecutar la función real de inicio');

function harness({accept=true,active=[],store='CK-02',autoriza=true}={}) {
  const calls=[],prompts=[],downloads=[];
  const context=vm.createContext({
    config:{autoriza,tiendas:[{codigo:'CK-02',nombre:'Móvil Shopping'}]},detalle:null,
    el:id=>id==='tienda'?{value:store}:{scrollIntoView:()=>calls.push('scroll')},
    global:{confirm:message=>{prompts.push(message);return accept;}},
    rpc:async(action,data)=>{
      calls.push(action);
      if(action==='en_proceso')return {cortes:active};
      return {corte:{id:data.id||'nuevo',estado:'abierto'}};
    },
    renderDetalle:async()=>calls.push('render'),
    historial:async()=>calls.push('historial'),
    descargar:blind=>downloads.push(blind),fechaCorte:()=> '14/10/2026',
  });
  const crear=vm.runInContext(`${source.slice(start,end)}\ncrear;`,context);
  return {crear,calls,prompts,downloads,context};
}

for(const blind of [false,true]) {
  test(`cancelar inicio ${blind?'ciego':'normal'} no crea ni descarga un inventario`,async()=>{
    const h=harness({accept:false});
    assert.equal(await h.crear(blind),false);
    assert.deepEqual(h.calls,['en_proceso']);
    assert.deepEqual(h.downloads,[]);
    assert.equal(h.context.detalle,null);
    assert.equal(h.prompts.length,1);
    assert.match(h.prompts[0],/¿Usted quiere inicializar inventario\?/);
    assert.match(h.prompts[0],/Móvil Shopping/);
    assert.match(h.prompts[0],/no modifica existencias ni saldos/);
  });
  test(`aceptar inicio ${blind?'ciego':'normal'} crea un solo corte después de confirmar`,async()=>{
    const h=harness();
    await h.crear(blind);
    assert.equal(h.prompts.length,1);
    assert.deepEqual(h.calls,['en_proceso','crear','render','historial']);
    assert.deepEqual(h.downloads,[blind]);
  });
}

test('retomar un corte existente no confirma ni crea una inicialización nueva',async()=>{
  const h=harness({accept:false,active:[{id:'existente'}]});
  assert.match(await h.crear(false),/No se creó otro corte/);
  assert.deepEqual(h.calls,['en_proceso','ver','render','historial','scroll']);
  assert.deepEqual(h.prompts,[]);
  assert.equal(h.context.detalle.corte.id,'existente');
});

test('sin tienda seleccionada no hay confirmación ni llamadas al servidor',async()=>{
  const h=harness({store:''});
  await assert.rejects(h.crear(false),/Selecciona una tienda/);
  assert.deepEqual(h.calls,[]);
  assert.deepEqual(h.prompts,[]);
});

test('la tienda no puede inicializar, pero puede retomar el corte abierto autorizado',async()=>{
  const h=harness({autoriza:false});
  await assert.rejects(h.crear(false),/Solo Mayte u Óscar/);
  assert.deepEqual(h.calls,['en_proceso']);
  assert.equal(h.prompts.length,0);
  const existing=harness({autoriza:false,active:[{id:'existente'}]});
  await existing.crear(false);
  assert.equal(existing.calls.includes('crear'),false);
  assert.equal(existing.context.detalle.corte.id,'existente');
});

test('ambos botones identifican que inicializan inventario',()=>{
  assert.match(source,/id="conteos-crear"[^>]*>Inicializar inventario y descargar/);
  assert.match(source,/id="conteos-ciego"[^>]*>Inicializar inventario con conteo ciego/);
});
