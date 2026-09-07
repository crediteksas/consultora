-- Column definitions inspected in KORA; no production rows or personal data.
-- Financial functions below are the inspected implementations, not test mocks.
create table public.aliados (
id uuid default gen_random_uuid(),
nombre_comercial text,
razon_social text,
identificacion text,
propietario text,
ejecutivo_id uuid,
ciudad_principal text,
estado text default 'activo'::text,
estado_asociacion text default 'confirmada'::text,
fecha_vinculacion date default CURRENT_DATE,
created_at timestamp with time zone default now(),
created_by uuid,
updated_at timestamp with time zone default now(),
updated_by uuid,
contacto text,
telefono text,
email text,
observacion text,
revision integer default 0,
payment_beneficiary_id uuid
);
create table public.aliados_sedes (
id uuid default gen_random_uuid(),
aliado_id uuid,
origen_codigo text,
nombre text,
ciudad text,
direccion text,
estado_asociacion text default 'confirmada'::text,
activa boolean default true,
created_at timestamp with time zone default now(),
created_by uuid,
updated_at timestamp with time zone default now(),
updated_by uuid
);
create table public.audit_log (
id bigint,
usuario text,
accion text,
tabla text,
registro_id text,
detalle jsonb,
created_at timestamp with time zone default now()
);
create table public.beneficiary_bank_accounts (
id uuid default gen_random_uuid(),
beneficiary_id uuid,
banco text,
tipo_cuenta text,
numero_cuenta text,
validada boolean default false,
validada_por uuid,
validada_at timestamp with time zone,
activo boolean default true,
created_at timestamp with time zone default now()
);
create table public.ejecutivos (
id uuid default gen_random_uuid(),
nombre text,
telefono text,
activo boolean default true,
esquema_comision jsonb,
nota text,
created_at timestamp with time zone default now()
);
create table public.krediya_bonus_rules (
id uuid default gen_random_uuid(),
tipo_establecimiento text,
valor numeric(16,2),
vigente_desde date,
vigente_hasta date,
activo boolean default true,
creado_por uuid default auth.uid(),
actualizado_por uuid,
created_at timestamp with time zone default now(),
updated_at timestamp with time zone default now(),
concepto text,
beneficiary_id uuid
);
create table public.krediya_diferencias (
operation_id uuid,
liquidation_id uuid,
contexto jsonb,
estado text default 'pendiente'::text,
updated_at timestamp with time zone default now(),
vence_el date default (((now() AT TIME ZONE 'America/Bogota'::text))::date + 7)
);
create table public.krediya_price_rules (
id uuid default gen_random_uuid(),
referencia_clave text,
referencia text,
precio_venta numeric(16,2),
pagamos numeric(16,2),
vigente_desde date default CURRENT_DATE,
vigente_hasta date,
activo boolean default true,
creado_por uuid default auth.uid(),
actualizado_por uuid,
created_at timestamp with time zone default now(),
updated_at timestamp with time zone default now(),
codigo text
);
create table public.liquidation_beneficiaries (
id uuid default gen_random_uuid(),
tipo text,
identificacion text,
nombre text,
origen_codigo text,
ejecutivo_id uuid,
activo boolean default true,
created_at timestamp with time zone default now()
);
create table public.liquidation_bonuses (
id uuid default gen_random_uuid(),
liquidation_id uuid,
operation_id uuid,
beneficiary_id uuid,
tipo_bono text,
rule_snapshot jsonb,
valor numeric(16,2),
motivo text,
estado text default 'borrador'::text,
idempotency_key uuid,
created_by uuid default auth.uid(),
created_at timestamp with time zone default now()
);
create table public.liquidation_calculations (
id uuid default gen_random_uuid(),
liquidation_id uuid,
operation_id uuid,
policy_version_id uuid,
policy_snapshot jsonb,
pagamos numeric(16,2),
pago_aliado numeric(16,2),
total_bonos numeric(16,2) default 0,
utilidad_creditek numeric(16,2),
explanation jsonb,
calculated_by uuid default auth.uid(),
calculated_at timestamp with time zone default now()
);
create table public.liquidation_domain_events (
id uuid default gen_random_uuid(),
event_type text,
aggregate_type text,
aggregate_id uuid,
payload jsonb,
occurred_at timestamp with time zone default now(),
published_at timestamp with time zone,
attempts integer default 0,
idempotency_key text
);
create table public.liquidation_incidents (
id uuid default gen_random_uuid(),
liquidation_id uuid,
operation_id uuid,
tipo text,
descripcion text,
bloquea_aprobacion boolean default true,
estado text default 'abierta'::text,
resolution text,
resolved_by uuid,
resolved_at timestamp with time zone,
created_at timestamp with time zone default now()
);
create table public.liquidation_operations (
id uuid default gen_random_uuid(),
liquidation_id uuid,
plataforma text,
source_key text,
external_id text,
operation_at timestamp with time zone,
establishment_name text,
origen_codigo text,
tipo_establecimiento text,
ejecutivo_id uuid,
cliente_documento text,
cliente_nombre text,
imei text,
referencia text,
modelo text,
monto_credito numeric(16,2),
monto_base numeric(16,2),
inicial numeric(16,2) default 0,
accesorios_cantidad integer default 0,
accesorios numeric(16,2) default 0,
reconocida boolean default false,
normalized_data jsonb,
created_at timestamp with time zone default now(),
venta_id uuid,
credito_id uuid,
unidad_id uuid,
inicial_kora numeric(16,2),
diferencia_inicial numeric(16,2),
costo_equipo numeric(16,2),
pagamos numeric(16,2),
pago_neto_tienda numeric(16,2),
utilidad_tienda numeric(16,2),
utilidad_creditek_tienda numeric(16,2),
diferencia_justificacion text,
diferencia_revisada_por uuid,
diferencia_revisada_at timestamp with time zone,
snapshot_tienda_at timestamp with time zone,
valor_comercial numeric(16,2),
porcentaje_politica numeric(8,6),
policy_version_id uuid,
policy_snapshot jsonb,
pago_neto_beneficiario numeric(16,2),
bonos_aplicados numeric(16,2),
utilidad_creditek numeric(16,2),
resultado_cerrado numeric(16,2) default 0,
cierre_utilidad_at timestamp with time zone,
cierre_utilidad_motivo text
);
create table public.liquidations (
id uuid default gen_random_uuid(),
plataforma text,
estado text default 'importada'::text,
periodo_desde date,
periodo_hasta date,
fecha_corte date,
imported_at timestamp with time zone default now(),
imported_by uuid default auth.uid(),
reviewed_at timestamp with time zone,
reviewed_by uuid,
approved_at timestamp with time zone,
approved_by uuid,
frozen_at timestamp with time zone,
total_operaciones numeric(16,2) default 0,
total_pago_aliados numeric(16,2) default 0,
total_bonos numeric(16,2) default 0,
total_utilidad_creditek numeric(16,2) default 0,
total_pagar numeric(16,2) default 0,
idempotency_key uuid,
created_at timestamp with time zone default now(),
updated_at timestamp with time zone default now(),
operaciones_tiendas integer default 0,
operaciones_aliados integer default 0,
total_pago_tiendas numeric(16,2) default 0,
total_utilidad_tiendas numeric(16,2) default 0
);
create table public.origenes (
codigo text,
nombre text,
tipo text,
ciudad text,
activo boolean default true,
created_at timestamp with time zone default now(),
ejecutivo_id uuid,
aliases jsonb default '[]'::jsonb,
inventario_control_activo boolean default false,
inventario_control_desde timestamp with time zone
);
create table public.payment_items (
id uuid default gen_random_uuid(),
payment_order_id uuid,
operation_id uuid,
bonus_id uuid,
concepto text,
valor numeric(16,2),
created_at timestamp with time zone default now()
);
create table public.payment_orders (
id uuid default gen_random_uuid(),
liquidation_id uuid,
beneficiary_id uuid,
bank_account_id uuid,
valor numeric(16,2),
estado text default 'pendiente'::text,
fecha_programada date,
fecha_pagada timestamp with time zone,
soporte_path text,
idempotency_key uuid,
created_by uuid default auth.uid(),
created_at timestamp with time zone default now(),
updated_at timestamp with time zone default now(),
payment_kind text,
concept text,
cutoff_snapshot date,
platform_snapshot text,
operations_count integer default 0,
commercial_value numeric(16,2) default 0,
own_bonuses numeric(16,2) default 0,
bank_snapshot jsonb,
paid_by uuid,
authorized_by uuid,
authorized_at timestamp with time zone,
historico_inicial boolean default false,
requiere_soporte boolean default true,
fecha_inicio_operacion date default '2026-09-01'::date
);
create table public.settlement_policy_versions (
id uuid default gen_random_uuid(),
version integer,
plataforma text,
tipo_establecimiento text,
porcentaje numeric(8,6),
base_field text,
formula_code text,
vigente_desde date,
vigente_hasta date,
estado text,
creado_por uuid,
aprobado_por uuid,
aprobado_at timestamp with time zone,
created_at timestamp with time zone default now()
);
CREATE OR REPLACE FUNCTION public.aliados_calcular_bonos_ejecutivos(p_liquidation_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o record;
  v_ejecutivo record;
  v_extra record;
  v_vendedor_norm text;
  v_ejecutivo_norm text;
  v_venta_directa boolean;
  v_seq integer;
  v_valor numeric;
  v_creados integer := 0;
  v_beneficiary_id uuid;
begin
  if not tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para calcular bonos'; end if;
  if exists(select 1 from liquidations where id=p_liquidation_id and frozen_at is not null) then raise exception 'Liquidación aprobada inmutable'; end if;

  delete from liquidation_bonuses
  where liquidation_id = p_liquidation_id
    and tipo_bono in ('automatico_ejecutivo', 'automatico_override', 'automatico_universal');

  for o in
    select lo.* from liquidation_operations lo
    where lo.liquidation_id = p_liquidation_id
      and lo.tipo_establecimiento = 'aliado'
      and lo.reconocida = true
      and lo.origen_codigo is not null
  loop
    if o.ejecutivo_id is null then
      update liquidation_operations set ejecutivo_id = (select ejecutivo_id from origenes where codigo = o.origen_codigo)
      where id = o.id;
      o.ejecutivo_id := (select ejecutivo_id from origenes where codigo = o.origen_codigo);
    end if;

    if o.ejecutivo_id is not null then
      select * into v_ejecutivo from ejecutivos where id = o.ejecutivo_id;
      if v_ejecutivo.esquema_comision is not null then
        v_vendedor_norm := lower(unaccent(coalesce(o.normalized_data->>'vendedorNombre','')));
        v_ejecutivo_norm := lower(unaccent(v_ejecutivo.nombre));
        v_venta_directa := v_vendedor_norm <> ''
          and v_vendedor_norm like '%'||split_part(v_ejecutivo_norm,' ',1)||'%'
          and v_vendedor_norm like '%'||split_part(v_ejecutivo_norm,' ',2)||'%';

        select count(*)+1 into v_seq
        from liquidation_operations lo2
        where lo2.origen_codigo = o.origen_codigo
          and lo2.tipo_establecimiento = 'aliado'
          and lo2.reconocida = true
          and lo2.operation_at < o.operation_at;

        if v_ejecutivo.esquema_comision->>'tipo' = 'tiered_por_aliado' then
          if v_venta_directa then
            v_valor := (v_ejecutivo.esquema_comision->>'valor_venta_directa')::numeric;
          elsif v_seq <= (v_ejecutivo.esquema_comision->>'primeras_n')::int then
            v_valor := (v_ejecutivo.esquema_comision->>'valor_primeras')::numeric;
          else
            v_valor := (v_ejecutivo.esquema_comision->>'valor_resto')::numeric;
          end if;
        elsif v_ejecutivo.esquema_comision->>'tipo' = 'fijo' then
          v_valor := (v_ejecutivo.esquema_comision->>'valor')::numeric;
        elsif v_ejecutivo.esquema_comision->>'tipo' = 'fijo_mas_override' then
          v_valor := (v_ejecutivo.esquema_comision->>'valor_propio')::numeric;
        else
          v_valor := null;
        end if;

        if v_valor is not null and v_valor > 0 then
          select id into v_beneficiary_id from liquidation_beneficiaries where tipo='ejecutivo' and ejecutivo_id = v_ejecutivo.id and activo limit 1;
          if v_beneficiary_id is not null then
            insert into liquidation_bonuses(liquidation_id, operation_id, beneficiary_id, tipo_bono, valor, motivo, estado, idempotency_key)
            values (p_liquidation_id, o.id, v_beneficiary_id, 'automatico_ejecutivo', v_valor,
              case
                when v_venta_directa then 'Venta directa - ' || v_ejecutivo.nombre
                when v_ejecutivo.esquema_comision->>'tipo' = 'tiered_por_aliado' then 'Venta #' || v_seq || ' del aliado ' || o.origen_codigo
                else 'Comisión fija por crédito'
              end,
              'aprobado', gen_random_uuid());
            v_creados := v_creados + 1;
          end if;
        end if;

        for v_extra in select * from ejecutivos where esquema_comision->>'tipo' = 'fijo_mas_override' and id <> o.ejecutivo_id and activo
        loop
          select id into v_beneficiary_id from liquidation_beneficiaries where tipo='ejecutivo' and ejecutivo_id = v_extra.id and activo limit 1;
          if v_beneficiary_id is not null then
            insert into liquidation_bonuses(liquidation_id, operation_id, beneficiary_id, tipo_bono, valor, motivo, estado, idempotency_key)
            values (p_liquidation_id, o.id, v_beneficiary_id, 'automatico_override',
              (v_extra.esquema_comision->>'valor_override_otros_ejecutivos')::numeric,
              'Override sobre venta de ' || v_ejecutivo.nombre, 'aprobado', gen_random_uuid());
            v_creados := v_creados + 1;
          end if;
        end loop;
      end if;
    end if;

    -- comisión universal (Maythe): aplica a TODO crédito de aliado, sin importar el ejecutivo asignado
    for v_extra in select * from ejecutivos where esquema_comision->>'tipo' = 'fijo_universal' and activo
    loop
      select id into v_beneficiary_id from liquidation_beneficiaries where tipo='ejecutivo' and ejecutivo_id = v_extra.id and activo limit 1;
      if v_beneficiary_id is not null then
        insert into liquidation_bonuses(liquidation_id, operation_id, beneficiary_id, tipo_bono, valor, motivo, estado, idempotency_key)
        values (p_liquidation_id, o.id, v_beneficiary_id, 'automatico_universal',
          (v_extra.esquema_comision->>'valor')::numeric,
          'Comisión fija por liquidar crédito de aliado', 'aprobado', gen_random_uuid());
        v_creados := v_creados + 1;
      end if;
    end loop;
  end loop;

  insert into audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid(),'aliados_bonos_ejecutivos_calculados','liquidations',p_liquidation_id,jsonb_build_object('bonos_creados',v_creados));

  return v_creados;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.aliados_beneficiario_de_comercio(p_origen_codigo text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select case when a.id is not null then
   (select b.id from public.liquidation_beneficiaries b where b.id=a.payment_beneficiary_id and b.tipo='aliado' and b.activo)
 else (select min(b.id::text)::uuid from public.liquidation_beneficiaries b
   where b.origen_codigo=o.codigo and b.tipo='aliado' and b.activo having count(*)=1) end
 from public.origenes o left join public.aliados_sedes s on s.origen_codigo=o.codigo
 left join public.aliados a on a.id=s.aliado_id where o.codigo=p_origen_codigo and o.tipo='aliado' and o.activo
$function$
;
CREATE OR REPLACE FUNCTION public.aliados_contexto_precio_krediya(p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare o public.liquidation_operations%rowtype; r public.krediya_price_rules%rowtype; b numeric; recibido numeric; pago_recibido numeric;
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado'; end if;
 select * into o from public.liquidation_operations where id=p_operation_id and plataforma='krediya';
 if not found then raise exception 'Operación no encontrada'; end if;
 select * into r from public.krediya_price_rules where referencia_clave in (
 'ref:'||regexp_replace(lower(coalesce(o.referencia,'')),'[^a-z0-9]','','g'),
 lower(btrim(coalesce(o.modelo,o.referencia,''))))
 and activo and vigente_desde<=(o.operation_at at time zone 'America/Bogota')::date
 and (vigente_hasta is null or vigente_hasta>=(o.operation_at at time zone 'America/Bogota')::date)
 order by (referencia_clave like 'ref:%') desc,vigente_desde desc,created_at desc limit 1;
 recibido:=coalesce(nullif(o.policy_snapshot->'krediya_fuente'->>'valorComercial','')::numeric,nullif(o.normalized_data->>'valorComercial','')::numeric,coalesce(o.monto_credito,o.monto_base)+o.inicial);
 pago_recibido:=case when o.policy_snapshot ? 'krediya_fuente' then nullif(o.policy_snapshot->'krediya_fuente'->>'pagamosArchivo','')::numeric when o.normalized_data->>'origenValoresLiquidacion'='tarifario_kora' then null else nullif(o.normalized_data->>'pagamosArchivo','')::numeric end;
 select sum(valor) into b from public.krediya_bonus_rules where tipo_establecimiento=o.tipo_establecimiento and activo
 and vigente_desde<=(o.operation_at at time zone 'America/Bogota')::date and (vigente_hasta is null or vigente_hasta>=(o.operation_at at time zone 'America/Bogota')::date);
 return jsonb_build_object('operation_id',o.id,'referencia',coalesce(o.referencia,o.modelo),'modelo',o.modelo,'tienda',o.establishment_name,
 'imei',o.imei,'fecha',(o.operation_at at time zone 'America/Bogota')::date,'pvp_guardado',r.precio_venta,'pagamos_guardado',coalesce(r.pagamos,nullif(o.policy_snapshot->'pagamos_fuente_manual'->>'pagamos','')::numeric),
 'fuente_pagamos',case when r.id is null then o.policy_snapshot->'pagamos_fuente_manual' else null end,
 'pvp_recibido',recibido,'pagamos_recibido',pago_recibido,'diferencia_pvp',recibido-r.precio_venta,
 'bonos',b,'inicial',o.inicial,'decision',o.policy_snapshot->'decision_precio','regla_id',r.id);
end$function$
;
