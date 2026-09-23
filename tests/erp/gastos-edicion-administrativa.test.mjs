import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const base = readFileSync('supabase/migrations/20260912221445_gastos_devolver_corregir.sql', 'utf8');
const edit = readFileSync('supabase/migrations/20260923215650_editar_gasto_administrativo.sql', 'utf8');

test('edición administrativa conserva identidad, motivo e historial y exige nueva aprobación', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
      create table perfiles(id uuid primary key, activo boolean, rol text, tienda_codigo text);
      insert into perfiles values('${id(1)}',true,'auditoria',null),('${id(2)}',true,'admin_tienda','A');
      create table conceptos_gasto(id uuid primary key, activo boolean);
      insert into conceptos_gasto values('${id(9)}',true);
      create table periodos(tienda_codigo text, fecha_inicio date, fecha_fin date);
      create table gastos(id uuid primary key, tienda_codigo text, fecha date, concepto_id uuid,
        monto numeric, descripcion text, estado text, registrado_por uuid, aprobado_por uuid,
        aprobado_at timestamptz, nota_rechazo text);
      insert into gastos values('${id(8)}','A','2026-09-12','${id(9)}',100,'original','aprobado','${id(2)}','${id(1)}',now(),null);
      alter table gastos enable row level security;
      create policy visible on gastos for select to authenticated using(true);
      grant usage on schema public,auth to authenticated;
      grant select on perfiles,gastos to authenticated;`);
    await db.exec(base);
    await db.exec(edit);
    await db.exec('set role authenticated');
    const user = n => db.query("select set_config('app.uid',$1,false)", [n ? id(n) : '']);
    const args = { fecha: '2026-09-12', concepto_id: id(9), monto: 80, descripcion: 'corregido', motivo: 'El soporte indica otro valor' };
    const call = (revision, datos = args) => db.query('select * from public.editar_gasto_administrativo($1,$2,$3)', [id(8), revision, JSON.stringify(datos)]);
    await user(2);
    await assert.rejects(call(0), /Solo gerencia/);
    await user(1);
    await assert.rejects(call(0, { ...args, motivo: '' }), /motivo/);
    await call(0);
    const row = (await db.query('select * from gastos')).rows[0];
    assert.equal(row.id, id(8));
    assert.equal(row.registrado_por, id(2));
    assert.equal(row.estado, 'registrado');
    assert.equal(row.aprobado_por, null);
    assert.equal(row.motivo_correccion_administrativa, args.motivo);
    assert.equal(row.revision, 1);
    assert.equal((await db.query('select * from gastos_historial')).rows.length, 1);
    await assert.rejects(call(0), /cambió/);
    await db.exec("reset role; insert into periodos values('A','2026-09-01','2026-09-30'); set role authenticated;");
    await assert.rejects(call(1), /período cerrado/);
  } finally { await db.close(); }
});

test('el gasto encontrado ofrece edición concreta a gestión y pide motivo', () => {
  const html = readFileSync('creditek/erp/gastos.html', 'utf8');
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if (match[1].trim()) new vm.Script(match[1]);
  assert.match(html, /abrirEdicionAdministrativa\(data\.id\)/);
  assert.match(html, /data-editar-gasto/);
  assert.match(html, /gastoMotivoEdicion/);
  assert.match(html, /sb\.rpc\('editar_gasto_administrativo'/);
});
