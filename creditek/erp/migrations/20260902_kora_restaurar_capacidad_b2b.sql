begin;

create or replace function public.es_admin_b2b()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = auth.uid()
      and p.activo = true
      and p.rol in ('gerencia', 'auditoria')
  );
$$;

revoke all on function public.es_admin_b2b() from public, anon;
grant execute on function public.es_admin_b2b() to authenticated;

commit;
