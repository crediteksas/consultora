begin;
alter table public.ajustes_gerencia_solicitudes drop constraint ajustes_gerencia_solicitudes_saldo_base_check, drop constraint ajustes_gerencia_solicitudes_saldo_objetivo_check;
alter table public.ajustes_gerencia_solicitudes add constraint ajustes_gerencia_solicitudes_saldo_base_check check(saldo_base>=0 and saldo_base::text not in ('NaN','Infinity','-Infinity')), add constraint ajustes_gerencia_solicitudes_saldo_objetivo_check check(saldo_objetivo>=0 and saldo_objetivo::text not in ('NaN','Infinity','-Infinity'));
CREATE OR REPLACE FUNCTION public.ajuste_gerencia_b2b(p_request_id uuid, p_cliente_codigo text, p_saldo_actual numeric, p_saldo_objetivo numeric, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.ajustes_auditoria_cartera_b2b%rowtype;
  v_cuenta uuid; v_saldo numeric; v_nombre text;
begin
  if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
     or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='gerencia') then
    raise exception 'Solo Oscar Pacheco puede hacer ajustes de Gerencia';
  end if;
  if exists(select 1 from unnest(array[p_saldo_actual,p_saldo_objetivo]) n where n::text in ('NaN','Infinity','-Infinity')) then raise exception 'Saldo inválido'; end if;
  if p_request_id is null or nullif(btrim(coalesce(p_cliente_codigo,'')),'') is null
     or length(btrim(coalesce(p_motivo,'')))<20 then
    raise exception 'Selecciona un cliente e indica un motivo de al menos 20 caracteres';
  end if;
  if p_saldo_actual is null or p_saldo_objetivo is null or p_saldo_objetivo<0
     or p_saldo_actual<>round(p_saldo_actual,2) or p_saldo_objetivo<>round(p_saldo_objetivo,2) then
    raise exception 'La deuda debe expresarse en pesos con máximo dos decimales y no puede quedar negativa';
  end if;
  select * into v from public.ajustes_auditoria_cartera_b2b where id=p_request_id;
  if found then
    if v.cliente_codigo is distinct from p_cliente_codigo or v.motivo is distinct from btrim(p_motivo)
       or v.saldo_base is distinct from p_saldo_actual or v.saldo_objetivo is distinct from p_saldo_objetivo then
      raise exception 'El identificador ya pertenece a otra solicitud';
    end if;
    return public.autorizar_ajuste_auditoria_cartera_b2b(v.id);
  end if;
  select c.id,o.nombre into v_cuenta,v_nombre from public.cuentas_cartera c
    join public.origenes o on o.codigo=c.tienda_codigo
    where c.tienda_codigo=p_cliente_codigo and c.tipo_cuenta='cliente_b2b'
      and c.activo and o.tipo='cliente_b2b' and o.activo;
  if v_cuenta is null then raise exception 'Cliente B2B sin cuenta activa'; end if;
  select coalesce(sum(case when efecto='debito' then monto else -monto end),0)
    into v_saldo from public.movimientos_cartera where cuenta_id=v_cuenta;
  if v_saldo is distinct from p_saldo_actual then
    raise exception 'La deuda cambió desde la vista previa: %. Actualiza la pantalla',v_saldo;
  end if;
  if p_saldo_objetivo=v_saldo then raise exception 'La nueva deuda debe ser distinta de la actual'; end if;
  insert into public.ajustes_auditoria_cartera_b2b(id,referencia,cliente_codigo,nombre_auditado,
    fecha_corte,saldo_base,saldo_objetivo,motivo)
  values(p_request_id,'GER-B2B-'||p_request_id::text,p_cliente_codigo,v_nombre,
    (now() at time zone 'America/Bogota')::date,v_saldo,p_saldo_objetivo,btrim(p_motivo));
  return public.autorizar_ajuste_auditoria_cartera_b2b(p_request_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.ajuste_gerencia_retail(p_request_id uuid, p_tienda_codigo text, p_caja_actual numeric, p_deuda_actual numeric, p_caja_objetivo numeric, p_deuda_objetivo numeric, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.saldo_ajustes_auditoria%rowtype;
  v_hoy date; v_caja numeric; v_deuda numeric; v_caja_objetivo numeric; v_deuda_objetivo numeric;
begin
  if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
     or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='gerencia') then
    raise exception 'Solo Oscar Pacheco puede hacer ajustes de Gerencia';
  end if;
  if exists(select 1 from unnest(array[p_caja_actual,p_deuda_actual,p_caja_objetivo,p_deuda_objetivo]) n where n::text in ('NaN','Infinity','-Infinity')) then raise exception 'Saldo inválido'; end if;
  if p_request_id is null or nullif(btrim(coalesce(p_tienda_codigo,'')),'') is null
     or length(btrim(coalesce(p_motivo,'')))<20 then
    raise exception 'Selecciona una tienda e indica un motivo de al menos 20 caracteres';
  end if;
  if p_caja_actual is null or p_deuda_actual is null
     or p_caja_actual<>round(p_caja_actual,2) or p_deuda_actual<>round(p_deuda_actual,2)
     or (p_caja_objetivo is not null and (p_caja_objetivo<0 or p_caja_objetivo<>round(p_caja_objetivo,2)))
     or (p_deuda_objetivo is not null and (p_deuda_objetivo<0 or p_deuda_objetivo<>round(p_deuda_objetivo,2))) then
    raise exception 'Los saldos deben ser pesos con máximo dos decimales y los nuevos saldos no pueden ser negativos';
  end if;
  select * into v from public.saldo_ajustes_auditoria where id=p_request_id;
  if found then
    if v.tienda_codigo is distinct from p_tienda_codigo or v.motivo is distinct from btrim(p_motivo)
       or v.caja_base is distinct from p_caja_actual or v.deuda_base is distinct from p_deuda_actual
       or v.caja_objetivo is distinct from coalesce(p_caja_objetivo,p_caja_actual)
       or v.deuda_objetivo is distinct from coalesce(p_deuda_objetivo,p_deuda_actual) then
      raise exception 'El identificador ya pertenece a otra solicitud';
    end if;
    return public.autorizar_ajuste_saldos_auditados(v.id);
  end if;
  if not exists(select 1 from public.origenes where codigo=p_tienda_codigo and tipo='propia' and activo) then
    raise exception 'Tienda Retail no activa';
  end if;
  v_hoy:=(now() at time zone 'America/Bogota')::date;
  v_caja:=(public.caja_calcular_interno(p_tienda_codigo,v_hoy)->>'esperado')::numeric;
  select coalesce(sum(case when tipo='cargo' then monto else -monto end),0)
    into v_deuda from public.cuenta_corriente where tienda_codigo=p_tienda_codigo;
  if v_caja is distinct from p_caja_actual or v_deuda is distinct from p_deuda_actual then
    raise exception 'Los saldos cambiaron desde la vista previa: caja %, deuda %. Actualiza la pantalla',v_caja,v_deuda;
  end if;
  v_caja_objetivo:=coalesce(p_caja_objetivo,v_caja);
  v_deuda_objetivo:=coalesce(p_deuda_objetivo,v_deuda);
  if v_caja_objetivo=v_caja and v_deuda_objetivo=v_deuda then
    raise exception 'Indica al menos un saldo nuevo diferente del actual';
  end if;
  insert into public.saldo_ajustes_auditoria(id,referencia,tienda_codigo,fecha_corte,
    caja_base,deuda_base,caja_objetivo,deuda_objetivo,motivo)
  values(p_request_id,'GER-RETAIL-'||p_request_id::text,p_tienda_codigo,v_hoy,
    v_caja,v_deuda,v_caja_objetivo,v_deuda_objetivo,btrim(p_motivo));
  return public.autorizar_ajuste_saldos_auditados(p_request_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.preparar_ajuste_gerencia(p_id uuid, p_tipo text, p_codigo text, p_saldo_base numeric, p_saldo_objetivo numeric, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actual numeric; v_cuenta uuid; v_hoy date;
begin
  if auth.uid() is distinct from 'd1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid
    or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='auditoria') then
    raise exception 'Solo Maite puede preparar ajustes de Gerencia';
  end if;
  if exists(select 1 from unnest(array[p_saldo_base,p_saldo_objetivo]) n where n::text in ('NaN','Infinity','-Infinity')) then raise exception 'Saldo inválido'; end if;
  if p_id is null or p_tipo not in ('caja_retail','cartera_retail','cartera_b2b')
    or nullif(btrim(coalesce(p_codigo,'')),'') is null
    or length(btrim(coalesce(p_motivo,'')))<20 then
    raise exception 'Completa el tipo, la cuenta y un motivo de al menos 20 caracteres';
  end if;
  if p_saldo_base is null or p_saldo_objetivo is null or p_saldo_base<0 or p_saldo_objetivo<0
    or p_saldo_base<>round(p_saldo_base,2) or p_saldo_objetivo<>round(p_saldo_objetivo,2)
    or p_saldo_base=p_saldo_objetivo then
    raise exception 'Los saldos deben ser pesos con máximo dos decimales, no negativos y diferentes';
  end if;
  if exists(select 1 from public.ajustes_gerencia_solicitudes where id=p_id) then
    if exists(select 1 from public.ajustes_gerencia_solicitudes s where s.id=p_id
      and s.tipo=p_tipo and s.codigo=p_codigo and s.saldo_base=p_saldo_base
      and s.saldo_objetivo=p_saldo_objetivo and s.motivo=btrim(p_motivo)
      and s.preparado_por=auth.uid()) then
      return jsonb_build_object('id',p_id,'estado','pendiente','ya_registrado',true);
    end if;
    raise exception 'Este identificador ya corresponde a otra solicitud';
  end if;
  if p_tipo in ('caja_retail','cartera_retail') then
    if not exists(select 1 from public.origenes where codigo=p_codigo and tipo='propia' and activo)
    then raise exception 'La tienda Retail no está activa'; end if;
    if p_tipo='caja_retail' then
      v_hoy:=(now() at time zone 'America/Bogota')::date;
      v_actual:=(public.caja_calcular_interno(p_codigo,v_hoy)->>'esperado')::numeric;
    else
      select coalesce(sum(case when tipo='cargo' then monto else -monto end),0)
        into v_actual from public.cuenta_corriente where tienda_codigo=p_codigo;
    end if;
  else
    select c.id into v_cuenta from public.cuentas_cartera c
      join public.origenes o on o.codigo=c.tienda_codigo
      where c.tienda_codigo=p_codigo and c.tipo_cuenta='cliente_b2b'
        and c.activo and o.tipo='cliente_b2b' and o.activo;
    if v_cuenta is null then raise exception 'El cliente B2B no está activo'; end if;
    select coalesce(sum(case when efecto='debito' then monto else -monto end),0)
      into v_actual from public.movimientos_cartera where cuenta_id=v_cuenta;
  end if;
  if v_actual is distinct from p_saldo_base then
    raise exception 'El saldo cambió: actual %, propuesto como base %. Actualiza la pantalla',v_actual,p_saldo_base;
  end if;
  insert into public.ajustes_gerencia_solicitudes(id,tipo,codigo,saldo_base,saldo_objetivo,motivo,preparado_por)
  values(p_id,p_tipo,p_codigo,p_saldo_base,p_saldo_objetivo,btrim(p_motivo),auth.uid());
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid()::text,'ajuste_gerencia_preparado','ajustes_gerencia_solicitudes',p_id::text,
    jsonb_build_object('tipo',p_tipo,'codigo',p_codigo,'base',p_saldo_base,'objetivo',p_saldo_objetivo));
  return jsonb_build_object('id',p_id,'estado','pendiente','ya_registrado',false);
end $function$
;
notify pgrst,'reload schema';
commit;
