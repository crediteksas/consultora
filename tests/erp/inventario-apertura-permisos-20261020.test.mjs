import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=fs.readFileSync('supabase/migrations/20261020225143_kora_auditoria_control_apertura_y_permisos.sql','utf8');
const user=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('migración aislada: apertura restringida y conteo ciego con perfil activo/asignación',async()=>{
  const db=await PGlite.create();
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth; create schema inventario_control;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table perfiles(id uuid primary key,rol text,activo boolean);
      create table inventario_control.responsables(perfil_id uuid primary key references perfiles);
      create table sesiones_conteo_cruzado(id uuid primary key default gen_random_uuid(),admin_autorizado uuid,estado text default 'abierta',vigencia_hasta timestamptz);
      create table conteos_bloque(id uuid primary key default gen_random_uuid(),sesion_id uuid references sesiones_conteo_cruzado,estado text default 'pendiente',esperado integer default 10,intentos_conteo integer default 0,contado integer,cerrado_por uuid,cerrado_en timestamptz);
      create function es_central() returns boolean language sql as $$select coalesce((select activo and rol in ('gerencia','auditoria') from perfiles where id=auth.uid()),false)$$;
      -- Doble de la API: conserva el punto de inserción exacto, sin existencias.
      create function inventario_control.api(p_accion text,p_datos jsonb) returns jsonb language plpgsql as $$
      declare v_autoriza boolean; begin
        select exists(select 1 from perfiles p join inventario_control.responsables r on r.perfil_id=p.id where p.id=auth.uid() and p.activo and p.rol in ('gerencia','auditoria')) into v_autoriza;
 if p_accion='crear' then
          return jsonb_build_object('creado',true);
        end if;
        return jsonb_build_object('accion',p_accion);
      end$$;
      create function abrir_sesion_conteo_cruzado(p_tienda_auditada text,p_admin_autorizado uuid,p_horas_vigencia integer default 4) returns uuid language plpgsql as $$begin
        if not es_central() then raise exception 'Solo gerencia o auditoría pueden abrir sesiones de conteo cruzado'; end if;
        return gen_random_uuid();end$$;
      insert into perfiles values ('${user(1)}','gerencia',true),('${user(2)}','auditoria',true),('${user(3)}','admin_tienda',true),('${user(4)}','admin_tienda',true),('${user(5)}','asesor',true),('${user(6)}','gerencia',false),('${user(7)}',null,true);
      insert into perfiles values ('${user(9)}','auditoria',true);
      insert into inventario_control.responsables values ('${user(1)}'),('${user(6)}'),('${user(9)}');
    `);
    await db.exec(sql);await db.exec(sql);
    const asUser=async n=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user(n)]);
    const api=async action=>(await db.query('select inventario_control.api($1,$2) result',[action,{}])).rows[0].result;
    for(const n of [2,3,4,5,6,7,8]){
      await asUser(n);
      await assert.rejects(api('crear'),/Solo Mayte u Óscar/);
      await assert.rejects(db.query("select abrir_sesion_conteo_cruzado('A',$1,4)",[user(3)]),/Solo Mayte u Óscar/);
    }
    for(const n of [1,9]){
      await asUser(n);assert.equal((await api('crear')).creado,true);
      assert.ok((await db.query("select abrir_sesion_conteo_cruzado('A',$1,4) id",[user(3)])).rows[0].id);
    }
    await asUser(3);assert.equal((await api('subir')).accion,'subir');
    const makeBlock=async(expired=false)=>{
      const s=(await db.query("insert into sesiones_conteo_cruzado(admin_autorizado,estado,vigencia_hasta) values($1,'abierta',clock_timestamp()+$2::interval) returning id",[user(3),expired?'-1 hour':'1 hour'])).rows[0].id;
      return (await db.query('insert into conteos_bloque(sesion_id) values($1) returning id',[s])).rows[0].id;
    };
    const block=await makeBlock();
    const count=async(value,id=block)=>(await db.query('select registrar_conteo_bloque($1,$2) result',[id,value])).rows[0].result;
    for(const n of [4,5,6,7,8]) {await asUser(n);await assert.rejects(count(10),/autorizado|perfil activo/);}
    assert.equal((await db.query('select intentos_conteo from conteos_bloque where id=$1',[block])).rows[0].intentos_conteo,0);
    await asUser(3);
    await assert.rejects(count(null),/no negativo/);await assert.rejects(count(-1),/no negativo/);
    assert.equal((await count(9)).estado,'no_cuadra_1');assert.equal((await count(8)).estado,'escalado_mayte');
    await assert.rejects(count(10),/cerrado o escalado/);
    const correct=await makeBlock();assert.equal((await count(10,correct)).estado,'cerrado_ok');
    await assert.rejects(count(10,correct),/cerrado o escalado/);
    const expired=await makeBlock(true);await assert.rejects(count(10,expired),/cerrada o expirada/);
    assert.equal((await db.query("select has_function_privilege('anon','registrar_conteo_bloque(uuid,integer)','EXECUTE') allowed")).rows[0].allowed,false);
    assert.equal((await db.query("select has_function_privilege('authenticated','registrar_conteo_bloque(uuid,integer)','EXECUTE') allowed")).rows[0].allowed,true);
  } finally {await db.close();}
});
