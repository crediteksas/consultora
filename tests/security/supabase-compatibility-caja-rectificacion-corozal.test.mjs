import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const migration = await readFile(new URL('../../supabase/migrations/20261109235736_caja_rectificacion_historica_ck02.sql', import.meta.url), 'utf8');
const maite = 'd1782db6-bacc-4caf-af6f-ce1b8d1c0391';
const oscar = '6de0ad26-64af-4966-8cd9-d468880af627';

test('Corozal: doble control, soporte privado, arqueo intacto y arrastre único', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(await readFile(new URL('../fixtures/supabase-compat/caja-rectificacion-corozal/fixture.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../../supabase/migrations/20260926221259_caja_primera_apertura_sin_doble_descuento.sql',import.meta.url),'utf8'));
    await db.exec(migration);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261111230357_caja_arrastre_rectificacion_corozal.sql',import.meta.url),'utf8'));
    const actor = async id => {
      await db.exec('reset role; set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    };
    const caja = async (dia, tienda='CK-02') => {
      await db.exec('reset role');
      return (await db.query('select caja_calcular_interno($1,$2) c',[tienda,dia])).rows[0].c;
    };
    const preparar = () => db.query('select preparar_rectificacion_corozal($1,$2,$3) id',
      ['Efectivo omitió los gastos de caja', 'soporte.pdf', 'JVBERi0xLjQK']);
    const decidir = id => db.query('select decidir_rectificacion_corozal($1,true)', [id]);

    await db.exec('set role anon');
    await assert.rejects(db.query('select listar_rectificaciones_corozal()'), /permission denied/);
    await actor(oscar);
    await assert.rejects(db.query('select * from kora_private.rectificacion_cierre_corozal'), /permission denied/);
    await assert.rejects(preparar(), /No autorizado/);
    await actor('00000000-0000-0000-0000-000000000001');
    await assert.rejects(db.query('select listar_rectificaciones_corozal()'), /No autorizado/);
    await actor(maite);
    const {id} = (await preparar()).rows[0];
    await assert.rejects(preparar(), /unique constraint/);
    await assert.rejects(decidir(id), /No autorizado/);
    assert.equal((await caja('2026-11-09')).apertura, 3360360);
    await actor(oscar);
    const {soporte} = (await db.query('select soporte_rectificacion_corozal($1) soporte',[id])).rows[0];
    assert.equal(soporte,'JVBERi0xLjQK');
    await db.exec(`reset role;
      insert into caja_cortes values ('CK-02','2026-11-09','validada',3920360);
      insert into caja_diaria(tienda_codigo,fecha,estado,apertura,efectivo_esperado,efectivo_contado,arrastre_movimientos_incorporado)
        values ('CK-02','2026-11-09','cerrada',3360360,3920360,3920360,0);
      insert into gastos values ('CK-02','2026-11-08','aprobado')`);
    await actor(oscar);
    await assert.rejects(decidir(id), /ya hay gastos/);
    assert.equal((await caja('2026-11-09')).apertura, 3360360);
    await db.exec("delete from gastos");
    await actor(oscar);
    await decidir(id);
    await assert.rejects(decidir(id), /no está disponible/);
    const corregido = await caja('2026-11-08');
    assert.equal(corregido.caja.efectivo_contado,3360360);
    assert.equal(corregido.rectificacion_cierre.efectivo_corregido,2588560);
    const siguiente = await caja('2026-11-09');
    assert.equal(siguiente.apertura,2588560);
    assert.equal(siguiente.esperado,3148560);
    assert.equal((await caja('2026-11-09','OTRA')).apertura,1000000);
    assert.equal(siguiente.caja.efectivo_contado,3920360);
    const posterior = await caja('2026-11-10');
    assert.equal(posterior.apertura,3148560);
    await db.query(`insert into caja_diaria(tienda_codigo,fecha,estado,apertura,efectivo_esperado,efectivo_contado,arrastre_movimientos_incorporado)
      values ('CK-02','2026-11-10','cerrada',$1,$2,$2,$3)`,[posterior.apertura,posterior.esperado,posterior.arrastre_movimientos_total]);
    assert.equal((await caja('2026-11-11')).apertura,3148560);
    assert.equal((await db.query("select efectivo_contado from caja_cortes where fecha='2026-11-08'")).rows[0].efectivo_contado,'3360360');
  } finally {
    await db.close();
  }
});
