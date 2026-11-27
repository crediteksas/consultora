-- PREPARATION ONLY. No real profile is assigned or widened by this script.
begin;
set local search_path='';
do $preflight$
declare actual text[];expected text[]:=array['abonos','abonos_clientes_b2b_destino','addi_liquidaciones','ajustes_auditoria_cartera_b2b','ajustes_gerencia_solicitudes','ajustes_inventario','aliados','aliados_cierres_utilidad','aliados_cruces_recuperacion','aliados_documentos','aliados_domain_events','aliados_estado_historial','aliados_gastos_operativos','aliados_metas_plataforma','aliados_operadores','aliados_plataformas','aliados_recuperaciones','aliados_reversiones','aliados_sedes','aplicaciones_abono_cliente_b2b_proveedor','aplicaciones_consignacion_proveedor','audit_log','b2b_aura_memoria','b2b_catalogo_borradores','b2b_catalogo_reglas','b2b_certificados_cliente','b2b_cierre_pedidos','b2b_cierres','b2b_facturas_emitidas','b2b_listas_precios','b2b_ofertas','b2b_pedido_avisos','b2b_pedido_fuente','b2b_presupuestos','b2b_referencias_catalogo','b2b_retenciones_cliente','banco_creditek_aplicaciones_proveedor','banco_creditek_cuentas','banco_creditek_movimientos','banco_creditek_pagos_proveedor','beneficiary_bank_accounts','caja_arqueo_intentos','caja_ciclo_config','caja_cortes','caja_diaria','captadores','cartera_retail_retiros_auditoria','categorias_producto','clientes','cobra_krediya_cut_operations','cobra_krediya_cuts','cobra_provision_actions','cobra_provision_authority','cobra_provision_funding_operations','cobra_provision_funding_sources','cobra_provision_fundings','cobros_allocations','cobros_deposits','cobros_events','cobros_expected','comisiones','comprobantes_consignacion','conceptos_gasto','confirmaciones_deuda_tienda','conteos_bloque','conteos_bloque_items','costo_promedio_tienda_historial','credit_collection_events','credit_customer_links','credit_portfolio_obligations','credit_portfolio_operators','credit_portfolio_settings','credit_repayments','creditos','creditos_historicos','creditos_historicos_plataforma','creditos_plataforma_consulta_log','cuenta_corriente','cuentas_cartera','documentos_solicitud','ejecutivos','enlaces_registro','equivalencias_tienda','erp_migration_cuts','facturas_proveedor','festivos_colombia','financial_entries','financial_recurring_templates','gastos','gastos_historial','historico_importado','historico_mensual','importacion_detalle','importaciones_financiera','instrucciones_consignacion','kora_incident_comments','kora_incident_history','kora_incident_notifications','kora_incident_operations','kora_incident_permissions','kora_incident_sequences','kora_incidents','kora_notifications','kora_nova_outbox','kora_nova_platform_renewals','kora_nova_renewal_delivery','kora_nova_reviewers','kora_nova_sources','krediya_bonus_rules','krediya_diferencias','krediya_diferencias_gestiones','krediya_gestiones','krediya_import_reports','krediya_instrucciones','krediya_price_rules','liquidation_adjustments','liquidation_approvals','liquidation_beneficiaries','liquidation_bonuses','liquidation_calculations','liquidation_domain_events','liquidation_imported_files','liquidation_incidents','liquidation_operations','liquidation_platforms','liquidation_source_rows','liquidation_treasury_destinations','liquidations','movimientos','movimientos_caja_tienda','movimientos_cartera','movimientos_tesoreria_central','nova_allied_login_challenges','nova_allied_login_members','nova_allied_login_sessions','nova_authorizations','nova_client_otp_dispatch','nova_client_otp_policy','nova_otp_delivery_receipts','nova_photo_quality_consents','nova_retail_actor_emails','nova_retail_case_events','nova_retail_cases','nova_retail_notifications','nova_retail_photo_events','nova_retail_photo_reviews','nova_retail_reference_deliveries','nova_retail_reference_replacements','nova_retail_reviewers','nova_retail_store_contacts','orden_compra_cambios','orden_compra_items','ordenes_compra','origenes','otp_codigos','pagos_proveedor','payment_destination_corrections','payment_dispatch_items','payment_dispatches','payment_items','payment_orders','pedido_b2b_items','pedidos_b2b','perfiles','periodos','presupuesto_premio_mensual','presupuesto_premios','presupuesto_whatsapp_destinos','presupuesto_whatsapp_envios','presupuestos','producto_foto_historial','productos','proveedores','proveedores_ajustes_detalle','proveedores_ajustes_solicitudes','proveedores_retencion_automatica','referencias','remision_items','remision_margenes','remisiones','reportes_deuda_enviados','reportes_diarios_enviados','retail_b2b_compensations','retenciones_factura_proveedor','saldo_ajustes_auditoria','saldos_iniciales_cartera','sesiones_conteo_cruzado','settlement_policy_versions','solicitudes','stock_cantidad','stock_cantidad_lotes','traslado_items','traslados','treasury_movements','treasury_unit_balances','unidades','utilidades_cierres_negocio','venta_ajustes_administrativos','venta_devoluciones','venta_items','ventas','ventas_autorizaciones'];x record;grants_json jsonb;
begin
 if current_setting('server_version_num')::integer<160000 then raise exception 'cartera_unsupported_server';end if;
 
declare expected jsonb:='[{"schema":"realtime","name":"messages","kind":"p"},{"schema":"realtime","name":"schema_migrations","kind":"r"},{"schema":"realtime","name":"subscription","kind":"r"},{"schema":"storage","name":"bucket_lifecycle_states","kind":"r"},{"schema":"storage","name":"buckets","kind":"r"},{"schema":"storage","name":"buckets_analytics","kind":"r"},{"schema":"storage","name":"buckets_vectors","kind":"r"},{"schema":"storage","name":"lifecycle_abandoned_artifacts","kind":"r"},{"schema":"storage","name":"migrations","kind":"r"},{"schema":"storage","name":"objects","kind":"r"},{"schema":"storage","name":"s3_multipart_uploads","kind":"r"},{"schema":"storage","name":"s3_multipart_uploads_parts","kind":"r"},{"schema":"storage","name":"vector_indexes","kind":"r"}]'::jsonb;actual jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind) order by n.nspname,c.relname),'[]') into actual from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in('storage','realtime') and c.relkind in('r','p','v','m','f');
 if actual is distinct from expected then raise exception 'cartera_managed_inventory_changed';end if;
 if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname in('storage','realtime') and c.relkind in('r','p','v','m','f')
 and not((n.nspname='storage' and c.relname in('objects','buckets'))or(n.nspname='realtime' and c.relname='messages'))
 and (not c.relrowsecurity or c.relkind not in('r','p') or exists(select 1 from pg_catalog.pg_policy p where p.polrelid=c.oid and p.polpermissive and exists(select 1 from unnest(p.polroles) r where r=0 or pg_catalog.pg_has_role('authenticated',r,'USAGE'))))) then raise exception 'cartera_managed_surface_not_isolated';end if;
end;
 if current_user<>'postgres' then raise exception 'cartera_unreviewed_installer';end if;
 if (select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint where conrelid='public.perfiles'::regclass and conname='perfiles_rol_check') is distinct from 'CHECK ((rol = ANY (ARRAY[''gerencia''::text, ''auditoria''::text, ''admin_tienda''::text, ''asesor''::text])))' then raise exception 'cartera_role_constraint_changed';end if;
 if exists(select 1 from pg_catalog.pg_namespace where nspname='kora_cartera_policy') then raise exception 'cartera_policy_schema_collision';end if;
 if exists(select 1 from pg_catalog.pg_roles where rolname='kora_cartera_operator') then raise exception 'cartera_role_collision';end if;
 if exists(select 1 from public.perfiles where rol='operador_cartera') then raise exception 'cartera_prior_profile_holder';end if;
 if to_regclass('kora_private.cartera_principals') is not null or to_regprocedure('public.cartera_operador_inicio()') is not null then raise exception 'cartera_installation_collision';end if;
 select array_agg(c.relname::text order by c.relname) into actual from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p');
 if actual is distinct from expected then raise exception 'cartera_relation_inventory_changed';end if;
 if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and (not c.relrowsecurity or pg_catalog.pg_get_userbyid(c.relowner)<>current_user)) then raise exception 'cartera_table_protection_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.kora_confirmacion_deuda_pre_request()'::regprocedure))<>'be5212a1608d406157c1641fcaa851d8' or md5(pg_catalog.pg_get_functiondef('kora_private.exigir_confirmacion_deuda_api()'::regprocedure))<>'a8aad0e67f70551625e9ede1937b92cd' then raise exception 'cartera_existing_guard_changed';end if;
 if exists(select 1 from pg_catalog.pg_extension where extname='pg_graphql') or exists(select 1 from pg_catalog.pg_publication_tables) then raise exception 'cartera_unreviewed_interface';end if;
 grants_json:=nullif(current_setting('supautils.policy_grants',true),'')::jsonb;
 for x in select c.oid,n.nspname,c.relname,c.relowner,c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where (n.nspname='storage' and c.relname in('objects','buckets')) or(n.nspname='realtime' and c.relname='messages') loop
  if not x.relrowsecurity then raise exception 'cartera_managed_rls_disabled';end if;
  if pg_catalog.pg_get_userbyid(x.relowner)<>current_user and not coalesce(grants_json->current_user ? (x.nspname||'.'||x.relname),false) then raise exception 'cartera_provider_policy_permission_missing';end if;
 end loop;
 if (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where (n.nspname='storage' and c.relname in('objects','buckets')) or(n.nspname='realtime' and c.relname='messages'))<>3 then raise exception 'cartera_managed_relation_missing';end if;
