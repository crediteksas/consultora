import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('creditek/erp/krediya-gestiones.js', 'utf8');
const sql = fs.readFileSync('supabase/migrations/20260905022414_krediya_instrucciones_gestion_externa.sql', 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const operation = { referencia:'REDMI 15C 128GB 4RAM', tienda:'A CREDICEL LA GRANJA', imei:'867754085954166', pvp_guardado:646400, pvp_recibido:701500 };
const instruction = {
  id:'instruction-1', operation_id:'operation-1', liquidation_id:'batch-1', responsable_id:'maythe',
  responsable_nombre:'Maythe Reyes', autor_nombre:'Oscar Pacheco', instruccion:'Subir PVP a 880000 en la plataforma Krediya',
  pvp_objetivo:880000, created_at:'2026-09-05T00:00:00Z', contexto:{ ...operation, fecha:'2026-08-12' }, krediya_gestiones:[]
};

function harness({ capability='aprobador', userId='oscar', reportRows=[instruction], failInsert=false, reportError=false, onReport=async()=>{}, queryResult }={}) {
  const nodes = new Map(), calls = [], forms = [];
  function node(id='') {
    const classes = new Set();
    const element = { id, value:'', textContent:'', disabled:false, required:false, dataset:{}, listeners:{},
      classList:{ add:name=>classes.add(name), remove:name=>classes.delete(name), contains:name=>classes.has(name) },
      addEventListener(name, fn) { this.listeners[name]=fn; },
      focus() { document.activeElement=this; }, click() { return this.onclick?.(); },
      querySelectorAll() { return []; },
      querySelector() { return undefined; }
    };
    let html='';
    Object.defineProperty(element, 'innerHTML', { get:()=>html, set(value) {
      html=value;
      for (const match of value.matchAll(/\bid="([^"]+)"/g)) if (!nodes.has(match[1])) nodes.set(match[1], node(match[1]));
      if (id==='instructionContent') nodes.get('instructionAssignee').value='maythe';
      if (id==='report') {
        forms.length=0;
        for (const match of value.matchAll(/<form data-management-form="([^"]+)"/g)) {
          const controls = new Map(['estado','comentario','evidencia'].map(key=>[key,node(key)]));
          const form=node(); form.dataset.managementForm=match[1]; form.elements={ namedItem:key=>controls.get(key) };
          const button=node(), error=node();
          form.querySelector=selector=>selector==='button[type="submit"]'?button:error;
          forms.push(form);
        }
      }
    } });
    return element;
  }
  const document={ activeElement:null, getElementById:id=>nodes.get(id), createElement:()=>node() };
  for (const id of ['instructionEditor','closeInstructionEditor','instructionContent','report']) nodes.set(id,node(id));
  nodes.get('report').querySelectorAll=selector=>selector==='[data-management-form]'?forms:[];
  const sb={
    async rpc(name,args) { calls.push({type:'rpc',name,args}); assert.equal(name,'aliados_contexto_precio_krediya'); return {data:operation,error:null}; },
    from(table) {
      const call={type:'query',table,filters:[]};calls.push(call);
      const query={
        select(value) {call.select=value;return query;},
        eq(...value) {call.filters.push(['eq',...value]);return query;},
        in(...value) {call.filters.push(['in',...value]);return query;},
        order(...value) {call.filters.push(['order',...value]);return query;},
        range(...value) {call.range=value;return query;},
        async insert(payload) {call.type='insert';call.payload=plain(payload);return {error:failInsert?new Error('Fallo de escritura'):null};},
        then(resolve,reject) {
          let data;
          if (table==='aliados_operadores') data=[{perfil_id:'maythe'}];
          else if (table==='perfiles') data=[{id:'maythe',nombre:'Maythe Reyes'}];
          else if (table==='krediya_instrucciones') data=reportRows.slice(call.range?.[0]||0,(call.range?.[1]??499)+1);
          else throw Error(`Lectura inesperada: ${table}`);
          return Promise.resolve(queryResult ? queryResult(call,data) : {data,error:reportError?new Error('Informe no disponible'):null}).then(resolve,reject);
        }
      };return query;
    }
  };
  const context={module:{exports:{}},document,Intl,URL:{createObjectURL:()=>'',revokeObjectURL(){}},Blob,setTimeout};
  vm.runInNewContext(source, context);
  const api=context.module.exports;
  const client=api.create({sb,userId,capability,money:value=>`COP ${value}`,onReport});
  return {api,client,nodes,calls,forms,report:nodes.get('report')};
}

