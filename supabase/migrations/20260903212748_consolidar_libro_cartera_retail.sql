-- Consolida la cartera Retail en public.cuenta_corriente.
-- El libro movimientos_cartera queda reservado para caja y proveedores.

create table if not exists public.cartera_retail_retiros_auditoria (
  movimiento_id uuid primary key,
  datos_originales jsonb not null,
  motivo text not null,
  retirado_at timestamptz not null default now()
);

alter table public.cartera_retail_retiros_auditoria enable row level security;
revoke all on public.cartera_retail_retiros_auditoria from anon, authenticated;

do $$
declare
  v_total integer;
  v_debitos numeric;
  v_creditos numeric;
begin
  select count(*),
         coalesce(sum(m.monto) filter (where m.efecto = 'debito'), 0),
         coalesce(sum(m.monto) filter (where m.efecto = 'credito'), 0)
    into v_total, v_debitos, v_creditos
  from public.movimientos_cartera m
  where m.id in (
    '3764f45c-4922-4fd6-ba90-1cc2e16c15c2',
    '779b70f8-57a9-424f-869d-5b4711173802',
    '475ad31a-0323-45d9-bd3d-ded6c926bf61',
    '3fcb163d-dbfe-4fba-8fbe-b0db2a0c66dc',
    '8fdcfc39-c8e9-4ec3-bb85-3b1a5da988c8',
    '8da49f17-4fff-417c-9fc7-96bf362b754d',
    '75ec3ddf-ef5b-4bc6-b3de-934d811664b8'
  );

  if v_total <> 7 or v_debitos <> 3179600 or v_creditos <> 1471400 then
    raise exception 'La prevalidacion de pruebas Retail no coincide: filas %, debitos %, creditos %',
      v_total, v_debitos, v_creditos;
  end if;
end;
$$;

insert into public.cartera_retail_retiros_auditoria
  (movimiento_id, datos_originales, motivo)
select m.id, to_jsonb(m),
       'Prueba anterior al inicio de operacion; retiro autorizado por Gerencia el 2026-09-03'
from public.movimientos_cartera m
where m.id in (
  '3764f45c-4922-4fd6-ba90-1cc2e16c15c2',
  '779b70f8-57a9-424f-869d-5b4711173802',
  '475ad31a-0323-45d9-bd3d-ded6c926bf61',
  '3fcb163d-dbfe-4fba-8fbe-b0db2a0c66dc',
  '8fdcfc39-c8e9-4ec3-bb85-3b1a5da988c8',
  '8da49f17-4fff-417c-9fc7-96bf362b754d',
  '75ec3ddf-ef5b-4bc6-b3de-934d811664b8'
)
on conflict (movimiento_id) do nothing;

-- La eliminación está estrictamente acotada y respaldada arriba. Se suspende
-- la barrera solo dentro de esta transacción y se repone inmediatamente.
drop trigger if exists movimientos_cartera_inmutable
  on public.movimientos_cartera;

delete from public.movimientos_cartera
where id in (
  '3764f45c-4922-4fd6-ba90-1cc2e16c15c2',
  '779b70f8-57a9-424f-869d-5b4711173802',
  '475ad31a-0323-45d9-bd3d-ded6c926bf61',
  '3fcb163d-dbfe-4fba-8fbe-b0db2a0c66dc',
  '8fdcfc39-c8e9-4ec3-bb85-3b1a5da988c8',
  '8da49f17-4fff-417c-9fc7-96bf362b754d',
  '75ec3ddf-ef5b-4bc6-b3de-934d811664b8'
);

create trigger movimientos_cartera_inmutable
before update or delete on public.movimientos_cartera
for each row execute function public.impedir_mutacion_movimiento_cartera();

create or replace function public.enrutar_movimiento_cartera_retail()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tipo_cuenta text;
  v_tienda text;
  v_tipo_movimiento text;
