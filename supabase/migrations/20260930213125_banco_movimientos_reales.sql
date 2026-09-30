-- Banco Creditek: registrar solo hechos bancarios, nunca compensaciones de cartera.
-- La apertura se realiza aparte con el saldo/corte real confirmado por Gerencia.
begin;

alter table public.banco_creditek_cuentas
  drop constraint banco_creditek_cuentas_saldo_inicial_check,
  drop constraint banco_creditek_cuentas_saldo_actual_check;
alter table public.banco_creditek_cuentas
  add constraint banco_creditek_cuentas_saldo_inicial_check check (saldo_inicial is null or saldo_inicial >= 0),
  add constraint banco_creditek_cuentas_saldo_actual_check check (saldo_actual is null or saldo_actual >= 0),
  add column fecha_corte_at timestamptz;

alter table public.banco_creditek_movimientos
  drop constraint banco_creditek_movimientos_monto_check,
  drop constraint banco_creditek_movimientos_tipo_check,
  drop constraint banco_creditek_movimientos_check;
alter table public.banco_creditek_movimientos
  add column fuente_tabla text,
  add column fuente_id uuid,
  add column ocurrido_at timestamptz,
  add constraint banco_creditek_movimientos_monto_check check (monto >= 0),
  add constraint banco_creditek_movimientos_tipo_check check
    (tipo in ('saldo_inicial','pago_proveedor','ingreso_plataforma','pago_aliado','pago_ejecutivo','gasto')),
  add constraint banco_creditek_movimientos_check check (
    (tipo='saldo_inicial' and solicitud_id is null and saldo_despues=saldo_antes+monto)
    or (tipo='pago_proveedor' and solicitud_id is not null and saldo_despues=saldo_antes-monto)
    or (tipo='ingreso_plataforma' and solicitud_id is null and fuente_tabla='cobros_deposits'
      and fuente_id is not null and saldo_despues=saldo_antes+monto)
    or (tipo in ('pago_aliado','pago_ejecutivo','gasto') and solicitud_id is null
      and fuente_id is not null and saldo_despues=saldo_antes-monto));
create unique index banco_creditek_fuente_unica
  on public.banco_creditek_movimientos(fuente_tabla,fuente_id)
  where fuente_id is not null;

-- El candado de la cuenta serializa todos los ingresos y egresos.
-- Idempotencia por la fila de origen, incluso si se reintenta la RPC.
create function kora_private.banco_creditek_asentar(
  p_tipo text,p_monto numeric,p_fuente_tabla text,p_fuente_id uuid,
  p_ocurrido_at timestamptz,p_referencia text,p_soporte text,p_usuario uuid
) returns boolean language plpgsql security definer set search_path='' as $$
declare c public.banco_creditek_cuentas%rowtype; v_despues numeric;
begin
  if p_tipo not in ('ingreso_plataforma','pago_aliado','pago_ejecutivo','gasto')
    or p_monto is null or p_monto<=0 or p_fuente_id is null or p_usuario is null
    then raise exception 'Movimiento bancario inválido'; end if;
  select * into c from public.banco_creditek_cuentas
    where numero_cuenta='87600004006' and activa for update;
  if not found then raise exception 'Cuenta Creditek 4006 no disponible'; end if;
  if exists(select 1 from public.banco_creditek_movimientos
    where fuente_tabla=p_fuente_tabla and fuente_id=p_fuente_id) then return false; end if;
  -- Un movimiento anterior al corte ya forma parte del saldo base.
  if c.saldo_actual is null or p_ocurrido_at is null
    or p_ocurrido_at<=coalesce(c.fecha_corte_at,c.fecha_corte::timestamptz) then return false; end if;
  v_despues:=c.saldo_actual + case when p_tipo='ingreso_plataforma' then p_monto else -p_monto end;
  if v_despues<0 then raise exception 'Saldo Banco Creditek insuficiente; concilia antes de registrar el pago'; end if;
  insert into public.banco_creditek_movimientos
    (cuenta_id,tipo,monto,saldo_antes,saldo_despues,fecha,referencia,soporte_path,
     registrado_por,fuente_tabla,fuente_id,ocurrido_at)
    values(c.id,p_tipo,p_monto,c.saldo_actual,v_despues,
      (p_ocurrido_at at time zone 'America/Bogota')::date,
      coalesce(nullif(btrim(p_referencia),''),p_fuente_tabla||' '||p_fuente_id::text),
      p_soporte,p_usuario,p_fuente_tabla,p_fuente_id,p_ocurrido_at);
  update public.banco_creditek_cuentas set saldo_actual=v_despues where id=c.id;
  return true;
end $$;
revoke all on function kora_private.banco_creditek_asentar(text,numeric,text,uuid,timestamptz,text,text,uuid)
  from public,anon,authenticated;

