-- Anulación auditable de retiros Retail autorizados que nunca se pagaron.
-- No borra documentos ni modifica Banco, Caja, cartera o Kardex.
begin;

create function kora_private.finanzas_anular_retiro_retail(
  p_id uuid, p_motivo text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  e public.financial_entries%rowtype;
  previous jsonb;
  original_entry jsonb;
  original_instructions jsonb;
  reason text := btrim(coalesce(p_motivo,''));
  instruction_count integer;
  instruction_total numeric;
begin
  if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
     or not public.es_controlador_financiero()
     or public.rol_actual() is distinct from 'gerencia' then
    raise exception 'Solo Oscar con perfil activo de Gerencia puede anular este retiro';
  end if;
  if p_id is null or p_request_id is null or length(reason)<5 then
    raise exception 'Indica el retiro, un motivo y una clave de idempotencia';
  end if;
  -- Serializa la misma solicitud, incluso si intenta usarla para otro retiro.
  perform pg_advisory_xact_lock(hashtextextended('anular-retiro-retail:'||p_request_id::text,0));
  select detalle into previous from public.audit_log
    where accion='finanzas_retiro_retail_anulado' and detalle->>'request_id'=p_request_id::text;
  if found then
    if previous->>'entry_id' is distinct from p_id::text
       or previous->>'motivo' is distinct from reason then
      raise exception 'La solicitud de anulación ya se usó con otros datos';
    end if;
    return jsonb_build_object('ok',true,'reutilizado',true,'id',p_id,'status','anulado');
  end if;

  -- Un retiro pendiente puede emitir instrucciones al aprobarse: no lo admitimos.
  select * into e from public.financial_entries where id=p_id;
  if not found or e.entry_type<>'retiro_utilidad' or e.business_unit<>'retail'
     or e.status<>'aprobado' then
    raise exception 'Solo se anulan retiros Retail aprobados y sin pago';
  end if;
  -- Mismo orden que la validación: instrucciones primero, documento después.
  perform id from public.instrucciones_consignacion
    where financial_entry_id=p_id order by id for update;
  select * into e from public.financial_entries where id=p_id for update;
  if e.status<>'aprobado' or e.approved_by is distinct from auth.uid()
     or e.approved_at is null or e.paid_at is not null or e.paid_by is not null
     or e.support_path is not null
     or (to_jsonb(e)->>'pagado_desde_banco_creditek')::boolean is true then
    raise exception 'El retiro cambió o ya registra un pago; no se anuló nada';
  end if;
  select count(*),sum(valor_esperado),jsonb_agg(to_jsonb(i) order by id)
    into instruction_count,instruction_total,original_instructions
    from public.instrucciones_consignacion i where financial_entry_id=p_id;
  if instruction_count=0 or instruction_total is distinct from e.amount
     or exists(select 1 from public.instrucciones_consignacion
       where financial_entry_id=p_id and (tipo_destino<>'SOCIO' or estado<>'pendiente'
         or movimiento_retiro_id is not null)) then
    raise exception 'Las instrucciones no están íntegramente pendientes; no se anuló nada';
  end if;
  if exists(select 1 from public.comprobantes_consignacion c
    join public.instrucciones_consignacion i on i.id=c.instruccion_id
    where i.financial_entry_id=p_id) then
    raise exception 'El retiro tiene comprobantes: revisa el pago antes de anular';
  end if;
  original_entry:=to_jsonb(e);
  update public.instrucciones_consignacion
    set estado='anulada',decidida_por=auth.uid(),decidida_at=now(),
        motivo_decision=reason,
        decision_idempotency_key=md5(p_request_id::text||':anular:'||id::text)::uuid,updated_at=now()
    where financial_entry_id=p_id;
  update public.financial_entries
    set status='anulado',note=concat_ws(E'\n',nullif(note,''),'Anulación: '||reason),updated_at=now()
    where id=p_id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'finanzas_retiro_retail_anulado','financial_entries',p_id::text,
      jsonb_build_object('request_id',p_request_id,'entry_id',p_id,'motivo',reason,
        'antes',original_entry,'instrucciones_antes',original_instructions,
        'instrucciones_anuladas',instruction_count,'status','anulado',
        'movio_banco',false,'movio_caja',false));
  return jsonb_build_object('ok',true,'reutilizado',false,'id',p_id,
    'status','anulado','instrucciones_anuladas',instruction_count);
end;
$$;
revoke all on function kora_private.finanzas_anular_retiro_retail(uuid,text,uuid) from public,anon;
grant execute on function kora_private.finanzas_anular_retiro_retail(uuid,text,uuid) to authenticated;

create function public.finanzas_anular_retiro_retail(p_id uuid,p_motivo text,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select kora_private.finanzas_anular_retiro_retail(p_id,p_motivo,p_request_id);
$$;
revoke all on function public.finanzas_anular_retiro_retail(uuid,text,uuid) from public,anon;
grant execute on function public.finanzas_anular_retiro_retail(uuid,text,uuid) to authenticated;

-- Conserva las validaciones de aprobación, pago y snapshot. Añade solo esta salida.
do $migration$
declare
  definition text := pg_get_functiondef('kora_private.retiro_retail_guardar_estado()'::regprocedure);
  anchor text := E'  elsif old.status=''aprobado'' then';
  cancellation text := $branch$
  elsif new.status='anulado' and old.status='aprobado' then
    if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
       or not public.es_controlador_financiero()
       or public.rol_actual() is distinct from 'gerencia' then
      raise exception 'Solo Oscar puede anular un retiro autorizado';
    end if;
    if old.paid_at is not null or old.paid_by is not null or old.support_path is not null
       or (to_jsonb(old)->>'pagado_desde_banco_creditek')::boolean is true
       or not exists(select 1 from public.instrucciones_consignacion where financial_entry_id=old.id)
       or exists(select 1 from public.instrucciones_consignacion where financial_entry_id=old.id
         and (estado<>'anulada' or tipo_destino<>'SOCIO' or movimiento_retiro_id is not null))
       or exists(select 1 from public.comprobantes_consignacion c
         join public.instrucciones_consignacion i on i.id=c.instruccion_id
         where i.financial_entry_id=old.id) then
      raise exception 'Solo se anula junto con todas sus instrucciones, sin pagos ni comprobantes';
    end if;
$branch$;
begin
  if position(anchor in definition)=0 or position('Solo se anula junto' in definition)>0 then
    raise exception 'El guard de retiros difiere de la versión revisada';
  end if;
  execute replace(definition,anchor,cancellation||anchor);
end;
$migration$;

commit;
