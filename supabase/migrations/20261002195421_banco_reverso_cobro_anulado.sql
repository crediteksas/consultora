-- Anular una recepción no es un gasto: conserva el ingreso y agrega su reverso.
-- Versión del historial de migraciones aplicada en producción.
begin;

alter table public.banco_creditek_movimientos
  drop constraint banco_creditek_movimientos_tipo_check,
  drop constraint banco_creditek_movimientos_check,
  add constraint banco_creditek_movimientos_tipo_check check
    (tipo in ('saldo_inicial','pago_proveedor','ingreso_plataforma','pago_aliado',
      'pago_ejecutivo','gasto','reverso_ingreso_plataforma')),
  add constraint banco_creditek_movimientos_check check (
    (tipo='saldo_inicial' and solicitud_id is null and saldo_despues=saldo_antes+monto)
    or (tipo='pago_proveedor' and solicitud_id is not null and saldo_despues=saldo_antes-monto)
    or (tipo='ingreso_plataforma' and solicitud_id is null and fuente_tabla='cobros_deposits'
      and fuente_id is not null and saldo_despues=saldo_antes+monto)
    or (tipo in ('pago_aliado','pago_ejecutivo','gasto') and solicitud_id is null
      and fuente_id is not null and saldo_despues=saldo_antes-monto)
    or (tipo='reverso_ingreso_plataforma' and solicitud_id is null
      and fuente_tabla='banco_creditek_movimientos' and fuente_id is not null
      and saldo_despues=saldo_antes-monto));

create or replace function kora_private.banco_creditek_cobro_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  m public.banco_creditek_movimientos%rowtype;
  c public.banco_creditek_cuentas%rowtype;
  v_reverso uuid;
begin
  if tg_op='UPDATE' and old.estado='anulado' and new.estado='activo' then
    raise exception 'Un abono anulado no se reactiva; registra una nueva recepción verificada';
  end if;

  if tg_op='UPDATE' and old.estado='activo' and new.estado='anulado' then
    if not cobros_private.autorizado(true) then
      raise exception 'Solo Gerencia puede anular un ingreso bancario';
    end if;
    if exists(select 1 from public.cobros_allocations
      where deposit_id=new.id and estado='activo') then
      raise exception 'Primero anula sus aplicaciones; el historial se conserva';
    end if;
    select * into m from public.banco_creditek_movimientos
      where tipo='ingreso_plataforma' and fuente_tabla='cobros_deposits' and fuente_id=new.id;
    -- No descontar recepciones que nunca ingresaron al libro, p. ej. anteriores al corte.
    if not found then return new; end if;
    select * into c from public.banco_creditek_cuentas where id=m.cuenta_id for update;
    if not found or c.saldo_actual is null then
      raise exception 'Cuenta bancaria del ingreso no disponible';
    end if;
    -- La cuenta serializa ingresos, pagos y reversos; la fuente única evita duplicados.
    if exists(select 1 from public.banco_creditek_movimientos
      where fuente_tabla='banco_creditek_movimientos' and fuente_id=m.id) then return new; end if;
    if c.saldo_actual<m.monto then
      raise exception 'Saldo Banco insuficiente para revertir el ingreso; no se anuló el cobro';
    end if;
    insert into public.banco_creditek_movimientos
      (cuenta_id,tipo,monto,saldo_antes,saldo_despues,fecha,referencia,soporte_path,
       registrado_por,fuente_tabla,fuente_id,ocurrido_at)
    values(c.id,'reverso_ingreso_plataforma',m.monto,c.saldo_actual,c.saldo_actual-m.monto,
      (now() at time zone 'America/Bogota')::date,
      'Anulación de ingreso · '||m.referencia,
      'Reverso del movimiento '||m.id::text||'; motivo en historial del cobro '||new.id::text,
      auth.uid(),'banco_creditek_movimientos',m.id,now()) returning id into v_reverso;
    update public.banco_creditek_cuentas set saldo_actual=c.saldo_actual-m.monto where id=c.id;
    perform cobros_private.evento('deposit_reversado_banco',new.id,jsonb_build_object(
      'movimiento_original_id',m.id,'movimiento_reverso_id',v_reverso,'importe',m.monto,
      'saldo_antes',c.saldo_actual,'saldo_despues',c.saldo_actual-m.monto));
    return new;
  end if;

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
revoke all on function kora_private.banco_creditek_cobro_trigger() from public,anon,authenticated;

commit;
