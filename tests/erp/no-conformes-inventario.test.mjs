import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const migration=name=>readFileSync(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8');
const oscar='6de0ad26-64af-4966-8cd9-d468880af627';
const maite='d1782db6-bacc-4caf-af6f-ce1b8d1c0391';
const tienda='00000000-0000-0000-0000-000000000003';
const auditora='00000000-0000-0000-0000-000000000004';

test('foto obligatoria, aprobación separada, gasto sin caja y ventas posteriores al corte',async()=>{
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
    grant usage on schema public,auth,storage to authenticated;
    grant select,insert,update,delete on public.stock_cantidad,public.unidades to authenticated;
    grant select,insert on storage.objects to authenticated;
  `);
  for(const name of ['20260915162101_inventario_conteos_auditables.sql',
    '20260915163724_inventario_conteo_referido_al_corte.sql',
    '20260915195416_inventario_comparativo_historico.sql',
    '20261005144038_retail_inventory_auditor_cut_access.sql',
    '20261005225513_salida_no_conformes_corte.sql'])await db.exec(migration(name));
  const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const api=async(a,d={})=>(await db.query('select public.inventario_no_conformes($1,$2::jsonb) r',[a,JSON.stringify(d)])).rows[0].r;
  const count=async(a,d={})=>(await db.query('select public.inventario_conteos($1,$2::jsonb) r',[a,JSON.stringify({base_conteo:'corte_fijo',...d})])).rows[0].r;
  await db.exec('reset role');
  const product=(await db.query("insert into productos(codigo,nombre,tipo) values('VID','Vidrio','cantidad') returning id")).rows[0].id;
  await db.query("insert into stock_cantidad values($1,'CK-01',10,1500,1000,now())",[product]);
  await as(tienda);
  const cut=await count('crear',{tienda:'CK-01'});
  await count('subir',{id:cut.corte.id,contado_at:cut.corte.corte_at,archivo:'acta.xlsx',sha256:'a'.repeat(64),
    filas:[{codigo:'VID',imei:'',cantidad:8}]});
  await db.exec('reset role');
  await db.query("update stock_cantidad set cantidad=9 where producto_id=$1",[product]);
  await as(tienda);
  const path='CK-01/11111111-1111-4111-8111-111111111111.jpg';
  const req={tienda:'CK-01',corte_id:cut.corte.id,codigo:'VID',imei:'',cantidad:2,
    categoria_gasto:'imperfecto',foto_path:path,motivo:'Vidrio roto',soporte:'Acta y fotografía'};
  await assert.rejects(api('solicitar',req),/foto/);
  await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name,owner_id) values('inventario-no-conformes',$1,$2)",[path,tienda]);
  await as(tienda);const request=await api('solicitar',req);
  assert.equal(request.stock_modificado,false);
  await assert.rejects(api('autorizar',{id:request.id}),/Solo Mayte/);
  await as(maite);
  const approval={id:cut.corte.id,base_conteo:'corte_fijo',motivo:'Imperfecto verificado',
    soporte:'Acta y fotografía',clasificacion:'no_conforme',decisiones:[{codigo:'VID',imei:'',clasificacion:'no_conforme'}]};
  const result=await api('aplicar_conteo',approval);
  assert.equal(result.lineas[0].posterior,7);
  await assert.rejects(api('aplicar_conteo',approval),/pendiente/);
  const expenses=(await db.query("select * from public.gastos_inventario_no_monetarios(current_date-1,current_date+1,'CK-01')")).rows;
  assert.equal(expenses.length,1);assert.equal(Number(expenses[0].valor),3000);
  assert.equal(expenses[0].categoria_gasto,'imperfecto');
  await db.exec('reset role');
  assert.equal((await db.query("select cantidad from stock_cantidad where producto_id=$1",[product])).rows[0].cantidad,7);
  assert.equal((await db.query("select count(*)::int n from movimientos where referencia_tipo='salida_no_conforme'")).rows[0].n,1);
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
  assert.equal(Number(annual.filas[0].gasto_no_monetario),4500);
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
  assert.equal((await api('resumen',{anio:new Date().getUTCFullYear().toString(),tienda:'CK-01'})).filas.length,1);
  await db.exec('reset role');
  await db.query("update sesiones_conteo_cruzado set vigencia_hasta=now()-interval '1 day' where admin_autorizado=$1",[auditora]);
  await as(auditora);
  await assert.rejects(api('solicitar',{...req,corte_id:null,cantidad:1,foto_path:delegatedPath}),/Solo la tienda/);
  await assert.rejects(api('resumen',{anio:new Date().getUTCFullYear().toString(),tienda:'CK-01'}),/otra tienda/);
 } finally {await db.close();}
});