begin
  select c.tipo_cuenta, coalesce(new.tienda_codigo, c.tienda_codigo)
    into v_tipo_cuenta, v_tienda
  from public.cuentas_cartera c
  where c.id = new.cuenta_id;

  if v_tipo_cuenta <> 'tienda' then
    return new;
  end if;

  if v_tienda is null then
    raise exception 'El movimiento Retail no tiene tienda asociada';
  end if;

  v_tipo_movimiento := case new.efecto
    when 'debito' then 'cargo'
    when 'credito' then 'abono'
    else null
  end;

  if v_tipo_movimiento is null then
    raise exception 'Efecto de cartera Retail no reconocido: %', new.efecto;
  end if;

  if not exists (
    select 1
    from public.cuenta_corriente cc
    where cc.tienda_codigo = v_tienda
      and cc.tipo = v_tipo_movimiento
      and cc.referencia_tipo is not distinct from new.referencia_tipo
      and cc.referencia_id is not distinct from new.referencia_id
      and cc.monto = new.monto
  ) then
    insert into public.cuenta_corriente
      (tienda_codigo, tipo, concepto, monto, referencia_tipo, referencia_id, usuario, nota, created_at)
    values
      (v_tienda, v_tipo_movimiento, new.concepto, new.monto,
       new.referencia_tipo, new.referencia_id, new.creado_por,
       'Enrutado automaticamente al libro oficial de cartera Retail',
       coalesce(new.created_at, now()));
  end if;

  -- Impide que vuelva a nacer un segundo saldo Retail.
  return null;
end;
$$;

drop trigger if exists trg_enrutar_movimiento_cartera_retail
  on public.movimientos_cartera;
create trigger trg_enrutar_movimiento_cartera_retail
before insert on public.movimientos_cartera
for each row execute function public.enrutar_movimiento_cartera_retail();

create or replace function public.proteger_libro_cartera_retail()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.mantenimiento_cartera_retail', true), '') <> 'autorizado' then
    raise exception 'El libro oficial de cartera Retail es inmutable; registre un ajuste compensatorio';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_proteger_libro_cartera_retail
  on public.cuenta_corriente;
create trigger trg_proteger_libro_cartera_retail
before update or delete on public.cuenta_corriente
for each row execute function public.proteger_libro_cartera_retail();

create or replace view public.v_saldos_cartera as
select c.id as cuenta_id,
       c.tipo_cuenta,
       c.tienda_codigo,
       c.proveedor_id,
       c.nombre,
       coalesce(sum(case m.efecto
         when 'debito' then m.monto
         when 'credito' then -m.monto
       end), 0) as saldo,
       max(m.created_at) as ultimo_movimiento_at
from public.cuentas_cartera c
left join public.movimientos_cartera m on m.cuenta_id = c.id
where c.activo = true
  and c.tipo_cuenta <> 'tienda'
group by c.id, c.tipo_cuenta, c.tienda_codigo, c.proveedor_id, c.nombre;

comment on view public.v_saldos_cartera is
  'Submayores de caja y proveedores. La cartera Retail vive exclusivamente en cuenta_corriente.';

create or replace view public.v_cartera_retail_oficial
with (security_invoker = true)
as
select o.codigo as tienda_codigo,
       o.nombre as tienda,
       count(cc.id)::integer as movimientos,
       coalesce(sum(case cc.tipo
         when 'cargo' then cc.monto
         when 'abono' then -cc.monto
       end), 0) as saldo,
       max(cc.created_at) as ultimo_movimiento_at
from public.origenes o
left join public.cuenta_corriente cc on cc.tienda_codigo = o.codigo
where coalesce(o.activo, true)
group by o.codigo, o.nombre;

grant select on public.v_cartera_retail_oficial to authenticated;

comment on table public.cuenta_corriente is
  'Libro oficial, unico e inmutable de cartera Retail. Las correcciones se registran mediante movimientos compensatorios.';
comment on table public.movimientos_cartera is
  'Submayor tecnico de caja y proveedores; los movimientos de tienda se redirigen a cuenta_corriente.';
