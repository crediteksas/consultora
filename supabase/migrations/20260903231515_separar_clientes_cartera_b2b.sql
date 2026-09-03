-- Separa los clientes comerciales B2B del maestro de tiendas Retail.
alter table public.origenes drop constraint if exists origenes_tipo_check;
alter table public.origenes add constraint origenes_tipo_check
  check (tipo = any (array['propia'::text,'aliado'::text,'central'::text,'cliente_b2b'::text]));

alter table public.cuentas_cartera drop constraint if exists cuentas_cartera_check;
alter table public.cuentas_cartera drop constraint if exists cuentas_cartera_tipo_cuenta_check;
alter table public.cuentas_cartera add constraint cuentas_cartera_tipo_cuenta_check
  check (tipo_cuenta = any (array['tienda'::text,'proveedor'::text,'caja'::text,'cliente_b2b'::text]));
alter table public.cuentas_cartera add constraint cuentas_cartera_check
  check (
    ((tipo_cuenta = any(array['tienda'::text,'caja'::text,'cliente_b2b'::text])) and tienda_codigo is not null and proveedor_id is null)
    or (tipo_cuenta='proveedor' and tienda_codigo is null and proveedor_id is not null)
  );

update public.origenes set tipo='cliente_b2b'
where codigo in ('CK-12','CK-13','CK-14') and nombre in ('Oscar','Luis','Meico');

update public.cuentas_cartera
set tipo_cuenta='cliente_b2b', nombre='Cartera B2B · ' || (select nombre from public.origenes where codigo=tienda_codigo), updated_at=now()
where tienda_codigo in ('CK-12','CK-13','CK-14') and tipo_cuenta='tienda';

update public.cuentas_cartera set activo=false, updated_at=now()
where tienda_codigo in ('CK-12','CK-13','CK-14') and tipo_cuenta='caja';

insert into public.cuentas_cartera(tipo_cuenta,tienda_codigo,nombre,activo)
select 'cliente_b2b',o.codigo,'Cartera B2B · '||o.nombre,true
from public.origenes o
where o.codigo in ('CK-12','CK-13','CK-14')
and not exists(select 1 from public.cuentas_cartera c where c.tienda_codigo=o.codigo and c.tipo_cuenta='cliente_b2b');

create or replace view public.v_cartera_clientes_b2b
with (security_invoker=true) as
select o.codigo cliente_codigo,o.nombre cliente,o.ciudad,c.id cuenta_id,
       count(m.id)::integer movimientos,
       coalesce(sum(case when m.efecto='debito' then m.monto else -m.monto end),0)::numeric saldo,
       max(m.created_at) ultimo_movimiento_at
from public.origenes o
join public.cuentas_cartera c on c.tienda_codigo=o.codigo and c.tipo_cuenta='cliente_b2b' and c.activo
left join public.movimientos_cartera m on m.cuenta_id=c.id
where o.tipo='cliente_b2b' and o.activo
group by o.codigo,o.nombre,o.ciudad,c.id;

grant select on public.v_cartera_clientes_b2b to authenticated;

create or replace function public.registrar_movimiento_cliente_b2b(
  p_cliente_codigo text,p_fecha date,p_efecto text,p_monto numeric,p_concepto text,
  p_soporte_path text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_perfil public.perfiles%rowtype; v_cuenta uuid; v_id uuid;
begin
  select * into v_perfil from public.perfiles where id=auth.uid() and activo;
  if v_perfil.id is null or v_perfil.rol not in ('gerencia','auditoria') then raise exception 'Solo Gestión o Gerencia puede registrar movimientos B2B'; end if;
  if p_efecto not in ('debito','credito') or coalesce(p_monto,0)<=0 then raise exception 'Movimiento B2B inválido'; end if;
  if nullif(btrim(coalesce(p_concepto,'')),'') is null or nullif(btrim(coalesce(p_soporte_path,'')),'') is null then raise exception 'Concepto y soporte son obligatorios'; end if;
  select c.id into v_cuenta from public.cuentas_cartera c join public.origenes o on o.codigo=c.tienda_codigo
   where o.codigo=p_cliente_codigo and o.tipo='cliente_b2b' and c.tipo_cuenta='cliente_b2b' and c.activo;
  if v_cuenta is null then raise exception 'Cliente B2B sin libro activo'; end if;
  insert into public.movimientos_cartera(cuenta_id,tienda_codigo,efecto,monto,concepto,referencia_tipo,referencia_id,fecha_efectiva,metadatos,creado_por)
  values(v_cuenta,p_cliente_codigo,p_efecto,p_monto,btrim(p_concepto),'movimiento_cliente_b2b',p_request_id::text,p_fecha,
    jsonb_build_object('soporte_path',p_soporte_path,'unidad_negocio','b2b','registrado_por',v_perfil.nombre),auth.uid()) returning id into v_id;
  return jsonb_build_object('ok',true,'movimiento_id',v_id,'cuenta_id',v_cuenta);
end; $$;

revoke all on function public.registrar_movimiento_cliente_b2b(text,date,text,numeric,text,text,uuid) from public,anon;
grant execute on function public.registrar_movimiento_cliente_b2b(text,date,text,numeric,text,text,uuid) to authenticated;