end $preflight$;

create role kora_cartera_operator nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant kora_cartera_operator to postgres with inherit false,set true;
grant usage on schema public,kora_private to kora_cartera_operator;
create schema kora_cartera_policy;
revoke all on schema kora_cartera_policy from public,anon,authenticated,service_role;
grant usage on schema kora_cartera_policy to authenticated,kora_cartera_operator;
-- Needed only for assigning reviewed function ownership. Removed before commit.
grant create on schema public,kora_private to kora_cartera_operator;
do $$begin
 if has_schema_privilege('kora_cartera_operator','auth','USAGE') or not has_function_privilege('kora_cartera_operator','auth.uid()','EXECUTE') then raise exception 'cartera_identity_permission_changed';end if;
end$$;

-- SQL-standard body is bound at definition time to the provider's auth.uid OID.
-- It runs as the caller, returns only the caller's UUID and accesses no rows.
-- No USAGE/CREATE privilege is granted on the managed auth schema.
create function public.cartera_subject() returns uuid language sql stable security invoker set search_path='' return auth.uid();
-- Same caller-only identity exposure as auth.uid(); dependencies of shared
-- functions must also work for anon and non-API database callers.
grant execute on function public.cartera_subject() to public;

create table kora_private.cartera_principals(user_id uuid primary key,recorded_at timestamptz not null default clock_timestamp());
create table kora_private.cartera_contract(singleton boolean primary key default true check(singleton),enabled boolean not null default false,fingerprint text);
create table kora_private.cartera_rpc_budget(user_id uuid not null,minute_start timestamptz not null,calls integer not null check(calls>0),primary key(user_id,minute_start));
alter table kora_private.cartera_principals enable row level security;
alter table kora_private.cartera_contract enable row level security;
alter table kora_private.cartera_rpc_budget enable row level security;
revoke all on kora_private.cartera_principals,kora_private.cartera_contract,kora_private.cartera_rpc_budget from public,anon,authenticated,service_role,kora_cartera_operator;
insert into kora_private.cartera_contract(singleton,enabled) values(true,false);

create function kora_cartera_policy.cartera_principal_restringido() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select public.cartera_subject()) is not null and exists(select 1 from kora_private.cartera_principals p where p.user_id=(select public.cartera_subject())),false);
$$;
revoke all on function kora_cartera_policy.cartera_principal_restringido() from public,anon,authenticated,service_role;
grant execute on function kora_cartera_policy.cartera_principal_restringido() to authenticated,kora_cartera_operator;

create function kora_private.cartera_record_profile() returns trigger language plpgsql security definer set search_path='' as $$
declare restricted boolean:=false;
begin
 if tg_op<>'INSERT' then restricted:=old.rol='operador_cartera' or exists(select 1 from kora_private.cartera_principals p where p.user_id=old.id);end if;
 if tg_op<>'DELETE' then restricted:=restricted or new.rol='operador_cartera' or exists(select 1 from kora_private.cartera_principals p where p.user_id=new.id);end if;
 if restricted then
  if tg_op<>'INSERT' then insert into kora_private.cartera_principals(user_id) values(old.id) on conflict(user_id) do nothing;end if;
  if tg_op<>'DELETE' then insert into kora_private.cartera_principals(user_id) values(new.id) on conflict(user_id) do nothing;end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
revoke all on function kora_private.cartera_record_profile() from public,anon,authenticated,service_role,kora_cartera_operator;
create trigger cartera_record_profile after insert or update or delete on public.perfiles for each row execute function kora_private.cartera_record_profile();

do $scope$
declare x record;
begin
 for x in select n.nspname,c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where (n.nspname='public' and c.relkind in('r','p')) or(n.nspname='storage' and c.relname in('objects','buckets')) or(n.nspname='realtime' and c.relname='messages') order by n.nspname,c.relname loop
  execute format('create policy cartera_dedicated_deny on %I.%I as restrictive for all to authenticated using (not (select kora_cartera_policy.cartera_principal_restringido())) with check (not (select kora_cartera_policy.cartera_principal_restringido()))',x.nspname,x.relname);
 end loop;
end $scope$;

-- The technical role has only its own bounded bootstrap policies. It never inherits authenticated.
grant select(id,nombre,rol,activo,tienda_codigo) on public.perfiles to kora_cartera_operator;
grant select(perfil_id,capability,active) on public.credit_portfolio_operators to kora_cartera_operator;
create policy cartera_tech_profile_allow on public.perfiles for select to kora_cartera_operator using(id=(select public.cartera_subject()) and (select kora_cartera_policy.cartera_principal_restringido()));
create policy cartera_tech_profile_bound on public.perfiles as restrictive for select to kora_cartera_operator using(id=(select public.cartera_subject()) and (select kora_cartera_policy.cartera_principal_restringido()));
create policy cartera_tech_cap_allow on public.credit_portfolio_operators for select to kora_cartera_operator using(perfil_id=(select public.cartera_subject()) and (select kora_cartera_policy.cartera_principal_restringido()));
create policy cartera_tech_cap_bound on public.credit_portfolio_operators as restrictive for select to kora_cartera_operator using(perfil_id=(select public.cartera_subject()) and (select kora_cartera_policy.cartera_principal_restringido()));

create function kora_private.cartera_catalog_fingerprint() returns text language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object(
 'relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'options',c.reloptions,'view',case when c.relkind in('v','m') then pg_catalog.pg_get_viewdef(c.oid,true) end,'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',a.atttypid,'mod',a.atttypmod,'acl',a.attacl,'null',a.attnotnull) order by a.attnum) from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'policies',(select jsonb_agg(jsonb_build_object('name',p.polname,'roles',p.polroles,'cmd',p.polcmd,'permissive',p.polpermissive,'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid),'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname) from pg_catalog.pg_policy p where p.polrelid=c.oid),'triggers',(select jsonb_agg(pg_catalog.pg_get_triggerdef(t.oid) order by t.tgname) from pg_catalog.pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),'constraints',(select jsonb_agg(pg_catalog.pg_get_constraintdef(k.oid) order by k.conname) from pg_catalog.pg_constraint k where k.conrelid=c.oid)) order by n.nspname,c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' or(n.nspname='kora_private' and c.relname like 'cartera_%') or n.nspname in('storage','realtime')),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),'owner',p.proowner,'acl',p.proacl,'definition',case when p.prokind in('f','p') then pg_catalog.pg_get_functiondef(p.oid) end) order by n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid)) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','kora_private','kora_cartera_policy') or(p.oid='auth.uid()'::regprocedure)),
 'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,'inherit',r.rolinherit,'bypass',r.rolbypassrls,'super',r.rolsuper,'create_role',r.rolcreaterole,'create_db',r.rolcreatedb) order by r.rolname) from pg_catalog.pg_roles r where r.rolname in('anon','authenticated','authenticator','service_role','postgres','kora_cartera_operator')),
 'members',(select jsonb_agg(jsonb_build_object('role',m.roleid,'member',m.member,'grantor',m.grantor,'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) order by m.roleid,m.member,m.grantor) from pg_catalog.pg_auth_members m),
 'event_triggers',(select jsonb_agg(jsonb_build_object('name',evtname,'event',evtevent,'owner',evtowner,'enabled',evtenabled,'tags',evttags,'function',pg_catalog.pg_get_functiondef(evtfoid)) order by evtname) from pg_catalog.pg_event_trigger),
 'default_acl',(select jsonb_agg(jsonb_build_object('role',defaclrole,'schema',defaclnamespace,'type',defaclobjtype,'acl',defaclacl) order by defaclrole,defaclnamespace,defaclobjtype) from pg_catalog.pg_default_acl where defaclnamespace=0 or defaclnamespace in(select oid from pg_catalog.pg_namespace where nspname in('public','kora_private','kora_cartera_policy'))),
 'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'owner',nspowner,'acl',nspacl) order by nspname) from pg_catalog.pg_namespace where nspname in('public','kora_private','kora_cartera_policy','auth','storage','realtime')),
 'extensions',(select jsonb_agg(jsonb_build_object('name',extname,'version',extversion) order by extname) from pg_catalog.pg_extension),
 'publications',(select jsonb_agg(jsonb_build_object('publication',pubname,'schema',schemaname,'table',tablename) order by pubname,schemaname,tablename) from pg_catalog.pg_publication_tables),
 'pre_request',(select jsonb_agg(s order by s) from pg_catalog.pg_db_role_setting d cross join lateral unnest(d.setconfig) s where s like 'pgrst.db_pre_request=%' or s like 'pgrst.db_schemas=%')
 )::text,'UTF8')),'hex');