test('sin gestiones es pendiente y el estado usa el evento más reciente sin mutar el historial', () => {
  const {api}=harness();
  assert.equal(api.status({}),'pendiente');
  const row={krediya_gestiones:[
    {id:'10',created_at:'2026-09-05T01:00:00Z',estado:'realizada'},
    {id:'2',created_at:'2026-09-05T01:00:00Z',estado:'no_aplicada'},
    {id:'1',created_at:'2026-09-04T01:00:00Z',estado:'en_gestion'}
  ]};
  assert.equal(api.status(row),'realizada');
  assert.equal(api.latest(row).id,'10');
  assert.deepEqual(row.krediya_gestiones.map(e=>e.id),['10','2','1']);
});

test('CSV identifica referencia, comercio, IMEI, precios, instrucción, autores, estado y evidencia; escapa fórmulas y comillas', () => {
  const {api}=harness();
  const csv=api.reportCsv([{...instruction,instruccion:' =HYPERLINK("bad"); primera\nsegunda',
    contexto:{...instruction.contexto,tienda:'@SUM(1)',referencia:'Equipo "especial"'},
    krediya_gestiones:[{id:'1',created_at:'2026-09-05T01:00:00Z',estado:'realizada',comentario:'Cambio terminado',evidencia:'ticket-123'}]
  }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal((csv.split('\r\n')[0].match(/";"/g)||[]).length+1,15);
  for (const value of ['Referencia','Comercio','IMEI','Fecha venta','PVP objetivo en Krediya','Instrucción de Gerencia','Autor','Responsable','Estado','Evidencia / referencia','867754085954166','646400','701500','880000','Oscar Pacheco','Maythe Reyes','ticket-123']) assert.ok(csv.includes(value),value);
  assert.ok(csv.includes('"\' =HYPERLINK(""bad""); primera\nsegunda"'));
  assert.ok(csv.includes('"\'@SUM(1)"'));
  assert.ok(csv.includes('"Equipo ""especial"""'));
  assert.ok(csv.includes('Realizada según responsable'));
});

test('solo Gerencia abre instrucciones; revisor no realiza consultas ni escrituras', async () => {
  const h=harness({capability:'revisor',userId:'maythe'});
  await assert.rejects(h.client.open('operation-1'),/Solo Gerencia/);
  assert.equal(h.calls.length,0);
  assert.equal(h.nodes.get('instructionEditor').classList.contains('show'),false);
});

test('crear registra exclusivamente la instrucción y PVP objetivo, sin cambiar el precio real ni resolver la liquidación', async () => {
  let refreshed=0;
  const h=harness({onReport:async()=>{refreshed++;}});
  await h.client.open('operation-1');
  assert.match(h.nodes.get('instructionContent').innerHTML,/No cambia precios en KORA/);
  assert.match(h.nodes.get('instructionContent').innerHTML,/no autoriza pagos/);
  h.nodes.get('instructionTarget').value='880000';
  h.nodes.get('instructionTarget').oninput();
  assert.match(h.nodes.get('instructionPreview').textContent,/COP 880000/);
  assert.match(h.nodes.get('instructionPreview').textContent,/aún no aplicado/);
  h.nodes.get('instructionText').value=' Subir a 880000 en la plataforma Krediya como estaba definido. ';
  await h.nodes.get('instructionForm').onsubmit({preventDefault(){}});
  const writes=h.calls.filter(c=>c.type==='insert');
  assert.equal(writes.length,1);
  assert.equal(writes[0].table,'krediya_instrucciones');
  assert.deepEqual(writes[0].payload,{operation_id:'operation-1',responsable_id:'maythe',instruccion:'Subir a 880000 en la plataforma Krediya como estaba definido.',pvp_objetivo:880000});
  assert.equal(refreshed,1);
  assert.equal(h.nodes.get('instructionEditor').classList.contains('show'),false);
  assert.deepEqual(h.calls.filter(c=>c.type==='rpc').map(c=>c.name),['aliados_contexto_precio_krediya']);
});

test('crear sin PVP objetivo no inventa un importe y una instrucción inválida no se guarda', async () => {
  const h=harness();await h.client.open('operation-1');
  h.nodes.get('instructionText').value='no';
  await h.nodes.get('instructionForm').onsubmit({preventDefault(){}});
  assert.equal(h.calls.filter(c=>c.type==='insert').length,0);
  h.nodes.get('instructionText').value='Revisar disponibilidad del modelo en Krediya';
  await h.nodes.get('instructionForm').onsubmit({preventDefault(){}});
  assert.equal(h.calls.find(c=>c.type==='insert').payload.pvp_objetivo,null);
});

test('un error al guardar conserva el formulario, informa el error y no informa éxito', async () => {
  let refreshed=0;const h=harness({failInsert:true,onReport:async()=>{refreshed++;}});
  await h.client.open('operation-1');
  h.nodes.get('instructionText').value='Gestionar el PVP en Krediya';
  await h.nodes.get('instructionForm').onsubmit({preventDefault(){}});
  assert.equal(refreshed,0);
  assert.equal(h.nodes.get('instructionEditor').classList.contains('show'),true);
  assert.equal(h.nodes.get('saveInstruction').disabled,false);
  assert.match(h.nodes.get('instructionError').textContent,/Fallo de escritura/);
});

test('guardar exitosamente seguido de refresco fallido no permite repetir la escritura ni informa un fallo de guardado', async () => {
  const h=harness({onReport:async()=>{throw Error('Falló refresco del informe');}});
  await h.client.open('operation-1');
  h.nodes.get('instructionText').value='Subir PVP a 880000 en Krediya';
  await h.nodes.get('instructionForm').onsubmit({preventDefault(){}});
  assert.equal(h.calls.filter(c=>c.type==='insert').length,1);
  assert.equal(h.nodes.get('saveInstruction').disabled,true);
  assert.match(h.nodes.get('instructionPreview').textContent,/Instrucción guardada/);
  assert.match(h.nodes.get('instructionError').textContent,/ya quedó guardada\. No la repitas/);
  assert.equal(h.nodes.get('instructionEditor').classList.contains('show'),true);
});

test('informe lee únicamente las instrucciones del lote y muestra responsabilidad, límites y acciones sin ejecutar pagos', async () => {
  const h=harness();await h.client.renderReport(h.report,'batch-1');
  assert.match(h.report.innerHTML,/REDMI 15C 128GB 4RAM/);
  assert.match(h.report.innerHTML,/Maythe Reyes/);
  assert.match(h.report.innerHTML,/PVP solicitado/);
  assert.match(h.report.innerHTML,/en Krediya: COP 880000/);
  assert.match(h.report.innerHTML,/Tampoco modifica tarifas, cálculos, bonos ni autoriza pagos en KORA/);
  assert.match(h.report.innerHTML,/1 registradas · 1 pendientes o en gestión/);
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].table,'krediya_instrucciones');
  assert.deepEqual(h.calls[0].filters.find(f=>f[0]==='eq'),['eq','liquidation_id','batch-1']);
  assert.deepEqual(h.calls[0].range,[0,499]);
  assert.equal(h.forms.length,1);
});

