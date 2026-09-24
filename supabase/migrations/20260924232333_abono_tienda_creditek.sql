-- Recaudo de tiendas a Creditek: destino verificado, instrucción inmutable y un solo abono.
-- La cuenta se configura por Maythe u Oscar; sin cuenta activa no se emiten instrucciones.
create table kora_private.cuenta_recaudo_creditek (
  id boolean primary key default true check (id),
  titular text not null default 'CREDITEK S.A.S.',
  nit text not null default '901.259.859-0',
  banco text,
  tipo_cuenta text,
  numero_cuenta text,
  activa boolean not null default false,
  actualizada_por uuid,
  actualizada_at timestamptz,
  check ((not activa) or (
    length(btrim(banco)) >= 2
    and tipo_cuenta in ('Ahorros','Corriente','Billetera digital')
    and numero_cuenta ~ '^[0-9]{6,20}$'
  ))
);
alter table kora_private.cuenta_recaudo_creditek enable row level security;
revoke all on kora_private.cuenta_recaudo_creditek from public, anon, authenticated;
insert into kora_private.cuenta_recaudo_creditek(id,banco,tipo_cuenta,numero_cuenta,activa)
values(true,'Bancolombia','Ahorros','87600004006',true); -- Datos bancarios confirmados por el usuario.

create function kora_private.ver_cuenta_recaudo_creditek()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c kora_private.cuenta_recaudo_creditek%rowtype;
begin
  if auth.uid() is null or not public.es_controlador_financiero() then
    raise exception 'Solo Maythe u Oscar consultan esta configuración';
  end if;
  select * into c from kora_private.cuenta_recaudo_creditek where id=true;
  return jsonb_build_object('titular',c.titular,'nit',c.nit,'banco',c.banco,
    'tipo_cuenta',c.tipo_cuenta,'numero_cuenta',c.numero_cuenta,'activa',c.activa,
    'actualizada_at',c.actualizada_at);
end $$;
revoke all on function kora_private.ver_cuenta_recaudo_creditek() from public,anon;
grant execute on function kora_private.ver_cuenta_recaudo_creditek() to authenticated;
create function public.ver_cuenta_recaudo_creditek()
returns jsonb language sql security invoker set search_path='' as $$
  select kora_private.ver_cuenta_recaudo_creditek()
$$;
revoke all on function public.ver_cuenta_recaudo_creditek() from public,anon;
grant execute on function public.ver_cuenta_recaudo_creditek() to authenticated;

