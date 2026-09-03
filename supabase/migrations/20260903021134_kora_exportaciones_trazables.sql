begin;

create or replace function public.kora_registrar_exportacion(
  p_reporte_id text,
  p_formato text,
  p_ruta text,
  p_titulo text,
  p_filtros jsonb default '{}'::jsonb,
  p_registros integer default 0
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.perfiles
    where id = auth.uid() and activo = true
  ) then
    raise exception 'Acceso denegado';
  end if;
  if p_formato not in ('xlsx', 'pdf')
     or p_reporte_id !~ '^KORA-REP-[0-9]{8}-[0-9]{6}-[0-9A-F]{4}$'
     or length(coalesce(p_ruta, '')) > 300
     or length(coalesce(p_titulo, '')) > 160
     or p_registros < 0 then
    raise exception 'Parámetros de exportación inválidos';
  end if;

  insert into public.audit_log(usuario, accion, tabla, detalle)
  values (
    auth.uid(),
    'informe_exportado',
    'kora_reportes',
    jsonb_build_object(
      'reporte_id', p_reporte_id,
      'formato', p_formato,
      'ruta', p_ruta,
      'titulo', p_titulo,
      'filtros', coalesce(p_filtros, '{}'::jsonb),
      'registros', p_registros
    )
  );
  return true;
end;
$$;

revoke all on function public.kora_registrar_exportacion(text,text,text,text,jsonb,integer) from public, anon;
grant execute on function public.kora_registrar_exportacion(text,text,text,text,jsonb,integer) to authenticated;

commit;
