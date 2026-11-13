begin;

alter table public.creditos drop constraint creditos_financiera_check;
alter table public.creditos add constraint creditos_financiera_check
  check (financiera in ('payjoy','krediya','alocredit','addi','ecredit'));

create schema ecredit_private;
revoke all on schema ecredit_private from public, anon, authenticated, service_role;

create table ecredit_private.ecredit_liquidaciones (
  venta_id uuid primary key references public.ventas(id),
  desembolso numeric(16,2) not null check (desembolso > 0),
  pagamos numeric(16,2) not null check (pagamos >= 0),
  utilidad numeric(16,2) not null,
  referencia text not null,
  confirmado_por uuid not null references public.perfiles(id),
  confirmado_at timestamptz not null default now(),
  check (desembolso = pagamos + utilidad)
);
alter table ecredit_private.ecredit_liquidaciones enable row level security;
revoke all on ecredit_private.ecredit_liquidaciones from public, anon, authenticated, service_role;

create function ecredit_private.ecredit_validar_credito()
returns trigger language plpgsql security definer set search_path='' as $$
declare total_venta numeric;
begin
  if tg_op <> 'INSERT' and old.financiera='ecredit' and exists (
    select 1 from ecredit_private.ecredit_liquidaciones where venta_id=old.venta_id
  ) then
    raise exception 'La venta eCredit ya fue liquidada';
  end if;
  if tg_op='DELETE' then return old; end if;
  if new.financiera='ecredit' then
    select v.total into total_venta from public.ventas v where v.id=new.venta_id;
    if new.cuota_inicial is null or new.cuota_inicial<0
      or new.valor_esperado_financiera is null or new.valor_esperado_financiera<=0
      or new.cuota_inicial+new.valor_esperado_financiera is distinct from total_venta
      or coalesce(new.medio_pago_complementario,'efectivo')<>'efectivo'
    then raise exception 'La inicial en efectivo y el saldo eCredit deben sumar el precio de venta'; end if;
  end if;
  return new;
end $$;
revoke all on function ecredit_private.ecredit_validar_credito() from public,anon,authenticated,service_role;
create trigger ecredit_validar_credito before insert or update of venta_id,financiera,cuota_inicial,valor_esperado_financiera,medio_pago_complementario or delete
  on public.creditos for each row execute function ecredit_private.ecredit_validar_credito();

create function ecredit_private.ecredit_proteger_venta()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (new.anulada is distinct from old.anulada or new.total is distinct from old.total)
    and exists (select 1 from ecredit_private.ecredit_liquidaciones where venta_id=old.id)
  then raise exception 'La venta eCredit ya fue liquidada'; end if;
  return new;
end $$;
revoke all on function ecredit_private.ecredit_proteger_venta() from public,anon,authenticated,service_role;
create trigger ecredit_proteger_venta before update of anulada,total on public.ventas
  for each row execute function ecredit_private.ecredit_proteger_venta();

create function ecredit_private.ecredit_listar()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare filas jsonb;
begin
  if not exists (select 1 from public.perfiles where id=auth.uid() and activo
    and (rol='gerencia' or (rol='auditoria' and id='d1782db6-bacc-4caf-af6f-ce1b8d1c0391'))) then
    raise exception 'Acceso a eCredit no autorizado';
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.fecha desc,r.consecutivo desc),'[]'::jsonb)
  into filas from (
    select v.id as venta_id,v.consecutivo,v.fecha,v.tienda_codigo,o.nombre as tienda,v.total,
      c.cuota_inicial,c.valor_esperado_financiera as saldo_financiado,
      l.desembolso,l.pagamos,l.utilidad,l.referencia,l.confirmado_at
    from public.creditos c join public.ventas v on v.id=c.venta_id
    left join public.origenes o on o.codigo=v.tienda_codigo
    left join ecredit_private.ecredit_liquidaciones l on l.venta_id=v.id
    where c.financiera='ecredit' and not v.anulada
  ) r;
  return filas;
end $$;

create function ecredit_private.ecredit_confirmar(p_venta_id uuid,p_desembolso numeric,p_pagamos numeric,p_utilidad numeric,p_referencia text)
returns void language plpgsql security definer set search_path='' as $$
declare anterior ecredit_private.ecredit_liquidaciones%rowtype;
begin
  if not exists (select 1 from public.perfiles where id=auth.uid() and activo
    and rol='auditoria' and id='d1782db6-bacc-4caf-af6f-ce1b8d1c0391') then
    raise exception 'Solo Mayte puede confirmar la liquidación eCredit';
  end if;
  if p_desembolso is null or not (p_desembolso>0 and p_desembolso<1000000000000)
    or p_pagamos is null or not (p_pagamos>=0 and p_pagamos<1000000000000)
    or p_utilidad is null or not (abs(p_utilidad)<1000000000000)
    or p_desembolso<>round(p_desembolso,2) or p_pagamos<>round(p_pagamos,2)
    or p_utilidad<>round(p_utilidad,2) or p_desembolso<>p_pagamos+p_utilidad
    or length(btrim(coalesce(p_referencia,''))) not between 1 and 120
  then raise exception 'El desembolso debe coincidir con Pagamos más utilidad. Ingresa la referencia del pago'; end if;
  perform 1 from public.ventas where id=p_venta_id and not anulada for update;
  if not found then raise exception 'La venta no está disponible'; end if;
  perform 1 from public.creditos where venta_id=p_venta_id and financiera='ecredit' for update;
  if not found then raise exception 'La venta no corresponde a eCredit'; end if;
  select * into anterior from ecredit_private.ecredit_liquidaciones where venta_id=p_venta_id;
  if found then
    if anterior.desembolso=p_desembolso and anterior.pagamos=p_pagamos
      and anterior.utilidad=p_utilidad and anterior.referencia=btrim(p_referencia) then return; end if;
    raise exception 'La venta eCredit ya tiene una liquidación confirmada';
  end if;
  insert into ecredit_private.ecredit_liquidaciones
    (venta_id,desembolso,pagamos,utilidad,referencia,confirmado_por)
  values(p_venta_id,p_desembolso,p_pagamos,p_utilidad,btrim(p_referencia),auth.uid());
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid()::text,'ecredit_liquidacion_confirmada','ecredit_liquidaciones',p_venta_id::text,
    jsonb_build_object('desembolso',p_desembolso,'pagamos',p_pagamos,'utilidad',p_utilidad));
end $$;

grant usage on schema ecredit_private to authenticated;
create function public.ecredit_listar() returns jsonb language sql stable set search_path=''
as $$ select ecredit_private.ecredit_listar() $$;
create function public.ecredit_confirmar(p_venta_id uuid,p_desembolso numeric,p_pagamos numeric,p_utilidad numeric,p_referencia text)
returns void language sql set search_path=''
as $$ select ecredit_private.ecredit_confirmar(p_venta_id,p_desembolso,p_pagamos,p_utilidad,p_referencia) $$;
revoke all on function ecredit_private.ecredit_listar(),public.ecredit_listar(),
  ecredit_private.ecredit_confirmar(uuid,numeric,numeric,numeric,text),
  public.ecredit_confirmar(uuid,numeric,numeric,numeric,text) from public,anon,authenticated,service_role;
grant execute on function ecredit_private.ecredit_listar(),public.ecredit_listar(),
  ecredit_private.ecredit_confirmar(uuid,numeric,numeric,numeric,text),
  public.ecredit_confirmar(uuid,numeric,numeric,numeric,text) to authenticated;
commit;