$$;
revoke all on function kora_private.cartera_catalog_fingerprint() from public,anon,authenticated,service_role,kora_cartera_operator;

-- Core-only fixture hook. The full candidate replaces it with exact pins of
-- every trusted shared dependency before the contract seal. Core is not deployable.
create function kora_private.cartera_assert_dependencies() returns void language plpgsql security invoker set search_path='' as $$begin null;end$$;
revoke all on function kora_private.cartera_assert_dependencies() from public,anon,authenticated,service_role,kora_cartera_operator;

-- All row-bearing managed relations, including any provider partitions/views.
-- No permissions or ownership on provider objects are changed here.
create function kora_private.cartera_assert_managed() returns void language plpgsql security definer set search_path='' as $$
declare expected jsonb:='[{"schema":"realtime","name":"messages","kind":"p"},{"schema":"realtime","name":"schema_migrations","kind":"r"},{"schema":"realtime","name":"subscription","kind":"r"},{"schema":"storage","name":"bucket_lifecycle_states","kind":"r"},{"schema":"storage","name":"buckets","kind":"r"},{"schema":"storage","name":"buckets_analytics","kind":"r"},{"schema":"storage","name":"buckets_vectors","kind":"r"},{"schema":"storage","name":"lifecycle_abandoned_artifacts","kind":"r"},{"schema":"storage","name":"migrations","kind":"r"},{"schema":"storage","name":"objects","kind":"r"},{"schema":"storage","name":"s3_multipart_uploads","kind":"r"},{"schema":"storage","name":"s3_multipart_uploads_parts","kind":"r"},{"schema":"storage","name":"vector_indexes","kind":"r"}]'::jsonb;actual jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind) order by n.nspname,c.relname),'[]') into actual from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in('storage','realtime') and c.relkind in('r','p','v','m','f');
 if actual is distinct from expected then raise exception 'cartera_managed_inventory_changed';end if;
 if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname in('storage','realtime') and c.relkind in('r','p','v','m','f')
 and not((n.nspname='storage' and c.relname in('objects','buckets'))or(n.nspname='realtime' and c.relname='messages'))
 and (not c.relrowsecurity or c.relkind not in('r','p') or exists(select 1 from pg_catalog.pg_policy p where p.polrelid=c.oid and p.polpermissive and exists(select 1 from unnest(p.polroles) r where r=0 or pg_catalog.pg_has_role('authenticated',r,'USAGE'))))) then raise exception 'cartera_managed_surface_not_isolated';end if;
end$$;
revoke all on function kora_private.cartera_assert_managed() from public,anon,authenticated,service_role,kora_cartera_operator;


create function kora_private.cartera_assert_coverage() returns void language plpgsql security definer set search_path='' as $$
declare expected text:='(NOT ( SELECT kora_cartera_policy.cartera_principal_restringido() AS cartera_principal_restringido))';
begin
 perform kora_private.cartera_assert_managed();
 if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where ((n.nspname='public' and c.relkind in('r','p')) or(n.nspname='storage' and c.relname in('objects','buckets')) or(n.nspname='realtime' and c.relname='messages'))
 and (not c.relrowsecurity or not exists(select 1 from pg_catalog.pg_policy p where p.polrelid=c.oid and p.polname='cartera_dedicated_deny' and not p.polpermissive and p.polcmd='*' and p.polroles=array['authenticated'::regrole::oid] and pg_catalog.pg_get_expr(p.polqual,p.polrelid)=expected and pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)=expected))) then raise exception 'cartera_deny_coverage_incomplete';end if;
end$$;
revoke all on function kora_private.cartera_assert_coverage() from public,anon,authenticated,service_role,kora_cartera_operator;

