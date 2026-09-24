import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../../supabase/migrations/20260924033608_addi_credito_sin_descontar_otro_medio_pago.sql', import.meta.url), 'utf8');
const previewSource = await readFile(new URL('../../creditek/erp/addi-liquidacion.js', import.meta.url), 'utf8');

test('la tienda ve su pago sobre el crédito, sin descontar el otro medio de pago', () => {
  const context = vm.createContext({});
  vm.runInContext(previewSource, context);
  const calculate = context.CreditekAddiLiquidacion.calcular;
  assert.equal(calculate(550000).pagoTienda, 418000);
  assert.equal(calculate(600000).pagoTienda, 456000);
  assert.equal(calculate(600000, 'aliada').pagoTienda, 462000);
});

test('Addi liquida el porcentaje completo del crédito sin restar otra forma de pago de la venta', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create schema cobros_private;
      create function cobros_private.addi_redondear_peso(p_valor numeric)
        returns numeric language sql immutable strict as $$
          select floor(p_valor) + case when p_valor-floor(p_valor)>0.50 then 1 else 0 end
        $$;
      create table public.addi_liquidaciones(
        id uuid primary key, venta_id uuid, credito_id uuid, fecha_venta date, tienda_codigo text,
        consecutivo int, estado text, credito_bruto numeric, neto_estimado numeric,
        inicial_tienda numeric, pago_tienda numeric, utilidad_creditek numeric,
        cobro_expected_id uuid, updated_at timestamptz);
      create table public.creditos(id uuid primary key, valor_esperado_financiera numeric, cuota_inicial numeric);
      create table public.origenes(codigo text primary key,tipo text,activo boolean);
      create table cobros_private.addi_politicas(tipo_establecimiento text,porcentaje numeric,vigente_desde date);
      create table cobros_private.addi_bases_reportadas(venta_id uuid,credito_bruto numeric,fuente text,referencia_addi text);
      create table public.cobros_expected(id uuid primary key,estado text,importe numeric);
      create table public.retail_b2b_compensations(addi_liquidacion_id uuid,reversed_at timestamptz);
      create table public.audit_log(usuario uuid,accion text,tabla text,registro_id uuid,detalle jsonb);
      insert into public.origenes values ('CK-02','propia',true),('CK-07','propia',true);
      insert into cobros_private.addi_politicas values ('propia',0.76,'2026-01-01');
    `);
    for (const [number, store, creditKora, otherPayment, base, net, oldPayout] of [
      [163, 'CK-02', 491860, 31400, 550000, 500912, 386600],
      [212, 'CK-07', 600000, 139500, 600000, 546450, 316500],
    ]) {
      const suffix = String(number).padStart(12, '0');
      const saleId = `00000000-0000-4000-8000-${suffix}`;
      const creditId = `00000000-0000-4001-8000-${suffix}`;
      const expectedId = `00000000-0000-4002-8000-${suffix}`;
      const addiId = `00000000-0000-4003-8000-${suffix}`;
      await db.query('insert into public.creditos values ($1,$2,$3)', [creditId, creditKora, otherPayment]);
      await db.query('insert into cobros_private.addi_bases_reportadas values ($1,$2,$3,$4)', [saleId, base, 'resumen_addi', `ref-${number}`]);
      await db.query("insert into public.cobros_expected values ($1,'activo',$2)", [expectedId, net]);
      await db.query("insert into public.addi_liquidaciones values ($1,$2,$3,'2026-09-15',$4,$5,'aprobada',$6,$7,$8,$9,$10,$11,now())",
        [addiId, saleId, creditId, store, number, base, net, otherPayment, oldPayout, net - oldPayout, expectedId]);
    }
    await db.exec(migration);
    const rows = (await db.query(`select consecutivo,credito_bruto,neto_estimado,inicial_tienda,
      pago_tienda,utilidad_creditek from public.addi_liquidaciones order by consecutivo`)).rows;
    assert.deepEqual(rows.map(row => [Number(row.consecutivo),Number(row.pago_tienda),Number(row.utilidad_creditek),Number(row.inicial_tienda)]), [
      [163,418000,82912,0],
      [212,456000,90450,0],
    ]);
    assert.deepEqual((await db.query('select importe from public.cobros_expected order by importe')).rows.map(row => Number(row.importe)), [500912,546450]);
    assert.deepEqual((await db.query('select cuota_inicial from public.creditos order by cuota_inicial')).rows.map(row => Number(row.cuota_inicial)), [31400,139500]);
    assert.equal(Number((await db.query("select count(*) as n from public.audit_log where accion='addi_pago_tienda_rectificado'")).rows[0].n), 2);
    const calculation = (await db.query('select cobros_private.addi_calculo($1) as result', ['00000000-0000-4000-8000-000000000163'])).rows[0].result;
    assert.equal(Number(calculation.pago_tienda), 418000);
    assert.equal(Number(calculation.otra_forma_pago_venta), 31400);
    assert.equal(Number(calculation.inicial_tienda), 0);
  } finally {
    await db.close();
  }
});
