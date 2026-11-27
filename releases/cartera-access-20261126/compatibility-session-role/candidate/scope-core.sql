-- PREPARATION ONLY. No real profile is assigned or widened by this script.
begin;
set local search_path='';
do $preflight$
declare actual text[];expected text[]:=array['abonos','abonos_clientes_b2b_destino','addi_liquidaciones','ajustes_auditoria_cartera_b2b','ajustes_gerencia_solicitudes','ajustes_inventario','aliados','aliados_cierres_utilidad','aliados_cruces_recuperacion','aliados_documentos','aliados_domain_events','aliados_estado_historial','aliados_gastos_operativos','aliados_metas_plataforma','aliados_operadores','aliados_plataformas','aliados_recuperaciones','aliados_reversiones','aliados_sedes','aplicaciones_abono_cliente_b2b_proveedor','aplicaciones_consignacion_proveedor','audit_log','b2b_aura_memoria','b2b_catalogo_borradores','b2b_catalogo_reglas','b2b_certificados_cliente','b2b_cierre_pedidos','b2b_cierres','b2b_facturas_emitidas','b2b_listas_precios','b2b_ofertas','b2b_pedido_avisos','b2b_pedido_fuente','b2b_presupuestos','b2b_referencias_catalogo','b2b_retenciones_cliente','banco_creditek_aplicaciones_proveedor','banco_creditek_cuentas','banco_creditek_movimientos','banco_creditek_pagos_proveedor','beneficiary_bank_accounts','caja_arqueo_intentos','caja_ciclo_config','caja_cortes','caja_diaria','captadores','cartera_retail_retiros_auditoria','categorias_producto','clientes','cobra_krediya_cut_operations','cobra_krediya_cuts','cobra_provision_actions','cobra_provision_authority','cobra_provision_funding_operations','cobra_provision_funding_sources','cobra_provision_fundings','cobros_allocations','cobros_deposits','cobros_events','cobros_expected','comisiones','comprobantes_consignacion','conceptos_gasto','confirmaciones_deuda_tienda','conteos_bloque','conteos_bloque_items','costo_promedio_tienda_historial','credit_collection_events','credit_customer_links','credit_portfolio_obligations','credit_portfolio_operators','credit_portfolio_settings','credit_repayments','creditos','creditos_historicos','creditos_historicos_plataforma','creditos_plataforma_consulta_log','cuenta_corriente','cuentas_cartera','documentos_solicitud','ejecutivos','enlaces_registro','equivalencias_tienda','erp_migration_cuts','facturas_proveedor','festivos_colombia','financial_entries','financial_recurring_templates','gastos','gastos_historial','historico_importado','historico_mensual','importacion_detalle','importaciones_financiera','instrucciones_consignacion','kora_incident_comments','kora_incident_history','kora_incident_notifications','kora_incident_operations','kora_incident_permissions','kora_incident_sequences','kora_incidents','kora_notifications','kora_nova_outbox','kora_nova_platform_renewals','kora_nova_renewal_delivery','kora_nova_reviewers','kora_nova_sources','krediya_bonus_rules','krediya_diferencias','krediya_diferencias_gestiones','krediya_gestiones','krediya_import_reports','krediya_instrucciones','krediya_price_rules','liquidation_adjustments','liquidation_approvals','liquidation_beneficiaries','liquidation_bonuses','liquidation_calculations','liquidation_domain_events','liquidation_imported_files','liquidation_incidents','liquidation_operations','liquidation_platforms','liquidation_source_rows','liquidation_treasury_destinations','liquidations','movimientos','movimientos_caja_tienda','movimientos_cartera','movimientos_tesoreria_central','nova_allied_login_challenges','nova_allied_login_members','nova_allied_login_sessions','nova_authorizations','nova_client_otp_dispatch','nova_client_otp_policy','nova_otp_delivery_receipts','nova_photo_quality_consents','nova_retail_actor_emails','nova_retail_case_events','nova_retail_cases','nova_retail_notifications','nova_retail_photo_events','nova_retail_photo_reviews','nova_retail_reference_deliveries','nova_retail_reference_replacements','nova_retail_reviewers','nova_retail_store_contacts','orden_compra_cambios','orden_compra_items','ordenes_compra','origenes','otp_codigos','pagos_proveedor','payment_destination_corrections','payment_dispatch_items','payment_dispatches','payment_items','payment_orders','pedido_b2b_items','pedidos_b2b','perfiles','periodos','presupuesto_premio_mensual','presupuesto_premios','presupuesto_whatsapp_destinos','presupuesto_whatsapp_envios','presupuestos','producto_foto_historial','productos','proveedores','proveedores_ajustes_detalle','proveedores_ajustes_solicitudes','proveedores_retencion_automatica','referencias','remision_items','remision_margenes','remisiones','reportes_deuda_enviados','reportes_diarios_enviados','retail_b2b_compensations','retenciones_factura_proveedor','saldo_ajustes_auditoria','saldos_iniciales_cartera','sesiones_conteo_cruzado','settlement_policy_versions','solicitudes','stock_cantidad','stock_cantidad_lotes','traslado_items','traslados','treasury_movements','treasury_unit_balances','unidades','utilidades_cierres_negocio','venta_ajustes_administrativos','venta_devoluciones','venta_items','ventas','ventas_autorizaciones'];x record;grants_json jsonb;
begin
 if current_setting('server_version_num')::integer<160000 then raise exception 'cartera_unsupported_server';end if;
 
