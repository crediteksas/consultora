-- La campana cuenta revisiones operativas, no comparativos históricos.
-- Conserva los cortes, sus metadatos y los permisos existentes de la función.
create or replace function inventario_control.conteos_pendientes_cantidad()
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
      and not coalesce((c.revision_fuente->>'solo_comparativo')::boolean, false)
  );
end;
$function$;
