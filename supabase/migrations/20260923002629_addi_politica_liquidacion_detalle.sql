begin;

-- La base que reporta Addi se conserva separada del crédito registrado por la tienda.
create table cobros_private.addi_bases_reportadas (
  venta_id uuid primary key references public.ventas(id),
  credito_bruto numeric(16,2) not null check (credito_bruto > 0),
  referencia_addi text,
  fuente text not null,
  registrado_at timestamptz not null default now()
);
alter table cobros_private.addi_bases_reportadas enable row level security;
revoke all on cobros_private.addi_bases_reportadas from public, anon, authenticated;

create table cobros_private.addi_politicas (
  tipo_establecimiento text primary key check (tipo_establecimiento in ('propia','aliado')),
  porcentaje numeric(8,6) not null check (porcentaje > 0 and porcentaje <= 1),
  vigente_desde date not null,
  descripcion text not null
);
alter table cobros_private.addi_politicas enable row level security;
revoke all on cobros_private.addi_politicas from public, anon, authenticated;
insert into cobros_private.addi_politicas values
  ('propia',0.76,date '2026-09-01','Misma participación vigente de tiendas propias'),
  ('aliado',0.77,date '2026-09-01','Misma participación vigente de aliados');

do $$
declare n integer;
begin
  select count(*) into n from public.ventas v
  join public.creditos c on c.venta_id=v.id and lower(btrim(c.financiera))='addi'
  where (v.consecutivo,v.fecha,v.tienda_codigo) in
    ((37,date '2026-09-02','CK-02'),(163,date '2026-09-15','CK-02'),
     (212,date '2026-09-16','CK-07'),(286,date '2026-09-19','CK-03'))
    and not v.anulada;
  if n <> 4 then raise exception 'No coinciden las cuatro ventas Addi identificadas; no aplicar bases'; end if;
end $$;

insert into cobros_private.addi_bases_reportadas(venta_id,credito_bruto,referencia_addi,fuente)
select v.id,x.base,x.referencia,x.fuente
from (values
  (37,date '2026-09-02','CK-02',258800::numeric,null::text,'confirmacion_usuario_2026_09_22'),
  (163,date '2026-09-15','CK-02',550000::numeric,'88dbe5','resumen_addi_2026_09_22'),
  (212,date '2026-09-16','CK-07',600000::numeric,'97fabc','resumen_addi_2026_09_22'),
  (286,date '2026-09-19','CK-03',782000::numeric,'970849','resumen_addi_2026_09_22')
) as x(consecutivo,fecha,tienda,base,referencia,fuente)
join public.ventas v on v.consecutivo=x.consecutivo and v.fecha=x.fecha and v.tienda_codigo=x.tienda;

