import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../../supabase/migrations/20260924045005_conciliar_pagos_al_subir_soporte.sql', import.meta.url), 'utf8');

test('el soporte concilia el pago una sola vez y el rezago sin soporte queda pendiente', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage; create schema kora_private;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.objects(bucket_id text,name text,metadata jsonb);
      create table public.liquidations(id uuid primary key,estado text,updated_at timestamptz);
      create table public.payment_orders(id uuid primary key,liquidation_id uuid,estado text,
        historico_inicial boolean default false,authorized_by uuid,authorized_at timestamptz,
        fecha_pagada timestamptz,soporte_path text,payment_kind text,cutoff_snapshot date,
        own_bonuses numeric,valor numeric,platform_snapshot text,operations_count integer,
        updated_at timestamptz);
      create table public.liquidation_domain_events(event_type text,aggregate_type text,
        aggregate_id uuid,payload jsonb,idempotency_key text unique);
      create table public.audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
      create table public.debit_counter(n integer);
      insert into public.debit_counter values(0);
      create function public.tesoreria_cerrar_pagos_con_soporte(p_ids uuid[],p_soporte_path text)
      returns integer language plpgsql security definer as $$
      declare v_id uuid;
      begin
        for v_id in select unnest(p_ids) loop
          if exists(select 1 from public.payment_orders where id=v_id and estado='programado') then
            update public.payment_orders set estado='pagado',fecha_pagada=now(),soporte_path=p_soporte_path where id=v_id;
            update public.debit_counter set n=n+1;
          end if;
        end loop;
        return cardinality(p_ids);
      end $$;
      insert into public.liquidations values
        ('00000000-0000-4000-8000-000000000001','pagada',now()),
        ('00000000-0000-4000-8000-000000000002','programada',now());
      insert into storage.objects values('soportes','aliados/pagos/uno.pdf',
        '{"mimetype":"application/pdf","size":1024}'::jsonb);
      insert into public.payment_orders(id,liquidation_id,estado,authorized_by,authorized_at,
        fecha_pagada,soporte_path,payment_kind,valor,platform_snapshot,operations_count)
      values
        ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000001',
         'pagado','00000000-0000-4000-8000-000000000777',now(),now(),
         'aliados/pagos/uno.pdf','aliado',100000,'payjoy',1),
        ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000002',
         'pagado','00000000-0000-4000-8000-000000000777',now(),now(),
         null,'aliado',200000,'payjoy',1),
        ('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000002',
         'programado','00000000-0000-4000-8000-000000000777',now(),null,
         null,'ejecutivo',30000,'payjoy',1);
    `);
    await db.exec(migration);
    assert.equal((await db.query("select estado from public.payment_orders where id='00000000-0000-4000-8000-000000000101'")).rows[0].estado, 'conciliado');
    assert.equal((await db.query("select estado from public.payment_orders where id='00000000-0000-4000-8000-000000000102'")).rows[0].estado, 'pagado');
    assert.equal((await db.query("select estado from public.liquidations where id='00000000-0000-4000-8000-000000000001'")).rows[0].estado, 'conciliada');
    await db.query("select public.tesoreria_cerrar_pagos_con_soporte(array['00000000-0000-4000-8000-000000000103']::uuid[],'aliados/pagos/uno.pdf')");
    assert.equal((await db.query("select estado from public.payment_orders where id='00000000-0000-4000-8000-000000000103'")).rows[0].estado, 'conciliado');
    assert.equal((await db.query('select n from public.debit_counter')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::integer as n from public.liquidation_domain_events')).rows[0].n, 2);
  } finally { await db.close(); }
});
