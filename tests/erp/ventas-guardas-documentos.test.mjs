import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const original = readFileSync(new URL('../../supabase/migrations/20260903204915_proteger_ventas_y_anulacion_administrativa.sql', import.meta.url), 'utf8');
const guardas = readFileSync(new URL('../../supabase/migrations/20260919222329_ventas_ajustes_guardas_documentos.sql', import.meta.url), 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const venta = id(10), credito = id(20), unidad = id(30), producto = id(40);
const motivo = 'Corrección solicitada por gerencia';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('app.uid',true),'')::uuid
    $$;
    create table perfiles(id uuid primary key, rol text, activo boolean);
    insert into perfiles values
      ('${id(1)}','gerencia',true), ('${id(2)}','auditoria',true),
      ('${id(3)}','gerencia',false), ('${id(4)}','admin_tienda',true), ('${id(5)}',null,true);
    create function rol_actual() returns text language sql stable security definer set search_path='' as $$
      select rol from public.perfiles where id=auth.uid() and activo
    $$;
    create function es_central() returns boolean language sql stable security definer set search_path='' as $$
      select coalesce(public.rol_actual() in ('gerencia','auditoria'),false)
    $$;
    create function tienda_actual() returns text language sql stable as $$ select 'CK-01'::text $$;
    create table ventas(id uuid primary key, consecutivo bigint, tienda_codigo text, vendedor uuid,
      tipo text, cliente_id uuid, total numeric, fecha date, anulada boolean, nota text);
    create table creditos(id uuid primary key, venta_id uuid references ventas,
      financiera text, cuota_inicial numeric not null default 0, valor_esperado_financiera numeric,
      valor_real_financiera numeric, contrato_ref text, plazo_meses integer,
      estado_conciliacion text not null default 'pendiente', conciliado_at timestamptz, importacion_id uuid);
    create table venta_items(id uuid primary key,venta_id uuid references ventas,producto_id uuid,
      unidad_id uuid,cantidad integer,costo_congelado numeric,precio_venta numeric);
    create table unidades(id uuid primary key,estado text);
    create table stock_cantidad(producto_id uuid,tienda_codigo text,cantidad integer,costo_promedio numeric,
      updated_at timestamptz,primary key(producto_id,tienda_codigo));
    create table movimientos(id bigint generated always as identity primary key,tipo text,tienda_codigo text,
      producto_id uuid,unidad_id uuid,cantidad integer,costo numeric,precio numeric,referencia_tipo text,
      referencia_id text,reverso_de bigint,usuario uuid,nota text,created_at timestamptz default now());
    create table audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
    create table periodos(tienda_codigo text,fecha_inicio date,fecha_fin date);
    create table liquidation_operations(id uuid primary key default gen_random_uuid(),credito_id uuid);
    create table credit_portfolio_obligations(id uuid primary key default gen_random_uuid(),credito_id uuid);
    create table importacion_detalle(id uuid primary key default gen_random_uuid(),credito_id uuid);
    insert into ventas values('${venta}',100,'CK-01','${id(1)}','credito',null,150000,'2026-09-19',false,'Original');
    insert into creditos(id,venta_id,financiera,cuota_inicial,valor_esperado_financiera,contrato_ref,plazo_meses)
      values('${credito}','${venta}','krediya',10000,140000,'C-100',12);
    insert into unidades values('${unidad}','vendido');
    insert into stock_cantidad values('${id(41)}','CK-01',3,10000,now());
    insert into venta_items values('${id(50)}','${venta}','${producto}','${unidad}',1,100000,120000),
      ('${id(51)}','${venta}','${id(41)}',null,2,10000,15000);
    insert into movimientos(tipo,tienda_codigo,producto_id,unidad_id,cantidad,costo,precio,referencia_tipo,referencia_id)
      values('venta','CK-01','${producto}','${unidad}',1,100000,120000,'venta','${venta}'),
      ('venta','CK-01','${id(41)}',null,2,10000,15000,'venta','${venta}');
    grant usage on schema public,auth to authenticated,anon;
  `);
  await db.exec(original);
  await db.exec(guardas);
  await db.exec('set role authenticated');
  await usuario(db, 1);
  return db;
}
const usuario = (db, n) => db.query("select set_config('app.uid',$1,false)", [n ? id(n) : '']);
const corregir = (db, cambios = { nota: 'Nueva nota' }) => db.query(
  'select public.corregir_venta_administrativa($1,$2,$3::jsonb) as result', [venta, motivo, JSON.stringify(cambios)]);
const anular = db => db.query('select public.anular_venta_administrativa($1,$2) as result', [venta, motivo]);
async function admin(db, sql, params = []) {
  await db.exec('reset role');
  try { return await db.query(sql, params); }
  finally { await db.exec('set role authenticated'); }
}
async function snapshot(db) {
  return (await admin(db, `select jsonb_build_object(
    'ventas',(select jsonb_agg(to_jsonb(t)) from ventas t),
    'creditos',(select jsonb_agg(to_jsonb(t)) from creditos t),
    'items',(select jsonb_agg(to_jsonb(t)) from venta_items t),
    'unidades',(select jsonb_agg(to_jsonb(t)) from unidades t),
    'stock',(select jsonb_agg(to_jsonb(t)) from stock_cantidad t),
    'movimientos',(select jsonb_agg(to_jsonb(t)) from movimientos t),
    'ajustes',(select jsonb_agg(to_jsonb(t)) from venta_ajustes_administrativos t),
    'audit',(select jsonb_agg(to_jsonb(t)) from audit_log t),
    'liquidacion',(select jsonb_agg(to_jsonb(t)) from liquidation_operations t),
    'cartera',(select jsonb_agg(to_jsonb(t)) from credit_portfolio_obligations t),
    'importacion',(select jsonb_agg(to_jsonb(t)) from importacion_detalle t)
  ) as data`)).rows[0].data;
}

test('ambos RPC rechazan sesión ausente, perfil ausente/inactivo, rol nulo y tienda sin mutar datos', async () => {
  const db = await fixture();
  try {
    const antes = await snapshot(db);
    for (const n of [null, 6, 3, 4, 5]) {
      await usuario(db, n);
      await assert.rejects(corregir(db), /Solo Gerencia o Auditoría/);
      await assert.rejects(anular(db), /Solo Gerencia o Auditoría/);
      assert.deepEqual(await snapshot(db), antes);
    }
  } finally { await db.close(); }
});

test('ambos RPC bloquean la fecha de venta dentro de un período cerrado de su tienda', async () => {
  const db = await fixture();
  try {
    for (const rango of [['2026-09-19','2026-09-30'], ['2026-09-01','2026-09-19']]) {
      await admin(db, 'insert into periodos values($1,$2,$3)', ['CK-01', ...rango]);
      const antes = await snapshot(db);
      await assert.rejects(corregir(db), /período cerrado/);
      await assert.rejects(anular(db), /período cerrado/);
      assert.deepEqual(await snapshot(db), antes);
      await admin(db, 'delete from periodos');
    }
    await admin(db, "insert into periodos values('CK-02','2026-09-01','2026-09-30'),('CK-01','2026-08-01','2026-08-31')");
    await usuario(db, 2);
    assert.equal((await corregir(db)).rows[0].result.ok, true);
  } finally { await db.close(); }
});

test('anulación rechaza conciliación, importación y valor real registrado, incluso cero, sin mutaciones', async () => {
  const db = await fixture();
  try {
    const estados = [
      "estado_conciliacion='conciliado'", "estado_conciliacion='novedad'",
      "conciliado_at=now()", `importacion_id='${id(90)}'`,
      'valor_real_financiera=0', 'valor_real_financiera=140000',
    ];
    for (const estado of estados) {
      await admin(db, `update creditos set ${estado} where id=$1`, [credito]);
      const antes = await snapshot(db);
      await assert.rejects(anular(db), /conciliación, importación, liquidación o cartera vinculada/);
      assert.deepEqual(await snapshot(db), antes);
      await admin(db, "update creditos set estado_conciliacion='pendiente',conciliado_at=null,importacion_id=null,valor_real_financiera=null where id=$1", [credito]);
    }
  } finally { await db.close(); }
});

test('anulación bloquea cada vínculo financiero por credito_id; no confunde créditos ajenos', async () => {
  const db = await fixture();
  try {
    for (const tabla of ['liquidation_operations', 'credit_portfolio_obligations', 'importacion_detalle']) {
      await admin(db, `insert into ${tabla}(credito_id) values($1),($2)`, [credito, id(99)]);
      const antes = await snapshot(db);
      await assert.rejects(anular(db), /conciliación, importación, liquidación o cartera vinculada/);
      assert.deepEqual(await snapshot(db), antes);
      await admin(db, `delete from ${tabla} where credito_id=$1`, [credito]);
    }
    assert.equal((await anular(db)).rows[0].result.ok, true);
    for (const tabla of ['liquidation_operations', 'credit_portfolio_obligations', 'importacion_detalle']) {
      assert.equal((await admin(db, `select count(*)::int n from ${tabla}`)).rows[0].n, 1);
    }
  } finally { await db.close(); }
});

test('Gerencia y Gestión conservan corrección administrativa y guardas previas sin alterar cálculos', async () => {
  const db = await fixture();
  try {
    const antes = await snapshot(db);
    await assert.rejects(corregir(db, { total: 1 }), /Productos, cantidades, precios, costos y fecha no se editan/);
    await corregir(db, { nota: 'Documento revisado', credito: { contrato_ref: 'C-101', plazo_meses: 18 } });
    await usuario(db, 2);
    await corregir(db, { nota: 'Gestión confirmó los datos' });
    const despues = await snapshot(db);
    assert.equal(despues.ventas[0].total, antes.ventas[0].total);
    assert.equal(despues.ventas[0].fecha, antes.ventas[0].fecha);
    for (const nombre of ['items', 'unidades', 'stock', 'movimientos']) assert.deepEqual(despues[nombre], antes[nombre]);
    assert.equal(despues.creditos[0].contrato_ref, 'C-101');
    assert.equal(despues.creditos[0].valor_esperado_financiera, 140000);
    assert.equal(despues.ajustes.length, 2);
    assert.equal(despues.ajustes[1].usuario_id, id(2));
  } finally { await db.close(); }
});

test('anulación permitida conserva contramovimientos, costos, auditoría y el crédito pendiente original', async () => {
  const db = await fixture();
  try {
    const antes = await snapshot(db);
    await usuario(db, 2);
    await anular(db);
    const despues = await snapshot(db);
    assert.equal(despues.ventas[0].anulada, true);
    assert.equal(despues.unidades[0].estado, 'disponible');
    assert.equal(despues.stock[0].cantidad, 5);
    assert.deepEqual(despues.creditos, antes.creditos);
    assert.deepEqual(despues.items, antes.items);
    assert.equal(despues.movimientos.length, 4);
    assert.deepEqual(despues.movimientos.slice(2).map(m => [m.costo, m.precio, m.reverso_de]), [[100000,120000,1],[10000,15000,2]]);
    assert.equal(despues.ajustes.length, 1);
    assert.equal(despues.ajustes[0].usuario_id, id(2));
    assert.equal(despues.audit[0].accion, 'ANULAR_VENTA_ADMINISTRATIVA');
    await assert.rejects(anular(db), /ya está anulada/);
    assert.deepEqual(await snapshot(db), despues);
  } finally { await db.close(); }
});

test('los RPC conservan privilegios limitados: anon no ejecuta y authenticated sigue sujeto a guardas', async () => {
  const db = await fixture();
  try {
    const rows = (await admin(db, `select proname,prosecdef,
      has_function_privilege('anon',p.oid,'execute') anon,
      has_function_privilege('authenticated',p.oid,'execute') autenticado
      from pg_proc p where proname in ('corregir_venta_administrativa','anular_venta_administrativa')`)).rows;
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.anon, false);
      assert.equal(row.autenticado, true);
      assert.equal(row.prosecdef, true);
    }
  } finally { await db.close(); }
});