-- Re-runnable activation preflight, distinct from the one-time install collision
-- checks. Never seals an unreviewed catalog. Also used at each guarded RPC.
create function kora_private.cartera_assert_ready() returns void language plpgsql security definer set search_path='' as $$
declare actual text[];expected text[]:=array['abonos','abonos_clientes_b2b_destino','addi_liquidaciones','ajustes_auditoria_cartera_b2b','ajustes_gerencia_solicitudes','ajustes_inventario','aliados','aliados_cierres_utilidad','aliados_cruces_recuperacion','aliados_documentos','aliados_domain_events','aliados_estado_historial','aliados_gastos_operativos','aliados_metas_plataforma','aliados_operadores','aliados_plataformas','aliados_recuperaciones','aliados_reversiones','aliados_sedes','aplicaciones_abono_cliente_b2b_proveedor','aplicaciones_consignacion_proveedor','audit_log','b2b_aura_memoria','b2b_catalogo_borradores','b2b_catalogo_reglas','b2b_certificados_cliente','b2b_cierre_pedidos','b2b_cierres','b2b_facturas_emitidas','b2b_listas_precios','b2b_ofertas','b2b_pedido_avisos','b2b_pedido_fuente','b2b_presupuestos','b2b_referencias_catalogo','b2b_retenciones_cliente','banco_creditek_aplicaciones_proveedor','banco_creditek_cuentas','banco_creditek_movimientos','banco_creditek_pagos_proveedor','beneficiary_bank_accounts','caja_arqueo_intentos','caja_ciclo_config','caja_cortes','caja_diaria','captadores','cartera_retail_retiros_auditoria','categorias_producto','clientes','cobra_krediya_cut_operations','cobra_krediya_cuts','cobra_provision_actions','cobra_provision_authority','cobra_provision_funding_operations','cobra_provision_funding_sources','cobra_provision_fundings','cobros_allocations','cobros_deposits','cobros_events','cobros_expected','comisiones','comprobantes_consignacion','conceptos_gasto','confirmaciones_deuda_tienda','conteos_bloque','conteos_bloque_items','costo_promedio_tienda_historial','credit_collection_events','credit_customer_links','credit_portfolio_obligations','credit_portfolio_operators','credit_portfolio_settings','credit_repayments','creditos','creditos_historicos','creditos_historicos_plataforma','creditos_plataforma_consulta_log','cuenta_corriente','cuentas_cartera','documentos_solicitud','ejecutivos','enlaces_registro','equivalencias_tienda','erp_migration_cuts','facturas_proveedor','festivos_colombia','financial_entries','financial_recurring_templates','gastos','gastos_historial','historico_importado','historico_mensual','importacion_detalle','importaciones_financiera','instrucciones_consignacion','kora_incident_comments','kora_incident_history','kora_incident_notifications','kora_incident_operations','kora_incident_permissions','kora_incident_sequences','kora_incidents','kora_notifications','kora_nova_outbox','kora_nova_platform_renewals','kora_nova_renewal_delivery','kora_nova_reviewers','kora_nova_sources','krediya_bonus_rules','krediya_diferencias','krediya_diferencias_gestiones','krediya_gestiones','krediya_import_reports','krediya_instrucciones','krediya_price_rules','liquidation_adjustments','liquidation_approvals','liquidation_beneficiaries','liquidation_bonuses','liquidation_calculations','liquidation_domain_events','liquidation_imported_files','liquidation_incidents','liquidation_operations','liquidation_platforms','liquidation_source_rows','liquidation_treasury_destinations','liquidations','movimientos','movimientos_caja_tienda','movimientos_cartera','movimientos_tesoreria_central','nova_allied_login_challenges','nova_allied_login_members','nova_allied_login_sessions','nova_authorizations','nova_client_otp_dispatch','nova_client_otp_policy','nova_otp_delivery_receipts','nova_photo_quality_consents','nova_retail_actor_emails','nova_retail_case_events','nova_retail_cases','nova_retail_notifications','nova_retail_photo_events','nova_retail_photo_reviews','nova_retail_reference_deliveries','nova_retail_reference_replacements','nova_retail_reviewers','nova_retail_store_contacts','orden_compra_cambios','orden_compra_items','ordenes_compra','origenes','otp_codigos','pagos_proveedor','payment_destination_corrections','payment_dispatch_items','payment_dispatches','payment_items','payment_orders','pedido_b2b_items','pedidos_b2b','perfiles','periodos','presupuesto_premio_mensual','presupuesto_premios','presupuesto_whatsapp_destinos','presupuesto_whatsapp_envios','presupuestos','producto_foto_historial','productos','proveedores','proveedores_ajustes_detalle','proveedores_ajustes_solicitudes','proveedores_retencion_automatica','referencias','remision_items','remision_margenes','remisiones','reportes_deuda_enviados','reportes_diarios_enviados','retail_b2b_compensations','retenciones_factura_proveedor','saldo_ajustes_auditoria','saldos_iniciales_cartera','sesiones_conteo_cruzado','settlement_policy_versions','solicitudes','stock_cantidad','stock_cantidad_lotes','traslado_items','traslados','treasury_movements','treasury_unit_balances','unidades','utilidades_cierres_negocio','venta_ajustes_administrativos','venta_devoluciones','venta_items','ventas','ventas_autorizaciones'];x record;grants_json jsonb;
begin
 if current_setting('server_version_num')::integer<160000 then raise exception 'cartera_unsupported_server';end if;
 if md5(pg_catalog.pg_get_functiondef('public.kora_confirmacion_deuda_pre_request()'::regprocedure))<>'5a549a460deb7bc53e16d13f52c40cf1' or md5(pg_catalog.pg_get_functiondef('kora_private.exigir_confirmacion_deuda_api()'::regprocedure))<>'a8aad0e67f70551625e9ede1937b92cd' then raise exception 'cartera_existing_guard_changed';end if;
 select array_agg(c.relname::text order by c.relname) into actual from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p');
 if actual is distinct from expected then raise exception 'cartera_relation_inventory_changed';end if;
 if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and(not c.relrowsecurity or pg_catalog.pg_get_userbyid(c.relowner)<>pg_catalog.pg_get_userbyid((select proowner from pg_catalog.pg_proc where oid='kora_private.cartera_assert_ready()'::regprocedure)))) then raise exception 'cartera_table_protection_changed';end if;
 if (select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint where conrelid='public.perfiles'::regclass and conname='perfiles_rol_check') is distinct from 'CHECK ((rol = ANY (ARRAY[''gerencia''::text, ''auditoria''::text, ''admin_tienda''::text, ''asesor''::text, ''operador_cartera''::text])))' then raise exception 'cartera_role_constraint_changed';end if;
 if not exists(select 1 from pg_catalog.pg_roles where rolname='kora_cartera_operator' and not(rolcanlogin or rolinherit or rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)) or has_schema_privilege('kora_cartera_operator','auth','USAGE') or has_schema_privilege('kora_cartera_operator','public','CREATE') or has_schema_privilege('kora_cartera_operator','kora_private','CREATE') then raise exception 'cartera_technical_role_changed';end if;
 if exists(select 1 from pg_catalog.pg_extension where extname='pg_graphql') or exists(select 1 from pg_catalog.pg_publication_tables) then raise exception 'cartera_unreviewed_interface';end if;
 grants_json:=nullif(current_setting('supautils.policy_grants',true),'')::jsonb;
 for x in select c.oid,n.nspname,c.relname,c.relowner,c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where(n.nspname='storage' and c.relname in('objects','buckets'))or(n.nspname='realtime' and c.relname='messages') loop
  if not x.relrowsecurity then raise exception 'cartera_managed_rls_disabled';end if;
  if pg_catalog.pg_get_userbyid(x.relowner)<>current_user and not coalesce(grants_json->current_user ? (x.nspname||'.'||x.relname),false) then raise exception 'cartera_provider_policy_permission_missing';end if;
 end loop;
 if(select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where(n.nspname='storage' and c.relname in('objects','buckets'))or(n.nspname='realtime' and c.relname='messages'))<>3 then raise exception 'cartera_managed_relation_missing';end if;
 -- PUBLIC trigger functions cannot be invoked as ordinary functions. They are
 -- fingerprinted too; any other PUBLIC-executable private function is rejected.
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where n.nspname='kora_private' and p.prorettype<>'trigger'::regtype and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'cartera_private_public_execute';end if;
 perform kora_private.cartera_assert_coverage();perform kora_private.cartera_assert_dependencies();
end$$;
revoke all on function kora_private.cartera_assert_ready() from public,anon,authenticated,service_role,kora_cartera_operator;

create function kora_private.cartera_activate(p_reviewed_fingerprint text) returns void language plpgsql security invoker set search_path='' as $$
declare c kora_private.cartera_contract%rowtype;
begin
 perform kora_private.cartera_assert_ready();
 select * into strict c from kora_private.cartera_contract where singleton for update;
 if p_reviewed_fingerprint is null or p_reviewed_fingerprint !~ '^[a-f0-9]{64}$' or c.fingerprint is distinct from p_reviewed_fingerprint or kora_private.cartera_catalog_fingerprint() is distinct from p_reviewed_fingerprint then raise exception 'cartera_activation_catalog_unreviewed';end if;
 update kora_private.cartera_contract set enabled=true where singleton;
end$$;
revoke all on function kora_private.cartera_activate(text) from public,anon,authenticated,service_role,kora_cartera_operator;

create function kora_private.cartera_require_contract() returns void language plpgsql security definer set search_path='' as $$
declare c kora_private.cartera_contract%rowtype;
begin
 select * into c from kora_private.cartera_contract where singleton;
 if not found or not c.enabled or c.fingerprint is null or c.fingerprint is distinct from kora_private.cartera_catalog_fingerprint() then raise sqlstate 'PT403' using message='cartera_contract_not_active';end if;
 perform kora_private.cartera_assert_ready();
end$$;
revoke all on function kora_private.cartera_require_contract() from public,anon,authenticated,service_role;
grant execute on function kora_private.cartera_require_contract() to kora_cartera_operator;

create function kora_private.cartera_actor() returns jsonb language plpgsql security invoker set search_path='' as $$
declare p record;can_read boolean;can_manage boolean;
begin
 if not kora_cartera_policy.cartera_principal_restringido() then raise sqlstate 'PT403' using message='cartera_dedicated_actor_required';end if;
 select id,nombre,rol,activo,tienda_codigo into p from public.perfiles where id=(select public.cartera_subject());
 if not found or not p.activo or p.rol<>'operador_cartera' then raise sqlstate 'PT403' using message='cartera_profile_inactive';end if;
 select coalesce(bool_or(active and capability in('read','manage')),false),coalesce(bool_or(active and capability='manage'),false) into can_read,can_manage from public.credit_portfolio_operators where perfil_id=p.id;
 if not can_read then raise sqlstate 'PT403' using message='cartera_capability_revoked';end if;
 return jsonb_build_object('profile',jsonb_build_object('id',p.id,'nombre',p.nombre,'rol',p.rol,'activo',p.activo,'tienda_codigo',p.tienda_codigo),'read',can_read,'manage',can_manage,'importer',false,'authorizer',false);
end$$;
revoke all on function kora_private.cartera_actor() from public,anon,authenticated,service_role;
alter function kora_private.cartera_actor() owner to kora_cartera_operator;

create function kora_private.cartera_error(p_code text,p_message text) returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('__cartera_error',jsonb_build_object('code',case when p_code in('PT400','PT403','PT404','PT429','42501','P0001','23514','23505','22P02','22003') then p_code else 'CAR01' end,'message',case when p_message ~ '^(cartera_|cobra_)[a-z_]+$' then p_message else 'cartera_operation_not_confirmed' end));
$$;
revoke all on function kora_private.cartera_error(text,text) from public,anon,authenticated,service_role;
grant execute on function kora_private.cartera_error(text,text) to kora_cartera_operator;

