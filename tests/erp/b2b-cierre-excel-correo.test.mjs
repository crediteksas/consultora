import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unzipSync,strFromU8} from 'fflate';
import XLSX from 'xlsx';
import {buildClosureWorkbook,closureWorkbookModel,setWorksheetDimension,XLSX_TYPE} from '../../supabase/functions/b2b-pedido-mail/workbook.mjs';
import {buildRaw,deliver,RECIPIENTS} from '../../supabase/functions/b2b-pedido-mail/core.mjs';
const fixture=()=>({tipo:'cierre',id:'synthetic-closure',numero:'CIE-000099',tienda:'Consolidado de tiendas',fecha:'2026-10-16T15:43:40Z',pedidos:2,items:[
 {item_id:'i1',pedido_id:'p1',numero:'PED-001',producto_id:'a',proveedor:'Proveedor Alfa',ciudad:'Ciudad Uno',tienda:'Tienda A',referencia:'Equipo A',cantidad:2,costo:100.25,precio:130.25},
 {item_id:'i2',pedido_id:'p2',numero:'PED-002',producto_id:'a',proveedor:'Proveedor Alfa',ciudad:'Ciudad Uno',tienda:'Tienda B',referencia:'Equipo A',cantidad:3,costo:100.25,precio:130.25},
 {item_id:'i3',pedido_id:'p2',numero:'PED-002',producto_id:'a',proveedor:'Proveedor Alfa',ciudad:'Ciudad Uno',tienda:'Tienda B',referencia:'Equipo A',cantidad:1,costo:101.25,precio:140.25},
 {item_id:'i4',pedido_id:'p1',numero:'PED-001',producto_id:'b',proveedor:'Proveedor Beta',ciudad:'Ciudad Dos',tienda:'Tienda A',referencia:'Accesorio B',cantidad:2,costo:15,precio:20}
]});
test('Excel real: tres hojas, logo, números, fórmulas, totales y copia del corte intacta',()=>{
 const r=fixture(),before=JSON.stringify(r),file=buildClosureWorkbook(r),book=XLSX.read(file.bytes,{type:'array'});
 assert.equal(file.mimeType,XLSX_TYPE);assert.equal(file.filename,'KORA-CIE-000099-pedidos-B2B.xlsx');
 assert.equal(JSON.stringify(r),before);assert.deepEqual(book.SheetNames,['Resumen','Compra por ciudad','Detalle tiendas']);
 const model=file.model;assert.deepEqual([model.pedidos,model.unidades,model.costo,model.retail],[2,8,632.5,831.5]);
 const buying=book.Sheets['Compra por ciudad'];assert.equal(buying.D11.v,5);assert.equal(buying.E11.v,100.25);assert.equal(buying.F11.v,501.25);assert.equal(buying.F11.f,'D11*E11');assert.equal(buying.D12.v,1);assert.equal(buying.E12.v,101.25);assert.equal(buying.F14.v,632.5);
 const summary=book.Sheets.Resumen;assert.equal(summary.B13.v,8);assert.equal(summary.C13.v,632.5);assert.equal(summary.D13.v,831.5);assert.equal(summary.E13.v,199);assert.match(summary.C11.f,/SUMIFS\('Detalle tiendas'!/);
 const detail=book.Sheets['Detalle tiendas'];assert.equal(detail.I15.v,632.5);assert.equal(detail.J15.v,831.5);assert.equal(detail.I11.f,'F11*G11');assert.equal(detail.I14.f,'F14*G14');assert.equal(detail.I11.t,'n');
 const zip=unzipSync(file.bytes);assert.ok(Object.keys(zip).some(x=>/xl\/media\/.+\.png$/.test(x)));assert.match(strFromU8(zip['xl/worksheets/sheet1.xml']),/CIE-000099/);assert.equal(summary.B6.v,(Date.parse(r.fecha)-5*3600000)/86400000+25569);
 for(let s=1;s<=3;s++)assert.equal((strFromU8(zip['xl/worksheets/sheet'+s+'.xml']).match(/<x:dimension\b/g)||[]).length,1);
});
test('dimensión OOXML única con y sin dimensión previa en la plantilla',()=>{
 for(const dimension of ['', '<x:dimension ref="A1:A1"/>']){
  const result=setWorksheetDimension('<x:worksheet>'+dimension+'<x:sheetViews></x:sheetViews></x:worksheet>','A1:J15');
  assert.equal((result.match(/<x:dimension\b/g)||[]).length,1);assert.match(result,/<x:dimension ref="A1:J15"\/><x:sheetViews>/);
 }
});
test('Excel no convierte texto del proveedor, ciudad, referencia o tienda en fórmula ni XML',()=>{
 const r=fixture();r.items[0].proveedor='=HYPERLINK("x")';r.items[0].referencia='<img>&" =1+1';r.items[0].tienda='@SUM(1)';r.items[0].ciudad='+Ciudad';
 const book=XLSX.read(buildClosureWorkbook(r).bytes,{type:'array'}),rows=XLSX.utils.sheet_to_json(book.Sheets['Detalle tiendas'],{header:1});
 const row=rows.find(x=>x.includes('<img>&" =1+1'));assert.ok(row);const address='D'+(rows.indexOf(row)+1);assert.equal(book.Sheets['Detalle tiendas'][address].t,'s');assert.equal(book.Sheets['Detalle tiendas'][address].f,undefined);
});
test('MIME adjunta XLSX nativo, destinatarios fijos y Message-ID nuevo para la corrección',()=>{
 const raw=Buffer.from(buildRaw(fixture()),'base64url').toString('utf8');
 assert.match(raw,/To: gestion@crediteksas.com, comercial@crediteksas.com/);assert.match(raw,/multipart\/mixed/);assert.match(raw,/Content-Disposition: attachment; filename="KORA-CIE-000099-pedidos-B2B.xlsx"/);assert.match(raw,/Message-ID: <b2b-pedido-synthetic-closure-xlsx-v1@crediteksas.com>/);assert.match(raw,/\r\n--kora-b2b-synthetic-closure-xlsx-v1--\r\n$/);
 const part=raw.split('Content-Disposition: attachment;')[1],base64=part.slice(part.indexOf('\r\n\r\n')+4).split('\r\n--')[0];const book=XLSX.read(Buffer.from(base64.replace(/\r\n/g,''),'base64'),{type:'buffer'});assert.equal(book.Sheets.Resumen.C13.v,632.5);assert.deepEqual(RECIPIENTS,['gestion@crediteksas.com','comercial@crediteksas.com']);
});
test('falla antes de OAuth si falta un importe, hay duplicados, valores fraccionarios o un cierre inválido',async()=>{
 for(const patch of [{item_id:null},{item_id:' '},{costo:null},{precio:''},{costo:' '},{cantidad:1.5},{cantidad:-1},{costo:Infinity},{referencia:''},{proveedor:''}]){
  const r=fixture();Object.assign(r.items[0],patch);assert.throws(()=>buildClosureWorkbook(r));let calls=0;const result=await deliver(r,{},async()=>{calls++;});assert.equal(result.outcome,'failed');assert.equal(calls,0);
 }
 const duplicate=fixture();duplicate.items[1].item_id='i1';assert.throws(()=>buildClosureWorkbook(duplicate),/duplicada/);
 assert.throws(()=>buildClosureWorkbook({...fixture(),numero:'CIE-1\r\nBcc: evil'}));assert.throws(()=>buildRaw({...fixture(),id:'x\r\nBcc: evil'}));assert.throws(()=>buildClosureWorkbook({...fixture(),items:Array(20001).fill(fixture().items[0])}));
});
test('envío exitoso conserva clasificación de fallos y no crea ni cierra pedidos',async()=>{
 for(const [status,expected] of [[200,'sent'],[429,'retry'],[500,'ambiguous'],[400,'failed']]){
  let n=0,raw;const result=await deliver(fixture(),{},async(url,options)=>{n++;if(n===1)return new Response(JSON.stringify({access_token:'ficticio'}));assert.match(url,/gmail.googleapis.com/);raw=JSON.parse(options.body).raw;return new Response(JSON.stringify({id:'syntheticMessage'}),{status});});
  assert.equal(result.outcome,expected);assert.ok(raw);assert.equal(n,2);
 }
 let n=0;assert.equal((await deliver(fixture(),{},async()=>{if(++n===1)return new Response(JSON.stringify({access_token:'ficticio'}));throw Error('lost response');})).outcome,'ambiguous');
 const index=readFileSync('supabase/functions/b2b-pedido-mail/index.ts','utf8');assert.match(index,/kora_claim_b2b_cierre_mail/);assert.match(index,/kora_finish_b2b_cierre_mail/);assert.doesNotMatch(index,/cerrar_periodo_pedidos_b2b|crear_orden_compra_b2b/);
});
