import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=readFileSync('supabase/migrations/20261002164207_devolucion_parcial_defectuosa_auditada.sql','utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('devolución parcial con arqueo cerrado: conserva caja, stock vendible, restantes e idempotencia',async()=>{
const db=await PGlite.create();try{
await db.exec(`create schema auth;create schema kora_private;create role anon;create role authenticated;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table perfiles(id uuid primary key,activo boolean,rol text,tienda_codigo text);
insert into perfiles values('${id(1)}',true,'gerencia',null),('${id(2)}',true,'admin_tienda','CK-05'),('${id(3)}',true,'admin_tienda','CK-06');
create table origenes(codigo text primary key);insert into origenes values('CK-05');
create table productos(id uuid primary key,tipo text);insert into productos values('${id(4)}','cantidad');
create table ventas(id uuid primary key,consecutivo bigint,tienda_codigo text,fecha date,tipo text,total numeric,anulada boolean,nota text);
insert into ventas values('${id(5)}',664,'CK-05',current_date-2,'contado',342000,false,null);
create table venta_items(id uuid primary key,venta_id uuid,cantidad int,precio_venta numeric,producto_id uuid,unidad_id uuid,costo_congelado numeric);
insert into venta_items values('${id(6)}','${id(5)}',1,80000,'${id(4)}',null,60000),('${id(7)}','${id(5)}',1,262000,'${id(4)}',null,100000);
create table stock_cantidad(producto_id uuid,tienda_codigo text,cantidad int);insert into stock_cantidad values('${id(4)}','CK-05',1);
create table movimientos(id bigserial primary key,tipo text,tienda_codigo text,producto_id uuid,unidad_id uuid,cantidad int,costo numeric,precio numeric,referencia_tipo text,referencia_id text,reverso_de bigint,usuario uuid,nota text);
create table saldo_ajustes_auditoria(id uuid primary key,referencia text,estado text,tienda_codigo text,caja_base numeric,caja_objetivo numeric,deuda_base numeric,deuda_objetivo numeric,movimiento_caja_id uuid);
insert into saldo_ajustes_auditoria values('${id(8)}','INC-64','aplicado','CK-05',246629,166629,0,0,'${id(9)}');
create table movimientos_caja_tienda(id uuid,idempotency_key uuid,tienda_codigo text,tipo text,monto numeric);
insert into movimientos_caja_tienda values('${id(9)}','${id(8)}','CK-05','ajuste_auditoria_salida',80000);
create table venta_ajustes_administrativos(id uuid default gen_random_uuid(),venta_id uuid,tipo text,motivo text,valores_anteriores jsonb,valores_nuevos jsonb,usuario_id uuid);
create table audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
create function public.caja_componentes_rango(text,date,date) returns jsonb language sql as $$select jsonb_build_object('neto',sum(v.total)-175371) from public.ventas v$$;
create function public.caja_calcular_interno(text,date) returns jsonb language sql as $$select jsonb_build_object('esperado',public.caja_componentes_rango($1,$2,$2)->'neto')$$;
create function public.obtener_cuadre_caja(text,date) returns numeric language sql as $$select sum(v.total) from public.ventas v$$;
create function public.anular_venta_administrativa(uuid,text) returns void language plpgsql as $$declare v_venta public.ventas;begin select * into v_venta from public.ventas where id=$1;
  if coalesce(v_venta.anulada,false) then raise exception 'La venta ya está anulada'; end if;
end$$;
create function public.cerrar_caja(text,date,numeric,text) returns numeric language plpgsql as $$declare v_contado_ventas numeric;begin
  select coalesce(sum(vi.precio_venta * vi.cantidad), 0) into v_contado_ventas
  from ventas v join venta_items vi on vi.venta_id = v.id;
  return v_contado_ventas;
end$$;
create function public.caja_guardar_movimiento() returns trigger language plpgsql as $$declare fila jsonb;begin
  fila:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  raise exception 'Arqueo cerrado';
end$$;
create trigger guard_venta before update of total on public.ventas for each row execute function public.caja_guardar_movimiento();
create trigger guard_item before delete on public.venta_items for each row execute function public.caja_guardar_movimiento();
select set_config('request.jwt.claim.sub','${id(1)}',false);`);
await db.exec(migration);
await db.exec(readFileSync('supabase/migrations/20261002165206_devoluciones_indices_y_caja_legacy.sql','utf8'));
const apply=()=>db.query("select public.registrar_devolucion_defectuosa('INC-64',$1,$2,current_date-1,'Producto devuelto defectuoso') r",[id(6),id(8)]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(2)]);
await assert.rejects(apply(),/Solo Gerencia/);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(1)]);
await db.exec("update saldo_ajustes_auditoria set caja_objetivo=170000");await assert.rejects(apply(),/mismo importe/);
await db.exec("update saldo_ajustes_auditoria set caja_objetivo=166629");
await assert.rejects(db.exec("update ventas set total=1"),/Arqueo cerrado/);
await assert.rejects(db.exec("update ventas set efectivo_devuelto_registrado=80000"),/requiere una devolución/);
const result=(await apply()).rows[0].r;
assert.equal(result.total_venta,262000);assert.equal(result.caja,166629);assert.equal(result.cantidad_defectuosa,1);
assert.equal((await apply()).rows[0].r.ya_aplicada,true);
assert.equal((await db.query('select count(*)::int n from movimientos_caja_tienda')).rows[0].n,1);
assert.equal((await db.query('select cantidad from stock_cantidad')).rows[0].cantidad,1);
assert.equal((await db.query('select count(*)::int n from venta_items')).rows[0].n,1);
assert.equal((await db.query("select cantidad from venta_devoluciones where estado_producto='defectuoso_en_tienda'")).rows[0].cantidad,1);
assert.equal((await db.query('select count(*)::int n from movimientos')).rows[0].n,1);
assert.equal((await db.query('select public.obtener_cuadre_caja(null,null) n')).rows[0].n,'342000.00');
await assert.rejects(db.query('select public.anular_venta_administrativa($1,$2)',[id(5),'test valid reason']),/devolución parcial/);
await db.exec('grant usage on schema auth to authenticated;grant select on perfiles to authenticated;set role authenticated');
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(2)]);
assert.equal((await db.query('select id,cantidad from venta_devoluciones')).rows.length,1);
await assert.rejects(db.query('select item_anterior from venta_devoluciones'),/permission denied/);
await assert.rejects(db.query("update venta_devoluciones set cantidad=2"),/permission denied/);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(3)]);
assert.equal((await db.query('select id,cantidad from venta_devoluciones')).rows.length,0);
}finally{await db.close();}});