create function kora_private.guardar_cuenta_recaudo_creditek(
  p_banco text,p_tipo_cuenta text,p_numero_cuenta text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c kora_private.cuenta_recaudo_creditek%rowtype;
begin
  if auth.uid() is null or not public.es_controlador_financiero() then
    raise exception 'Solo Maythe u Oscar configuran la cuenta de Creditek';
  end if;
  if length(btrim(coalesce(p_banco,''))) not between 2 and 100
    or p_tipo_cuenta not in ('Ahorros','Corriente','Billetera digital')
    or p_numero_cuenta !~ '^[0-9]{6,20}$' then
    raise exception 'Confirma banco, tipo y número de la cuenta de Creditek';
  end if;
  if exists(select 1 from public.instrucciones_consignacion
    where tipo_destino='CREDITEK' and estado in ('pendiente','en_validacion')) then
    raise exception 'Resuelve las instrucciones de Creditek pendientes antes de cambiar la cuenta';
  end if;
  update kora_private.cuenta_recaudo_creditek
    set banco=btrim(p_banco),tipo_cuenta=p_tipo_cuenta,numero_cuenta=p_numero_cuenta,
        activa=true,actualizada_por=auth.uid(),actualizada_at=now()
    where id=true returning * into c;
  return jsonb_build_object('ok',true,'titular',c.titular,'nit',c.nit,
    'banco',c.banco,'tipo_cuenta',c.tipo_cuenta,'terminacion',right(c.numero_cuenta,4));
end $$;
revoke all on function kora_private.guardar_cuenta_recaudo_creditek(text,text,text) from public,anon;
grant execute on function kora_private.guardar_cuenta_recaudo_creditek(text,text,text) to authenticated;
create function public.guardar_cuenta_recaudo_creditek(
  p_banco text,p_tipo_cuenta text,p_numero_cuenta text
) returns jsonb language sql security invoker set search_path='' as $$
  select kora_private.guardar_cuenta_recaudo_creditek($1,$2,$3)
$$;
revoke all on function public.guardar_cuenta_recaudo_creditek(text,text,text) from public,anon;
grant execute on function public.guardar_cuenta_recaudo_creditek(text,text,text) to authenticated;

-- Reemplaza únicamente la regla de destinos; no altera instrucciones existentes.
alter table public.instrucciones_consignacion drop constraint instrucciones_destino_retail_check;
alter table public.instrucciones_consignacion add constraint instrucciones_destino_retail_check check (
  (tipo_destino='PROVEEDOR' and proveedor_id is not null and financial_entry_id is null and beneficiario_socio is null) or
  (tipo_destino='OSCAR' and proveedor_id is null and financial_entry_id is null and beneficiario_socio is null) or
  (tipo_destino='CREDITEK' and proveedor_id is null and financial_entry_id is null and beneficiario_socio is null) or
  (tipo_destino='SOCIO' and proveedor_id is null and financial_entry_id is not null and beneficiario_socio is not null and length(btrim(beneficiario_socio))>=3)
);
alter table public.instrucciones_consignacion add column creditek_request_id uuid;
create unique index instrucciones_creditek_request_uidx
  on public.instrucciones_consignacion(creditek_request_id)
  where creditek_request_id is not null;

create function kora_private.crear_instruccion_recaudo_creditek(
  p_tienda_codigo text,p_fecha date,p_valor_esperado numeric,p_observacion text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c kora_private.cuenta_recaudo_creditek%rowtype;
  i public.instrucciones_consignacion%rowtype;
  disponible numeric; reservado numeric; deuda numeric;
begin
  if auth.uid() is null or not public.es_controlador_financiero() then
    raise exception 'Solo Maythe u Oscar emiten esta instrucción';
  end if;
  if p_request_id is null then raise exception 'Falta identificador de la solicitud'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into i from public.instrucciones_consignacion where creditek_request_id=p_request_id;
  if found then
    if i.tienda_codigo is distinct from p_tienda_codigo or i.fecha is distinct from p_fecha
      or i.valor_esperado is distinct from p_valor_esperado then
      raise exception 'La solicitud ya existe con otros datos';
    end if;
    return jsonb_build_object('ok',true,'reutilizado',true,'instruccion_id',i.id);
  end if;
  if p_fecha is null or p_valor_esperado is null or p_valor_esperado<=0
    or p_valor_esperado::text in ('NaN','Infinity','-Infinity')
    or not exists(select 1 from public.origenes where codigo=p_tienda_codigo and tipo='propia' and activo)
  then raise exception 'Selecciona tienda propia activa, fecha y monto positivo'; end if;
  select * into c from kora_private.cuenta_recaudo_creditek where id=true for share;
  if not c.activa then raise exception 'Configura primero la cuenta de recaudo verificada de Creditek'; end if;
  perform pg_advisory_xact_lock(hashtextextended('retiro-caja:'||p_tienda_codigo,0));
  disponible:=coalesce((public.calcular_efectivo_esperado_tienda(p_tienda_codigo,p_fecha)->>'esperado')::numeric,0);
  select coalesce(sum(valor_esperado),0) into reservado
    from public.instrucciones_consignacion
    where tienda_codigo=p_tienda_codigo
      and ((fecha=p_fecha and estado in ('pendiente','en_validacion'))
        or (tipo_destino='SOCIO' and estado in ('pendiente','en_validacion','rechazado')));
  if p_valor_esperado>disponible-reservado then
    raise exception 'El valor supera el efectivo disponible sin asignar';
  end if;
  select coalesce(sum(case when tipo='cargo' then monto else -monto end),0)
    into deuda from public.cuenta_corriente where tienda_codigo=p_tienda_codigo;
  select deuda-coalesce(sum(valor_esperado),0) into deuda
    from public.instrucciones_consignacion
    where tienda_codigo=p_tienda_codigo and tipo_destino='CREDITEK'
      and estado in ('pendiente','en_validacion','rechazado');
  if p_valor_esperado>deuda then
    raise exception 'El abono supera la deuda registrada de esta tienda con Creditek';
  end if;
  insert into public.instrucciones_consignacion(
    tienda_codigo,fecha,banco,numero_cuenta,valor_esperado,tipo_destino,
    observacion,creada_por,creditek_request_id
  ) values (
    p_tienda_codigo,p_fecha,c.banco||' · '||c.tipo_cuenta,c.numero_cuenta,
    p_valor_esperado,'CREDITEK',nullif(btrim(coalesce(p_observacion,'')),''),
    auth.uid(),p_request_id
  ) returning * into i;
  return jsonb_build_object('ok',true,'reutilizado',false,'instruccion_id',i.id);
end $$;
revoke all on function kora_private.crear_instruccion_recaudo_creditek(text,date,numeric,text,uuid) from public,anon;
grant execute on function kora_private.crear_instruccion_recaudo_creditek(text,date,numeric,text,uuid) to authenticated;
create function public.crear_instruccion_recaudo_creditek(
  p_tienda_codigo text,p_fecha date,p_valor_esperado numeric,p_observacion text,p_request_id uuid
) returns jsonb language sql security invoker set search_path='' as $$
  select kora_private.crear_instruccion_recaudo_creditek($1,$2,$3,$4,$5)
$$;
revoke all on function public.crear_instruccion_recaudo_creditek(text,date,numeric,text,uuid) from public,anon;
grant execute on function public.crear_instruccion_recaudo_creditek(text,date,numeric,text,uuid) to authenticated;

-- Registro de recaudo bancario separado del saldo B2B y de proveedores.
create table kora_private.recaudos_creditek_tienda (
  instruccion_id uuid primary key references public.instrucciones_consignacion(id) on delete restrict,
  abono_id uuid not null unique references public.abonos(id) on delete restrict,
  tienda_codigo text not null,
  fecha date not null,
  titular text not null,
  nit text not null,
  banco text not null,
  numero_cuenta text not null,
  monto numeric not null check(monto>0),
  soporte_path text not null,
  validado_por uuid not null,
  validado_at timestamptz not null default now()
);
alter table kora_private.recaudos_creditek_tienda enable row level security;
revoke all on kora_private.recaudos_creditek_tienda from public,anon,authenticated;
create function kora_private.registrar_recaudo_creditek() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.abonos%rowtype; saldo numeric;
begin
  if new.tipo_destino<>'CREDITEK' or new.estado<>'validado'
    or old.estado='validado' then return new; end if;
  select * into a from public.abonos where instruccion_id=new.id;
  if not found or a.monto is distinct from new.valor_esperado or a.soporte_path is null then
    raise exception 'El recaudo Creditek exige un abono validado y soportado';
  end if;
  select coalesce(sum(case when tipo='cargo' then monto else -monto end),0)
    into saldo from public.cuenta_corriente where tienda_codigo=new.tienda_codigo;
  if saldo < 0 then raise exception 'El abono supera la deuda de la tienda con Creditek'; end if;
  insert into kora_private.recaudos_creditek_tienda(
    instruccion_id,abono_id,tienda_codigo,fecha,titular,nit,banco,numero_cuenta,
    monto,soporte_path,validado_por
  ) values (
    new.id,a.id,new.tienda_codigo,new.fecha,'CREDITEK S.A.S.','901.259.859-0',
    new.banco,new.numero_cuenta,new.valor_esperado,a.soporte_path,new.decidida_por
  );
  return new;
end $$;
revoke all on function kora_private.registrar_recaudo_creditek() from public,anon,authenticated;
create trigger registrar_recaudo_creditek
after update of estado on public.instrucciones_consignacion
for each row execute function kora_private.registrar_recaudo_creditek();

-- La tienda necesita reconocer que el destinatario es Creditek antes de consignar.
create or replace function public.listar_instrucciones_consignacion()
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare v_perfil public.perfiles%rowtype;
begin
  select * into v_perfil from public.perfiles where id=auth.uid() and activo;
  if not found then raise exception 'Perfil activo requerido'; end if;
  return query
  select jsonb_build_object(
    'id',i.id,'tipo_destino',i.tipo_destino,'beneficiario',
      case when i.tipo_destino='CREDITEK' then 'CREDITEK S.A.S. · NIT 901.259.859-0'
           when i.tipo_destino='SOCIO' then i.beneficiario_socio
           else null end,
    'beneficiario_socio',i.beneficiario_socio,'financial_entry_id',i.financial_entry_id,
    'tienda_codigo',i.tienda_codigo,'fecha',i.fecha,'fecha_pago',c.fecha_pago,
    'banco',i.banco,'numero_cuenta',i.numero_cuenta,'valor_esperado',i.valor_esperado,
    'estado',i.estado,'created_at',i.created_at,'comprobante_id',c.id,
    'comprobante_version',c.version,'valor_confirmado',c.valor_confirmado,
    'soporte_path',c.soporte_path,'motivo_decision',c.motivo_decision
  ) || case when v_perfil.rol in ('gerencia','auditoria') then
    jsonb_build_object('proveedor_id',i.proveedor_id,'proveedor_nombre',p.nombre,
      'observacion',i.observacion,'creada_por',i.creada_por,
      'decidida_por',i.decidida_por,'decidida_at',i.decidida_at)
    else '{}'::jsonb end
  from public.instrucciones_consignacion i
  left join public.proveedores p on p.id=i.proveedor_id
  left join lateral (
    select cc.* from public.comprobantes_consignacion cc
    where cc.instruccion_id=i.id order by cc.version desc limit 1
  ) c on true
  where v_perfil.rol in ('gerencia','auditoria') or i.tienda_codigo=v_perfil.tienda_codigo
  order by i.fecha desc,i.created_at desc;
end $$;
