import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration1 = await readFile(new URL('../../supabase/migrations/20260922193359_addi_venta_cobro_estimado.sql', import.meta.url), 'utf8');
const migration2 = await readFile(new URL('../../supabase/migrations/20260922234405_addi_cobros_nombre_tienda.sql', import.meta.url), 'utf8');
const migration3 = await readFile(new URL('../../supabase/migrations/20260923002629_addi_politica_liquidacion_detalle.sql', import.meta.url), 'utf8');
const auditor = '00000000-0000-4000-8000-000000000001';
const gerente = '00000000-0000-4000-8000-000000000002';
const rows = [
  [37, 'CK-02', '2026-09-02', 233000, 233000, 0, 258800, 235702.10, 196688, 39014.10],
  [163, 'CK-02', '2026-09-15', 523260, 491860, 31400, 550000, 500912.50, 386600, 114312.50],
  [212, 'CK-07', '2026-09-16', 739500, 600000, 139500, 600000, 546450, 316500, 229950],
  [286, 'CK-03', '2026-09-19', 703800, 703800, 0, 782000, 712206.50, 594320, 117886.50],
];

test('Addi conserva la base KORA y liquida la base reportada con IVA, tienda y utilidad', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema cobros_private;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.perfiles(id uuid primary key,rol text not null,activo boolean not null default true);
      create table public.origenes(codigo text primary key,nombre text not null,ciudad text,activo boolean default true,tipo text);
      insert into public.origenes(codigo,nombre,ciudad,tipo) values
        ('CK-02','Móvil Shopping','Corozal','propia'),
        ('CK-07','Sonivox','Chinú','propia'),
        ('CK-03','Celfiao','Corozal','propia');
      insert into public.perfiles(id,rol) values ('${auditor}','auditoria'),('${gerente}','gerencia');
      create function cobros_private.autorizado(p_escritura boolean default false)
        returns boolean language sql stable as $$
        select exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo
          and (p.rol='gerencia' or (not p_escritura and p.rol='auditoria')))
        $$;
      create function cobros_private.evento(text,uuid,jsonb) returns void language plpgsql as $$begin end$$;
      create table public.ventas(id uuid primary key,tienda_codigo text,fecha date,tipo text,total numeric,
        anulada boolean default false,consecutivo bigint,vendedor uuid references public.perfiles(id));
      create table public.creditos(id uuid primary key default gen_random_uuid(),venta_id uuid references public.ventas(id),
        financiera text,valor_esperado_financiera numeric,cuota_inicial numeric);
      create table public.cobros_expected(id uuid primary key default gen_random_uuid(),plataforma text,corte date,
        fecha_esperada date,concepto text,importe numeric,soporte text,fuente_tipo text
        constraint cobros_expected_fuente_tipo_check check(fuente_tipo='neto_confirmado'),
        estado text default 'activo',idempotency_key uuid unique,created_by uuid references public.perfiles(id));
      create table public.cobros_allocations(id uuid primary key default gen_random_uuid(),expected_id uuid,
        estado text default 'activo');
      create table public.audit_log(id bigint generated always as identity,usuario uuid,accion text,
        tabla text,registro_id uuid,detalle jsonb);
    `);
    for (let i = 0; i < rows.length; i++) {
      const [number, store, date, total, credit, initial] = rows[i];
      const id = `00000000-0000-4000-8000-${String(101 + i).padStart(12, '0')}`;
      await db.query('insert into public.ventas(id,tienda_codigo,fecha,tipo,total,consecutivo,vendedor) values($1,$2,$3,$4,$5,$6,$7)',
        [id, store, date, 'credito', total, number, gerente]);
      await db.query('insert into public.creditos(venta_id,financiera,valor_esperado_financiera,cuota_inicial) values($1,$2,$3,$4)',
        [id, 'Addi', credit, initial]);
    }
    await db.exec(migration1);
    await db.exec(migration2);
    await db.exec(migration3);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [auditor]);
    const list = (await db.query('select public.addi_liquidaciones_listar() as data')).rows[0].data;
    for (const expected of rows) {
      const [number, , , , kora, initial, base, net, payout, profit] = expected;
      const row = list.find(item => Number(item.consecutivo) === number);
      assert.ok(row);
      assert.equal(Number(row.credito_kora), kora);
      assert.equal(Number(row.credito_bruto), base);
      assert.equal(Number(row.neto_estimado), net);
      assert.equal(Number(row.inicial_tienda), initial);
      assert.equal(Number(row.pago_tienda), payout);
      assert.equal(Number(row.utilidad_creditek), profit);
      assert.equal(Number(row.iva_tarifa), Number((base * 0.075 * 0.19).toFixed(2)));
    }
    assert.equal(list.reduce((sum, row) => sum + Number(row.iva_tarifa), 0), 31218.90);
    const first = list.find(row => row.consecutivo === 37);
    await db.query('select public.addi_liquidacion_revisar($1)', [first.venta_id]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [gerente]);
    await db.query('select public.addi_liquidacion_aprobar($1)', [first.venta_id]);
    const cobro = (await db.query('select importe,credito_bruto,tarifa_addi,iva_tarifa from public.cobros_expected')).rows[0];
    assert.equal(Number(cobro.importe), 235702.10);
    assert.equal(Number(cobro.credito_bruto), 258800);
    assert.equal(Number(cobro.iva_tarifa), 3687.90);
    assert.equal(Number((await db.query('select valor_esperado_financiera from public.creditos where venta_id=$1', [first.venta_id])).rows[0].valor_esperado_financiera), 233000);
  } finally { await db.close(); }
});
