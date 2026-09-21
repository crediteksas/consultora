begin;

-- La tienda puede cerrar el mismo dia cuando termina su operacion. Si queda
-- un dia anterior pendiente, ese arqueo conserva prioridad y bloquea el nuevo.
create or replace function public.validar_arqueo_caja(
  p_tienda_codigo text,
  p_fecha date,
  p_efectivo_contado numeric,
  p_idempotency_key uuid,
  p_nota text default null,
  p_autorizar boolean default false
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  perfil public.perfiles%rowtype;
  c jsonb;
  dif numeric;
  estado_nuevo text;
  res jsonb;
  intento public.caja_arqueo_intentos%rowtype;
  pendiente date;
  corte public.caja_cortes%rowtype;
  hoy date := (now() at time zone 'America/Bogota')::date;
begin
  select * into perfil from public.perfiles where id=auth.uid() and activo;
  if not found or not (perfil.rol in ('gerencia','auditoria') or
    (perfil.rol='admin_tienda' and perfil.tienda_codigo=p_tienda_codigo)) then
    raise exception 'No autorizado';
  end if;
  if p_autorizar and perfil.rol not in ('gerencia','auditoria') then
    raise exception 'Solo Gestión o Gerencia puede autorizar diferencias';
  end if;
  if p_fecha is null or p_fecha>hoy or
    p_fecha<(select fecha_inicio from public.caja_ciclo_config where id) then
    raise exception 'El arqueo corresponde al día actual o a un día anterior pendiente; no admite fechas futuras ni histórico anterior a la activación';
  end if;
  if p_efectivo_contado is null or p_efectivo_contado<0 or
    p_efectivo_contado::text in ('NaN','Infinity','-Infinity') or p_idempotency_key is null then
    raise exception 'Ingresa el efectivo contado real';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('caja-arrastre:'||p_tienda_codigo,0));
  select * into intento from public.caja_arqueo_intentos where idempotency_key=p_idempotency_key;
  if found then
    if intento.creado_por<>auth.uid() or intento.tienda_codigo<>p_tienda_codigo or
      intento.fecha<>p_fecha or intento.efectivo_contado<>p_efectivo_contado then
      raise exception 'Identificador de intento ya utilizado';
    end if;
    return intento.resultado;
  end if;

  pendiente:=public.caja_pendiente_interno(p_tienda_codigo);
  if p_fecha<hoy and pendiente is distinct from p_fecha then
    raise exception 'Primero valida la caja pendiente de %',pendiente;
  end if;
  if p_fecha=hoy and pendiente is not null then
    raise exception 'Primero valida la caja pendiente de % antes de cerrar la de hoy',pendiente;
  end if;
  if exists(select 1 from public.caja_diaria where tienda_codigo=p_tienda_codigo and fecha=p_fecha and estado='cerrada') then
    raise exception 'La caja de esta fecha ya está cerrada';
  end if;

  perform public.caja_asegurar_corte(p_tienda_codigo,p_fecha);
  select * into corte from public.caja_cortes
    where tienda_codigo=p_tienda_codigo and fecha=p_fecha for update;
  if p_autorizar and (corte.efectivo_contado is null or
    corte.efectivo_contado<>p_efectivo_contado or length(trim(coalesce(p_nota,'')))<5) then
    raise exception 'La autorización requiere un arqueo registrado por la tienda y un motivo';
  end if;

  c:=public.caja_calcular_interno(p_tienda_codigo,p_fecha);
  dif:=p_efectivo_contado-(c->>'esperado')::numeric;
  if dif<>0 and length(trim(coalesce(p_nota,'')))<5 then
    raise exception 'Explica la diferencia para enviarla a Gestión';
  end if;
  estado_nuevo:=case
    when (c->>'gastos_pendientes')::int>0 then 'observada'
    when dif=0 then 'validada'
    when p_autorizar then 'autorizada'
    else 'observada'
  end;
  res:=jsonb_build_object(
    'ok',estado_nuevo in ('validada','autorizada'),
    'estado',estado_nuevo,
    'diferencia',dif,
    'esperado',(c->>'esperado')::numeric,
    'gastos_pendientes',(c->>'gastos_pendientes')::int,
    'mensaje',case
      when (c->>'gastos_pendientes')::int>0 then 'Hay gastos pendientes de aprobación. Gestión debe resolverlos antes de cerrar la caja.'
      when estado_nuevo='observada' then 'Arqueo registrado con diferencia. Queda vivo para revisión de Gestión.'
      when p_fecha=hoy then 'Caja cerrada por la tienda con arqueo físico.'
      else 'Arqueo registrado. Ciclo anterior cerrado.'
    end
  );

  update public.caja_cortes set
    estado=estado_nuevo,
    efectivo_contado=p_efectivo_contado,
    diferencia=dif,
    resumen_validado=c,
    nota=nullif(trim(p_nota),''),
    validado_por=case when estado_nuevo in ('validada','autorizada') then auth.uid() end,
    validado_at=case when estado_nuevo in ('validada','autorizada') then now() end
  where tienda_codigo=p_tienda_codigo and fecha=p_fecha;

  insert into public.caja_arqueo_intentos(
    tienda_codigo,fecha,creado_por,idempotency_key,efectivo_contado,resumen,nota,resultado
  ) values(
    p_tienda_codigo,p_fecha,auth.uid(),p_idempotency_key,p_efectivo_contado,c,p_nota,res
  );

  if estado_nuevo in ('validada','autorizada') then
    insert into public.caja_diaria(
      tienda_codigo,fecha,estado,apertura,contado_ventas,financiado_ventas,iniciales,otros_ingresos,
      gastos_efectivo,salidas_explicitas,efectivo_esperado,efectivo_contado,diferencia,cerrada_por,
      cerrada_at,nota,cierre_idempotency_key,arrastre_movimientos_incorporado
    ) values(
      p_tienda_codigo,p_fecha,'cerrada',(c->>'apertura')::numeric,(c->>'contado_ventas')::numeric,0,
      (c->>'iniciales')::numeric,(c->>'otros_ingresos')::numeric,(c->>'gastos_efectivo')::numeric,
      (c->>'salidas_explicitas')::numeric,(c->>'esperado')::numeric,p_efectivo_contado,dif,auth.uid(),
      now(),p_nota,p_idempotency_key,(c->>'arrastre_movimientos_total')::numeric
    ) on conflict(tienda_codigo,fecha) do update set
      estado=excluded.estado,
      apertura=excluded.apertura,
      contado_ventas=excluded.contado_ventas,
      financiado_ventas=excluded.financiado_ventas,
      iniciales=excluded.iniciales,
      otros_ingresos=excluded.otros_ingresos,
      gastos_efectivo=excluded.gastos_efectivo,
      salidas_explicitas=excluded.salidas_explicitas,
      efectivo_esperado=excluded.efectivo_esperado,
      efectivo_contado=excluded.efectivo_contado,
      diferencia=excluded.diferencia,
      cerrada_por=excluded.cerrada_por,
      cerrada_at=excluded.cerrada_at,
      nota=excluded.nota,
      cierre_idempotency_key=excluded.cierre_idempotency_key,
      arrastre_movimientos_incorporado=excluded.arrastre_movimientos_incorporado
    where caja_diaria.estado='abierta';
  end if;
  return res;
end;
$$;

revoke all on function public.validar_arqueo_caja(text,date,numeric,uuid,text,boolean) from public,anon;
grant execute on function public.validar_arqueo_caja(text,date,numeric,uuid,text,boolean) to authenticated;

commit;
