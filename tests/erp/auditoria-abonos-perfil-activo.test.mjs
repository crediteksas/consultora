import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('abonos: null, perfil ausente/inactivo y tienda no atraviesan el control; gerencia y auditoría sí', async () => {
 const db = await PGlite.create();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create table perfiles(id uuid,rol text,activo boolean);
   create function public.verificar_abono_y_aplicar_v2(uuid,uuid,boolean) returns jsonb language plpgsql security definer as $fn$
   declare v_rol text; begin
    select p.rol into v_rol from public.perfiles p where p.id=auth.uid() and p.activo=true;
    if v_rol not in ('gerencia', 'auditoria') then raise exception 'No autorizado'; end if;
    return '{"authorized":true}'::jsonb;
   end $fn$;`);
  const sql = await readFile(new URL('../../supabase/migrations/20260908145755_auditoria_abonos_perfil_activo.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql);
  const call = () => db.query('select public.verificar_abono_y_aplicar_v2(null,null,false) result');
  await assert.rejects(call(), /No autorizado/);
  await db.exec("select set_config('test.uid','00000000-0000-4000-8000-000000000001',false)");
  await assert.rejects(call(), /No autorizado/);
  await db.exec("insert into perfiles values ('00000000-0000-4000-8000-000000000001','gerencia',false)");
  await assert.rejects(call(), /No autorizado/);
  await db.exec("update perfiles set activo=true,rol='admin_tienda'");
  await assert.rejects(call(), /No autorizado/);
  for (const rol of ['gerencia','auditoria']) {
   await db.query('update perfiles set rol=$1',[rol]);
   assert.equal((await call()).rows[0].result.authorized,true);
  }
  assert.equal((await db.query("select has_function_privilege('anon','public.verificar_abono_y_aplicar_v2(uuid,uuid,boolean)','EXECUTE') allowed")).rows[0].allowed,false);
 } finally { await db.close(); }
});
