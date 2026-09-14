-- Oscar confirmó: costo del Excel inicial = costo de tienda; no utilidad B2B.
-- No se crean compras, cartera, remisiones ni márgenes.
lock table public.movimientos, public.stock_cantidad, public.unidades, public.venta_items in share row exclusive mode;
create table kora_private.respaldo_costos_iniciales_20260914 (
 tabla text not null, anterior jsonb not null, creado_at timestamptz default now(),
 motivo text default 'Corrección autorizada por Oscar: costo inicial de tienda, sin utilidad B2B'
);
alter table kora_private.respaldo_costos_iniciales_20260914 enable row level security;
revoke all on kora_private.respaldo_costos_iniciales_20260914 from public,anon,authenticated;

-- Solo grupos cuyo único origen es carga inicial; nunca copiar costo proveedor.
create temporary table costos_iniciales on commit drop as
select m.tienda_codigo,m.producto_id,sum(m.costo*m.cantidad)/nullif(sum(m.cantidad),0) costo
from public.movimientos m
where m.tipo='carga_inicial' and m.unidad_id is null and m.tienda_codigo<>'CENTRAL'
and not exists(select 1 from public.movimientos x where x.tienda_codigo=m.tienda_codigo
 and x.producto_id=m.producto_id and x.tipo not in ('carga_inicial','venta'))
group by m.tienda_codigo,m.producto_id
having count(*) filter(where m.costo is null or m.costo<0)=0 and min(m.costo)=max(m.costo);
insert into kora_private.respaldo_costos_iniciales_20260914(tabla,anterior)
select 'stock_cantidad',to_jsonb(s) from public.stock_cantidad s join costos_iniciales c using(tienda_codigo,producto_id)
where s.precio_tienda is distinct from c.costo;
update public.stock_cantidad s set precio_tienda=c.costo
from costos_iniciales c where s.tienda_codigo=c.tienda_codigo and s.producto_id=c.producto_id
and s.precio_tienda is distinct from c.costo;

create temporary table unidades_iniciales on commit drop as
select u.id,min(m.costo) costo from public.unidades u join public.movimientos m
on m.unidad_id=u.id and m.tipo='carga_inicial' and m.tienda_codigo=u.tienda_actual
where m.costo>=0 and not exists(select 1 from public.movimientos x where x.unidad_id=u.id and x.tipo not in ('carga_inicial','venta'))
group by u.id having min(m.costo)=max(m.costo);
insert into kora_private.respaldo_costos_iniciales_20260914(tabla,anterior)
select 'unidades',to_jsonb(u) from public.unidades u join unidades_iniciales c on c.id=u.id
where u.precio_tienda is distinct from c.costo;
update public.unidades u set precio_tienda=c.costo from unidades_iniciales c
where u.id=c.id and u.precio_tienda is distinct from c.costo;


-- Corregir la proyección de costo Retail histórico sin tocar ventas ni cobros.
create temporary table ventas_iniciales on commit drop as
select vi.id,coalesce(ui.costo,c.costo) costo from public.venta_items vi
join public.ventas v on v.id=vi.venta_id
left join unidades_iniciales ui on ui.id=vi.unidad_id
left join costos_iniciales c on vi.unidad_id is null and c.producto_id=vi.producto_id and c.tienda_codigo=v.tienda_codigo
where coalesce(ui.costo,c.costo) is not null
and not exists(select 1 from public.periodos p where p.tienda_codigo=v.tienda_codigo and v.fecha::date between p.fecha_inicio and p.fecha_fin);
insert into kora_private.respaldo_costos_iniciales_20260914(tabla,anterior)
select 'venta_items',to_jsonb(vi) from public.venta_items vi join ventas_iniciales c on c.id=vi.id
where vi.costo_tienda_congelado is distinct from c.costo;
select set_config('app.ajuste_venta_autorizado','1',true);
update public.venta_items vi set costo_tienda_congelado=c.costo,estado_costo_tienda='trazable'
from ventas_iniciales c where c.id=vi.id and vi.costo_tienda_congelado is distinct from c.costo;
select set_config('app.ajuste_venta_autorizado','',true);

-- Lectura acotada: costo del archivo inicial confirmado, nunca costo proveedor.
create function kora_private.costo_archivo_inicial(p_id bigint)
returns numeric language sql stable security definer set search_path='' as $$
 select m.costo from public.movimientos m where m.id=p_id and m.tipo='carga_inicial'
 and exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo
 and (p.rol in ('gerencia','auditoria') or p.tienda_codigo=m.tienda_codigo))
$$;
revoke all on function kora_private.costo_archivo_inicial(bigint) from public,anon;
grant execute on function kora_private.costo_archivo_inicial(bigint) to authenticated;
create or replace view public.movimientos_tienda_lectura with(security_invoker=true) as
select m.id,m.tipo,m.tienda_codigo,m.producto_id,m.unidad_id,m.cantidad,
case when m.tipo='carga_inicial' then kora_private.costo_archivo_inicial(m.id)
 when m.tipo='venta' then (select sum(vi.costo_tienda_congelado*vi.cantidad)/nullif(sum(vi.cantidad),0)
 from public.venta_items vi where vi.venta_id::text=m.referencia_id and vi.producto_id=m.producto_id
 and vi.unidad_id is not distinct from m.unidad_id and vi.estado_costo_tienda='trazable')
 else coalesce(m.costo_tienda,case when m.tipo in ('remision_entrada','traslado_entrada','traslado_salida') then m.precio end)
 end as costo,
m.precio,m.referencia_tipo,m.referencia_id,m.reverso_de,m.usuario,m.nota,m.created_at
from public.movimientos m;

-- Las cargas iniciales no usan precio de venta como costo, tampoco en ajustes.
create or replace function kora_private.costo_inicial_movimiento()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.tipo='carga_inicial' then new.costo_tienda:=new.costo; end if;
 return new;
end $$;
revoke all on function kora_private.costo_inicial_movimiento() from public,anon,authenticated;
create trigger zz_costo_inicial_movimiento before insert on public.movimientos
for each row execute function kora_private.costo_inicial_movimiento();
