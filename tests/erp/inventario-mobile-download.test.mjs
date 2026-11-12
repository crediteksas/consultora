import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('enlace de inventario permanece disponible para un segundo gesto y libera URLs al cerrar o reemplazar',()=>{
 const elements=new Map(),clicks=[],revoked=[];
 function element(tag){return {tag,children:[],style:{},setAttribute(){},append(...nodes){this.children.push(...nodes);},appendChild(node){this.children.push(node);node.connected=true;if(node.id)elements.set(node.id,node);},replaceChildren(){this.children=[];},remove(){elements.delete(this.id);},click(){clicks.push(this);}};}
 const document={body:element('body'),createElement:element,getElementById:id=>elements.get(id),dispatchEvent(){}};
 let sequence=0;
 const context=vm.createContext({window:{addEventListener(){},removeEventListener(){}},document,CustomEvent:function(){},Blob,URL:{createObjectURL:()=>`blob:test-${++sequence}`,revokeObjectURL:url=>revoked.push(url)}});
 const source=readFileSync('creditek/erp/kora-report-export.js','utf8').replace('window.KoraReportExport={mount,','window.KoraReportExport={downloadWorkbook,mount,');
 vm.runInContext(source,context);
 const save=context.window.KoraReportExport.downloadWorkbook;
 save(new Uint8Array([1]),{title:'Inventario prueba',id:'TEST-1'});
 assert.equal(clicks.length,0);
 const panel=elements.get('koraReportDownload');
 assert.ok(panel.connected);
 panel.children[1].click();
 assert.equal(panel.children[1],clicks[0]);
 assert.equal(clicks[0].download,'inventario-prueba-detallado-TEST-1.xlsx');
 assert.deepEqual(revoked,[]);
 save(new Uint8Array([2]),{title:'Inventario prueba',id:'TEST-2'});
 assert.equal(elements.size,1);
 assert.deepEqual(revoked,['blob:test-1']);
 elements.get('koraReportDownload').children[2].onclick();
 assert.deepEqual(revoked,['blob:test-1','blob:test-2']);
 assert.equal(elements.size,0);
});
