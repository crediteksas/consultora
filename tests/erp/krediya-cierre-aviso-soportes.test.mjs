import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../../supabase/migrations/20260918122500_cerrar_aviso_soportes_rectificacion_krediya.sql', import.meta.url),
  'utf8',
);

test('cierra el aviso de soportes sin borrar la rectificacion ni sus importes', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create table liquidation_adjustments(
        id uuid primary key,
        liquidation_id uuid,
        field_name text,
        new_value jsonb
      );
      create table audit_log(
        usuario text,
        accion text,
        tabla text,
        registro_id text,
        detalle jsonb
      );
      insert into liquidation_adjustments values(
        '8289594a-1ed1-4568-8a19-707a380472d7',
        '9f5d2902-cfb4-45c8-9b6c-65b7688cce2d',
        'krediya_bonos_rectificados',
        '{"estado":"numeros_rectificados_soportes_pendientes","exceso_pagado_por_validar":255000,"diferencias_pagos":[{"nombre":"Maythe Reyes","diferencia":35000,"estado":"pendiente_validacion_soporte"},{"nombre":"Luis Rivera","diferencia":220000,"estado":"pendiente_validacion_soporte"}]}'
      );
    `);

    await db.exec(migration);
    const row = (await db.query('select new_value from liquidation_adjustments')).rows[0].new_value;
    assert.equal(row.estado, 'soportes_validados');
    assert.equal(row.exceso_pagado_por_validar, 255000);
    assert.deepEqual(row.diferencias_pagos.map((item) => item.estado), ['validado', 'validado']);
    assert.equal((await db.query('select count(*)::int n from liquidation_adjustments')).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from audit_log where accion='krediya_soportes_rectificacion_validados'")).rows[0].n, 1);

    await db.exec(migration);
    assert.equal((await db.query('select count(*)::int n from audit_log')).rows[0].n, 1);
  } finally {
    await db.close();
  }
});
