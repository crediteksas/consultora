create table public.proveedores_retencion_automatica (
  proveedor_id uuid primary key references public.proveedores(id),
  tarifa_porcentaje numeric(8,5) not null default 2.5 check (tarifa_porcentaje=2.5),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.proveedores_retencion_automatica enable row level security;
revoke all on public.proveedores_retencion_automatica from public,anon,authenticated;
grant select on public.proveedores_retencion_automatica to authenticated;
create policy proveedores_retencion_lectura on public.proveedores_retencion_automatica
  for select to authenticated using ((select public.es_central()));
insert into public.proveedores_retencion_automatica(proveedor_id)
select id from public.proveedores where upper(regexp_replace(nombre,'[^a-zA-Z0-9]','','g'))
  in ('INITY','MRMOVILSAS','COMQUIASAS','COMUNICARIBE','CONMOVIL','TEKMOBILE');
do $$begin
  if (select count(*) from public.proveedores_retencion_automatica)<>6 then
    raise exception 'Se requieren los seis proveedores inequívocos de la política';
  end if;
end $$;
alter table public.facturas_proveedor add column retencion_automatica_snapshot jsonb;

-- El diferimiento permite terminar todos los pasos de la compra en una sola transacción.
-- Incluye los endpoints anteriores: ninguno puede crear una compra omitiendo la retención.
create function kora_private.validar_retencion_compra_automatica() returns trigger
language plpgsql security definer set search_path='' as $$
declare f public.facturas_proveedor%rowtype; r record; tarifa numeric; v_base numeric;
begin
  select * into f from public.facturas_proveedor where id=new.id;
  select tarifa_porcentaje into tarifa from public.proveedores_retencion_automatica
    where proveedor_id=f.proveedor_id and activo;
  if not found or f.total<=0 or coalesce(f.origen_registro,'') in
      ('saldo_inicial','ajuste_gerencia','anticipo_proveedor') then return null; end if;
  v_base:=(f.retencion_automatica_snapshot->>'base')::numeric;
  if v_base is null or v_base<=0 or v_base>f.total then
    raise exception 'RETENCION_AUTOMATICA: confirma la base antes de IVA en Registrar compra';
  end if;
  select count(*) cantidad,min(valor) valor,min(base) base,min(tarifa_porcentaje) tarifa,
    bool_and(descontada_al_registrar) descontada into r
    from public.retenciones_factura_proveedor where factura_id=f.id and tipo='ReteFuente';
  if r.cantidad<>1 or r.base is distinct from v_base or r.tarifa is distinct from tarifa
    or r.valor is distinct from round(v_base*tarifa/100,2) or r.descontada is distinct from true then
    raise exception 'RETENCION_AUTOMATICA: la compra exige una sola ReteFuente calculada y aplicada';
  end if;
  return null;
end $$;
revoke all on function kora_private.validar_retencion_compra_automatica() from public,anon,authenticated;
create constraint trigger compra_exige_retencion_automatica
  after insert or update of total,proveedor_id,retencion_automatica_snapshot on public.facturas_proveedor
  deferrable initially deferred for each row execute function kora_private.validar_retencion_compra_automatica();

create function kora_private.proteger_retencion_automatica() returns trigger
language plpgsql security definer set search_path='' as $$
declare factura uuid; tarifa numeric;
begin
  factura:=case when tg_op='DELETE' then old.factura_id else new.factura_id end;
  select p.tarifa_porcentaje into tarifa from public.facturas_proveedor f
    join public.proveedores_retencion_automatica p on p.proveedor_id=f.proveedor_id and p.activo
    where f.id=factura for update of f;
  if not found then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op<>'INSERT' and old.tipo='ReteFuente' then
    if tg_op='UPDATE' and not old.descontada_al_registrar and new.descontada_al_registrar
      and to_jsonb(old)-'descontada_al_registrar'=to_jsonb(new)-'descontada_al_registrar' then return new; end if;
    raise exception 'La retención automática conserva su registro original; requiere corrección auditada';
  end if;
  if tg_op<>'DELETE' and new.tipo='ReteFuente' then
    if new.tarifa_porcentaje is distinct from tarifa
      or new.valor is distinct from round(new.base*tarifa/100,2) then
      raise exception 'La ReteFuente debe ser el 2,5 %% de la base antes de IVA';
    end if;
    if exists(select 1 from public.retenciones_factura_proveedor where factura_id=factura
      and tipo='ReteFuente' and id is distinct from new.id) then raise exception 'La factura ya tiene ReteFuente'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function kora_private.proteger_retencion_automatica() from public,anon,authenticated;
create trigger proteger_retencion_automatica before insert or update or delete
  on public.retenciones_factura_proveedor for each row execute function kora_private.proteger_retencion_automatica();

create function kora_private.registrar_compra_retencion_automatica(
  p_proveedor_id uuid,p_numero_factura text,p_fecha date,p_tipo_compra text,
  p_fecha_vencimiento date,p_fuente_fondos text,p_items jsonb,p_soporte_path text,
  p_nota text,p_idempotency_key uuid,p_retenciones jsonb,p_base_sin_iva numeric
) returns jsonb language plpgsql security definer set search_path='' as $$
declare tarifa numeric; v_total numeric; retenido numeric; resultado jsonb; f public.facturas_proveedor%rowtype;
  huella text; adicionales jsonb; id_factura uuid;
begin
  if auth.uid() is null or not coalesce(public.es_central(),false) then
    raise exception 'Solo Gerencia o Gestión puede registrar compras' using errcode='42501';
  end if;
  select tarifa_porcentaje into tarifa from public.proveedores_retencion_automatica
    where proveedor_id=p_proveedor_id and activo;
  if not found then raise exception 'Este proveedor no tiene retención automática configurada'; end if;
  if nullif(btrim(p_numero_factura),'') is null or p_fecha is null or p_idempotency_key is null or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items)=0 or jsonb_typeof(p_retenciones) is distinct from 'array' then
    raise exception 'Compra incompleta';
  end if;
  if exists(select 1 from jsonb_array_elements(p_retenciones) x where x->>'tipo'='ReteFuente') then
    raise exception 'ReteFuente se calcula automáticamente; no la agregues otra vez';
  end if;
  select round(sum((x->>'cantidad')::numeric*(x->>'costo_unitario')::numeric),2)
    into v_total from jsonb_array_elements(p_items) x;
  if p_base_sin_iva is null or p_base_sin_iva<=0 or p_base_sin_iva<>round(p_base_sin_iva,2)
    or v_total is null or p_base_sin_iva>v_total then raise exception 'Confirma la base antes de IVA de la factura'; end if;
  huella:=md5(jsonb_build_object('proveedor',p_proveedor_id,'numero',p_numero_factura,'fecha',p_fecha,
    'tipo',p_tipo_compra,'vencimiento',p_fecha_vencimiento,'fondos',p_fuente_fondos,'items',p_items,
    'base',p_base_sin_iva,'retenciones',p_retenciones)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  select * into f from public.facturas_proveedor where operacion_idempotency_key=p_idempotency_key;
  if found then
    if f.retencion_automatica_snapshot->>'huella' is distinct from huella then
      raise exception 'La solicitud ya fue utilizada con otros datos'; end if;
    return jsonb_build_object('ok',true,'reutilizado',true,'factura_id',f.id,'total',f.total,
      'total_retenido',(select coalesce(sum(valor),0) from public.retenciones_factura_proveedor
        where factura_id=f.id and descontada_al_registrar),'base_retencion',p_base_sin_iva);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('proveedor-factura:'||p_proveedor_id::text||upper(regexp_replace(p_numero_factura,'[^a-zA-Z0-9]','','g')),0));
  if exists(select 1 from public.facturas_proveedor where proveedor_id=p_proveedor_id
    and upper(regexp_replace(numero,'[^a-zA-Z0-9]','','g'))=upper(regexp_replace(p_numero_factura,'[^a-zA-Z0-9]','','g'))) then
    raise exception 'La factura ya existe para este proveedor'; end if;
  retenido:=round(p_base_sin_iva*tarifa/100,2);
  adicionales:=p_retenciones||jsonb_build_array(jsonb_build_object('tipo','ReteFuente','base',p_base_sin_iva,
    'tarifa',tarifa,'valor',retenido));
  resultado:=public.registrar_compra_proveedor_operativa(p_proveedor_id,p_numero_factura,p_fecha,
    p_tipo_compra,p_fecha_vencimiento,p_fuente_fondos,p_items,p_soporte_path,p_nota,p_idempotency_key,adicionales);
  id_factura:=(resultado->>'factura_id')::uuid;
  update public.facturas_proveedor set retencion_automatica_snapshot=jsonb_build_object(
    'base',p_base_sin_iva,'iva',v_total-p_base_sin_iva,'tarifa',tarifa,'valor',retenido,
    'huella',huella,'origen','base_confirmada_en_compra') where id=id_factura;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'RETENCION_AUTOMATICA_COMPRA','facturas_proveedor',id_factura::text,
      jsonb_build_object('base',p_base_sin_iva,'tarifa',tarifa,'valor',retenido,'idempotency_key',p_idempotency_key));
  return resultado||jsonb_build_object('base_retencion',p_base_sin_iva,'retefuente_automatica',retenido);
