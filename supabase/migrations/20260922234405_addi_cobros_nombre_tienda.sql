begin;

-- El concepto que recibe Tesorería identifica la tienda por nombre, no por código.
create or replace function cobros_private.addi_liquidacion_aprobar(p_venta_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.addi_liquidaciones%rowtype;
  e_id uuid;
  v_tienda_nombre text;
begin
  if not cobros_private.autorizado(true) then raise exception 'Solo Gerencia puede aprobar Addi'; end if;
  select * into a from public.addi_liquidaciones
    where venta_id = p_venta_id for update;
  if not found or a.estado <> 'revisada' then
    raise exception 'La venta Addi debe estar revisada antes de aprobarse';
  end if;
  if exists (select 1 from public.ventas v where v.id = a.venta_id and v.anulada) then
    raise exception 'No se puede aprobar una venta anulada';
  end if;
  select nullif(btrim(o.nombre),'') into v_tienda_nombre
    from public.origenes o where o.codigo = a.tienda_codigo;
  if v_tienda_nombre is null then
    raise exception 'La tienda no tiene nombre en el catálogo; corrígelo antes de aprobar';
  end if;
  insert into public.cobros_expected (
    plataforma,corte,fecha_esperada,concepto,importe,soporte,
    fuente_tipo,venta_id,credito_bruto,tarifa_addi,iva_tarifa,
    idempotency_key,created_by
  ) values (
    'addi',a.fecha_venta,a.fecha_esperada,
    'Venta Addi #' || a.consecutivo || ' · ' || v_tienda_nombre,
    a.neto_estimado,'Venta KORA ' || a.venta_id,
    'estimacion_venta',a.venta_id,a.credito_bruto,a.tarifa_addi,a.iva_tarifa,
    gen_random_uuid(),auth.uid()
  ) returning id into e_id;
  update public.addi_liquidaciones set estado = 'aprobada',
    aprobada_por = auth.uid(), aprobada_at = now(), cobro_expected_id = e_id,
    updated_at = now() where id = a.id returning * into a;
  perform cobros_private.evento('expected_creado',e_id,
    jsonb_build_object('origen','venta_addi','venta_id',a.venta_id,'neto_estimado',a.neto_estimado));
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'addi_liquidacion_aprobada','addi_liquidaciones',a.id,
           jsonb_build_object('venta_id',a.venta_id,'cobro_expected_id',e_id));
  return to_jsonb(a);
end;
$$;

-- Definidor solo en esquema privado, invocable por el wrapper público autorizado.
revoke all on function cobros_private.addi_liquidacion_aprobar(uuid) from public,anon;
grant execute on function cobros_private.addi_liquidacion_aprobar(uuid) to authenticated;

commit;