declare expected jsonb:='[{"schema":"realtime","name":"messages","kind":"p"},{"schema":"realtime","name":"schema_migrations","kind":"r"},{"schema":"realtime","name":"subscription","kind":"r"},{"schema":"storage","name":"bucket_lifecycle_states","kind":"r"},{"schema":"storage","name":"buckets","kind":"r"},{"schema":"storage","name":"buckets_analytics","kind":"r"},{"schema":"storage","name":"buckets_vectors","kind":"r"},{"schema":"storage","name":"lifecycle_abandoned_artifacts","kind":"r"},{"schema":"storage","name":"migrations","kind":"r"},{"schema":"storage","name":"objects","kind":"r"},{"schema":"storage","name":"s3_multipart_uploads","kind":"r"},{"schema":"storage","name":"s3_multipart_uploads_parts","kind":"r"},{"schema":"storage","name":"vector_indexes","kind":"r"}]'::jsonb;actual jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind) order by n.nspname,c.relname),'[]') into actual from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in('storage','realtime') and c.relkind in('r','p','v','m','f') and not (c.relispartition and c.relkind in('r','p') and n.nspname='realtime'
 and c.oid in(select relid from pg_catalog.pg_partition_tree('realtime.messages'::regclass) where level>0)
 and c.relowner=(select relowner from pg_class where oid='realtime.messages'::regclass)
 and not exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0)
 and not exists(select 1 from pg_attribute ca cross join lateral aclexplode(ca.attacl) a where ca.attrelid=c.oid and ca.attnum>0 and not ca.attisdropped and a.grantee=0)
 and not exists(select 1 from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where a.grantee=0 and a.privilege_type in('USAGE','CREATE'))
 and case when to_regrole('kora_cartera_session') is null then true else
 not has_schema_privilege('kora_cartera_session',n.oid,'USAGE') and not has_schema_privilege('kora_cartera_session',n.oid,'CREATE')
 and not has_table_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') end);
 if actual is distinct from expected then raise exception 'cartera_managed_inventory_changed';end if;
end;
 if current_user<>'postgres' then raise exception 'cartera_unreviewed_installer';end if;
 if (select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint where conrelid='public.perfiles'::regclass and conname='perfiles_rol_check') is distinct from 'CHECK ((rol = ANY (ARRAY[''gerencia''::text, ''auditoria''::text, ''admin_tienda''::text, ''asesor''::text])))' then raise exception 'cartera_role_constraint_changed';end if;
 if exists(select 1 from pg_catalog.pg_namespace where nspname='kora_cartera_policy') then raise exception 'cartera_policy_schema_collision';end if;
 if current_setting('createrole_self_grant')<>'' or exists(select 1 from pg_roles where rolname='kora_cartera_session') then raise exception 'cartera_session_creation_precondition';end if;
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