create function kora_private.cartera_take_budget() returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=public.cartera_subject();m timestamptz:=date_trunc('minute',clock_timestamp());n integer;
begin
 if u is null or not kora_cartera_policy.cartera_principal_restringido() then return false;end if;
 insert into kora_private.cartera_rpc_budget(user_id,minute_start,calls) values(u,m,1) on conflict(user_id,minute_start) do update set calls=least(121,cartera_rpc_budget.calls+1) returning calls into n;
 delete from kora_private.cartera_rpc_budget where user_id=u and minute_start<m-interval '2 days';
 return n<=120;
end$$;
revoke all on function kora_private.cartera_take_budget() from public,anon,authenticated,service_role;
grant execute on function kora_private.cartera_take_budget() to kora_cartera_operator;

create function public.cartera_operador_inicio() returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor jsonb;
begin
 if (select public.cartera_subject()) is null then raise sqlstate 'PT403' using message='cartera_session_required';end if;
 if not kora_cartera_policy.cartera_principal_restringido() then return jsonb_build_object('restricted',false);end if;
 if not kora_private.cartera_take_budget() then return kora_private.cartera_error('PT429','cartera_request_limit');end if;
 begin
  actor:=kora_private.cartera_actor();perform kora_private.cartera_require_contract();
  return actor||jsonb_build_object('restricted',true);
 exception when others then return kora_private.cartera_error(sqlstate,sqlerrm);
 end;
end$$;
revoke all on function public.cartera_operador_inicio() from public,anon,authenticated,service_role;
grant execute on function public.cartera_operador_inicio() to authenticated;
alter function public.cartera_operador_inicio() owner to kora_cartera_operator;

create function kora_private.cartera_api_pre_request() returns void language plpgsql security invoker set search_path='' as $$
declare p text:=coalesce(current_setting('request.path',true),'');m text:=coalesce(current_setting('request.method',true),'');h jsonb;mime text;
begin
 if not kora_cartera_policy.cartera_principal_restringido() then return;end if;
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 if jsonb_typeof(h)<>'object' then raise sqlstate 'PT403' using message='cartera_invalid_headers';end if;
 mime:=lower(coalesce(h->>'accept','application/json'));
 if (h ? 'accept-profile' and h->>'accept-profile'<>'public') or(h ? 'content-profile' and h->>'content-profile'<>'public') or mime not in('application/json','*/*') or lower(coalesce(h->>'prefer','')) like '%tx=rollback%' then raise sqlstate 'PT403' using message='cartera_api_representation_denied';end if;
 if left(p,1)='/' then p:=substr(p,2);end if;
 if m<>'POST' or p not in('rpc/cartera_operador_inicio','rpc/cartera_operador_datos','rpc/cartera_operador_guardar_gestion','rpc/cartera_operador_solicitar_provision') then raise sqlstate 'PT403' using message='cartera_api_route_denied';end if;
end$$;
revoke all on function kora_private.cartera_api_pre_request() from public,anon,authenticated,service_role,kora_cartera_operator;

-- Same existing debt guard and grants. The new fixed bootstrap must be reachable
-- before the existing shell mounts the daily confirmation dialog. Its only
-- ordinary-profile response is restricted:false; all other old routes still
-- invoke the unchanged debt guard and propagate its errors.
create or replace function public.kora_confirmacion_deuda_pre_request() returns void language plpgsql security definer set search_path='' as $$
begin
 if current_setting('request.method',true)='POST' and current_setting('request.path',true) in('/rpc/cartera_operador_inicio','rpc/cartera_operador_inicio') then
  perform kora_private.cartera_api_pre_request();return;
 end if;
 perform kora_private.exigir_confirmacion_deuda_api();
 perform kora_private.cartera_api_pre_request();
end$$;

-- Exact same invoker functions, owners, ACLs and checks; only caller-UUID lookup changes.
do $identity_preflight$ begin
 if not coalesce((select reloptions @> array['security_invoker=true'] from pg_catalog.pg_class where oid='public.creditos_cartera_operaciones'::regclass),false) then raise exception 'cartera_view_must_be_invoker';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_krediya_save_collection(uuid,uuid,text,text,text,date,numeric)'::regprocedure))<>'9ded2229e4c0f09292278010efef595f' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_krediya_validate_event()'::regprocedure))<>'619802e296d0e4e8fb8c003c5cd0e2b7' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_quality_operator()'::regprocedure))<>'fdfa3953e70bb6a20113d88172395ba8' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.tiene_capacidad_cartera(text)'::regprocedure))<>'b39ff51350c58028c5309d041f879028' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_provision_authorizer()'::regprocedure))<>'7469482b7393336dfb24bec48b1434f7' then raise exception 'cartera_fund_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_provision_prepare_action()'::regprocedure))<>'e8f55710558aa63c77e0dcd70cfd049c' then raise exception 'cartera_fund_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_quality_importer()'::regprocedure))<>'ae58e5f4a241ae148b89f86d48a7ec51' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.creditos_cartera_puede_leer(text)'::regprocedure))<>'62c421a981947be30b9d7e9fc3c060f4' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.rol_actual()'::regprocedure))<>'30233b4b90bed68ae5fce3f590e65b27' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.tiene_capacidad_aliados(text)'::regprocedure))<>'0baaeaffa5f5f7c697d8eb1b2af0f2ae' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_viewdef('public.creditos_cartera_operaciones'::regclass,true))<>'5795039e56374ed229d7b8acd9c21616' then raise exception 'cartera_trusted_view_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_krediya_history_cuts(uuid)'::regprocedure))<>'2c83998920c39b878c0ab32634cabbc8' then raise exception 'cartera_draft_dependency_changed';end if;