end $$;
revoke all on function kora_private.registrar_compra_retencion_automatica(uuid,text,date,text,date,text,jsonb,text,text,uuid,jsonb,numeric) from public,anon,authenticated;
create function public.registrar_compra_proveedor_automatica(
  p_proveedor_id uuid,p_numero_factura text,p_fecha date,p_tipo_compra text,
  p_fecha_vencimiento date,p_fuente_fondos text,p_items jsonb,p_soporte_path text,
  p_nota text,p_idempotency_key uuid,p_retenciones jsonb,p_base_sin_iva numeric
) returns jsonb language sql security definer set search_path='' as $$
  select kora_private.registrar_compra_retencion_automatica(p_proveedor_id,p_numero_factura,p_fecha,p_tipo_compra,
    p_fecha_vencimiento,p_fuente_fondos,p_items,p_soporte_path,p_nota,p_idempotency_key,p_retenciones,p_base_sin_iva)
$$;
revoke all on function public.registrar_compra_proveedor_automatica(uuid,text,date,text,date,text,jsonb,text,text,uuid,jsonb,numeric) from public,anon,authenticated;
grant execute on function public.registrar_compra_proveedor_automatica(uuid,text,date,text,date,text,jsonb,text,text,uuid,jsonb,numeric) to authenticated;