create role kora_cartera_session nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant kora_cartera_session to authenticator with admin false,inherit false,set true;
alter role kora_cartera_session set statement_timeout='8s';
alter role kora_cartera_session set lock_timeout='2s';
grant usage on schema public to kora_cartera_session;
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
revoke all on function public.cartera_subject() from public,anon,authenticated,service_role,kora_cartera_session;
grant execute on function public.cartera_subject() to anon,authenticated,service_role,kora_cartera_operator;

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

create function kora_private.cartera_safe_message_partition(p_rel oid) returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((select (c.relispartition and c.relkind in('r','p') and n.nspname='realtime'
 and c.oid in(select relid from pg_catalog.pg_partition_tree('realtime.messages'::regclass) where level>0)
 and c.relowner=(select relowner from pg_class where oid='realtime.messages'::regclass)
 and not exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0)
 and not exists(select 1 from pg_attribute ca cross join lateral aclexplode(ca.attacl) a where ca.attrelid=c.oid and ca.attnum>0 and not ca.attisdropped and a.grantee=0)
 and not exists(select 1 from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where a.grantee=0 and a.privilege_type in('USAGE','CREATE'))
 and case when to_regrole('kora_cartera_session') is null then true else
 not has_schema_privilege('kora_cartera_session',n.oid,'USAGE') and not has_schema_privilege('kora_cartera_session',n.oid,'CREATE')
 and not has_table_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') end) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid=p_rel),false);
$$;
revoke all on function kora_private.cartera_safe_message_partition(oid) from public,anon,authenticated,service_role,kora_cartera_operator,kora_cartera_session;

create function kora_private.cartera_catalog_fingerprint() returns text language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object(
 'relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'options',c.reloptions,'view',case when c.relkind in('v','m') then pg_catalog.pg_get_viewdef(c.oid,true) end,'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',a.atttypid,'mod',a.atttypmod,'acl',a.attacl,'null',a.attnotnull) order by a.attnum) from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'policies',(select jsonb_agg(jsonb_build_object('name',p.polname,'roles',p.polroles,'cmd',p.polcmd,'permissive',p.polpermissive,'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid),'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname) from pg_catalog.pg_policy p where p.polrelid=c.oid),'triggers',(select jsonb_agg(pg_catalog.pg_get_triggerdef(t.oid) order by t.tgname) from pg_catalog.pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),'constraints',(select jsonb_agg(pg_catalog.pg_get_constraintdef(k.oid) order by k.conname) from pg_catalog.pg_constraint k where k.conrelid=c.oid)) order by n.nspname,c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname not in('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and c.relkind in('r','p','v','m','f','S') and not kora_private.cartera_safe_message_partition(c.oid)),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),'owner',p.proowner,'acl',p.proacl,'definition',case when p.prokind in('f','p') then pg_catalog.pg_get_functiondef(p.oid) end) order by n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid)) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','kora_private','kora_cartera_policy','storage','realtime') or(p.oid='auth.uid()'::regprocedure)),
 'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,'inherit',r.rolinherit,'bypass',r.rolbypassrls,'super',r.rolsuper,'create_role',r.rolcreaterole,'create_db',r.rolcreatedb) order by r.rolname) from pg_catalog.pg_roles r where r.rolname in('anon','authenticated','authenticator','service_role','postgres','kora_cartera_operator','kora_cartera_session')),
 'role_settings',(select jsonb_agg(jsonb_build_object('database',setdatabase,'role',setrole,'settings',setconfig) order by setdatabase,setrole) from pg_db_role_setting),
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

