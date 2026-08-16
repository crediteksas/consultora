begin;
do $$ begin
  if exists(select 1 from public.aliados)
     or exists(select 1 from public.aliados_estado_historial)
     or exists(select 1 from public.aliados_domain_events) then
    raise exception 'Rollback V1.1 bloqueado: existen históricos. Conservar tablas y revertir aplicación con restauración validada.';
  end if;
end $$;
drop policy if exists aliados_v11_select on public.aliados;
drop policy if exists aliados_v11_select on public.aliados_sedes;
drop policy if exists aliados_v11_select on public.aliados_plataformas;
drop policy if exists aliados_v11_select on public.aliados_documentos;
drop policy if exists aliados_v11_select on public.aliados_estado_historial;
drop policy if exists aliados_v11_select on public.aliados_domain_events;
drop function if exists public.aliados_reactivar(uuid,text);
drop function if exists public.aliados_suspendender(uuid,text);
drop function if exists public.aliados_cambiar_estado_maestro(uuid,text,text);
drop function if exists public.aliados_guardar_maestro(uuid,text,text,text,text,uuid,text,text);
drop function if exists public.puede_gestionar_aliados();
drop table if exists public.aliados_domain_events;
drop table if exists public.aliados_estado_historial;
drop table if exists public.aliados_documentos;
drop table if exists public.aliados_plataformas;
drop table if exists public.aliados_sedes;
drop table if exists public.aliados;
commit;
