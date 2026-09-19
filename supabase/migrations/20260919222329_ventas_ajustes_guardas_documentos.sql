begin;

-- Solo incorpora guardas a las operaciones existentes. Conserva íntegros sus
-- cálculos, restitución de inventario y bitácoras; no anula créditos ni pagos.
-- Se valida la forma de cada función para detener la migración si cambió la base.
do $migration$
declare
  v_signature text;
  v_definition text;
  v_auth_guard text := 'if (select public.rol_actual()) not in (''gerencia'',''auditoria'') then';
  v_sale_guard text := 'if coalesce(v_venta.anulada,false) then raise exception ''La venta ya está anulada''; end if;';
  v_period_guard text := $guard$
  if exists (
    select 1 from public.periodos p
    where p.tienda_codigo = v_venta.tienda_codigo
      and v_venta.fecha between p.fecha_inicio and p.fecha_fin
  ) then
    raise exception 'La venta pertenece a un período cerrado. No se puede corregir ni anular desde documentos.';
  end if;$guard$;
  v_credit_guard text := $guard$
  -- Bloquea también la fila de crédito antes de comprobar su estado financiero.
  -- Un valor real registrado (incluso cero) no equivale a un dato ausente.
  perform 1 from public.creditos c where c.venta_id = p_venta_id for update;
  if exists (
    select 1 from public.creditos c
    where c.venta_id = p_venta_id
      and (
        c.estado_conciliacion is distinct from 'pendiente'
        or c.conciliado_at is not null
        or c.importacion_id is not null
        or c.valor_real_financiera is not null
        or exists (select 1 from public.liquidation_operations lo where lo.credito_id = c.id)
        or exists (select 1 from public.credit_portfolio_obligations o where o.credito_id = c.id)
        or exists (select 1 from public.importacion_detalle d where d.credito_id = c.id)
      )
  ) then
    raise exception 'La venta tiene conciliación, importación, liquidación o cartera vinculada. Revisa su reversión en Conciliación o Tesorería antes de anular; no se modificó ningún documento.';
  end if;$guard$;
begin
  foreach v_signature in array array[
    'public.corregir_venta_administrativa(uuid,text,jsonb)',
    'public.anular_venta_administrativa(uuid,text)'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if strpos(v_definition, v_auth_guard) = 0
       or strpos(v_definition, v_sale_guard) = 0 then
      raise exception 'La definición de % cambió; revisa las guardas antes de aplicar esta migración', v_signature;
    end if;

    v_definition := replace(v_definition, v_auth_guard,
      'if auth.uid() is null or not coalesce(public.es_central(), false) then');
    v_definition := replace(v_definition, v_sale_guard,
      v_sale_guard || v_period_guard || case
        when v_signature = 'public.anular_venta_administrativa(uuid,text)'
          then v_credit_guard
        else ''
      end);
    execute v_definition;
  end loop;
end;
$migration$;

revoke all on function public.corregir_venta_administrativa(uuid,text,jsonb) from public, anon;
revoke all on function public.anular_venta_administrativa(uuid,text) from public, anon;
grant execute on function public.corregir_venta_administrativa(uuid,text,jsonb) to authenticated;
grant execute on function public.anular_venta_administrativa(uuid,text) to authenticated;

commit;
