begin;

-- Identidad comercial de pedidos, independiente del SKU de inventario.
-- No se renombran productos, ni se reescriben ofertas, listas o movimientos.
create table public.b2b_referencias_catalogo (
 producto_id uuid primary key references public.productos(id),
 referencia_id uuid not null references public.productos(id),
 nombre_pedido text not null check (length(btrim(nombre_pedido)) between 1 and 300),
 creado_at timestamptz not null default now()
);
create index b2b_referencias_catalogo_referencia on public.b2b_referencias_catalogo(referencia_id);
alter table public.b2b_referencias_catalogo enable row level security;
revoke all on public.b2b_referencias_catalogo from public,anon,authenticated;
grant select on public.b2b_referencias_catalogo to authenticated,service_role;
create policy referencias_pedidos_lectura on public.b2b_referencias_catalogo
 for select to authenticated using (exists (
  select 1 from public.perfiles p where p.id=(select auth.uid()) and p.activo and
  (p.rol in ('gerencia','auditoria') or (p.rol in ('admin_tienda','asesor') and exists (
   select 1 from public.origenes o where o.codigo=p.tienda_codigo and o.activo and o.tipo='propia')))
 ));

-- Un único salto: cada grupo conserva su raíz y un único nombre comercial.
-- La validación diferida permite cargar un grupo completo atómicamente.
create function public.validar_referencias_catalogo_b2b() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if exists (select 1 from public.b2b_referencias_catalogo m
  left join public.b2b_referencias_catalogo r on r.producto_id=m.referencia_id
  where r.producto_id is null or r.referencia_id<>r.producto_id or r.nombre_pedido<>m.nombre_pedido)
 then raise exception 'La referencia B2B debe apuntar a una raíz con el mismo nombre, sin cadenas ni ciclos'; end if;
 return null;
end $$;
revoke all on function public.validar_referencias_catalogo_b2b() from public,anon,authenticated;
create constraint trigger validar_referencias_catalogo_b2b
 after insert or update or delete on public.b2b_referencias_catalogo
 deferrable initially deferred for each row execute function public.validar_referencias_catalogo_b2b();

create function public.nombre_referencia_pedido_b2b(p_producto_id uuid,p_nombre_original text)
returns text language sql stable security invoker set search_path='' as $$
 select coalesce((select m.nombre_pedido from public.b2b_referencias_catalogo m where m.producto_id=p_producto_id),p_nombre_original);
$$;
revoke all on function public.nombre_referencia_pedido_b2b(uuid,text) from public,anon;
grant execute on function public.nombre_referencia_pedido_b2b(uuid,text) to authenticated,service_role;

-- La versión sigue siendo la oferta original: costo, proveedor y trazabilidad
-- se conservan en b2b_pedido_fuente. Sólo producto_id es la referencia de pedido.
create or replace view public.b2b_mejor_oferta with(security_invoker=true) as
 select distinct on(coalesce(m.referencia_id,o.producto_id))
 o.id,o.lista_id,coalesce(m.referencia_id,o.producto_id) as producto_id,
 o.proveedor_id,o.costo,o.precio_tienda,o.motivo,o.vigente
 from public.b2b_ofertas o
 join public.productos p on p.id=o.producto_id and p.activo
 join public.proveedores pr on pr.id=o.proveedor_id and pr.activo
 left join public.b2b_referencias_catalogo m on m.producto_id=o.producto_id
 join public.productos canon on canon.id=coalesce(m.referencia_id,o.producto_id) and canon.activo
 where o.vigente
 order by coalesce(m.referencia_id,o.producto_id),o.costo,o.precio_tienda,o.proveedor_id,o.id;