test('informe pagina resultados del servidor y permite filtrar estados sin volver a consultar', async () => {
  const rows=Array.from({length:501},(_,i)=>({...instruction,id:`instruction-${i}`,krediya_gestiones:i===500?[{id:'e',created_at:'2026-09-05T01:00:00Z',estado:'realizada'}]:[]}));
  const h=harness({reportRows:rows});await h.client.renderReport(h.report,'batch-1');
  assert.equal(h.calls.length,2);
  assert.deepEqual(h.calls[1].range,[500,999]);
  assert.match(h.report.innerHTML,/501 registradas · 500 pendientes o en gestión/);
  assert.equal(h.forms.length,8);
  h.nodes.get('instructionFilter').value='realizada';h.nodes.get('instructionFilter').onchange();
  assert.equal(h.forms.length,1);
  assert.match(h.report.innerHTML,/Página 1 de 1 · 1 instrucciones/);
  assert.equal(h.calls.length,2);
});

test('cambiar alcance dos veces descarta la respuesta obsoleta aunque llegue después', async () => {
  let queryCount=0;const pending=[];
  const h=harness({queryResult:(call,data)=>{
    queryCount++;
    if(queryCount===1) return {data,error:null};
    return new Promise(resolve=>pending.push({call,resolve}));
  }});
  await h.client.renderReport(h.report,'batch-1');
  h.nodes.get('instructionScope').value='all';
  const allLoad=h.nodes.get('instructionScope').onchange();
  await new Promise(setImmediate);
  h.nodes.get('instructionScope').value='batch';
  const batchLoad=h.nodes.get('instructionScope').onchange();
  await new Promise(setImmediate);
  assert.equal(pending.length,2);
  assert.ok(!pending[0].call.filters.some(f=>f[0]==='eq'));
  assert.ok(pending[1].call.filters.some(f=>f[0]==='eq'&&f[2]==='batch-1'));
  pending[1].resolve({data:[{...instruction,instruccion:'Resultado vigente del lote'}],error:null});
  await batchLoad;
  assert.match(h.report.innerHTML,/Resultado vigente del lote/);
  pending[0].resolve({data:[{...instruction,instruccion:'Resultado obsoleto de todos los lotes'}],error:null});
  await allLoad;
  assert.match(h.report.innerHTML,/Resultado vigente del lote/);
  assert.doesNotMatch(h.report.innerHTML,/Resultado obsoleto/);
});