-- Corrección privada de una compra anterior aún íntegramente pendiente, sin pagos ni ajustes.
create function kora_private.completar_retencion_proveedor_pendiente(
  p_factura uuid,p_base numeric,p_iva_xml numeric,p_total_xml numeric,p_total_esperado numeric,
  p_saldo_esperado numeric,p_actor uuid,p_referencia text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.facturas_proveedor%rowtype; tarifa numeric; valor numeric; r public.retenciones_factura_proveedor%rowtype;
  antes jsonb; despues jsonb;
begin
  if session_user not in ('postgres','supabase_admin') or current_user not in ('postgres','supabase_admin') then
    raise exception 'Solo soporte SQL administrativo'; end if;
  if not exists(select 1 from public.perfiles where id=p_actor and activo and rol='gerencia') then
    raise exception 'Falta autorización de Gerencia'; end if;
  select * into f from public.facturas_proveedor where id=p_factura for update;
  if not found then raise exception 'Factura inexistente'; end if;
  select tarifa_porcentaje into tarifa from public.proveedores_retencion_automatica where proveedor_id=f.proveedor_id and activo;
  if not found or p_base is null or p_base<=0 or p_base>f.total or p_iva_xml is null or p_iva_xml<0
    or p_total_xml is null or abs(p_base+p_iva_xml-p_total_xml)>0.02 or length(coalesce(p_referencia,''))<20
    or length(p_referencia)>250 then raise exception 'Base o soporte inválidos'; end if;
  valor:=round(p_base*tarifa/100,2);
  select * into r from public.retenciones_factura_proveedor where factura_id=f.id and tipo='ReteFuente';
  if found then
    if r.base is distinct from p_base or r.valor is distinct from valor or r.referencia is distinct from p_referencia
      or f.retencion_automatica_snapshot->>'origen' is distinct from 'regularizacion_xml' then
      raise exception 'La factura ya tiene otra retención'; end if;
    return jsonb_build_object('ok',true,'reutilizado',true,'retencion_id',r.id,'valor',r.valor,'saldo',f.saldo);
  end if;
  if f.total is distinct from p_total_esperado or f.saldo is distinct from p_saldo_esperado or f.saldo<>f.total
    or f.total<=valor or coalesce(f.origen_registro,'') in ('saldo_inicial','ajuste_gerencia','anticipo_proveedor')
    or exists(select 1 from public.pagos_proveedor where factura_id=f.id)
    or exists(select 1 from public.proveedores_ajustes_detalle where factura_id=f.id) then
    raise exception 'La factura tiene movimientos previos o cambió su saldo; conciliar antes de aplicar'; end if;
  antes:=to_jsonb(f);
  insert into public.retenciones_factura_proveedor(factura_id,tipo,base,tarifa_porcentaje,valor,fecha,
    descontada_al_registrar,referencia,registrado_por)
    values(f.id,'ReteFuente',p_base,tarifa,valor,f.fecha,true,p_referencia,p_actor) returning * into r;
  update public.facturas_proveedor set saldo=saldo-valor,retencion_automatica_snapshot=jsonb_build_object(
    'base',p_base,'iva_xml',p_iva_xml,'total_xml',p_total_xml,'diferencia_total_xml',p_total_xml-f.total,
    'tarifa',tarifa,'valor',valor,'origen','regularizacion_xml','operador_sql',session_user,'autorizado_por',p_actor)
    where id=f.id returning to_jsonb(facturas_proveedor) into despues;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(p_actor::text,'COMPLETAR_RETENCION_PROVEEDOR','facturas_proveedor',f.id::text,
      jsonb_build_object('antes',antes,'despues',despues,'retencion_id',r.id,'referencia',p_referencia,'operador_sql',session_user));
  return jsonb_build_object('ok',true,'reutilizado',false,'retencion_id',r.id,'valor',valor,'saldo',f.saldo-valor,
    'diferencia_total_xml',p_total_xml-f.total);
end $$;
revoke all on function kora_private.completar_retencion_proveedor_pendiente(uuid,numeric,numeric,numeric,numeric,numeric,uuid,text) from public,anon,authenticated;
