-- Fictional dependency model. No production rows, network or external payments.
create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema krediya_private;create schema kora_private;
create function auth.uid() returns uuid language sql stable as $$select nullif(coalesce(current_setting('test.actor',true),'11111111-1111-4111-8111-111111111111'),'')::uuid$$;
create function public.tiene_capacidad_aliados(text) returns boolean language sql stable as $$select coalesce(nullif(current_setting('test.allowed',true),''),'true')::boolean$$;
create function public.unaccent(text) returns text language sql immutable as $$select $1$$;
create function kora_private.clave_comercio(text) returns text language sql immutable as $$select lower(regexp_replace($1,'[^a-zA-Z0-9]','','g'))$$;
create table public.liquidations(id uuid primary key default gen_random_uuid(),plataforma text default 'krediya',estado text default 'calculada',frozen_at timestamptz,approved_at timestamptz,approved_by uuid,reviewed_at timestamptz,reviewed_by uuid,updated_at timestamptz,total_operaciones numeric,total_pago_aliados numeric,total_pago_tiendas numeric,total_bonos numeric,total_utilidad_creditek numeric,total_utilidad_tiendas numeric,total_pagar numeric,operaciones_aliados int,operaciones_tiendas int);
create table public.liquidation_operations(id uuid primary key default gen_random_uuid(),liquidation_id uuid,plataforma text default 'krediya',referencia text,modelo text,imei text,external_id text,operation_at timestamptz,tipo_establecimiento text,origen_codigo text,ejecutivo_id uuid,establishment_name text,inicial numeric,monto_credito numeric,monto_base numeric,reconocida boolean default true,normalized_data jsonb default '{}',policy_snapshot jsonb default '{}',valor_comercial numeric,pagamos numeric,pago_neto_beneficiario numeric,pago_neto_tienda numeric,bonos_aplicados numeric,utilidad_creditek numeric,utilidad_creditek_tienda numeric);
create table public.krediya_price_rules(id uuid primary key default gen_random_uuid(),referencia_clave text,referencia text,precio_venta numeric,pagamos numeric,vigente_desde date,vigente_hasta date,activo boolean default true,created_at timestamptz default now());
create table public.krediya_bonus_rules(id uuid primary key default gen_random_uuid(),beneficiary_id uuid,tipo_establecimiento text,activo boolean default true,vigente_desde date,vigente_hasta date,concepto text,valor numeric);
create table public.ejecutivos(id uuid primary key,nombre text,esquema_comision jsonb,activo boolean default true);
create table public.origenes(codigo text primary key,nombre text,tipo text,activo boolean default true,aliases jsonb default '[]',ejecutivo_id uuid);
create table public.liquidation_beneficiaries(id uuid primary key,ejecutivo_id uuid,tipo text,activo boolean default true);
create table public.beneficiary_bank_accounts(id uuid primary key default gen_random_uuid(),beneficiary_id uuid,activo boolean default true,validada boolean default true,validada_at timestamptz default now());
create table public.payment_orders(id uuid primary key default gen_random_uuid(),liquidation_id uuid,beneficiary_id uuid,bank_account_id uuid,valor numeric,idempotency_key uuid,secuencia_beneficiario int default 1,estado text default 'pendiente',authorized_at timestamptz,authorized_by uuid,unique(liquidation_id,beneficiary_id,secuencia_beneficiario));
create table public.payment_items(id uuid primary key default gen_random_uuid(),payment_order_id uuid,operation_id uuid,bonus_id uuid,concepto text,valor numeric);
create table public.liquidation_bonuses(id uuid primary key default gen_random_uuid(),liquidation_id uuid,operation_id uuid,beneficiary_id uuid,tipo_bono text,rule_snapshot jsonb,valor numeric,motivo text,estado text,idempotency_key uuid);
create table public.liquidation_calculations(id uuid primary key default gen_random_uuid(),liquidation_id uuid,operation_id uuid,policy_snapshot jsonb,pagamos numeric,pago_aliado numeric,total_bonos numeric,utilidad_creditek numeric,explanation jsonb,calculated_by uuid);
create table public.liquidation_incidents(id uuid primary key default gen_random_uuid(),liquidation_id uuid,operation_id uuid,tipo text,descripcion text,estado text default 'abierta',resolution text,resolved_at timestamptz,resolved_by uuid,bloquea_aprobacion boolean default false);
create table public.liquidation_approvals(id uuid primary key default gen_random_uuid(),liquidation_id uuid,etapa text,decision text);
create table public.krediya_diferencias(operation_id uuid primary key,liquidation_id uuid,contexto jsonb,estado text default 'pendiente',updated_at timestamptz);
create table public.audit_log(id uuid primary key default gen_random_uuid(),usuario text,accion text,tabla text,registro_id text,detalle jsonb);
-- Simplified fixed-bonus dependency, unchanged before/after. Native engine and automatic preview remain exact sources.
create function public.aliados_calcular_bonos_ejecutivos(p_id uuid) returns void language plpgsql as $$begin
 delete from public.liquidation_bonuses where liquidation_id=p_id and tipo_bono='automatico_ejecutivo';
 insert into public.liquidation_bonuses(liquidation_id,operation_id,beneficiary_id,tipo_bono,valor,estado)
 select p_id,o.id,b.id,'automatico_ejecutivo',(e.esquema_comision->>'valor')::numeric,'aprobado' from public.liquidation_operations o join public.ejecutivos e on e.id=o.ejecutivo_id join public.liquidation_beneficiaries b on b.ejecutivo_id=e.id and b.tipo='ejecutivo' where o.liquidation_id=p_id and o.reconocida and o.tipo_establecimiento='aliado';
end$$;
create function public.aliados_beneficiario_de_comercio(text) returns uuid language sql stable as $$select 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid$$;
