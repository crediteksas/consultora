import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../../supabase/migrations/20260922193359_addi_venta_cobro_estimado.sql', import.meta.url), 'utf8');
const maite = '00000000-0000-4000-8000-000000000001';
const oscar = '00000000-0000-4000-8000-000000000002';
const ventas = [
  ['00000000-0000-4000-8000-000000000101', 37, 'MOVIL', '2026-09-02', 233000, 233000, 0],
  ['00000000-0000-4000-8000-000000000102', 163, 'MOVIL', '2026-09-15', 523260, 491860, 31400],
  ['00000000-0000-4000-8000-000000000103', 212, 'SONIVOX', '2026-09-16', 739500, 600000, 139500],
  ['00000000-0000-4000-8000-000000000104', 286, 'CELFIAO', '2026-09-19', 703800, 703800, 0],
];

test('cuatro créditos Addi pasan por revisión antes de generar cobros en Tesorería', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema cobros_private;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.perfiles(id uuid primary key,rol text not null,activo boolean not null default true);
      insert into public.perfiles(id,rol) values ('${maite}','auditoria'),('${oscar}','gerencia');
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
    for (const [id, number, store, date, total, credit, initial] of ventas) {
      await db.query('insert into public.ventas(id,tienda_codigo,fecha,tipo,total,consecutivo,vendedor) values($1,$2,$3,$4,$5,$6,$7)',
        [id, store, date, 'credito', total, number, oscar]);
      await db.query('insert into public.creditos(venta_id,financiera,valor_esperado_financiera,cuota_inicial) values($1,$2,$3,$4)',
        [id, 'Addi', credit, initial]);
    }
    await db.exec(migration);
    const queued = await db.query("select count(*)::int as n from public.addi_liquidaciones where estado='pendiente_revision'");
    assert.equal(queued.rows[0].n, 4);
    assert.equal((await db.query('select count(*)::int as n from public.cobros_expected')).rows[0].n, 0);

    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [maite]);
    await assert.rejects(() => db.query('select public.addi_liquidacion_aprobar($1)', [ventas[0][0]]), /Solo Gerencia/);
    await db.query('select public.addi_liquidacion_revisar($1)', [ventas[0][0]]);
    assert.equal((await db.query('select count(*)::int as n from public.cobros_expected')).rows[0].n, 0);

    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [oscar]);
    await db.query('select public.addi_liquidacion_aprobar($1)', [ventas[0][0]]);
    const expected = await db.query('select importe::numeric as neto,fecha_esperada,fuente_tipo,estado from public.cobros_expected');
    assert.equal(expected.rows.length, 1);
    assert.equal(Number(expected.rows[0].neto), 212204.75);
    assert.equal(expected.rows[0].fecha_esperada.toISOString().slice(0, 10), '2026-09-17');
    assert.equal(expected.rows[0].fuente_tipo, 'estimacion_venta');
    assert.equal(expected.rows[0].estado, 'activo');
    await assert.rejects(() => db.query('select public.addi_liquidacion_aprobar($1)', [ventas[0][0]]), /debe estar revisada/);
    assert.equal((await db.query('select count(*)::int as n from public.cobros_expected')).rows[0].n, 1);
  } finally { await db.close(); }
});
