import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync('supabase/migrations/20261007145000_incident_notifications_close_read.sql', 'utf8');

test('cerrar una incidencia lee sus avisos anteriores y no altera los de otra', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema kora_private;
      create table public.kora_incidents (id uuid primary key, status text not null);
      create table public.kora_notifications (
        id uuid primary key, incident_id uuid references public.kora_incidents(id),
        type text not null, read_at timestamptz
      );
      insert into public.kora_incidents values
        ('00000000-0000-0000-0000-000000000001','cerrado'),
        ('00000000-0000-0000-0000-000000000002','nuevo'),
        ('00000000-0000-0000-0000-000000000003','nuevo'),
        ('00000000-0000-0000-0000-000000000004','nuevo');
      insert into public.kora_notifications values
        ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','incident_assigned',null),
        ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','incident_assigned',null),
        ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','incident_assigned',null);
    `);
    await db.exec(migration);
    let rows = (await db.query('select id,read_at from public.kora_notifications order by id')).rows;
    assert.ok(rows[0].read_at, 'el respaldo limpia avisos de incidencias ya cerradas');
    assert.equal(rows[1].read_at, null);

    await db.exec(`update public.kora_incidents set status='cerrado' where id='00000000-0000-0000-0000-000000000002';
      insert into public.kora_notifications values
        ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','incident_comment',null);
      update public.kora_incidents set status='corregido' where id='00000000-0000-0000-0000-000000000003';
      insert into public.kora_notifications values
        ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000003','incident_resolved',null),
        ('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000003','incident_assigned',null);
    `);
    rows = (await db.query('select id,read_at from public.kora_notifications order by id')).rows;
    assert.ok(rows[1].read_at, 'cerrar lee el aviso existente');
    assert.ok(rows[3].read_at, 'un aviso tardío de incidencia cerrada no queda sin leer');
    assert.ok(rows[2].read_at, 'corregir lee el aviso de asignación');
    assert.equal(rows[4].read_at, null, 'la resolución sí se notifica al reportante');
    assert.ok(rows[5].read_at, 'una asignación tardía no reabre la alerta');

    await db.exec("update public.kora_incidents set status='cerrado' where id='00000000-0000-0000-0000-000000000003'");
    assert.ok((await db.query("select read_at from public.kora_notifications where id='10000000-0000-0000-0000-000000000005'")).rows[0].read_at);
    assert.equal((await db.query("select status from public.kora_incidents where id='00000000-0000-0000-0000-000000000004'")).rows[0].status, 'nuevo');
  } finally {
    await db.close();
  }
});