end $identity_preflight$;
CREATE OR REPLACE FUNCTION public.cobra_krediya_save_collection(p_request_id uuid, p_operation_id uuid, p_event_type text, p_channel text, p_note text, p_promise_date date DEFAULT NULL::date, p_promise_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare e public.credit_collection_events%rowtype; obligation uuid; saved uuid;
begin
 if not coalesce(public.cobra_quality_operator(),false) then raise exception 'cobra_event_not_authorized' using errcode='42501'; end if;
 if p_request_id is null or p_operation_id is null then raise exception 'cobra_event_invalid_reference'; end if;
 select * into e from public.credit_collection_events where client_request_id=p_request_id;
 if e.id is null then
  select id into obligation from public.credit_portfolio_obligations where operation_id=p_operation_id;
  insert into public.credit_collection_events(operation_id,client_request_id,obligation_id,actor_type,event_type,channel,note,promise_date,promise_amount,created_by)
  values(p_operation_id,p_request_id,obligation,'humano',p_event_type,p_channel,btrim(p_note),p_promise_date,p_promise_amount,public.cartera_subject())
  on conflict(client_request_id) do nothing returning id into saved;
  select * into e from public.credit_collection_events where id=saved or client_request_id=p_request_id;
 end if;
 if e.id is null or e.created_by is distinct from public.cartera_subject() or e.operation_id is distinct from p_operation_id or e.event_type is distinct from p_event_type or e.channel is distinct from p_channel or e.note is distinct from btrim(p_note) or e.promise_date is distinct from p_promise_date or e.promise_amount is distinct from p_promise_amount then raise exception 'cobra_event_idempotency_conflict'; end if;
 return jsonb_build_object('id',e.id,'request_id',e.client_request_id,'operation_id',e.operation_id,'obligation_id',e.obligation_id,'event_type',e.event_type,'created_at',e.created_at,'duplicate',saved is null,'status','collection_saved','payment_created',false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.cobra_krediya_validate_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 -- Legacy RPC remains unchanged. New operation-based events have their own explicit checks.
 if new.operation_id is null then
  if current_user in ('anon','authenticated') then raise exception 'cobra_direct_legacy_event_denied' using errcode='42501'; end if;
  if new.client_request_id is not null then raise exception 'cobra_event_invalid_reference'; end if;
  return new;
 end if;
 if not coalesce(public.cobra_quality_operator(),false) or new.created_by is distinct from public.cartera_subject() or new.actor_type is distinct from 'humano' then raise exception 'cobra_event_not_authorized' using errcode='42501'; end if;
 if new.client_request_id is null or not exists(select 1 from public.cobra_krediya_cut_operations where operation_id=new.operation_id) then raise exception 'cobra_event_without_reviewed_cut'; end if;
 if new.obligation_id is not null and not exists(select 1 from public.credit_portfolio_obligations where id=new.obligation_id and operation_id=new.operation_id) then raise exception 'cobra_event_wrong_obligation'; end if;
 if new.event_type not in ('contact_attempt','contacted','note','promise') or new.event_type is null or new.channel not in ('call','whatsapp','email','platform','internal') or new.channel is null or length(btrim(coalesce(new.note,''))) not between 1 and 600 then raise exception 'cobra_event_invalid_fields'; end if;
 if new.event_type='promise' then
  if new.promise_date is null or new.promise_date<(now() at time zone 'America/Bogota')::date or new.promise_amount is null or new.promise_amount<=0 or new.promise_amount<>trunc(new.promise_amount) or new.promise_amount>90071992547409 then raise exception 'cobra_event_invalid_promise'; end if;
 elsif new.promise_date is not null or new.promise_amount is not null then raise exception 'cobra_event_unexpected_promise';
 end if;
 new.created_at=clock_timestamp();new.note=btrim(new.note);
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cobra_quality_operator()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select (select public.cartera_subject()) is not null and public.rol_actual() is not null
 and (public.rol_actual() in ('gerencia','auditoria') or public.tiene_capacidad_cartera('manage'));
$function$;

CREATE OR REPLACE FUNCTION public.tiene_capacidad_cartera(p_capacidad text DEFAULT 'read'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select (select public.cartera_subject()) is not null and exists (
    select 1
    from public.credit_portfolio_operators operator
    where operator.perfil_id = (select public.cartera_subject())
      and operator.active
      and case p_capacidad
        when 'read' then operator.capability in ('read','manage')
        when 'manage' then operator.capability = 'manage'
        else false
      end
  );
$function$;

create or replace function public.cobra_provision_authorizer() returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(public.cobra_quality_importer(),false) and exists(select 1 from public.cobra_provision_authority where user_id=(select public.cartera_subject()));
$$;
create or replace function public.cobra_provision_prepare_action() returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.cobra_provision_actions%rowtype; state text; allocation jsonb; funds jsonb; total numeric:=0; remaining numeric; seen uuid[]:='{}';fid uuid;
begin
 if not coalesce(public.cobra_quality_operator(),false) then raise exception 'cobra_fund_not_authorized' using errcode='42501';end if;
 if new.payload->>'kind' is distinct from 'request' and not coalesce(public.cobra_provision_authorizer(),false) then raise exception 'cobra_fund_authority_required' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'cobra_fund_isolation_required';end if;
 perform pg_advisory_xact_lock(726026,22);
 -- Identity is allocated before BEFORE triggers; stale direct inserts must retry.
 if exists(select 1 from public.cobra_provision_actions where event_no>new.event_no) then raise exception 'cobra_fund_sequence_retry';end if;
 if new.request_id is null or jsonb_typeof(new.payload) is distinct from 'object' or (select count(*) from jsonb_object_keys(new.payload))<>10 or not new.payload ?& array['kind','parent_id','cut_id','operation_id','amount_cents','allocations','purpose','note','evidence','evidence_sha256'] then raise exception 'cobra_fund_invalid_payload';end if;
 new.evidence_sha256=new.payload->>'evidence_sha256';
 if (new.payload->>'kind'='execute' and (new.evidence_sha256 is null or new.evidence_sha256 !~ '^[0-9a-f]{64}$')) or (new.payload->>'kind'<>'execute' and new.evidence_sha256 is not null) then raise exception 'cobra_fund_evidence_hash_required';end if;
 new.kind=new.payload->>'kind';new.note=btrim(new.payload->>'note');new.evidence=nullif(btrim(new.payload->>'evidence'),'');
 if jsonb_typeof(new.payload->'amount_cents') is distinct from 'number' or new.payload->>'amount_cents' !~ '^[0-9]{1,16}$' or jsonb_typeof(new.payload->'note') is distinct from 'string' or jsonb_typeof(new.payload->'allocations') is distinct from 'array' then raise exception 'cobra_fund_invalid_payload';end if;
 new.amount_cents=(new.payload->>'amount_cents')::bigint;new.allocations=new.payload->'allocations';
 if new.kind='request' then
  if new.payload->>'parent_id' is not null or new.allocations<>'[]'::jsonb or new.evidence is not null or new.amount_cents<=0 then raise exception 'cobra_fund_invalid_request';end if;
  new.parent_id=null;new.cut_id=(new.payload->>'cut_id')::uuid;new.operation_id=(new.payload->>'operation_id')::uuid;new.purpose=new.payload->>'purpose';
  select cohort_month into new.cohort_month from public.cobra_krediya_cuts c where c.id=new.cut_id and c.link_keys ? new.operation_id::text;
  if not found then raise exception 'cobra_fund_credit_not_in_cut';end if;
 else
  if not coalesce(public.cobra_provision_authorizer(),false) then raise exception 'cobra_fund_authority_required' using errcode='42501';end if;
  new.parent_id=(new.payload->>'parent_id')::uuid;select * into r from public.cobra_provision_actions where id=new.parent_id and kind='request';
  if not found then raise exception 'cobra_fund_request_not_found';end if;
  if new.payload->>'cut_id' is not null or new.payload->>'operation_id' is not null or new.payload->>'purpose' is not null then raise exception 'cobra_fund_canonical_reference_required';end if;
  new.cut_id=r.cut_id;new.operation_id=r.operation_id;new.cohort_month=r.cohort_month;new.purpose=r.purpose;
  select kind into state from public.cobra_provision_actions where parent_id=r.id order by event_no desc limit 1;state=coalesce(state,'request');
  if new.kind='authorize' then
   if state<>'request' or new.amount_cents<>r.amount_cents or jsonb_array_length(new.allocations) not between 1 and 100 or new.evidence is not null then raise exception 'cobra_fund_invalid_transition';end if;
   perform public.cobra_provision_source_guard();
   funds=public.cobra_provision_balances();select coalesce(sum((x->>'remaining_cents')::numeric),0) into remaining from jsonb_array_elements(funds) x;
   if remaining<new.amount_cents then raise exception 'cobra_fund_insufficient_total';end if;
   for allocation in select value from jsonb_array_elements(new.allocations) loop
    if jsonb_typeof(allocation) is distinct from 'object' or (select count(*) from jsonb_object_keys(allocation))<>2 or not allocation ?& array['fund_id','cents'] or jsonb_typeof(allocation->'cents') is distinct from 'number' or allocation->>'cents' !~ '^[0-9]{1,16}$' or (allocation->>'cents')::numeric<=0 then raise exception 'cobra_fund_invalid_allocation';end if;
    fid=(allocation->>'fund_id')::uuid;if fid=any(seen) then raise exception 'cobra_fund_duplicate_allocation';end if;seen=array_append(seen,fid);
    select (x->>'remaining_cents')::numeric into remaining from jsonb_array_elements(funds) x where x->>'id'=fid::text;
    if remaining is null or remaining<(allocation->>'cents')::numeric then raise exception 'cobra_fund_insufficient_allocation';end if;total=total+(allocation->>'cents')::numeric;
   end loop;
   if total<>new.amount_cents then raise exception 'cobra_fund_allocation_total';end if;
  elsif new.kind='reject' then
   if state<>'request' or new.amount_cents<>0 or new.allocations<>'[]'::jsonb or new.evidence is not null then raise exception 'cobra_fund_invalid_transition';end if;
  elsif new.kind in('execute','release') then
   if state<>'authorize' or new.allocations<>'[]'::jsonb then raise exception 'cobra_fund_invalid_transition';end if;
   if new.kind='execute' then perform public.cobra_provision_source_guard();select coalesce(sum((x->>'remaining_cents')::numeric),0) into remaining from jsonb_array_elements(public.cobra_provision_balances()) x;if remaining<0 then raise exception 'cobra_fund_deficit_review_required';end if;end if;
   if new.kind='execute' and (new.amount_cents<=0 or new.amount_cents>r.amount_cents or new.evidence is null or length(new.evidence) not between 5 and 600) then raise exception 'cobra_fund_execution_evidence_required';end if;
   if new.kind='release' and (new.amount_cents<>0 or new.evidence is not null) then raise exception 'cobra_fund_invalid_transition';end if;
  else raise exception 'cobra_fund_invalid_action';end if;
 end if;
 new.created_by=public.cartera_subject();new.created_at=clock_timestamp();return new;
end $$;
create or replace function kora_private.cartera_assert_dependencies() returns void language plpgsql security invoker set search_path='' as $$begin
 if not coalesce((select reloptions @> array['security_invoker=true'] from pg_catalog.pg_class where oid='public.creditos_cartera_operaciones'::regclass),false) then raise exception 'cartera_view_must_be_invoker';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_krediya_save_collection(uuid,uuid,text,text,text,date,numeric)'::regprocedure))<>'3dc437336cc8eb92559070fb1e7cdbf5' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_krediya_validate_event()'::regprocedure))<>'ca306bf55021c5d3c9fd80580a6b4b90' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_quality_operator()'::regprocedure))<>'367477a866771c9bf1cb8bed602fbbbb' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.tiene_capacidad_cartera(text)'::regprocedure))<>'f672b9c2a0726f23bc3e925636a2add7' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_provision_authorizer()'::regprocedure))<>'335d23bc6e54b083dbbedd8f14523ce6' then raise exception 'cartera_fund_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_provision_prepare_action()'::regprocedure))<>'e2c76e47ef6dc2ef839c67b95ebdd9ff' then raise exception 'cartera_fund_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_quality_importer()'::regprocedure))<>'ae58e5f4a241ae148b89f86d48a7ec51' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.creditos_cartera_puede_leer(text)'::regprocedure))<>'62c421a981947be30b9d7e9fc3c060f4' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.rol_actual()'::regprocedure))<>'30233b4b90bed68ae5fce3f590e65b27' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.tiene_capacidad_aliados(text)'::regprocedure))<>'0baaeaffa5f5f7c697d8eb1b2af0f2ae' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_viewdef('public.creditos_cartera_operaciones'::regclass,true))<>'5795039e56374ed229d7b8acd9c21616' then raise exception 'cartera_trusted_view_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_krediya_history_cuts(uuid)'::regprocedure))<>'2c83998920c39b878c0ab32634cabbc8' then raise exception 'cartera_draft_dependency_changed';end if;
