import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=file=>readFileSync(new URL('../../creditek/erp/'+file,import.meta.url),'utf8');
const helper={window:{}};vm.runInNewContext(read('producto-foto.js'),helper);
const fotos=helper.window.CreditekProductoFoto;
const html=read('remisiones.html');
const start=html.indexOf('async function registrarFotosFaltantesRecepcion()');
const end=html.indexOf('// ─── Escáner',start);
assert.ok(start>=0&&end>start);

function harness({size=1024,uploadError=null,existingURL=null}={}){
  const calls=[],err={textContent:'',classList:{add(){},remove(){}}},button={disabled:false,textContent:'Confirmar recepción'};
  const file={name:'foto-ficticia.jpg',type:'image/jpeg',size};
  const item={id:'item-ficticio',producto_id:'producto-ficticio',cantidad:1,precio_remision:100,
    productos:{nombre:'Producto ficticio',tipo:'cantidad',foto_url:null}};
  const context={productoFoto:fotos,recepcionRemisionActual:{id:'remision-ficticia',revision:0,items:[item]},
    document:{getElementById:id=>id==='modalRecepcionErr'?err:button,
      querySelector:selector=>selector.includes('foto-recepcion-input')?{files:[file]}:{value:'1'}},
    sb:{storage:{from:()=>({upload:async()=>{calls.push('upload');return {error:uploadError};},
      getPublicUrl:()=>({data:{publicUrl:'https://example.test/productos-fotos/canonicas/producto-ficticio'}})})},
      from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{foto_url:existingURL}})})})}),
      rpc:async name=>{calls.push(name);return {data:name==='registrar_foto_producto_recepcion'?{ok:true,foto_url:'https://example.test/foto.jpg'}:{ok:true}};}},
    cerrarModalAccesible(){},mostrarBanner(){},cargarRemisiones(){},
  };
  const functions=vm.runInNewContext(html.slice(start,end)+'\n({confirmarRecepcion,registrarFotosFaltantesRecepcion});',context);
  return {functions,calls,err,button,item,context};
}

test('recepción rechaza foto mayor de 2 MB antes de subir, asociar o recibir',async()=>{
  const h=harness({size:2*1024*1024+1});await h.functions.confirmarRecepcion();
  assert.match(h.err.textContent,/Producto ficticio.*2 MB.*Baja la resolución o comprímela/);
  assert.deepEqual(h.calls,[]);assert.equal(h.button.disabled,false);assert.equal(h.item.productos.foto_url,null);
});

test('foto exactamente de 2 MB conserva el flujo upload, asociación y recepción',async()=>{
  const h=harness({size:2*1024*1024});await h.functions.confirmarRecepcion();
  assert.deepEqual(h.calls,['upload','registrar_foto_producto_recepcion','confirmar_recepcion_remision']);
  assert.equal(h.context.recepcionRemisionActual,null);
});

for(const error of [{statusCode:'413',message:'The object exceeded the maximum allowed size'},
  {statusCode:'403',message:'Sin permiso para subir'}]){
  test('rechazo de Storage '+error.statusCode+' no intenta asociar una foto inexistente ni recibir',async()=>{
    const h=harness({uploadError:error});await h.functions.confirmarRecepcion();
    assert.deepEqual(h.calls,['upload']);assert.equal(h.button.disabled,false);
    assert.match(h.err.textContent,error.statusCode==='413'?/2 MB.*Baja la resolución o comprímela/:/Sin permiso para subir/);
    assert.doesNotMatch(h.err.textContent,/imagen canónica no existe/);
    assert.equal(h.item.productos.foto_url,null);assert.notEqual(h.context.recepcionRemisionActual,null);
  });
}

test('colisión con foto ya asociada por otra sesión conserva la foto sin sobrescribirla',async()=>{
  const h=harness({uploadError:{statusCode:'409'},existingURL:'https://example.test/foto-actual.jpg'});
  await h.functions.confirmarRecepcion();
  assert.equal(h.item.productos.foto_url,'https://example.test/foto-actual.jpg');
  assert.deepEqual(h.calls,['upload','confirmar_recepcion_remision']);
});

const doc=read('documento-remision.html');
const listenerStart=doc.indexOf("inputFotoHidden.addEventListener('change', async () => {");
const listenerEnd=doc.indexOf('// ============================================================\n// BOOT',listenerStart);
assert.ok(listenerStart>=0&&listenerEnd>listenerStart);
function documentHarness(size,uploadError=null){
  const calls=[],messages=[],button={textContent:'📷'};let listener;
  const context={window:{CreditekProductoFoto:fotos},productoIdSubiendo:'producto-ficticio',REMISION_ID:'remision-ficticia',
    inputFotoHidden:{files:[{name:'foto-ficticia.jpg',type:'image/jpeg',size}],addEventListener:(_event,fn)=>{listener=fn;}},
    document:{querySelector:()=>button},items:[{producto_id:'producto-ficticio',productos:{foto_url:null}}],
    SB:{storage:{from:()=>({upload:async()=>{calls.push('upload');return {error:uploadError};},
      getPublicUrl:()=>({data:{publicUrl:'https://example.test/foto.jpg'}})})},
      from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{foto_url:null}})})})}),
      rpc:async name=>{calls.push(name);return {data:{ok:true,foto_url:'https://example.test/foto.jpg'}};}},
    renderDocumento(){},toast:message=>messages.push(message),
  };
  vm.runInNewContext(doc.slice(listenerStart,listenerEnd),context);
  return {run:()=>listener(),calls,messages,button};
}
test('documento de remisión valida tamaño antes de enviar y pide reducir resolución',async()=>{
  const h=documentHarness(3*1024*1024);await h.run();assert.deepEqual(h.calls,[]);
  assert.match(h.messages[0],/2 MB.*Baja la resolución o comprímela/);assert.equal(h.button.textContent,'📷');
});
test('documento no asocia la foto cuando Storage rechaza el archivo',async()=>{
  const h=documentHarness(1024,{code:'EntityTooLarge'});await h.run();
  assert.deepEqual(h.calls,['upload']);assert.match(h.messages[0],/2 MB.*Baja la resolución o comprímela/);
});
test('documento conserva carga válida sin confirmar recepción automáticamente',async()=>{
  const h=documentHarness(1024);await h.run();
  assert.deepEqual(h.calls,['upload','registrar_foto_producto_recepcion']);assert.match(h.messages[0],/Foto guardada/);
});
