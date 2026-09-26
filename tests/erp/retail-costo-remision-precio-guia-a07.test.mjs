import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = await readFile(new URL('../../supabase/migrations/20260926011937_retail_separar_precio_venta_costo_remision_a07.sql', import.meta.url), 'utf8');

test('retira solo el costo interno del precio guía A07 sin modificar el costo Retail', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table productos(id uuid primary key,codigo text,precio_guia numeric);
      create table unidades(id int,producto_id uuid,costo_remision numeric,precio_tienda numeric);
      insert into productos values('4a0be743-557a-4ca6-a83a-d34f865ea24b','1CV1001',356108);
      insert into unidades values(1,'4a0be743-557a-4ca6-a83a-d34f865ea24b',356108,382000);`);
    await db.exec(sql);
    await db.exec(sql);
    const producto = (await db.query('select precio_guia from productos')).rows[0];
    const unidad = (await db.query('select costo_remision,precio_tienda from unidades')).rows[0];
    assert.equal(producto.precio_guia, null);
    assert.equal(Number(unidad.costo_remision), 356108);
    assert.equal(Number(unidad.precio_tienda), 382000);
    await db.exec('update productos set precio_guia=450000');
    await assert.rejects(db.exec(sql), /El precio guía ya cambió/);
  } finally {
    await db.close();
  }
});