end$$;

-- Fixed datasets only. No client-selected relation, column, join, operator or SQL.
grant execute on function public.rol_actual(),public.tiene_capacidad_cartera(text),public.cobra_quality_operator(),public.creditos_cartera_puede_leer(text),public.cobra_krediya_save_collection(uuid,uuid,text,text,text,date,numeric),public.cobra_krediya_history_cuts(uuid) to kora_cartera_operator;
-- The shared immutable trigger prepares this boolean expression even for a
-- request. These boolean helpers and own authority lookup grant no funding,
-- authorization or execution action; both INSERT bounds still require request.
grant execute on function public.cobra_provision_authorizer(),public.cobra_quality_importer(),public.tiene_capacidad_aliados(text) to kora_cartera_operator;
grant select(user_id) on public.cobra_provision_authority to kora_cartera_operator;
create policy cartera_tech_authority_allow on public.cobra_provision_authority for select to kora_cartera_operator using(user_id=(select public.cartera_subject()));
create policy cartera_tech_authority_bound on public.cobra_provision_authority as restrictive for select to kora_cartera_operator using(user_id=(select public.cartera_subject()));
grant select(id,operation_id,credito_id,cliente_id,plataforma,external_credit_id,origen_codigo,cliente_nombre_snapshot,cliente_documento_snapshot,original_amount,outstanding_amount,ally_paid_at,first_due_date,next_due_date,status,pre_nova,nova_authorization_id) on public.credit_portfolio_obligations to kora_cartera_operator;
grant select(id,nombre_completo,cedula) on public.clientes to kora_cartera_operator;
grant select(codigo,nombre) on public.origenes to kora_cartera_operator;
grant select(id,decision,external_decision_id,rule_version) on public.nova_authorizations to kora_cartera_operator;
grant select(obligation_id,amount,status) on public.credit_repayments to kora_cartera_operator;
grant select(id,obligation_id,operation_id,client_request_id,actor_type,event_type,channel,note,promise_date,promise_amount,created_by,created_at) on public.credit_collection_events to kora_cartera_operator;
grant select(singleton,nova_enforcement_enabled,nova_enforcement_from) on public.credit_portfolio_settings to kora_cartera_operator;
grant select on public.creditos_cartera_operaciones to kora_cartera_operator;
grant select(id,request_id,file_sha256,payload_sha256,cohort_month,cutoff,source_name,observations,link_keys,row_count,received_by,received_at,schema_version) on public.cobra_krediya_cuts to kora_cartera_operator;
grant select(cut_id,operation_id) on public.cobra_krediya_cut_operations to kora_cartera_operator;
grant select(id,source_month,generated_cents,prior_used_cents,available_cents) on public.cobra_provision_fundings to kora_cartera_operator;
grant select(id,event_no,request_id,payload,kind,parent_id,cut_id,operation_id,cohort_month,amount_cents,allocations,purpose,note,evidence,created_by,created_at) on public.cobra_provision_actions to kora_cartera_operator;
grant insert(operation_id,client_request_id,obligation_id,actor_type,event_type,channel,note,promise_date,promise_amount,created_by) on public.credit_collection_events to kora_cartera_operator;
grant insert(request_id,payload) on public.cobra_provision_actions to kora_cartera_operator;
grant usage on sequence public.cobra_provision_actions_event_no_seq to kora_cartera_operator;

-- One allow and one bound for each technical-role relation. Shared PUBLIC
-- permissive policies cannot enlarge this role's rows. Existing roles unchanged.
do $policies$
declare r record;predicate text;
begin
 for r in select * from (values
 ('credit_portfolio_obligations','public.creditos_cartera_puede_leer(origen_codigo)'),
 ('clientes','exists(select 1 from public.credit_portfolio_obligations o where o.cliente_id=clientes.id)'),
 ('origenes','exists(select 1 from public.credit_portfolio_obligations o where o.origen_codigo=origenes.codigo)'),
 ('nova_authorizations','exists(select 1 from public.credit_portfolio_obligations o where o.nova_authorization_id=nova_authorizations.id)'),
 ('credit_repayments','exists(select 1 from public.credit_portfolio_obligations o where o.id=credit_repayments.obligation_id)'),
 ('credit_collection_events','exists(select 1 from public.credit_portfolio_obligations o where o.id=credit_collection_events.obligation_id) or (public.cobra_quality_operator() and exists(select 1 from public.cobra_krediya_cut_operations l where l.operation_id=credit_collection_events.operation_id))'),
 ('credit_portfolio_settings','singleton'),
 ('cobra_krediya_cuts','public.cobra_quality_operator()'),
 ('cobra_krediya_cut_operations','public.cobra_quality_operator()'),
 ('cobra_provision_fundings','public.cobra_quality_operator()'),
 ('cobra_provision_actions','public.cobra_quality_operator()')
 ) v(table_name,row_predicate) loop
  predicate:='(select kora_cartera_policy.cartera_principal_restringido()) and ('||r.row_predicate||')';
  execute format('create policy cartera_tech_read_allow on public.%I for select to kora_cartera_operator using(%s)',r.table_name,predicate);
  execute format('create policy cartera_tech_read_bound on public.%I as restrictive for select to kora_cartera_operator using(%s)',r.table_name,predicate);
 end loop;
end $policies$;
create policy cartera_tech_event_insert_allow on public.credit_collection_events for insert to kora_cartera_operator with check(public.cobra_quality_operator() and created_by=(select public.cartera_subject()) and actor_type='humano' and operation_id is not null and client_request_id is not null and exists(select 1 from public.cobra_krediya_cut_operations l where l.operation_id=credit_collection_events.operation_id));
create policy cartera_tech_event_insert_bound on public.credit_collection_events as restrictive for insert to kora_cartera_operator with check(public.cobra_quality_operator() and created_by=(select public.cartera_subject()) and actor_type='humano' and operation_id is not null and client_request_id is not null and exists(select 1 from public.cobra_krediya_cut_operations l where l.operation_id=credit_collection_events.operation_id));
create policy cartera_tech_request_allow on public.cobra_provision_actions for insert to kora_cartera_operator with check(public.cobra_quality_operator() and created_by=(select public.cartera_subject()) and kind='request' and parent_id is null and allocations='[]'::jsonb and evidence is null);
create policy cartera_tech_request_bound on public.cobra_provision_actions as restrictive for insert to kora_cartera_operator with check(public.cobra_quality_operator() and created_by=(select public.cartera_subject()) and kind='request' and parent_id is null and allocations='[]'::jsonb and evidence is null);

