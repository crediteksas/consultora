-- Cartera es independiente de la confirmación diaria de la tienda.
-- El permiso existente y activo de gestionar Cartera es obligatorio.
-- No se modifican roles, saldos, confirmaciones ni otras rutas.
set local lock_timeout='3s';
set local statement_timeout='20s';
do $preflight$
begin
 if md5(pg_catalog.pg_get_functiondef('public.kora_confirmacion_deuda_pre_request()'::regprocedure)) <> '8c27a5975628606baa2093c610f3474c'
 or md5(pg_catalog.pg_get_functiondef('kora_private.exigir_confirmacion_deuda_api()'::regprocedure)) <> 'a8aad0e67f70551625e9ede1937b92cd'
 or md5(pg_catalog.pg_get_functiondef('kora_private.cartera_api_pre_request()'::regprocedure)) <> '52da4eb5ffd077c6fb702fb0325ffd52'
 or md5(pg_catalog.pg_get_functiondef('public.cobra_quality_operator()'::regprocedure)) <> '367477a866771c9bf1cb8bed602fbbbb'
 or not exists(select 1 from kora_private.cartera_contract where singleton and not enabled)
 or not exists(select 1 from pg_catalog.pg_proc p where p.oid='public.kora_confirmacion_deuda_pre_request()'::regprocedure and pg_catalog.pg_get_userbyid(p.proowner)='postgres' and p.prosecdef and p.proconfig=array['search_path=""'] and p.proacl::text='{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,kora_cartera_session=X/postgres}')
 then raise exception 'cartera_independiente_preflight_changed'; end if;
end $preflight$;
create or replace function public.kora_confirmacion_deuda_pre_request() returns void
language plpgsql security definer set search_path='' as $function$
begin
 if current_setting('role',true)='kora_cartera_session' or kora_cartera_policy.cartera_principal_restringido() then
  perform kora_private.cartera_api_pre_request();return;
 end if;
 if current_setting('request.method',true)='POST' and current_setting('request.path',true) in('/rpc/cartera_operador_inicio','rpc/cartera_operador_inicio') then
  perform kora_private.cartera_api_pre_request();return;
 end if;
 if current_setting('role',true)='authenticated' and current_setting('request.method',true)='POST'
 and current_setting('request.path',true) in (
  '/rpc/cobra_quality_operator','rpc/cobra_quality_operator',
  '/rpc/cobra_quality_importer','rpc/cobra_quality_importer',
  '/rpc/cobra_krediya_history_cuts','rpc/cobra_krediya_history_cuts',
  '/rpc/cobra_krediya_save_collection','rpc/cobra_krediya_save_collection',
  '/rpc/cobra_krediya_payload_digest','rpc/cobra_krediya_payload_digest',
  '/rpc/cobra_krediya_save_cut','rpc/cobra_krediya_save_cut',
  '/rpc/cobra_provision_authorizer','rpc/cobra_provision_authorizer',
  '/rpc/cobra_provision_book','rpc/cobra_provision_book',
  '/rpc/cobra_provision_source','rpc/cobra_provision_source',
  '/rpc/cobra_provision_save','rpc/cobra_provision_save'
 ) and exists (
  select 1 from public.perfiles p
  join public.credit_portfolio_operators o on o.perfil_id=p.id
  where p.id=(select auth.uid()) and p.activo and p.rol='admin_tienda'
    and o.active and o.capability='manage'
 ) then
  perform kora_private.cartera_api_pre_request();return;
 end if;
 perform kora_private.exigir_confirmacion_deuda_api();
 perform kora_private.cartera_api_pre_request();
end$function$;
do $postflight$
begin
 if md5(pg_catalog.pg_get_functiondef('public.kora_confirmacion_deuda_pre_request()'::regprocedure)) <> '9bed256af7305c4752bdde1a865bcb6e'
 or not exists(select 1 from pg_catalog.pg_proc p where p.oid='public.kora_confirmacion_deuda_pre_request()'::regprocedure and pg_catalog.pg_get_userbyid(p.proowner)='postgres' and p.prosecdef and p.proconfig=array['search_path=""'] and p.proacl::text='{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,kora_cartera_session=X/postgres}')
 or not exists(select 1 from kora_private.cartera_contract where singleton and not enabled)
 then raise exception 'cartera_independiente_postflight_changed'; end if;
end $postflight$;
notify pgrst,'reload schema';
