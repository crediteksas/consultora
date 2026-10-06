import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const migration=name=>readFileSync(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8');
const oscar='6de0ad26-64af-4966-8cd9-d468880af627';
const maite='d1782db6-bacc-4caf-af6f-ce1b8d1c0391';
const tienda='00000000-0000-0000-0000-000000000003';
const auditora='00000000-0000-0000-0000-000000000004';

for(const diferirFoto of [false,true])test(`foto ${diferirFoto?'como tarea no bloqueante':'previa'}, aprobación separada, gasto sin caja y ventas posteriores al corte`,async()=>{
 const db=await PGlite.create();
 try{
  await db.exec(`create role authenticated;create role anon;create schema auth;create schema storage;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.perfiles(id uuid primary key,nombre text,rol text,tienda_codigo text,activo boolean default true);
    insert into perfiles(id,nombre,rol,tienda_codigo) values
     ('${oscar}','Oscar','gerencia',null),('${maite}','Maite','auditoria',null),
     ('${tienda}','Tienda','admin_tienda','CK-01'),('${auditora}','Andrea','admin_tienda','CK-02');
    create function public.tienda_actual() returns text language sql security definer as $$select tienda_codigo from perfiles where id=auth.uid()$$;
    create table public.origenes(codigo text primary key,nombre text,tipo text,activo boolean default true);
    insert into origenes values('CK-01','Celfiao Tolú','propia',true),('CK-02','Otra tienda','propia',true);
    create table public.productos(id uuid primary key default gen_random_uuid(),codigo text unique,nombre text,tipo text);
    create table public.stock_cantidad(producto_id uuid references productos,tienda_codigo text references origenes,
      cantidad integer check(cantidad>=0),precio_tienda numeric,costo_promedio numeric,updated_at timestamptz,
      primary key(producto_id,tienda_codigo));
    create table public.unidades(id uuid primary key default gen_random_uuid(),producto_id uuid references productos,
      imei text unique,estado text constraint unidades_estado_check check(estado in
        ('en_oscar','disponible','vendido','en_traslado','garantia_proveedor','anulado_reingreso','salida_b2b')),
      tienda_actual text references origenes,precio_tienda numeric check(precio_tienda>0),costo_remision numeric);
    create table public.movimientos(id bigint generated always as identity primary key,tipo text check(tipo in ('ajuste_entrada','ajuste_salida')),
      tienda_codigo text,producto_id uuid,unidad_id uuid,cantidad integer,costo numeric,costo_tienda numeric,
      referencia_tipo text,referencia_id text,usuario uuid,nota text);
    create table public.ajustes_inventario(id uuid primary key,tienda_codigo text,solicitado_por uuid,estado text,
      autorizado_por uuid,autorizado_at timestamptz,nota_rechazo text);
    create table public.sesiones_conteo_cruzado(id uuid primary key default gen_random_uuid(),tienda_auditada text,
      admin_autorizado uuid,estado text,vigencia_hasta timestamptz);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$select regexp_split_to_array(regexp_replace(name,'/[^/]+$',''),'/')$$;
    alter table storage.objects enable row level security;
    alter table public.ajustes_inventario enable row level security;
    alter table public.origenes add column inventario_control_desde timestamptz default now()-interval '1 day';
    alter table public.origenes add column inventario_control_activo boolean default true;
    create table public.ventas(id uuid,tienda_codigo text,created_at timestamptz,fecha date,total numeric,anulada boolean);
    create table public.venta_items(venta_id uuid,costo_tienda_congelado numeric,cantidad integer);
    create table public.gastos(tienda_codigo text,fecha date,created_at timestamptz,monto numeric,estado text);
    create table public.periodos(tienda_codigo text,fecha_inicio date,fecha_fin date);
    create table public.creditos(venta_id uuid,valor_real_financiera numeric,valor_esperado_financiera numeric,estado_conciliacion text,conciliado_at timestamptz);
    create function public.es_central() returns boolean language sql as $$select true$$;
    create function public.cerrar_periodo(p_tienda_codigo text,p_fecha_inicio date,p_fecha_fin date)
      returns jsonb language plpgsql as $$begin if not es_central() then raise exception 'Sin permiso'; end if; return '{}'::jsonb; end$$;
    grant usage on schema public,auth,storage to authenticated;
    grant select,insert,update,delete on public.stock_cantidad,public.unidades to authenticated;
    grant select,insert on storage.objects to authenticated;
  `);
  for(const name of ['20260915162101_inventario_conteos_auditables.sql',
    '20260915163724_inventario_conteo_referido_al_corte.sql',
    '20260915195416_inventario_comparativo_historico.sql',
    '20261005144038_retail_inventory_auditor_cut_access.sql',
    '20261005225513_salida_no_conformes_corte.sql',
    '20261005161602_retail_cierre_utilidad_por_corte.sql',
    '20261006152825_inventario_documento_ajuste_por_tienda.sql',
    '20261006165240_inventario_fotos_tarea_no_bloqueante.sql',
    '20261006211640_inventario_editar_conteo_informe_diferencias.sql'])await db.exec(migration(name));
  const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const api=async(a,d={})=>(await db.query('select public.inventario_no_conformes($1,$2::jsonb) r',[a,JSON.stringify(d)])).rows[0].r;
  const count=async(a,d={})=>(await db.query('select public.inventario_conteos($1,$2::jsonb) r',[a,JSON.stringify({base_conteo:'corte_fijo',...d})])).rows[0].r;
  const doc=async(a,d={})=>(await db.query('select public.inventario_ajuste_documento($1,$2::jsonb) r',[a,JSON.stringify(d)])).rows[0].r;
  await db.exec('reset role');
  const product=(await db.query("insert into productos(codigo,nombre,tipo) values('VID','Vidrio','cantidad') returning id")).rows[0].id;
  await db.query("insert into stock_cantidad values($1,'CK-01',10,1500,1000,now())",[product]);
  await as(tienda);
  const cut=await count('crear',{tienda:'CK-01'});
  await count('subir',{id:cut.corte.id,contado_at:cut.corte.corte_at,archivo:'acta.xlsx',sha256:'a'.repeat(64),
    filas:[{codigo:'VID',imei:'',cantidad:7}]});
  await as(maite);
  const correction=(await db.query("select public.inventario_conteo_correcciones('guardar',$1::jsonb) r",[JSON.stringify({
    id:cut.corte.id,conteo_version:0,motivo:'Reconteo encontró un vidrio',filas:[{codigo:'VID',imei:'',cantidad:8}]
  })])).rows[0].r;
  assert.equal(correction.stock_modificado,false);assert.equal(correction.corte.conteo_version,1);
  assert.equal(correction.lineas[0].actual,10);assert.equal(correction.lineas[0].diferencia,-2);
  await db.exec('reset role');
  await db.query("update stock_cantidad set cantidad=9 where producto_id=$1",[product]);
  await as(tienda);
  const path='CK-01/11111111-1111-4111-8111-111111111111.jpg';
  const req={tienda:'CK-01',corte_id:cut.corte.id,codigo:'VID',imei:'',cantidad:2,
    categoria_gasto:'imperfecto',foto_path:path,motivo:'Vidrio roto',soporte:'Acta y fotografía'};
  await assert.rejects(api('solicitar',req),/foto/);
  if(!diferirFoto){
    await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name,owner_id) values('inventario-no-conformes',$1,$2)",[path,tienda]);
    await as(tienda);const request=await api('solicitar',req);
    assert.equal(request.stock_modificado,false);
    await assert.rejects(api('autorizar',{id:request.id}),/Solo Mayte/);
  }
  await as(maite);
  const approval={id:cut.corte.id,base_conteo:'corte_fijo',conteo_version:1,motivo:'Imperfecto verificado',
    soporte:'Acta y fotografía',clasificacion:'no_conforme',decisiones:[{codigo:'VID',imei:'',clasificacion:'no_conforme'}]};
  await assert.rejects(doc('aplicar',{...approval,conteo_version:0}),/conteo cambió/);
  const result=await doc('aplicar',approval);
  assert.equal(result.documento.conteo_version,1);
  assert.equal(result.documento.correcciones[0].cambios[0].cantidad_anterior,7);
  assert.equal(result.lineas[0].posterior,7);
  assert.equal(result.documento.numero,'AJ-CK-01-000001');
  assert.equal(result.documento.totales.impacto_neto,-3000);
  assert.equal(result.documento.lineas[0].clasificacion,'no_conforme');
  assert.equal(result.documento.lineas[0].movimientos.length,1);
  assert.equal(result.puede_cerrar_utilidad,false);
  assert.equal((await doc('aplicar',approval)).documento.documento_id,result.documento.documento_id);
  assert.equal((await doc('ver',{id:cut.corte.id})).corte.estado,'aplicado');
  const tareas=await api('tareas_fotos');
  assert.equal(tareas.tareas.length,diferirFoto?1:0);
  assert.equal(Number((await db.query('select public.inventario_fotos_pendientes_cantidad() n')).rows[0].n),diferirFoto?1:0);
  if(diferirFoto){
    assert.equal(tareas.tareas[0].cantidad,2);
    assert.equal(tareas.tareas[0].documento_numero,'AJ-CK-01-000001');
    assert.equal(tareas.tareas[0].tienda_codigo,'CK-01');
  }
  const preview=(await db.query("select public.cierre_utilidad_retail('vista',$1,null) r",[cut.corte.id])).rows[0].r;
  assert.equal(Number(preview.utilidad_neta),-3000);
  await assert.rejects(db.query("select public.cierre_utilidad_retail('cerrar',$1,$2)",[cut.corte.id,preview.huella]),/Solo Gerencia/);
  await as(oscar);
  const closed=(await db.query("select public.cierre_utilidad_retail('cerrar',$1,$2) r",[cut.corte.id,preview.huella])).rows[0].r;
  assert.equal(closed.cerrado,true);
  assert.equal((await db.query("select public.cierre_utilidad_retail('cerrar',$1,$2) r",[cut.corte.id,preview.huella])).rows[0].r.cierre_id,closed.cierre_id);
  // Cerrar utilidad también funciona con la tarea abierta. La foto posterior no
  // cambia el documento inmutable, las existencias, el gasto ni el cierre.
  if(diferirFoto){
    const tarea=tareas.tareas[0];
    await as(auditora);
    assert.equal((await api('tareas_fotos')).tareas.length,0);
    assert.equal(Number((await db.query('select public.inventario_fotos_pendientes_cantidad() n')).rows[0].n),0);
    await assert.rejects(api('completar_foto',{id:tarea.id,foto_path:path}),/otra tienda/);
    await as(tienda);
    assert.equal((await api('tareas_fotos')).tareas.length,1);
    await assert.rejects(api('completar_foto',{id:tarea.id,foto_path:path}),/foto propia/);
    await db.exec('reset role');
    await db.query("insert into storage.objects(bucket_id,name,owner_id) values('inventario-no-conformes',$1,$2)",[path,maite]);
    await as(tienda);
    await assert.rejects(api('completar_foto',{id:tarea.id,foto_path:path}),/foto propia/);
    await db.exec('reset role');await db.query('update storage.objects set owner_id=$1 where name=$2',[tienda,path]);
    await as(tienda);
    const completed=await api('completar_foto',{id:tarea.id,foto_path:path});
    assert.equal(completed.stock_modificado,false);assert.equal(completed.evidencia_completa,true);
    assert.equal((await api('completar_foto',{id:tarea.id,foto_path:path})).stock_modificado,false);
    assert.equal((await api('tareas_fotos')).tareas.length,0);
    assert.equal(Number((await db.query('select public.inventario_fotos_pendientes_cantidad() n')).rows[0].n),0);
    await as(oscar);
    assert.deepEqual((await doc('ver',{id:cut.corte.id})).documento,result.documento);
    assert.equal((await db.query("select public.cierre_utilidad_retail('vista',$1,null) r",[cut.corte.id])).rows[0].r.cierre_id,closed.cierre_id);
    await db.exec('reset role');
    const attached=(await db.query('select foto_por,foto_at from inventario_control.no_conformes where id=$1',[tarea.id])).rows[0];
    assert.equal(attached.foto_por,tienda);assert.ok(attached.foto_at);
    await as(oscar);
  }
  await assert.rejects(api('aplicar_conteo',approval),/pendiente/);
  const expenses=(await db.query("select * from public.gastos_inventario_no_monetarios(current_date-1,current_date+1,'CK-01')")).rows;
  assert.equal(expenses.length,1);assert.equal(Number(expenses[0].valor),3000);
  assert.equal(expenses[0].categoria_gasto,diferirFoto?'producto_deteriorado':'imperfecto');
  await db.exec('reset role');
  assert.equal((await db.query("select cantidad from stock_cantidad where producto_id=$1",[product])).rows[0].cantidad,7);
  assert.equal((await db.query("select count(*)::int n from movimientos where referencia_tipo='salida_no_conforme'")).rows[0].n,1);
  await assert.rejects(db.query('update inventario_control.ajuste_documentos set numero=numero'),/inmutables/);
  await assert.rejects(db.query('delete from inventario_control.cierres_utilidad'),/inmutables/);
  const nextPath='CK-01/22222222-2222-4222-8222-222222222222.jpg';
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values('inventario-no-conformes',$1,$2)",[nextPath,tienda]);
  await as(tienda);
  const outside=await api('solicitar',{...req,corte_id:null,foto_path:nextPath,cantidad:1});
  await assert.rejects(api('autorizar',{id:outside.id}),/Solo Mayte/);
  await as(oscar);
  const approved=await api('autorizar',{id:outside.id});
  assert.equal(approved.stock_modificado,true);assert.equal(Number(approved.valor),1500);
  await assert.rejects(api('autorizar',{id:outside.id}),/ya decidida/);
  assert.equal((await db.query("select cantidad from stock_cantidad where producto_id=$1",[product])).rows[0].cantidad,6);
  const annual=await api('resumen',{anio:new Date().getUTCFullYear().toString(),tienda:'CK-01'});
  assert.equal(annual.filas.reduce((total,r)=>total+Number(r.gasto_no_monetario),0),4500);
  await as(tienda);
  assert.equal((await api('listar')).registros.length,2);
  await assert.rejects(api('resumen',{anio:new Date().getUTCFullYear().toString(),tienda:null}),/otra tienda/);
  await assert.rejects(db.query('select * from inventario_control.no_conformes'),/permission denied/);
  await as(auditora);
  await assert.rejects(api('solicitar',{...req,corte_id:null,cantidad:1}),/Solo la tienda/);
  await db.exec('reset role');
  await db.query("insert into sesiones_conteo_cruzado(tienda_auditada,admin_autorizado,estado,vigencia_hasta) values('CK-01',$1,'abierta',now()+interval '1 day')",[auditora]);
  await as(auditora);
  const delegatedPath='CK-01/33333333-3333-4333-8333-333333333333.jpg';
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values('inventario-no-conformes',$1,$2)",[delegatedPath,auditora]);
  const delegated=await api('solicitar',{...req,corte_id:null,cantidad:1,foto_path:delegatedPath});
  assert.equal(delegated.stock_modificado,false);
  assert.equal((await api('listar')).registros.length,3);
  assert.equal((await api('resumen',{anio:new Date().getUTCFullYear().toString(),tienda:'CK-01'})).filas.length,diferirFoto?2:1);
  await db.exec('reset role');
  await db.query("update sesiones_conteo_cruzado set vigencia_hasta=now()-interval '1 day' where admin_autorizado=$1",[auditora]);
  await as(auditora);
  await assert.rejects(api('solicitar',{...req,corte_id:null,cantidad:1,foto_path:delegatedPath}),/Solo la tienda/);
  await assert.rejects(api('resumen',{anio:new Date().getUTCFullYear().toString(),tienda:'CK-01'}),/otra tienda/);
  await assert.rejects(doc('ver',{id:cut.corte.id}),/otra tienda/);
  // Cada tienda tiene su consecutivo; una aplicación fallida no consume número.
  await db.exec('reset role');
  await db.query("insert into stock_cantidad values($1,'CK-02',5,1500,1000,now())",[product]);
  await as(oscar);
  const second=await count('crear',{tienda:'CK-02'});
  await count('subir',{id:second.corte.id,contado_at:second.corte.corte_at,archivo:'conteo.xlsx',sha256:'b'.repeat(64),filas:[{codigo:'VID',imei:'',cantidad:4}]});
  const payload={...approval,id:second.corte.id,conteo_version:0,clasificacion:'faltante',decisiones:[{codigo:'VID',imei:'',clasificacion:'faltante'}]};
  await assert.rejects(doc('aplicar',{...payload,decisiones:[]}),/Faltan decisiones/);
  assert.equal((await doc('aplicar',payload)).documento.numero,'AJ-CK-02-000001');
  const third=await count('crear',{tienda:'CK-02'});
  await count('subir',{id:third.corte.id,contado_at:third.corte.corte_at,archivo:'conteo.xlsx',sha256:'c'.repeat(64),filas:[{codigo:'VID',imei:'',cantidad:3}]});
  // Fallo al documentar revierte también existencias, decisiones y consecutivo.
  await db.exec('reset role');
  await db.exec(`create function public.omitir_movimiento_prueba() returns trigger language plpgsql as $$begin return null; end$$;
    create trigger omitir_movimiento_prueba before insert on public.movimientos for each row execute function public.omitir_movimiento_prueba();`);
  await as(oscar);
  const thirdPayload={...payload,id:third.corte.id,...(diferirFoto?{clasificacion:'no_conforme',decisiones:[{codigo:'VID',imei:'',clasificacion:'no_conforme'}]}:{})};
  await assert.rejects(doc('aplicar',thirdPayload),/Falta vincular/);
  assert.equal((await count('ver',{id:third.corte.id})).corte.estado,'pendiente');
  assert.equal((await count('ver',{id:third.corte.id})).lineas[0].actual,4);
  await db.exec('reset role');await db.exec('drop trigger omitir_movimiento_prueba on public.movimientos');
  assert.equal((await db.query('select count(*)::int n from inventario_control.no_conformes where corte_id=$1',[third.corte.id])).rows[0].n,0,'Un fallo revierte también la tarea de foto');
  assert.equal((await db.query("select ultimo::int n from inventario_control.ajuste_consecutivos where tienda_codigo='CK-02'")).rows[0].n,1);
  await as(oscar);
  assert.equal((await doc('aplicar',thirdPayload)).documento.numero,'AJ-CK-02-000002');
  if(diferirFoto){
    assert.equal((await api('tareas_fotos')).tareas.length,1);
    await db.exec('reset role');await db.query('update perfiles set activo=false where id=$1',[auditora]);
    await as(auditora);
    await assert.rejects(api('tareas_fotos'),/perfil activo/);
    assert.equal(Number((await db.query('select public.inventario_fotos_pendientes_cantidad() n')).rows[0].n),0);
    await as(oscar);
  }
  const fourth=await count('crear',{tienda:'CK-02'});
  await count('subir',{id:fourth.corte.id,contado_at:fourth.corte.corte_at,archivo:'conteo.xlsx',sha256:'d'.repeat(64),filas:[{codigo:'VID',imei:'',cantidad:3}]});
  const clean=await doc('aplicar',{...payload,id:fourth.corte.id,clasificacion:'correccion_registro',decisiones:[]});
  assert.equal(clean.documento.numero,'AJ-CK-02-000003');
  assert.equal(clean.documento.lineas.length,0);
  assert.equal(clean.documento.totales.impacto_neto,0);
  await as(tienda);
  assert.equal((await doc('ver',{id:cut.corte.id})).documento.numero,'AJ-CK-01-000001');
  await assert.rejects(doc('aplicar',approval),/Solo Mayte/);
  await assert.rejects(db.query('select * from inventario_control.ajuste_documentos'),/permission denied/);
 } finally {await db.close();}
});
