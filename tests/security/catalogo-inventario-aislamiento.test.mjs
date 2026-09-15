import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
let db;
const sql=readFileSync(new URL('../../supabase/migrations/20260915174605_catalogo_inventario_por_tienda.sql',import.meta.url),'utf8');
const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
before(async()=>{
 db=await PGlite.create();
 await db.exec(`create role authenticated;create role anon;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table perfiles(id uuid primary key,rol text,tienda_codigo text,activo boolean);
 create function public.tienda_actual() returns text language sql stable security definer set search_path='' as $$select tienda_codigo from public.perfiles where id=auth.uid() and activo$$;
 create function public.es_central() returns boolean language sql stable security definer set search_path='' as $$select coalesce((select rol in ('gerencia','auditoria') from public.perfiles where id=auth.uid() and activo),false)$$;
 create table productos(id uuid primary key,codigo text,nombre text,categoria text,tipo text,foto_url text,activo boolean);
 create table stock_cantidad(producto_id uuid,tienda_codigo text,cantidad integer,precio_tienda numeric,costo_promedio numeric);
 create table unidades(id uuid primary key,producto_id uuid,tienda_actual text,estado text,precio_tienda numeric,costo_remision numeric);
 alter table stock_cantidad enable row level security;alter table unidades enable row level security;alter table productos enable row level security;
 create policy stock on stock_cantidad for select to authenticated using (es_central() or tienda_codigo=tienda_actual());
 create policy unidades on unidades for select to authenticated using (es_central() or tienda_actual=public.tienda_actual());
 create policy productos on productos for select to authenticated using (true);
 grant usage on schema public,auth to authenticated,anon;
 grant select on productos to authenticated;
 grant select(producto_id,tienda_codigo,cantidad,precio_tienda) on stock_cantidad to authenticated;
 grant select(id,producto_id,tienda_actual,estado,precio_tienda) on unidades to authenticated;
 insert into perfiles values('${uid(99)}','gerencia',null,true),('${uid(98)}','admin_tienda',null,true),('${uid(97)}','admin_tienda','T1',false);
 insert into productos values('${uid(100)}','COMUN','Producto compartido','ACC','cantidad',null,true),('${uid(101)}','CEL','Celular','CEL','serializado',null,true),('${uid(102)}','AGOTADO','Agotado','ACC','cantidad',null,true),('${uid(103)}','VENDIDO','Vendido','CEL','serializado',null,true);
 `);
 for(let n=1;n<=10;n++){
   await db.query('insert into perfiles values($1,$2,$3,true)',[uid(n),'admin_tienda',`T${n}`]);
   await db.query('insert into productos values($1,$2,$3,$4,$5,null,true)',[uid(200+n),`EX${n}`,`Exclusivo ${n}`,'ACC','cantidad']);
   await db.query('insert into stock_cantidad values($1,$2,10,$3,500),($4,$2,1,$3,500),($5,$2,0,$3,500)',[uid(100),`T${n}`,n*1000,uid(200+n),uid(102)]);
   await db.query("insert into unidades values($1,$2,$3,'disponible',$4,500),($5,$2,$3,'disponible',$6,500),($7,$8,$3,'vendido',1000,500)",[uid(300+n),uid(101),`T${n}`,n*1000,uid(400+n),n*1000+100,uid(500+n),uid(103)]);
 }
 await db.exec(sql);
});
after(async()=>db?.close());
async function user(n){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);await db.exec('set role authenticated');}
test('diez tiendas: consulta sin filtro devuelve solo sus productos y sus costos',async()=>{
 for(let n=1;n<=10;n++){
   await user(n);const rows=(await db.query('select * from public.catalogo_tienda_lectura')).rows;
   assert.equal(rows.length,3);assert.ok(rows.every(r=>r.tienda_codigo===`T${n}`));
   assert.ok(rows.some(r=>r.codigo===`EX${n}`));assert.ok(!rows.some(r=>r.codigo==='AGOTADO'||r.codigo==='VENDIDO'));
   const shared=rows.find(r=>r.codigo==='COMUN');assert.equal(Number(shared.costo_min),n*1000);assert.equal(Number(shared.costo_max),n*1000);
   const cell=rows.find(r=>r.codigo==='CEL');assert.equal(Number(cell.costo_min),n*1000);assert.equal(Number(cell.costo_max),n*1000+100);
   assert.equal((await db.query('select * from catalogo_tienda_lectura where tienda_codigo=$1',[`T${n===10?1:n+1}`])).rows.length,0);
 }
});
test('perfil sin tienda o inactivo no recibe catálogo ni existencias',async()=>{
 for(const n of [98,97]){await user(n);assert.equal((await db.query('select * from catalogo_tienda_lectura')).rows.length,0);assert.equal((await db.query('select cantidad from stock_cantidad')).rows.length,0);}
});
test('anónimo y escrituras bloqueados; costos internos no están disponibles',async()=>{
 await user(1);await assert.rejects(db.query('select costo_promedio from stock_cantidad'),/permission denied/);
 await assert.rejects(db.query('select costo_remision from unidades'),/permission denied/);
 await assert.rejects(db.query("delete from catalogo_tienda_lectura"),/permission denied|cannot delete/);
 const cols=(await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='catalogo_tienda_lectura'")).rows.map(r=>r.column_name);
 assert.ok(!cols.some(c=>/costo_promedio|costo_remision|precio_guia/.test(c)));
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from catalogo_tienda_lectura'),/permission denied/);
});
test('administración conserva catálogo maestro y la vista no usa privilegios del creador',async()=>{
 await user(99);assert.equal((await db.query('select count(*)::int n from productos')).rows[0].n,14);
 assert.equal((await db.query('select * from catalogo_tienda_lectura')).rows.length,0);
 await db.exec('reset role');const opts=(await db.query("select reloptions from pg_class where oid='catalogo_tienda_lectura'::regclass")).rows[0].reloptions;
 assert.ok(opts.includes('security_invoker=true'));assert.ok(opts.includes('security_barrier=true'));
});