create or replace function cobros_private.addi_calculo(p_venta_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  a public.addi_liquidaciones%rowtype;
  c public.creditos%rowtype;
  v_base numeric(16,2); v_pct numeric(8,6); v_fee numeric(16,2);
  v_iva numeric(16,2); v_neto numeric(16,2); v_pagamos numeric(16,2);
  v_pago numeric(16,2); v_utilidad numeric(16,2);
  v_tipo text; v_fuente text; v_referencia text;
begin
  select * into a from public.addi_liquidaciones where venta_id=p_venta_id;
  if not found then raise exception 'Liquidación Addi no encontrada'; end if;
  select * into c from public.creditos where id=a.credito_id;
  select o.tipo,p.porcentaje into v_tipo,v_pct
    from public.origenes o join cobros_private.addi_politicas p
      on p.tipo_establecimiento=o.tipo and a.fecha_venta>=p.vigente_desde
    where o.codigo=a.tienda_codigo and o.activo;
  if v_pct is null then raise exception 'La tienda Addi no tiene política propia/aliado vigente'; end if;
  select r.credito_bruto,r.fuente,r.referencia_addi into v_base,v_fuente,v_referencia
    from cobros_private.addi_bases_reportadas r where r.venta_id=p_venta_id;
  v_base:=coalesce(v_base,c.valor_esperado_financiera);
  v_fuente:=coalesce(v_fuente,'credito_kora_sin_reporte_addi');
  if v_base is null or v_base<=0 or c.cuota_inicial is null or c.cuota_inicial<0 then
    raise exception 'Base o inicial Addi inválida';
  end if;
  v_fee:=round(v_base*0.075,2);
  v_iva:=round(v_fee*0.19,2);
  v_neto:=v_base-v_fee-v_iva;
  v_pagamos:=round(v_base*v_pct,2);
  v_pago:=v_pagamos-c.cuota_inicial;
  v_utilidad:=v_neto-v_pago;
  if v_pago<0 or v_utilidad<0 then raise exception 'Liquidación Addi negativa; revisión requerida'; end if;
  return jsonb_build_object(
    'credito_bruto',v_base,'credito_kora',c.valor_esperado_financiera,
    'diferencia_base',v_base-c.valor_esperado_financiera,
    'base_fuente',v_fuente,'referencia_addi',v_referencia,
    'tipo_establecimiento',v_tipo,'porcentaje_politica',v_pct,
    'inicial_tienda',c.cuota_inicial,'pagamos_tienda',v_pagamos,
    'pago_tienda',v_pago,'tarifa_addi',v_fee,'iva_tarifa',v_iva,
    'neto_estimado',v_neto,'utilidad_creditek',v_utilidad,
    'rentabilidad_pct',round(v_utilidad/v_base*100,2));
end $$;
revoke all on function cobros_private.addi_calculo(uuid) from public,anon,authenticated;

create or replace function cobros_private.addi_liquidaciones_listar()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not cobros_private.autorizado(false) then raise exception 'Acceso a Addi no autorizado'; end if;
  return coalesce((select jsonb_agg(to_jsonb(a)||cobros_private.addi_calculo(a.venta_id)
                                    order by a.fecha_venta desc,a.consecutivo desc)
                   from public.addi_liquidaciones a),'[]'::jsonb);
end $$;

create or replace function cobros_private.addi_liquidacion_revisar(p_venta_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.addi_liquidaciones%rowtype; calc jsonb;
begin
  if not cobros_private.autorizado(false) then raise exception 'Solo Auditoría o Gerencia pueden revisar Addi'; end if;
  calc:=cobros_private.addi_calculo(p_venta_id);
  update public.addi_liquidaciones set estado='revisada',
    revisada_por=auth.uid(),revisada_at=now(),updated_at=now()
  where venta_id=p_venta_id and estado='pendiente_revision' returning * into a;
  if not found then raise exception 'La venta no está pendiente de revisión'; end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'addi_liquidacion_revisada','addi_liquidaciones',a.id,
           jsonb_build_object('venta_id',a.venta_id,'calculo',calc));
  return to_jsonb(a)||calc;
end $$;
revoke all on function cobros_private.addi_liquidacion_revisar(uuid) from public,anon;
grant execute on function cobros_private.addi_liquidacion_revisar(uuid) to authenticated;

create or replace function cobros_private.addi_liquidacion_aprobar(p_venta_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a public.addi_liquidaciones%rowtype;
  calc jsonb; e_id uuid; v_tienda_nombre text;
begin
  if not cobros_private.autorizado(true) then raise exception 'Solo Gerencia puede aprobar Addi'; end if;
  select * into a from public.addi_liquidaciones where venta_id=p_venta_id for update;
  if not found or a.estado<>'revisada' then raise exception 'La venta Addi debe estar revisada antes de aprobarse'; end if;
  if exists(select 1 from public.ventas v where v.id=a.venta_id and v.anulada) then
    raise exception 'No se puede aprobar una venta anulada'; end if;
  calc:=cobros_private.addi_calculo(p_venta_id);
  select nullif(btrim(o.nombre),'') into v_tienda_nombre
    from public.origenes o where o.codigo=a.tienda_codigo;
  if v_tienda_nombre is null then raise exception 'La tienda no tiene nombre en el catálogo'; end if;
  insert into public.cobros_expected(
    plataforma,corte,fecha_esperada,concepto,importe,soporte,
    fuente_tipo,venta_id,credito_bruto,tarifa_addi,iva_tarifa,
    idempotency_key,created_by)
  values('addi',a.fecha_venta,a.fecha_esperada,
    'Venta Addi #'||a.consecutivo||' · '||v_tienda_nombre,
    (calc->>'neto_estimado')::numeric,
    'Venta KORA '||a.venta_id||coalesce(' · Crédito Addi '||(calc->>'referencia_addi'),''),
    'estimacion_venta',a.venta_id,(calc->>'credito_bruto')::numeric,
    (calc->>'tarifa_addi')::numeric,(calc->>'iva_tarifa')::numeric,
    gen_random_uuid(),auth.uid()) returning id into e_id;
  update public.addi_liquidaciones set estado='aprobada',
    credito_bruto=(calc->>'credito_bruto')::numeric,
    tarifa_addi=(calc->>'tarifa_addi')::numeric,
    iva_tarifa=(calc->>'iva_tarifa')::numeric,
    neto_estimado=(calc->>'neto_estimado')::numeric,
    aprobada_por=auth.uid(),aprobada_at=now(),cobro_expected_id=e_id,
    updated_at=now() where id=a.id returning * into a;
  perform cobros_private.evento('expected_creado',e_id,
    jsonb_build_object('origen','venta_addi','venta_id',a.venta_id,'calculo',calc));
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'addi_liquidacion_aprobada','addi_liquidaciones',a.id,
           jsonb_build_object('venta_id',a.venta_id,'cobro_expected_id',e_id,'calculo',calc));
  return to_jsonb(a)||calc;
end $$;
revoke all on function cobros_private.addi_liquidacion_aprobar(uuid) from public,anon;
grant execute on function cobros_private.addi_liquidacion_aprobar(uuid) to authenticated;

commit;
