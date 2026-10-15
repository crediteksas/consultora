-- Aplicar después de publicar confirmacion-deuda.js y comprobar el arranque de KORA.
begin;
do $$ begin
 if exists(select 1 from pg_db_role_setting s,unnest(s.setconfig) cfg
   where s.setrole=(select oid from pg_roles where rolname='authenticator')
     and cfg like 'pgrst.db_pre_request=%'
     and cfg<>'pgrst.db_pre_request=public.kora_confirmacion_deuda_pre_request') then
   raise exception 'Existe otro pre-request configurado: integrar ambos controles antes de activar';
 end if;
end $$;
alter role authenticator set pgrst.db_pre_request='public.kora_confirmacion_deuda_pre_request';
notify pgrst,'reload config';
commit;