create function kora_private.banco_creditek_cobro_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.estado='activo' and new.created_by is not null
    and (tg_op='INSERT' or old.estado is distinct from 'activo')
    and (new.fuente_tipo='confirmacion_gerencia'
      or (new.fuente_tipo='abono_bancario' and new.cuenta_ultimos4='4006')) then
    perform kora_private.banco_creditek_asentar('ingreso_plataforma',new.importe,
      'cobros_deposits',new.id,new.created_at,
      new.plataforma||' · '||new.referencia,new.soporte,new.created_by);
  end if;
  return new;
end $$;
create trigger banco_creditek_cobro_real
  after insert or update of estado on public.cobros_deposits
  for each row execute function kora_private.banco_creditek_cobro_trigger();

create function kora_private.banco_creditek_pago_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_tipo text;
begin
  if new.estado in ('pagado','conciliado') and new.fecha_pagada is not null
    and new.authorized_by is not null and new.soporte_path is not null
    and not coalesce(new.historico_inicial,false)
    and (tg_op='INSERT' or old.fecha_pagada is null) then
    -- Torito Cell y cualquier destino 4006 son traslados internos a cartera B2B.
    -- Nunca descontar la cuenta propia ni duplicar el movimiento de Tesorería.
    if regexp_replace(coalesce(new.bank_snapshot->>'account_number',''),'[^0-9]','','g')='87600004006'
      then return new; end if;
    v_tipo:=case when new.payment_kind='ejecutivo' then 'pago_ejecutivo' else 'pago_aliado' end;
    perform kora_private.banco_creditek_asentar(v_tipo,new.valor,'payment_orders',new.id,
      new.fecha_pagada,coalesce(new.concept,'Orden de pago'),new.soporte_path,
      coalesce(new.paid_by,new.authorized_by));
  end if;
  return new;
end $$;
create trigger banco_creditek_pago_real
  after insert or update of fecha_pagada,estado on public.payment_orders
  for each row execute function kora_private.banco_creditek_pago_trigger();

-- Solo el gasto administrativo con soporte; comisiones, compensaciones y
-- pagos a proveedores B2B de saldo interno no son nuevos giros de Banco.
create function kora_private.banco_creditek_gasto_tesoreria_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.type='gasto_administrativo' and new.direction='debit'
    and new.status in ('pagado','conciliado') and new.paid_by is not null
    and nullif(new.support_path,'') is not null
    and (tg_op='INSERT' or old.status not in ('pagado','conciliado')) then
    perform kora_private.banco_creditek_asentar('gasto',new.amount,'treasury_movements',new.id,
      coalesce(new.updated_at,new.created_at),new.concept,new.support_path,new.paid_by);
  end if;
  return new;
end $$;
create trigger banco_creditek_gasto_tesoreria_real
  after insert or update of status on public.treasury_movements
  for each row execute function kora_private.banco_creditek_gasto_tesoreria_trigger();

-- Las obligaciones generales pueden pagarse desde Banco o desde otra fuente.
-- La persona que adjunta el soporte debe indicar el origen; Retail conserva su
-- contabilidad de cajas y nunca se debita aquí por defecto.
alter table public.financial_entries add column pagado_desde_banco_creditek boolean;
create function kora_private.banco_creditek_finanzas_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='pagado' and new.pagado_desde_banco_creditek is true
    and new.business_unit in ('aliados','b2b') and new.paid_at is not null
    and new.paid_by is not null and nullif(new.support_path,'') is not null
    and (tg_op='INSERT' or old.pagado_desde_banco_creditek is distinct from true) then
    perform kora_private.banco_creditek_asentar('gasto',new.amount,'financial_entries',new.id,
      new.paid_at,new.concept,new.support_path,new.paid_by);
  end if;
  return new;
end $$;
create trigger banco_creditek_gasto_finanzas_real
  after insert or update of pagado_desde_banco_creditek on public.financial_entries
  for each row execute function kora_private.banco_creditek_finanzas_trigger();

create function public.finanzas_registrar_pago_con_origen(
  p_id uuid,p_support_path text,p_desde_banco_creditek boolean
) returns public.financial_entries
language plpgsql security definer set search_path='' as $$
declare v public.financial_entries%rowtype;
begin
  if p_desde_banco_creditek is null then raise exception 'Indica si el giro salió de Banco Creditek'; end if;
  select * into v from public.financial_entries where id=p_id for update;
  if not found or v.status<>'aprobado' then raise exception 'Movimiento no aprobado o ya pagado'; end if;
  if p_desde_banco_creditek and v.business_unit not in ('aliados','b2b') then
    raise exception 'Los pagos de Retail se registran en su propia caja'; end if;
  v:=public.finanzas_registrar_pago(p_id,p_support_path);
  update public.financial_entries set pagado_desde_banco_creditek=p_desde_banco_creditek
    where id=p_id returning * into v;
  return v;
end $$;
revoke all on function public.finanzas_registrar_pago_con_origen(uuid,text,boolean)
  from public,anon,authenticated;
grant execute on function public.finanzas_registrar_pago_con_origen(uuid,text,boolean) to authenticated;

commit;