import vm from 'node:vm';
test('inventario muestra defectuosos separados, filtrados por tienda y con texto escapado',()=>{
 const html=readFileSync('creditek/erp/inventario.html','utf8');
 const fn=html.slice(html.indexOf('function renderDefectuosos()'),html.indexOf('async function cargarTodo()'));
 const panel={hidden:true,innerHTML:'',textContent:''};
 const context=vm.createContext({document:{getElementById:()=>panel},defectuososCache:[
  {tienda_codigo:'CK-05',producto_id:'k9',cantidad:1,fecha_devolucion:'2026-10-01',referencia:'INC-64'},
  {tienda_codigo:'CK-06',producto_id:'k9',cantidad:4,referencia:'OTRA-TIENDA'}],defectuososError:'',
  tiendaActiva:()=> 'CK-05',esCentral:()=>false,currentPerfil:{tienda_codigo:'CK-05'},productosCache:[{id:'k9',nombre:'K9 <defectuoso>'}],tiendasCache:[{codigo:'CK-05',nombre:'Chinucell'}],escapeHtml:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;')});
 vm.runInContext(fn+';renderDefectuosos();',context);
 assert.equal(panel.hidden,false);assert.match(panel.innerHTML,/INC-64/);assert.match(panel.innerHTML,/K9 &lt;defectuoso&gt;/);assert.doesNotMatch(panel.innerHTML,/OTRA-TIENDA/);
 context.defectuososError='Error de carga';vm.runInContext('renderDefectuosos()',context);assert.equal(panel.textContent,'Error de carga');
});
