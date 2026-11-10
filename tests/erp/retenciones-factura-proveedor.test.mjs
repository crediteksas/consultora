import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('retenciones de compra ajustan el neto una vez y conservan el bruto y la trazabilidad', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      insert into auth.users values ('10000000-0000-0000-0000-000000000001');
      create function auth.uid() returns uuid language sql stable as
        $$ select '10000000-0000-0000-0000-000000000001'::uuid $$;
      create function public.es_central() returns boolean language sql stable as
        $$ select coalesce(current_setting('test.central', true) = 'yes', false) $$;
      create table public.facturas_proveedor (
        id uuid primary key default gen_random_uuid(), numero text, fecha date,
        total numeric(16,2), saldo numeric(16,2), origen_registro text,
        tipo_compra text, fecha_vencimiento date, operacion_idempotency_key uuid unique
      );
      create table public.movimientos_tesoreria_central (
        fecha date, tipo text, fuente_fondos text, monto numeric, referencia_tipo text,
        referencia_id uuid, soporte_path text, observacion text, idempotency_key uuid unique
      );
      create table public.pagos_prueba (factura_id uuid, monto numeric);
      create function public.registrar_compra_proveedor(uuid,text,date,jsonb,text,text)
      returns jsonb language sql as $$
        insert into public.facturas_proveedor(numero,fecha,total,saldo)
        values ($2,$3,1000,1000)
        returning jsonb_build_object('ok',true,'factura_id',id,'total',total)
      $$;
      create function public.registrar_pago_proveedor(uuid,numeric,date,text,text,text,text,uuid)
      returns jsonb language sql as $$
        insert into public.pagos_prueba values ($1,$2);
        update public.facturas_proveedor set saldo=saldo-$2 where id=$1;
        select '{}'::jsonb
      $$;
      set test.central = 'yes';
    `);
    await db.exec('reset role');
    await db.exec(await readFile(new URL('../../supabase/migrations/20261110180316_registro_retenciones_proveedor.sql', import.meta.url), 'utf8'));
    const retenciones = [{tipo:'ReteFuente',base:1000,tarifa:5,valor:50},{tipo:'ReteIVA',base:100,tarifa:15,valor:15}];
    const compra = async (numero, tipo, retencionesCompra = retenciones) => {
      const {rows} = await db.query(`
        select public.registrar_compra_proveedor_operativa(
          gen_random_uuid(),$1,current_date-1,$2,current_date,'caja_central',
          '[]',null,null,('20000000-0000-0000-0000-' || lpad($1,12,'0'))::uuid,$3::jsonb
        ) as factura`, [numero, tipo, JSON.stringify(retencionesCompra)]);
      return rows[0].factura;
    };
    await db.exec('set role authenticated');
    const credito = await compra('1', 'credito');
    const contado = await compra('2', 'contado');
    assert.equal((await compra('1', 'credito')).reutilizado, true);
    assert.equal(credito.total_retenido, 65);
    assert.equal(contado.total, 1000);
    await assert.rejects(compra('3', 'credito', [{tipo:'ReteFuente',base:2000,tarifa:100,valor:2000}]), /Revisa la base/);
    await assert.rejects(compra('6', 'credito', [{tipo:'ReteFuente',base:1000,tarifa:5,valor:500}]), /debe coincidir/);
    await assert.rejects(compra('7', 'credito', [
      {tipo:'ReteFuente',base:1000,tarifa:60,valor:600},
      {tipo:'ReteICA',base:1000,tarifa:50,valor:500},
    ]), /superan el total/);
    await assert.rejects(compra('4', 'credito', [retenciones[0], retenciones[0]]), /ya está registrada/);
    await db.query(`select public.registrar_retencion_factura_proveedor(
      $1,'ReteICA',1000,1,10,current_date-1,'Comprobante histórico')`, [credito.factura_id]);
    await assert.rejects(db.exec('update public.retenciones_factura_proveedor set valor=1'), /permission denied/);
    await db.exec("set test.central = 'no'");
    assert.deepEqual((await db.query('select id from public.retenciones_factura_proveedor')).rows, []);
    await assert.rejects(compra('5', 'credito'), /Solo gerencia o auditoría/);
    await db.exec('reset role');
    assert.deepEqual((await db.query('select numero,total,saldo from public.facturas_proveedor order by numero')).rows, [
      {numero:'1',total:'1000.00',saldo:'935.00'},
      {numero:'2',total:'1000.00',saldo:'0.00'},
    ]);
    assert.equal(Number((await db.query('select monto from public.pagos_prueba')).rows[0].monto), 935);
    assert.equal(Number((await db.query('select monto from public.movimientos_tesoreria_central')).rows[0].monto), 935);
    assert.equal(Number((await db.query('select count(*) from public.retenciones_factura_proveedor where descontada_al_registrar')).rows[0].count), 4);
  } finally {
    await db.close();
  }
});
