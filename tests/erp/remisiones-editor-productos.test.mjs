import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../../creditek/erp/remisiones.html',import.meta.url),'utf8');
test('editor carga catálogo completo y consulta referencia original directamente',()=>{
 assert.match(html,/cargarTodasLasPaginas\(\(\) => sb.from\('productos'\)/);
 assert.match(html,/select\('\*,productos\(id,codigo,nombre,categoria,tipo,foto_url,activo\)'\)/);
 assert.match(html,/productosCache.push\(it.productos\)/);
});
test('editor nunca sustituye originales ausentes y exige selección válida',()=>{
 assert.match(html,/Referencia original no disponible — no guardar/);
 assert.match(html,/selector.value = seleccionado/);
 assert.match(html,/!productosCache.some\(p => p.id === producto_id\)/);
 assert.match(html,/type="search" class="it-buscar"/);
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if(m[1].trim()) new vm.Script(m[1]);
});
test('cartera B2B permite corregir solo precios con motivo y RPC auditada',()=>{
 assert.match(html,/rem\.estado === 'cartera_b2b'/);
 assert.match(html,/>Ajustar precio<\/button>/);
 assert.match(html,/corregir_precios_remision_b2b/);
 assert.match(html,/p_precios:\s*items\.map\(item => \(\{ id: item\.id, precio_remision: item\.precio_remision \}\)\)/);
 assert.match(html,/soloLectura \|\| soloPrecio \? 'disabled'/);
 assert.match(html,/!soloLectura && !soloPrecio/);
});