test('informe con error informa la carga fallida sin mostrar importes cero o completar una gestión', async () => {
  const h=harness({reportError:true});await h.client.renderReport(h.report,'batch-1');
  assert.match(h.report.textContent,/No se pudo cargar el informe: Informe no disponible/);
  assert.equal(h.calls.filter(c=>c.type==='insert').length,0);
});

test('instrucciones y comentarios se escapan y un revisor ajeno no obtiene formulario de seguimiento', async () => {
  const h=harness({capability:'revisor',userId:'otro',reportRows:[{...instruction,instruccion:'<script>alert(1)</script>',contexto:{...instruction.contexto,tienda:'<img src=x onerror=bad>'}}]});
  await h.client.renderReport(h.report,'batch-1');
  assert.match(h.report.innerHTML,/&lt;script&gt;/);
  assert.match(h.report.innerHTML,/&lt;img/);
  assert.doesNotMatch(h.report.innerHTML,/<script>|<img/);
  assert.equal(h.forms.length,0);
});

test('Maythe registra seguimiento separado; realizada exige evidencia y nunca actualiza precios o órdenes de pago', async () => {
  const h=harness({capability:'revisor',userId:'maythe'});await h.client.renderReport(h.report,'batch-1');
  const form=h.forms[0],state=form.elements.namedItem('estado'),evidence=form.elements.namedItem('evidencia');
  state.value='realizada';state.onchange();
  assert.equal(evidence.required,true);
  form.elements.namedItem('comentario').value='Actualicé el PVP en Krediya';
  await form.onsubmit({preventDefault(){}});
  assert.equal(h.calls.filter(c=>c.type==='insert').length,0);
  evidence.value=' ticket K-123 ';
  await form.onsubmit({preventDefault(){}});
  const writes=h.calls.filter(c=>c.type==='insert');
  assert.equal(writes.length,1);
  assert.equal(writes[0].table,'krediya_gestiones');
  assert.deepEqual(writes[0].payload,{instruccion_id:'instruction-1',estado:'realizada',comentario:'Actualicé el PVP en Krediya',evidencia:'ticket K-123'});
  assert.equal(h.calls.filter(c=>c.type==='rpc').length,0);
  assert.ok(h.calls.every(c=>['krediya_instrucciones','krediya_gestiones'].includes(c.table)));
});

test('error de seguimiento no marca realizada ni habilita una falsa confirmación', async () => {
  const h=harness({capability:'revisor',userId:'maythe',failInsert:true});await h.client.renderReport(h.report,'batch-1');
  const form=h.forms[0];form.elements.namedItem('estado').value='en_gestion';form.elements.namedItem('comentario').value='Revisando Krediya';
  await form.onsubmit({preventDefault(){}});
  assert.match(form.querySelector('[data-management-error]').textContent,/Fallo de escritura/);
  assert.equal(form.querySelector('button[type="submit"]').disabled,false);
  assert.equal(h.api.status(instruction),'pendiente');
});

test('migración mantiene autor, contexto y lote controlados por servidor y tablas de seguimiento inmutables con RLS', () => {
  assert.match(sql,/new\.autor_id\s*:=\s*auth\.uid\(\)/i);
  assert.match(sql,/new\.liquidation_id\s*:=\s*o\.liquidation_id/i);
  assert.match(sql,/new\.contexto\s*:=\s*jsonb_build_object/i);
  assert.match(sql,/new\.created_at\s*:=\s*clock_timestamp\(\)/i);
  assert.match(sql,/grant insert \(operation_id, responsable_id, instruccion, pvp_objetivo\)\s+on public\.krediya_instrucciones/i);
  assert.match(sql,/grant insert \(instruccion_id, estado, comentario, evidencia\)\s+on public\.krediya_gestiones/i);
  assert.match(sql,/krediya_instrucciones enable row level security/i);
  assert.match(sql,/krediya_gestiones enable row level security/i);
  assert.match(sql,/before update or delete on public\.krediya_instrucciones/i);
  assert.match(sql,/before update or delete on public\.krediya_gestiones/i);
  assert.match(sql,/estado <> 'realizada' or nullif\(btrim\(evidencia\), ''\) is not null/i);
  assert.match(sql,/i\.responsable_id = auth\.uid\(\)/i);
  assert.match(sql,/tiene_capacidad_aliados\('aprobador'\)/i);
  assert.doesNotMatch(sql,/security definer|\b(?:update|insert into|delete from)\s+public\.(?:liquidations|liquidation_operations|payment_orders|krediya_price_rules|krediya_bonus_rules)\b/i);
});
