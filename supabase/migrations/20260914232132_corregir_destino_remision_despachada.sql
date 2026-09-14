-- Corrige únicamente el destino de una remisión despachada que todavía no fue
-- recibida. Las reservas y salidas siguen perteneciendo a CENTRAL hasta la
-- recepción, por lo que no se recrean movimientos ni se altera el inventario.

create or replace function remisiones_edicion_private.corregir_destino(
  p_remision_id uuid,
  p_revision integer,
  p_tienda_codigo text,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remision public.remisiones%rowtype;
  v_revision integer;
  v_destino text := upper(trim(coalesce(p_tienda_codigo, '')));
  v_anterior jsonb;
  v_posterior jsonb;
begin
  if not remisiones_edicion_private.permitido() then
    raise exception 'No tienes permiso para corregir el destino de remisiones';
  end if;

  select *
    into v_remision
    from public.remisiones
   where id = p_remision_id
   for update;

  if not found
     or v_remision.estado <> 'despachada'
     or v_remision.recibida_at is not null
  then
    raise exception 'Solo se puede cambiar el destino antes de que la tienda reciba la remisión';
  end if;

  if p_revision is null or p_revision <> v_remision.revision then
    raise exception 'La remisión cambió. Cierra y vuelve a abrir antes de guardar';
  end if;

  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo del cambio (mínimo 5 caracteres)';
  end if;

  if not exists (
    select 1
      from public.origenes
     where codigo = v_destino
       and tipo = 'propia'
       and activo = true
  ) then
    raise exception 'La tienda destino no existe, no está activa o no es una tienda propia';
  end if;

  if v_destino = v_remision.tienda_codigo then
    raise exception 'Selecciona una tienda destino diferente';
  end if;

  v_anterior := jsonb_build_object(
    'tienda_codigo', v_remision.tienda_codigo,
    'estado', v_remision.estado,
    'revision', v_remision.revision
  );

  update public.remisiones
     set tienda_codigo = v_destino,
         revision = revision + 1
   where id = v_remision.id
   returning revision into v_revision;

  v_posterior := jsonb_build_object(
    'tienda_codigo', v_destino,
    'estado', v_remision.estado,
    'revision', v_revision
  );

  insert into remisiones_edicion_private.historial(
    remision_id,
    revision,
    usuario_id,
    motivo,
    anterior,
    posterior
  ) values (
    v_remision.id,
    v_revision,
    auth.uid(),
    trim(p_motivo),
    v_anterior,
    v_posterior
  );

  return jsonb_build_object(
    'ok', true,
    'remision_id', v_remision.id,
    'revision', v_revision,
    'destino_anterior', v_remision.tienda_codigo,
    'destino_nuevo', v_destino
  );
end;
$$;

revoke all on function remisiones_edicion_private.corregir_destino(uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function remisiones_edicion_private.corregir_destino(uuid, integer, text, text)
  to authenticated;

create or replace function public.corregir_destino_remision_despachada(
  p_remision_id uuid,
  p_revision integer,
  p_tienda_codigo text,
  p_motivo text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select remisiones_edicion_private.corregir_destino(
    p_remision_id,
    p_revision,
    p_tienda_codigo,
    p_motivo
  );
$$;

revoke all on function public.corregir_destino_remision_despachada(uuid, integer, text, text)
  from public, anon;
grant execute on function public.corregir_destino_remision_despachada(uuid, integer, text, text)
  to authenticated;