create or replace function public.catalogo_pedidos_b2b()
returns table(id uuid,codigo text,nombre text,categoria text,foto_url text,precio_guia numeric,version_precio uuid)
language plpgsql security definer stable set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and
 (p.rol in ('gerencia','auditoria') or (p.rol in ('admin_tienda','asesor') and exists(select 1 from public.origenes o where o.codigo=p.tienda_codigo and o.activo and o.tipo='propia')))) then raise exception 'Acceso no autorizado al catálogo de pedidos'; end if;
 return query select p.id,p.codigo,
 public.nombre_referencia_pedido_b2b(p.id,p.nombre) || case when o.motivo like '[BAJO PEDIDO]%' then ' · Bajo pedido' else '' end,
 p.categoria,p.foto_url,o.precio_tienda,o.id
 from public.b2b_mejor_oferta o join public.productos p on p.id=o.producto_id
 order by public.nombre_referencia_pedido_b2b(p.id,p.nombre),p.id;
end $$;

-- Los nombres para avisos y NUEVOS cierres usan la misma identidad. El resto
-- de cada función (autorización, tokens, importes, destinatarios) no cambia.
do $$
declare v_signature text; v_old text; v_new text;
begin
 foreach v_signature in array array['public.kora_claim_b2b_pedido_mail(uuid,uuid)','public.vista_previa_cierre_b2b(uuid[])'] loop
  v_old:=pg_get_functiondef(v_signature::regprocedure);
  if strpos(v_old,'''referencia'',pr.nombre')=0 then raise exception 'La función % cambió; revisar antes de migrar',v_signature; end if;
  v_new:=replace(v_old,'''referencia'',pr.nombre','''referencia'',public.nombre_referencia_pedido_b2b(pr.id,pr.nombre)');
  execute v_new;
 end loop;
end $$;

-- Equivalencias revisadas contra las listas publicadas el 18/09/2026.
-- Resolver códigos de catálogo, nunca IDs generados en otro entorno.
create temporary table b2b_colores_semilla(codigo text primary key,canonical text,nombre_original text,nombre_pedido text) on commit drop;
insert into b2b_colores_semilla values
 ('BHR08OJGL','K26-1E0C63353C4B','Audifonos Redmi Buds 8 Lite Blue','Redmi Buds 8 Lite'),
 ('2GE3003','K26-1E0C63353C4B','AUDIFONOS REDMI BUDS 8 LITE WHITE','Redmi Buds 8 Lite'),
 ('K26-1E0C63353C4B','K26-1E0C63353C4B','XIAOMI REDMI BUDS 8 LITE','Redmi Buds 8 Lite'),
 ('BHR08GJGL','K26-D664E4E49C90','Audifonos REDMI Buds 8 Pro Cloud White','Redmi Buds 8 Pro'),
 ('BHR08GMGL','K26-D664E4E49C90','audifonos REDMI Buds 8 Pro Glacier Blue','Redmi Buds 8 Pro'),
 ('BHR08GOGL','K26-D664E4E49C90','Audifonos REDMI Buds 8 Pro Obsidian Black','Redmi Buds 8 Pro'),
 ('K26-D664E4E49C90','K26-D664E4E49C90','XIAOMI REDMI BUDS 8 PRO','Redmi Buds 8 Pro'),
 ('BHR09GTGL','K26-731FA4078FC6','Audifonos Xiaomi Buds 6 Nebula Purple','Xiaomi Buds 6'),
 ('BHR08OGGL','K26-731FA4078FC6','Audifonos Xiaomi Buds 6 Pearl White','Xiaomi Buds 6'),
 ('BHR08OHGL','K26-731FA4078FC6','Audifonos Xiaomi Buds 6 Titan Gray','Xiaomi Buds 6'),
 ('K26-731FA4078FC6','K26-731FA4078FC6','XIAOMI BUDS 6','Xiaomi Buds 6'),
 ('BHR8930GL','BHR8930GL','Audifonos Xiaomi Type-C Earphones Black','Xiaomi Type-C Earphones'),
 ('BHR8931GL','BHR8930GL','Audifonos Xiaomi Type-C Earphones White','Xiaomi Type-C Earphones'),
 ('BHR08W6GL','K26-0817FCC59C92','DIADEMA REDMI Headphones Neo Mist Blue','Redmi Headphones Neo'),
 ('BHR08W5GL','K26-0817FCC59C92','DIADEMA REDMI Headphones Neo Obsidian Black','Redmi Headphones Neo'),
 ('BHR08W2GL','K26-0817FCC59C92','DIADEMA REDMI Headphones Neo Sand White','Redmi Headphones Neo'),
 ('K26-0817FCC59C92','K26-0817FCC59C92','XIAOMI REDMI HEADPHONES NEO','Redmi Headphones Neo'),
 ('K26-9A216E403B7F','K26-9A216E403B7F','JBL Boombox 4','JBL Boombox 4'),
 ('K26-796CEAB7DA35','K26-9A216E403B7F','JBL Boombox 4 Camuflado','JBL Boombox 4'),
 ('K26-5CCF39569FBB','K26-9A216E403B7F','JBL Boombox 4 Negro','JBL Boombox 4'),
 ('BHR08UFGL','K26-DC47A4F8E931','REDMI Buds 8 Black','Redmi Buds 8'),
 ('BHR08UJGL','K26-DC47A4F8E931','REDMI Buds 8 Green','Redmi Buds 8'),
 ('BHR08UHGL','K26-DC47A4F8E931','REDMI Buds 8 White','Redmi Buds 8'),
 ('K26-DC47A4F8E931','K26-DC47A4F8E931','XIAOMI REDMI BUDS 8','Redmi Buds 8'),
 ('BHR09CXGL','K26-7BA0CC3726E5','REDMI Watch 6 Active Matte Silver','Redmi Watch 6 Active'),
 ('K26-7BA0CC3726E5','K26-7BA0CC3726E5','XIAOMI REDMI WATCH 6 ACTIVE','Redmi Watch 6 Active'),
 ('K26-9DCAE66151E9','K26-9DCAE66151E9','REDMI Watch 6 Lite','Redmi Watch 6 Lite'),
 ('BHR09CWGL','K26-9DCAE66151E9','REDMI Watch 6 Lite Black','Redmi Watch 6 Lite'),
 ('BHR09CVGL','K26-9DCAE66151E9','REDMI Watch 6 Lite Steel Gray','Redmi Watch 6 Lite'),
 ('BHR08CWGL','BHR08CWGL','RELOJ REDMI Watch 6 Glacier Blue','Redmi Watch 6'),
 ('BHR08CUGL','BHR08CWGL','Reloj REDMI Watch 6 Silver Gray','Redmi Watch 6'),
 ('BHR07WRGL','K26-B7F938B78B93','Reloj Xiaomi Watch 5 Black Strap','Xiaomi Watch 5'),
 ('K26-B7F938B78B93','K26-B7F938B78B93','XIAOMI WATCH 5','Xiaomi Watch 5'),
 ('K26-4629CE8A9C29','K26-4629CE8A9C29','XIAOMI SMART BAND 10','Xiaomi Smart Band 10'),
 ('BHR07PYGL','K26-4629CE8A9C29','Xiaomi Smart Band 10 Midnight Black','Xiaomi Smart Band 10'),
 ('K26-D060FDB7D52F','K26-D060FDB7D52F','XIAOMI SMART BAND 10 PRO','Xiaomi Smart Band 10 Pro'),
 ('BHR08WBGL','K26-D060FDB7D52F','Xiaomi Smart Band 10 Pro Glacier Silver','Xiaomi Smart Band 10 Pro'),
 ('BHR08WGGL','K26-D060FDB7D52F','Xiaomi Smart Band 10 Pro Lavender pink','Xiaomi Smart Band 10 Pro'),
 ('BHR08W9GL','K26-D060FDB7D52F','Xiaomi Smart Band 10 Pro Midnight Black','Xiaomi Smart Band 10 Pro'),
 ('K26-A48F572E7E8D','K26-A48F572E7E8D','XIAOMI ULTRATHIN MAGNETIC POWER BANK 5000 15W','Xiaomi UltraThin Magnetic Power Bank 5000 15W'),
 ('BHR08Z2GL','K26-A48F572E7E8D','Xiaomi UltraThin Magnetic Power Bank 5000 15W Glacier Silver','Xiaomi UltraThin Magnetic Power Bank 5000 15W'),
 ('BHR0913GL','K26-A48F572E7E8D','Xiaomi UltraThin Magnetic Power Bank 5000 15W Graphite Black','Xiaomi UltraThin Magnetic Power Bank 5000 15W'),
 ('BHR8143US','BHR8143US','Aspiradora Xiaomi Robot Vacuum E5 (White) US','Aspiradora Xiaomi Robot Vacuum E5 US'),
 ('BHR08ITGL','BHR08ITGL','Reloj Xiaomi Watch S5 46mm Ceramic Blue','Xiaomi Watch S5 46mm · bisel cerámico y correa de cuero'),
 ('BHR08IXGL','BHR08IXGL','RELOJ Xiaomi Watch S5 46mm Jungle Green','Xiaomi Watch S5 46mm · bisel de carbono y correas de fluoroelastómero y nylon'),
 ('BHR08ISGL','BHR08ISGL','Reloj Xiaomi Watch S5 46mm Silver','Xiaomi Watch S5 46mm · edición estándar'),
 ('K26-D70952A1ACDF','K26-D70952A1ACDF','TCL Barra de Sonido Q65H Negro','TCL Barra de Sonido Q65H'),
 ('K26-EDC818D585FC','K26-EDC818D585FC','TCL Barra de Sonido S45H Negro','TCL Barra de Sonido S45H'),
 ('K26-4EF5D994A793','K26-4EF5D994A793','TCL Barra de Sonido S55H Negro','TCL Barra de Sonido S55H'),
 ('K26-812EB67674F5','K26-812EB67674F5','TCL Parlante TP200K 220W Negro','TCL Parlante TP200K 220W'),
 ('K26-456A96497FBA','K26-456A96497FBA','TCL Parlante TP300K 340W Negro','TCL Parlante TP300K 340W'),
 ('BHR084CUS','BHR084CUS','Xiaomi Air Fryer 6.5L Black US','Xiaomi Air Fryer 6.5L US'),
 ('BHR07Y5GL','BHR07Y5GL','Xiaomi Smart Band 10 Ceramic Edition Pearl White','Xiaomi Smart Band 10 Ceramic Edition'),
 ('BHR07VRGL','BHR07VRGL','Xiaomi Watch S4 41mm Fluororubber Strap(Black)','Xiaomi Watch S4 41mm · correa de fluoroelastómero'),
 ('BHR07VUGL','BHR07VUGL','Xiaomi Watch S4 41mm Leather Strap(White)','Xiaomi Watch S4 41mm · correa de cuero'),
 ('K26-C5B581051999','K26-C5B581051999','XIAOMI WATCH S4 41MM SUNSET GOLD MILANESE','Xiaomi Watch S4 41mm · correa Milanese');
do $$ begin
 if exists(select 1 from b2b_colores_semilla s where
  (select count(*) from public.productos p where p.codigo=s.codigo and p.nombre=s.nombre_original and p.activo)<>1
  or (select count(*) from public.productos p where p.codigo=s.canonical and p.activo)<>1)
 then raise exception 'Las referencias de origen cambiaron o faltan: revisar equivalencias antes de agrupar'; end if;
end $$;
insert into public.b2b_referencias_catalogo(producto_id,referencia_id,nombre_pedido)
select p.id,c.id,s.nombre_pedido from b2b_colores_semilla s
join public.productos p on p.codigo=s.codigo join public.productos c on c.codigo=s.canonical;

commit;