create function kora_private.cartera_assert_managed() returns void language plpgsql security definer set search_path='' as $$
declare expected jsonb:='[{"schema":"realtime","name":"messages","kind":"p"},{"schema":"realtime","name":"schema_migrations","kind":"r"},{"schema":"realtime","name":"subscription","kind":"r"},{"schema":"storage","name":"bucket_lifecycle_states","kind":"r"},{"schema":"storage","name":"buckets","kind":"r"},{"schema":"storage","name":"buckets_analytics","kind":"r"},{"schema":"storage","name":"buckets_vectors","kind":"r"},{"schema":"storage","name":"lifecycle_abandoned_artifacts","kind":"r"},{"schema":"storage","name":"migrations","kind":"r"},{"schema":"storage","name":"objects","kind":"r"},{"schema":"storage","name":"s3_multipart_uploads","kind":"r"},{"schema":"storage","name":"s3_multipart_uploads_parts","kind":"r"},{"schema":"storage","name":"vector_indexes","kind":"r"}]'::jsonb;actual jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind) order by n.nspname,c.relname),'[]') into actual from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in('storage','realtime') and c.relkind in('r','p','v','m','f') and not (c.relispartition and c.relkind in('r','p') and n.nspname='realtime'
 and c.oid in(select relid from pg_catalog.pg_partition_tree('realtime.messages'::regclass) where level>0)
 and c.relowner=(select relowner from pg_class where oid='realtime.messages'::regclass)
 and not exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0)
 and not exists(select 1 from pg_attribute ca cross join lateral aclexplode(ca.attacl) a where ca.attrelid=c.oid and ca.attnum>0 and not ca.attisdropped and a.grantee=0)
 and not exists(select 1 from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where a.grantee=0 and a.privilege_type in('USAGE','CREATE'))
 and case when to_regrole('kora_cartera_session') is null then true else
 not has_schema_privilege('kora_cartera_session',n.oid,'USAGE') and not has_schema_privilege('kora_cartera_session',n.oid,'CREATE')
 and not has_table_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') end);
 if actual is distinct from expected then raise exception 'cartera_managed_inventory_changed';end if;
 if exists(select 1 from pg_namespace where nspname in('storage','realtime') and (has_schema_privilege('kora_cartera_session',oid,'USAGE') or has_schema_privilege('kora_cartera_session',oid,'CREATE'))) then raise exception 'cartera_managed_surface_not_isolated';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('storage','realtime') and ((c.relkind in('r','p','v','m','f') and (has_table_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) or(c.relkind='S' and has_sequence_privilege('kora_cartera_session',c.oid,'USAGE,SELECT,UPDATE')) or c.relowner='kora_cartera_session'::regrole)) then raise exception 'cartera_managed_surface_not_isolated';end if;
