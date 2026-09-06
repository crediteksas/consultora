-- Cliente -> varios locales; cliente -> titular -> cuentas. La cuenta no se
-- copia ni se traslada al agregar un local. Los pagos existentes son inmutables.
alter table public.aliados add column payment_beneficiary_id uuid references public.liquidation_beneficiaries(id);
create index aliados_payment_beneficiary_idx on public.aliados(payment_beneficiary_id);

-- Solo vínculos anteriores inequívocos. Nunca agrupar clientes por un nombre.
update public.aliados a set payment_beneficiary_id=x.beneficiary_id
from (select s.aliado_id,min(b.id::text)::uuid beneficiary_id
 from public.aliados_sedes s join public.liquidation_beneficiaries b
 on b.origen_codigo=s.origen_codigo and b.tipo='aliado' and b.activo
 group by s.aliado_id having count(distinct b.id)=1) x where a.id=x.aliado_id;

create function public.aliados_beneficiario_de_comercio(p_origen_codigo text)
returns uuid language sql stable security invoker set search_path='' as $$
 select case when a.id is not null then
   (select b.id from public.liquidation_beneficiaries b where b.id=a.payment_beneficiary_id and b.tipo='aliado' and b.activo)
 else (select min(b.id::text)::uuid from public.liquidation_beneficiaries b
   where b.origen_codigo=o.codigo and b.tipo='aliado' and b.activo having count(*)=1) end
 from public.origenes o left join public.aliados_sedes s on s.origen_codigo=o.codigo
 left join public.aliados a on a.id=s.aliado_id where o.codigo=p_origen_codigo and o.tipo='aliado' and o.activo
$$;
revoke all on function public.aliados_beneficiario_de_comercio(text) from public,anon;
grant execute on function public.aliados_beneficiario_de_comercio(text) to authenticated;

create or replace function public.tesoreria_guardar_cliente_cuenta(
 p_origen_codigo text,p_previous_beneficiary_id uuid,p_nombre text,p_identificacion text,
 p_banco text,p_tipo_cuenta text,p_numero_cuenta text,p_verificada boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_client public.aliados%rowtype; v_holder public.liquidation_beneficiaries%rowtype;
 v_account public.beneficiary_bank_accounts%rowtype; v_previous uuid; v_id text:=btrim(coalesce(p_identificacion,''));
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para administrar clientes y cuentas'; end if;
 if p_verificada is distinct from true then raise exception 'Verifica el titular y los datos bancarios'; end if;
 if length(btrim(coalesce(p_nombre,''))) not between 3 and 180 then raise exception 'Escribe el nombre del titular'; end if;
 if v_id !~ '^[0-9]{5,20}$' then raise exception 'Identificación inválida'; end if;
 perform 1 from public.origenes where codigo=p_origen_codigo and tipo='aliado' and activo for update;
 if not found then raise exception 'Comercio no disponible'; end if;
 perform 1 from public.aliados_sedes where origen_codigo=p_origen_codigo for update;
 select a.* into v_client from public.aliados a join public.aliados_sedes s on s.aliado_id=a.id
 where s.origen_codigo=p_origen_codigo for update of a;
 if not found then raise exception 'Falta vincular la ficha del cliente'; end if;
 v_previous:=public.aliados_beneficiario_de_comercio(p_origen_codigo);
 if v_previous is distinct from p_previous_beneficiary_id then raise exception 'La relación del cliente cambió. Actualiza el directorio antes de guardar'; end if;
 perform pg_advisory_xact_lock(hashtextextended('treasury-holder:'||v_id,0));
 select * into v_holder from public.liquidation_beneficiaries where tipo='aliado' and identificacion=v_id for update;
 if found then
   -- Reutilizar identidad; no cambiar el nombre de un titular desde otro local.
   if upper(btrim(v_holder.nombre))<>upper(btrim(p_nombre)) then raise exception 'La identificación pertenece al titular %. Selecciónalo en Titular relacionado',v_holder.nombre; end if;
   if not v_holder.activo then raise exception 'El titular está inactivo; requiere revisión antes de relacionarlo'; end if;
 else
   insert into public.liquidation_beneficiaries(tipo,identificacion,nombre,origen_codigo,activo)
    values('aliado',v_id,btrim(p_nombre),p_origen_codigo,true) returning * into v_holder;
 end if;
 select * into v_account from public.aliados_guardar_cuenta_bancaria(v_holder.id,p_banco,p_tipo_cuenta,p_numero_cuenta,true);
 update public.aliados set payment_beneficiary_id=v_holder.id,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=v_client.id;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'cliente_cuenta_compartida_guardada','aliados',v_client.id,
  jsonb_build_object('origen_codigo',p_origen_codigo,'previous_beneficiary_id',v_previous,'beneficiary_id',v_holder.id,
   'bank_account_id',v_account.id,'locales',(select jsonb_agg(origen_codigo order by origen_codigo) from public.aliados_sedes where aliado_id=v_client.id),
   'alcance','maestro_futuras_liquidaciones'));
 return jsonb_build_object('ok',true,'beneficiary_id',v_holder.id,'bank_account_id',v_account.id);
