import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('búsqueda de las cinco funciones queda fija y no acepta una tabla temporal homónima',async()=>{
  const db=await PGlite.create();
  try{
    await db.exec(`create table public.productos(nombre text);insert into public.productos values ('Público ficticio');
      create temp table productos(nombre text);insert into pg_temp.productos values ('Temporal no confiable');
      create function public.bloquear_costo_promedio_tienda_historial() returns trigger language plpgsql as $$begin raise exception 'Inmutable';end$$;
      create function public.bloquear_mutacion_movimientos() returns trigger language plpgsql as $$begin raise exception 'Inmutable';end$$;
      create function public.normalizar_categoria(txt text) returns text language sql immutable as $$select lower(trim(txt))$$;
      create function public.registrar_compra_proveedor(uuid,text,date,jsonb,text,text) returns text language sql security definer as $$select nombre from productos limit 1$$;
      create function public.trg_normalizar_categoria_producto() returns trigger language plpgsql as $$begin new.nombre:=normalizar_categoria(new.nombre);return new;end$$;`);
    const sql=fs.readFileSync('supabase/migrations/20261020231231_kora_auditoria_busqueda_funciones.sql','utf8');
    await db.exec(sql);await db.exec(sql);
    const paths=(await db.query("select proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")).rows;
    assert.equal(paths.length,5);for(const row of paths)assert.deepEqual(row.proconfig,['search_path=public, pg_temp']);
    assert.equal((await db.query("select registrar_compra_proveedor(null,null,null,null,null,null) value")).rows[0].value,'Público ficticio');
    assert.equal((await db.query("select normalizar_categoria('  ACCESORIOS ') value")).rows[0].value,'accesorios');
    assert.doesNotMatch(sql,/\b(?:insert|update|delete|drop)\s/i);
  }finally{await db.close();}
});
