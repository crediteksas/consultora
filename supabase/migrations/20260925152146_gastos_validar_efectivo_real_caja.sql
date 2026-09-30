-- Versión registrada en producción: 20260925152146.
-- La pantalla de Gastos ya llamaba saldo_gastos_tienda, pero el RPC no estaba
-- desplegado. El límite correcto es el efectivo de caja, incluido el arrastre,
-- no únicamente las ventas de contado del día.
create or replace function public.saldo_gastos_tienda_interno(
  p_tienda text, p_fecha date, p_excluir uuid default null
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  v_caja jsonb;
  v_gastos numeric;
  v_base numeric;
  v_disponible numeric;
begin
  if p_tienda is null or p_fecha is null or p_fecha>(now() at time zone 'America/Bogota')::date then
    raise exception 'Selecciona una tienda y una fecha válida';
  end if;
  if p_tienda='CENTRAL' then
    raise exception 'Los gastos generales de CENTRAL no usan caja de tienda';
  end if;
  v_caja:=public.caja_calcular_interno(p_tienda,p_fecha);
  -- caja_calcular_interno ya descontó gastos aprobados y preautorizados.
  -- Se reconstruye la caja previa a todos los gastos del día y se reservan
  -- tanto los aprobados como los registrados aún pendientes de aprobación.
  v_base:=(v_caja->>'esperado')::numeric+(v_caja->>'gastos_efectivo')::numeric;
  select coalesce(sum(g.monto),0) into v_gastos
  from public.gastos g
  where g.tienda_codigo=p_tienda and g.fecha=p_fecha
    and g.estado in ('registrado','aprobado')
    and (p_excluir is null or g.id<>p_excluir);
  v_disponible:=v_base-v_gastos;
  return jsonb_build_object(
    'ventas_contado',coalesce((v_caja->>'contado_ventas')::numeric,0),
    'efectivo_base',v_base,'gastos_registrados',v_gastos,
    'disponible',greatest(v_disponible,0),
    'disponible_real',v_disponible
  );
end;
$$;
revoke all on function public.saldo_gastos_tienda_interno(text,date,uuid) from public,anon,authenticated;

create or replace function public.saldo_gastos_tienda(
  p_tienda text, p_fecha date, p_excluir uuid default null
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not exists (
    select 1 from public.perfiles p where p.id=auth.uid() and p.activo
      and (p.rol in ('gerencia','auditoria')
        or (p.rol='admin_tienda' and p.tienda_codigo=p_tienda))
  ) then
    raise exception 'No autorizado para consultar la caja de esta tienda';
  end if;
  return public.saldo_gastos_tienda_interno(p_tienda,p_fecha,p_excluir);
end;
$$;
revoke all on function public.saldo_gastos_tienda(text,date,uuid) from public,anon;
grant execute on function public.saldo_gastos_tienda(text,date,uuid) to authenticated;

-- El control en la base evita registrar dos gastos simultáneos que, juntos,
-- sobrepasen el efectivo aunque cada formulario haya visto saldo suficiente.
create or replace function public.validar_gasto_efectivo_caja()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_saldo jsonb;
  v_excluir uuid;
begin
  if new.tienda_codigo='CENTRAL' or new.estado not in ('registrado','aprobado') then
    return new;
  end if;
  if new.monto is null or new.monto<=0 then
    raise exception 'El gasto debe tener un monto positivo';
  end if;
  -- Aprobar un gasto ya reservado no constituye una segunda salida.
  if tg_op='UPDATE' and old.tienda_codigo=new.tienda_codigo and old.fecha=new.fecha
    and old.monto=new.monto and old.estado in ('registrado','aprobado') then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('gasto-caja:'||new.tienda_codigo||':'||new.fecha::text,0)
  );
  if tg_op='UPDATE' then v_excluir:=old.id; end if;
  v_saldo:=public.saldo_gastos_tienda_interno(new.tienda_codigo,new.fecha,v_excluir);
  if new.monto>(v_saldo->>'disponible')::numeric then
    raise exception 'Gasto supera el efectivo disponible: caja %, gastos registrados %, disponible %, gasto solicitado %',
      (v_saldo->>'efectivo_base')::numeric,(v_saldo->>'gastos_registrados')::numeric,
      (v_saldo->>'disponible')::numeric,new.monto;
  end if;
  return new;
end;
$$;
revoke all on function public.validar_gasto_efectivo_caja() from public,anon,authenticated;
drop trigger if exists gastos_limite_efectivo_diario on public.gastos;
drop trigger if exists gastos_limite_efectivo_caja on public.gastos;
create trigger gastos_limite_efectivo_caja
before insert or update of monto,fecha,tienda_codigo,estado on public.gastos
for each row execute function public.validar_gasto_efectivo_caja();