create function public.cartera_operador_datos(p_dataset text,p_month date default null,p_id uuid default null,p_after uuid default null,p_limit integer default 100,p_offset integer default 0,p_request uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor jsonb;result jsonb;f jsonb;a jsonb;
begin
 if not kora_cartera_policy.cartera_principal_restringido() then return kora_private.cartera_error('PT403','cartera_dedicated_actor_required');end if;
 if not kora_private.cartera_take_budget() then return kora_private.cartera_error('PT429','cartera_request_limit');end if;
 begin
  actor:=kora_private.cartera_actor();perform kora_private.cartera_require_contract();
 if p_limit is null or p_limit not between 1 and 500 or p_offset is null or p_offset not between 0 and 50000 then raise sqlstate 'PT400' using message='cartera_invalid_page';end if;
 if p_dataset='portfolio' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.ally_paid_at desc nulls last,x.id),'[]') into result from(select id,operation_id,credito_id,cliente_id,plataforma,external_credit_id,origen_codigo,tienda,cliente_nombre,cliente_documento,original_amount,outstanding_amount,ally_paid_at,first_due_date,next_due_date,status,pre_nova,nova_status,nova_decision_id,nova_rule_version,validated_repayments,last_collection_at,broken_promises,credit_outcome from public.creditos_cartera_operaciones order by ally_paid_at desc nulls last,id limit p_limit offset p_offset)x;
 elsif p_dataset='events' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]') into result from(select id,obligation_id,operation_id,event_type,channel,note,promise_date,promise_amount,created_at,actor_type from public.credit_collection_events order by created_at desc,id desc limit p_limit offset p_offset)x;
 elsif p_dataset='settings' then
  select jsonb_build_object('singleton',s.singleton,'nova_enforcement_enabled',s.nova_enforcement_enabled,'nova_enforcement_from',s.nova_enforcement_from) into result from public.credit_portfolio_settings s where singleton;
 elsif not coalesce((actor->>'manage')::boolean,false) then raise sqlstate 'PT403' using message='cartera_quality_capability_required';
 elsif p_dataset='cuts' then
  if p_month is null or extract(day from p_month)<>1 then raise sqlstate 'PT400' using message='cartera_invalid_month';end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into result from(select id,request_id,file_sha256,payload_sha256,cohort_month,cutoff,source_name,row_count,received_by,received_at,schema_version from public.cobra_krediya_cuts where cohort_month=p_month and(p_after is null or id>p_after) order by id limit p_limit)x;
 elsif p_dataset='cut' then
  if p_id is null then raise sqlstate 'PT400' using message='cartera_cut_required';end if;
  select jsonb_build_object('id',c.id,'request_id',c.request_id,'file_sha256',c.file_sha256,'payload_sha256',c.payload_sha256,'cohort_month',c.cohort_month,'cutoff',c.cutoff,'source_name',c.source_name,'observations',c.observations,'row_count',c.row_count,'received_by',c.received_by,'received_at',c.received_at,'schema_version',c.schema_version) into result from public.cobra_krediya_cuts c where id=p_id;
  if result is null then raise sqlstate 'PT404' using message='cartera_cut_not_found';end if;
 elsif p_dataset in('collection_history','collection_lookup') then
  if(p_dataset='collection_history' and p_id is null)or(p_dataset='collection_lookup' and p_request is null)then raise sqlstate 'PT400' using message='cartera_reference_required';end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into result from(select id,client_request_id,operation_id,obligation_id,event_type,channel,note,promise_date,promise_amount,created_by,created_at from public.credit_collection_events where operation_id is not null and case when p_dataset='collection_lookup' then client_request_id=p_request and created_by=(select public.cartera_subject()) else operation_id=p_id and(p_after is null or id>p_after) end order by id limit p_limit)x;
 elsif p_dataset='fund_book' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.source_month,x.id),'[]') into f from(select id,source_month,generated_cents,prior_used_cents,available_cents from public.cobra_provision_fundings order by source_month,id limit 10001)x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.event_no),'[]') into a from(select id,event_no,kind,parent_id,cut_id,operation_id,cohort_month,amount_cents,allocations,purpose,note,evidence,created_at from public.cobra_provision_actions order by event_no limit 10001)x;
  if jsonb_array_length(f)>10000 or jsonb_array_length(a)>10000 then raise sqlstate 'PT400' using message='cartera_fund_book_requires_scope';end if;
  result:=jsonb_build_object('fundings',f,'actions',a);
 elsif p_dataset='fund_lookup' then
  if p_request is null then raise sqlstate 'PT400' using message='cartera_reference_required';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'request_id',x.request_id,'payload',x.payload,'created_by',x.created_by)),'[]') into result from public.cobra_provision_actions x where request_id=p_request and created_by=(select public.cartera_subject()) and kind='request';
 elsif p_dataset='customer_history' then
  if p_id is null then raise sqlstate 'PT400' using message='cartera_reference_required';end if;
  result:=public.cobra_krediya_history_cuts(p_id);
 else raise sqlstate 'PT400' using message='cartera_dataset_denied';
 end if;
 return result;
 exception when others then return kora_private.cartera_error(sqlstate,sqlerrm);
 end;
end$$;
revoke all on function public.cartera_operador_datos(text,date,uuid,uuid,integer,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.cartera_operador_datos(text,date,uuid,uuid,integer,integer,uuid) to authenticated;
alter function public.cartera_operador_datos(text,date,uuid,uuid,integer,integer,uuid) owner to kora_cartera_operator;

create function public.cartera_operador_guardar_gestion(p_request_id uuid,p_operation_id uuid,p_event_type text,p_channel text,p_note text,p_promise_date date default null,p_promise_amount numeric default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor jsonb;
begin
 if not kora_cartera_policy.cartera_principal_restringido() then return kora_private.cartera_error('PT403','cartera_dedicated_actor_required');end if;
 if not kora_private.cartera_take_budget() then return kora_private.cartera_error('PT429','cartera_request_limit');end if;
 begin
  actor:=kora_private.cartera_actor();perform kora_private.cartera_require_contract();
 if not coalesce((actor->>'manage')::boolean,false) then raise sqlstate 'PT403' using message='cartera_manage_required';end if;
 return public.cobra_krediya_save_collection(p_request_id,p_operation_id,p_event_type,p_channel,p_note,p_promise_date,p_promise_amount);
 exception when others then return kora_private.cartera_error(sqlstate,sqlerrm);
 end;
end$$;
revoke all on function public.cartera_operador_guardar_gestion(uuid,uuid,text,text,text,date,numeric) from public,anon,authenticated,service_role;
grant execute on function public.cartera_operador_guardar_gestion(uuid,uuid,text,text,text,date,numeric) to authenticated;
alter function public.cartera_operador_guardar_gestion(uuid,uuid,text,text,text,date,numeric) owner to kora_cartera_operator;

create function public.cartera_operador_solicitar_provision(p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor jsonb;r record;
begin
 if not kora_cartera_policy.cartera_principal_restringido() then return kora_private.cartera_error('PT403','cartera_dedicated_actor_required');end if;
 if not kora_private.cartera_take_budget() then return kora_private.cartera_error('PT429','cartera_request_limit');end if;
 begin
  actor:=kora_private.cartera_actor();perform kora_private.cartera_require_contract();
 if not coalesce((actor->>'manage')::boolean,false) then raise sqlstate 'PT403' using message='cartera_manage_required';end if;
 if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' or p_payload->>'kind' is distinct from 'request' then raise sqlstate 'PT400' using message='cartera_request_only';end if;
 perform pg_advisory_xact_lock(726026,22);
 select id,request_id,payload,created_by into r from public.cobra_provision_actions where request_id=p_request_id;
 if not found then insert into public.cobra_provision_actions(request_id,payload) values(p_request_id,p_payload) returning id,request_id,payload,created_by into r;end if;
 if r.payload is distinct from p_payload or r.created_by is distinct from public.cartera_subject() then raise exception 'cobra_fund_idempotency_conflict';end if;
 return jsonb_build_object('id',r.id,'request_id',r.request_id,'payload',r.payload,'saved',true,'payment_executed',false);
 exception when others then return kora_private.cartera_error(sqlstate,sqlerrm);
 end;
end$$;
revoke all on function public.cartera_operador_solicitar_provision(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cartera_operador_solicitar_provision(uuid,jsonb) to authenticated;
alter function public.cartera_operador_solicitar_provision(uuid,jsonb) owner to kora_cartera_operator;

-- Enablement and the actual profile assignment require the separate reviewed activation.
alter table public.perfiles drop constraint perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check(rol in('gerencia','auditoria','admin_tienda','asesor','operador_cartera'));
revoke create on schema public,kora_private from kora_cartera_operator;
do $$begin perform kora_private.cartera_assert_ready();end$$;
update kora_private.cartera_contract set fingerprint=kora_private.cartera_catalog_fingerprint() where singleton;
notify pgrst,'reload schema';
commit;
