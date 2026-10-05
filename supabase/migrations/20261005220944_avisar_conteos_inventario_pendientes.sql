-- Campana de Gerencia y Auditoría: cuenta solo cortes ya cargados y aún
-- pendientes de una decisión. La consulta no aplica ajustes ni revela filas.
create or replace function public.conteos_pendientes_cantidad()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.perfiles p
    join inventario_control.responsables r on r.perfil_id = p.id
    where p.id = auth.uid()
      and p.activo = true
      and p.rol in ('gerencia', 'auditoria')
  ) then
    return 0;
  end if;

  return (
    select count(*)
    from inventario_control.cortes c
    where c.estado = 'pendiente'
  );
end;
$function$;

revoke all on function public.conteos_pendientes_cantidad() from public, anon, authenticated;
grant execute on function public.conteos_pendientes_cantidad() to authenticated;