end$$;
revoke all on function kora_private.cartera_assert_managed() from public,anon,authenticated,service_role,kora_cartera_operator,kora_cartera_session;


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
-- R6 candidate: fixed privilege checks. Never installs or assigns an Auth user.
create function kora_private.cartera_assert_session_surface() returns void language plpgsql security definer set search_path='' as $$
declare s record;rpc_shape record;expected text[];actual text[];
begin
 if current_setting('server_version_num')::integer<160000 then raise exception 'cartera_unsupported_server';end if;
 if not exists(select 1 from pg_roles where rolname='kora_cartera_session' and not(rolcanlogin or rolinherit or rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)) then raise exception 'cartera_session_role_attributes';end if;
 if exists(select 1 from pg_roles r where r.rolname<>'kora_cartera_session' and (pg_has_role('kora_cartera_session',r.oid,'MEMBER') or pg_has_role('kora_cartera_session',r.oid,'USAGE') or pg_has_role('kora_cartera_session',r.oid,'SET'))) then raise exception 'cartera_session_forward_membership';end if;
 -- Exact count is asserted separately; avoid accepting an extra trusted member.
 if (select count(*) from pg_auth_members where roleid='kora_cartera_session'::regrole)<>2 or exists(select 1 from pg_auth_members where roleid='kora_cartera_session'::regrole and not((member='postgres'::regrole and grantor=10 and admin_option and not inherit_option and not set_option) or(member='authenticator'::regrole and grantor='postgres'::regrole and not admin_option and not inherit_option and set_option))) then raise exception 'cartera_session_reverse_membership';end if;
 if not exists(select 1 from pg_db_role_setting where setrole='kora_cartera_session'::regrole and setdatabase=0 and setconfig=array['statement_timeout=8s','lock_timeout=2s']) then raise exception 'cartera_session_timeout_settings';end if;
 if exists(select 1 from pg_namespace where nspname in('auth','kora_private','kora_cartera_policy','storage','realtime') and (has_schema_privilege('kora_cartera_session',oid,'USAGE') or has_schema_privilege('kora_cartera_session',oid,'CREATE'))) then raise exception 'cartera_session_private_schema_grant';end if;
 if has_schema_privilege('kora_cartera_session','public','CREATE') then raise exception 'cartera_session_public_create';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and (n.nspname in('public','auth','kora_private','kora_cartera_policy','storage','realtime') or not exists(select 1 from pg_depend xd where xd.classid='pg_class'::regclass and xd.objid=c.oid and xd.refclassid='pg_extension'::regclass and xd.deptype='e')) and ((c.relkind in('r','p','v','m','f') and (has_table_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) or(c.relkind='S' and has_sequence_privilege('kora_cartera_session',c.oid,'USAGE,SELECT,UPDATE')) or c.relowner='kora_cartera_session'::regrole)) then raise exception 'cartera_session_data_grant';end if;
 -- Tier H is public. Actual provider/API exposure is independently verified.
 if exists(select 1 from pg_proc fn_meta join pg_namespace n on n.oid=fn_meta.pronamespace where n.nspname='public' and fn_meta.prorettype not in('trigger'::regtype,'event_trigger'::regtype,'internal'::regtype) and has_function_privilege('kora_cartera_session',fn_meta.oid,'EXECUTE') and fn_meta.proname not in('cartera_operador_inicio','cartera_operador_datos','cartera_operador_guardar_gestion','cartera_operador_solicitar_provision','kora_confirmacion_deuda_pre_request') and (fn_meta.prosecdef or (case when fn_meta.prokind in('f','p') then pg_get_functiondef(fn_meta.oid) else '' end) ~* '(dblink|http_|net\.|pg_notify|lo_import|lo_export|pg_read_file|pg_write_file)')) then raise exception 'cartera_session_unsafe_http_function';end if;
 for s in select * from(values
 ('cartera_operador_inicio','public.cartera_operador_inicio()','authenticated'),
 ('cartera_operador_datos','public.cartera_operador_datos(text,date,uuid,uuid,integer,integer,uuid)',null),
 ('cartera_operador_guardar_gestion','public.cartera_operador_guardar_gestion(uuid,uuid,text,text,text,date,numeric)',null),
 ('cartera_operador_solicitar_provision','public.cartera_operador_solicitar_provision(uuid,jsonb)',null)) q(name,signature,ordinary) loop
  select pr.* into rpc_shape from pg_proc pr where pr.oid=to_regprocedure(s.signature);
  if not found or rpc_shape.proretset or rpc_shape.prorettype<>'jsonb'::regtype or rpc_shape.proowner<>'kora_cartera_operator'::regrole or not rpc_shape.prosecdef or rpc_shape.proconfig is distinct from array['search_path=""'] then raise exception 'cartera_session_rpc_shape';end if;
  if(select count(*) from pg_proc pr join pg_namespace ns on ns.oid=pr.pronamespace where ns.nspname='public' and pr.proname=s.name)<>1 then raise exception 'cartera_session_rpc_overload';end if;
  expected:=array['kora_cartera_operator:EXECUTE:false:kora_cartera_operator','kora_cartera_session:EXECUTE:false:kora_cartera_operator'];
  if s.ordinary is not null then expected:=array_append(expected,'authenticated:EXECUTE:false:kora_cartera_operator');end if;
  select array_agg(x order by x) into expected from unnest(expected) x;
  select array_agg(pg_get_userbyid(a.grantee)||':'||a.privilege_type||':'||a.is_grantable::text||':'||pg_get_userbyid(a.grantor) order by pg_get_userbyid(a.grantee)||':'||a.privilege_type||':'||a.is_grantable::text||':'||pg_get_userbyid(a.grantor)) into actual from aclexplode(coalesce(rpc_shape.proacl,acldefault('f',rpc_shape.proowner))) a;
  if actual is distinct from expected then raise exception 'cartera_session_rpc_acl';end if;
 end loop;
end$$;
revoke all on function kora_private.cartera_assert_session_surface() from public,anon,authenticated,service_role,kora_cartera_operator,kora_cartera_session;