end $$;
revoke all on function public.tesoreria_guardar_cliente_cuenta(text,uuid,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.tesoreria_guardar_cliente_cuenta(text,uuid,text,text,text,text,text,boolean) to authenticated;

-- La ruta antigua deja de trasladar al titular y reutiliza el escritor único.
create or replace function public.aliados_crear_tercero_con_cuenta(p_origen_codigo text,p_identificacion text,p_nombre text,p_banco text,p_tipo_cuenta text,p_numero_cuenta text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 return public.tesoreria_guardar_cliente_cuenta(p_origen_codigo,public.aliados_beneficiario_de_comercio(p_origen_codigo),
   p_nombre,p_identificacion,p_banco,p_tipo_cuenta,p_numero_cuenta,true);
end $$;
revoke all on function public.aliados_crear_tercero_con_cuenta(text,text,text,text,text,text) from public,anon;
grant execute on function public.aliados_crear_tercero_con_cuenta(text,text,text,text,text,text) to authenticated;

-- Acción explícita de Gestión: agregar UN local a un cliente existente.
-- No deduce que compartir un titular bancario equivale a compartir identidad legal.
create function public.tesoreria_vincular_local_cliente(p_origen_codigo text,p_cliente_anterior uuid,p_cliente_destino uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_site public.aliados_sedes%rowtype; v_old public.aliados%rowtype; v_new public.aliados%rowtype;
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para relacionar locales'; end if;
 perform 1 from public.origenes where codigo=p_origen_codigo and tipo='aliado' and activo for update;
 if not found then raise exception 'Comercio no disponible'; end if;
 select * into v_site from public.aliados_sedes where origen_codigo=p_origen_codigo for update;
 if not found or v_site.aliado_id is distinct from p_cliente_anterior then raise exception 'La relación del local cambió. Actualiza el directorio'; end if;
 perform 1 from public.aliados where id in(p_cliente_anterior,p_cliente_destino) order by id for update;
 select * into v_old from public.aliados where id=p_cliente_anterior;
 select * into v_new from public.aliados where id=p_cliente_destino and estado='activo';
 if not found then raise exception 'Cliente destino no disponible'; end if;
 if p_cliente_anterior=p_cliente_destino then return jsonb_build_object('ok',true,'sin_cambios',true); end if;
 -- No perder una ficha legal/documental por un traslado desde la pantalla simple.
 if exists(select 1 from public.aliados_documentos where aliado_id=p_cliente_anterior and sede_id is null)
  or exists(select 1 from public.aliados_plataformas where aliado_id=p_cliente_anterior and sede_id is null)
  or exists(select 1 from unnest(array['razon_social','identificacion','propietario','contacto','telefono','email','observacion']) k
    where nullif(btrim(to_jsonb(v_old)->>k),'') is not null and nullif(btrim(to_jsonb(v_old)->>k),'') is distinct from nullif(btrim(to_jsonb(v_new)->>k),'')) then
   raise exception 'La ficha actual tiene información propia distinta. Revisa y concilia esos datos antes de relacionar el local';
 end if;
 update public.aliados_sedes set aliado_id=p_cliente_destino,updated_at=now(),updated_by=auth.uid() where id=v_site.id;
 update public.aliados_documentos set aliado_id=p_cliente_destino where sede_id=v_site.id;
 update public.aliados_plataformas set aliado_id=p_cliente_destino where sede_id=v_site.id;
 update public.aliados set revision=revision+1,updated_at=now(),updated_by=auth.uid() where id in(p_cliente_anterior,p_cliente_destino);
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'cliente_local_relacionado','aliados_sedes',v_site.id,
  jsonb_build_object('sede_antes',to_jsonb(v_site),'cliente_anterior',to_jsonb(v_old),'cliente_destino',p_cliente_destino,
   'titular_destino',v_new.payment_beneficiary_id,'alcance','maestro_futuras_liquidaciones'));
 return jsonb_build_object('ok',true,'cliente_id',p_cliente_destino);
end $$;
revoke all on function public.tesoreria_vincular_local_cliente(text,uuid,uuid) from public,anon;
grant execute on function public.tesoreria_vincular_local_cliente(text,uuid,uuid) to authenticated;

-- Resolver destinatario por cliente/local en los motores, sin variar fórmulas,
-- aprobación, bonos ni importes. Abortar si el código fuente ya cambió.
do $$
declare v_sql text; v_old text; v_new text; v_fn text;
begin
 for v_fn,v_old,v_new in values
 ('public.aliados_calcular_liquidacion(uuid)',
  'select * into b from public.liquidation_beneficiaries where tipo=case when o.tipo_establecimiento=''aliado'' then ''aliado'' else ''otro'' end and origen_codigo=o.origen_codigo and activo limit 1;',
  'select * into b from public.liquidation_beneficiaries where activo and ((o.tipo_establecimiento=''aliado'' and id=public.aliados_beneficiario_de_comercio(o.origen_codigo)) or (o.tipo_establecimiento<>''aliado'' and tipo=''otro'' and origen_codigo=o.origen_codigo)) limit 1;'),
 ('krediya_private.calcular_y_enviar_aprobacion(uuid)',
  'select id into b from public.liquidation_beneficiaries where tipo=''aliado'' and origen_codigo=o.origen_codigo and activo order by created_at desc limit 1;',
  'b:=public.aliados_beneficiario_de_comercio(o.origen_codigo);'),
 ('public.aliados_completar_pagos_beneficiario(uuid)',
  'and lower(op.origen_codigo)=lower(beneficiary.origen_codigo)',
  'and public.aliados_beneficiario_de_comercio(op.origen_codigo)=beneficiary.id')
 loop
  v_sql:=pg_get_functiondef(v_fn::regprocedure);
  if strpos(v_sql,v_old)=0 then raise exception 'Cambió %, revisar antes de migrar',v_fn; end if;
  v_sql:=replace(v_sql,v_old,v_new);
  if v_fn='public.aliados_completar_pagos_beneficiario(uuid)' then
    v_sql:=replace(v_sql,'if beneficiary.tipo=''aliado'' and nullif(btrim(beneficiary.origen_codigo),'''') is not null then','if beneficiary.tipo=''aliado'' and beneficiary.activo then');
  end if;
  execute v_sql;
 end loop;
end $$;