create function kora_private.cartera_assert_ready() returns void language plpgsql security definer set search_path='' as $$
declare actual text[];expected text[]:=array['abonos','abonos_clientes_b2b_destino','addi_liquidaciones','ajustes_auditoria_cartera_b2b','ajustes_gerencia_solicitudes','ajustes_inventario','aliados','aliados_cierres_utilidad','aliados_cruces_recuperacion','aliados_documentos','aliados_domain_events','aliados_estado_historial','aliados_gastos_operativos','aliados_metas_plataforma','aliados_operadores','aliados_plataformas','aliados_recuperaciones','aliados_reversiones','aliados_sedes','aplicaciones_abono_cliente_b2b_proveedor','aplicaciones_consignacion_proveedor','audit_log','b2b_aura_memoria','b2b_catalogo_borradores','b2b_catalogo_reglas','b2b_certificados_cliente','b2b_cierre_pedidos','b2b_cierres','b2b_facturas_emitidas','b2b_listas_precios','b2b_ofertas','b2b_pedido_avisos','b2b_pedido_fuente','b2b_presupuestos','b2b_referencias_catalogo','b2b_retenciones_cliente','banco_creditek_aplicaciones_proveedor','banco_creditek_cuentas','banco_creditek_movimientos','banco_creditek_pagos_proveedor','beneficiary_bank_accounts','caja_arqueo_intentos','caja_ciclo_config','caja_cortes','caja_diaria','captadores','cartera_retail_retiros_auditoria','categorias_producto','clientes','cobra_krediya_cut_operations','cobra_krediya_cuts','cobra_provision_actions','cobra_provision_authority','cobra_provision_funding_operations','cobra_provision_funding_sources','cobra_provision_fundings','cobros_allocations','cobros_deposits','cobros_events','cobros_expected','comisiones','comprobantes_consignacion','conceptos_gasto','confirmaciones_deuda_tienda','conteos_bloque','conteos_bloque_items','costo_promedio_tienda_historial','credit_collection_events','credit_customer_links','credit_portfolio_obligations','credit_portfolio_operators','credit_portfolio_settings','credit_repayments','creditos','creditos_historicos','creditos_historicos_plataforma','creditos_plataforma_consulta_log','cuenta_corriente','cuentas_cartera','documentos_solicitud','ejecutivos','enlaces_registro','equivalencias_tienda','erp_migration_cuts','facturas_proveedor','festivos_colombia','financial_entries','financial_recurring_templates','gastos','gastos_historial','historico_importado','historico_mensual','importacion_detalle','importaciones_financiera','instrucciones_consignacion','kora_incident_comments','kora_incident_history','kora_incident_notifications','kora_incident_operations','kora_incident_permissions','kora_incident_sequences','kora_incidents','kora_notifications','kora_nova_outbox','kora_nova_platform_renewals','kora_nova_renewal_delivery','kora_nova_reviewers','kora_nova_sources','krediya_bonus_rules','krediya_diferencias','krediya_diferencias_gestiones','krediya_gestiones','krediya_import_reports','krediya_instrucciones','krediya_price_rules','liquidation_adjustments','liquidation_approvals','liquidation_beneficiaries','liquidation_bonuses','liquidation_calculations','liquidation_domain_events','liquidation_imported_files','liquidation_incidents','liquidation_operations','liquidation_platforms','liquidation_source_rows','liquidation_treasury_destinations','liquidations','movimientos','movimientos_caja_tienda','movimientos_cartera','movimientos_tesoreria_central','nova_allied_login_challenges','nova_allied_login_members','nova_allied_login_sessions','nova_authorizations','nova_client_otp_dispatch','nova_client_otp_policy','nova_otp_delivery_receipts','nova_photo_quality_consents','nova_retail_actor_emails','nova_retail_case_events','nova_retail_cases','nova_retail_notifications','nova_retail_photo_events','nova_retail_photo_reviews','nova_retail_reference_deliveries','nova_retail_reference_replacements','nova_retail_reviewers','nova_retail_store_contacts','orden_compra_cambios','orden_compra_items','ordenes_compra','origenes','otp_codigos','pagos_proveedor','payment_destination_corrections','payment_dispatch_items','payment_dispatches','payment_items','payment_orders','pedido_b2b_items','pedidos_b2b','perfiles','periodos','presupuesto_premio_mensual','presupuesto_premios','presupuesto_whatsapp_destinos','presupuesto_whatsapp_envios','presupuestos','producto_foto_historial','productos','proveedores','proveedores_ajustes_detalle','proveedores_ajustes_solicitudes','proveedores_retencion_automatica','referencias','remision_items','remision_margenes','remisiones','reportes_deuda_enviados','reportes_diarios_enviados','retail_b2b_compensations','retenciones_factura_proveedor','saldo_ajustes_auditoria','saldos_iniciales_cartera','sesiones_conteo_cruzado','settlement_policy_versions','solicitudes','stock_cantidad','stock_cantidad_lotes','traslado_items','traslados','treasury_movements','treasury_unit_balances','unidades','utilidades_cierres_negocio','venta_ajustes_administrativos','venta_devoluciones','venta_items','ventas','ventas_autorizaciones'];x record;grants_json jsonb;
begin
 if current_setting('server_version_num')::integer<160000 then raise exception 'cartera_unsupported_server';end if;
 if (select md5(prosrc) from pg_proc where oid='public.kora_confirmacion_deuda_pre_request()'::regprocedure)<>'799023da2e442e5ba83d0df4965a6531' or md5(pg_catalog.pg_get_functiondef('kora_private.exigir_confirmacion_deuda_api()'::regprocedure))<>'a8aad0e67f70551625e9ede1937b92cd' then raise exception 'cartera_existing_guard_changed';end if;
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
 perform kora_private.cartera_assert_coverage();perform kora_private.cartera_assert_dependencies();perform kora_private.cartera_assert_session_surface();
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
 if current_setting('role',true) is distinct from 'kora_cartera_session' or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'kora_cartera_session' or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub' is distinct from public.cartera_subject()::text or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'is_anonymous'='true' then raise sqlstate 'PT403' using message='cartera_session_role_required';end if;
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
 if not kora_cartera_policy.cartera_principal_restringido() then
  if current_setting('role',true)='kora_cartera_session' then raise sqlstate 'PT403' using message='cartera_dedicated_actor_required';end if;
  return jsonb_build_object('restricted',false);
 end if;
 if current_setting('role',true) is distinct from 'kora_cartera_session' or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'kora_cartera_session' or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub' is distinct from public.cartera_subject()::text or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'is_anonymous'='true' then raise sqlstate 'PT403' using message='cartera_session_role_required';end if;

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
 if current_setting('role',true) is distinct from 'kora_cartera_session' and not kora_cartera_policy.cartera_principal_restringido() then return;end if;
 if current_setting('role',true) is distinct from 'kora_cartera_session' or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'kora_cartera_session' or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub' is distinct from public.cartera_subject()::text or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'is_anonymous'='true' then raise sqlstate 'PT403' using message='cartera_session_role_required';end if;
 if not kora_cartera_policy.cartera_principal_restringido() then raise sqlstate 'PT403' using message='cartera_dedicated_actor_required';end if;
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
 if current_setting('role',true)='kora_cartera_session' or kora_cartera_policy.cartera_principal_restringido() then
  perform kora_private.cartera_api_pre_request();return;
 end if;
 if current_setting('request.method',true)='POST' and current_setting('request.path',true) in('/rpc/cartera_operador_inicio','rpc/cartera_operador_inicio') then
  perform kora_private.cartera_api_pre_request();return;
 end if;
 perform kora_private.exigir_confirmacion_deuda_api();
 perform kora_private.cartera_api_pre_request();
end$$;
grant execute on function public.kora_confirmacion_deuda_pre_request() to kora_cartera_session;


-- Enablement and the actual profile assignment require the separate reviewed activation.
alter table public.perfiles drop constraint perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check(rol in('gerencia','auditoria','admin_tienda','asesor','operador_cartera'));
set local role kora_cartera_operator;
revoke all on function public.cartera_operador_inicio() from public,anon,authenticated,service_role,postgres,kora_cartera_session;
grant execute on function public.cartera_operador_inicio() to kora_cartera_operator,kora_cartera_session,authenticated;
reset role;
revoke create on schema public,kora_private from kora_cartera_operator;
do $$begin perform kora_private.cartera_assert_ready();end$$;
update kora_private.cartera_contract set fingerprint=kora_private.cartera_catalog_fingerprint() where singleton;
notify pgrst,'reload schema';
commit;
