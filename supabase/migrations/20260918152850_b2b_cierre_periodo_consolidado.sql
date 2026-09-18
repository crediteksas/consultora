begin;

-- Un cierre agrupa solicitudes; NO cierra compras, remisiones, inventario ni cartera.
create table public.b2b_cierres (
 id uuid primary key default gen_random_uuid(),
 consecutivo bigint generated always as identity unique,
 creado_at timestamptz not null default now(), creado_por uuid not null references public.perfiles(id),
 solicitud_key uuid not null, huella text not null, reporte jsonb not null,
 correo_estado text not null default 'pendiente' check(correo_estado in ('pendiente','enviando','enviado','error','incierto')),
 correo_enviado_at timestamptz,
 unique(creado_por,solicitud_key)
);
create table public.b2b_cierre_pedidos (
 pedido_id uuid primary key references public.pedidos_b2b(id),
 cierre_id uuid not null references public.b2b_cierres(id)
);
create index b2b_cierre_pedidos_cierre on public.b2b_cierre_pedidos(cierre_id);
create index b2b_cierres_autor on public.b2b_cierres(creado_por);
alter table public.b2b_cierres enable row level security;
alter table public.b2b_cierre_pedidos enable row level security;
revoke all on public.b2b_cierres,public.b2b_cierre_pedidos from public,anon,authenticated;
grant select on public.b2b_cierres,public.b2b_cierre_pedidos to authenticated;
grant all on public.b2b_cierres,public.b2b_cierre_pedidos to service_role;
create policy cierres_admin on public.b2b_cierres for select to authenticated using(exists(select 1 from public.perfiles where id=(select auth.uid()) and activo and rol in('gerencia','auditoria')));
create policy cierre_pedidos_admin on public.b2b_cierre_pedidos for select to authenticated using(exists(select 1 from public.perfiles where id=(select auth.uid()) and activo and rol in('gerencia','auditoria')));

create table kora_private.b2b_cierre_mail_jobs (
 cierre_id uuid primary key references public.b2b_cierres(id), token uuid not null default gen_random_uuid(),
 status text not null default 'pending' check(status in('pending','sending','retry','sent','failed','ambiguous')),
 attempts integer not null default 0,due_at timestamptz not null default now(),claimed_at timestamptz,last_dispatch_at timestamptz
);
alter table kora_private.b2b_cierre_mail_jobs enable row level security;
revoke all on kora_private.b2b_cierre_mail_jobs from public,anon,authenticated;
grant all on kora_private.b2b_cierre_mail_jobs to service_role;
create policy cierre_mail_service on kora_private.b2b_cierre_mail_jobs to service_role using(true) with check(true);

create function public.vista_previa_cierre_b2b(p_pedidos uuid[] default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_items jsonb; v_ids jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in('gerencia','auditoria')) then raise exception 'Solo Administración puede consultar cierres';end if;
 select coalesce(jsonb_agg(p.id order by p.id),'[]'::jsonb) into v_ids from public.pedidos_b2b p
 where p.estado not in('borrador','cancelado') and (p_pedidos is null or p.id=any(p_pedidos))
 and not exists(select 1 from public.b2b_cierre_pedidos cp where cp.pedido_id=p.id);
 select coalesce(jsonb_agg(jsonb_build_object('pedido_id',p.id,'numero','PED-'||lpad(p.consecutivo::text,6,'0'),
 'fecha',p.solicitado_at,'estado',p.estado,'nota',p.nota,'tienda',o.nombre,'tienda_codigo',p.tienda_codigo,'ciudad',o.ciudad,
 'item_id',i.id,'producto_id',i.producto_id,'referencia',pr.nombre,'cantidad',i.cantidad_solicitada,
 'precio',i.precio_catalogo,'proveedor_id',f.proveedor_id,'proveedor',v.nombre,'costo',f.costo)
 order by p.id,i.id),'[]'::jsonb) into v_items
 from public.pedidos_b2b p join public.pedido_b2b_items i on i.pedido_id=p.id
 left join public.origenes o on o.codigo=p.tienda_codigo left join public.productos pr on pr.id=i.producto_id
 left join public.b2b_pedido_fuente s on s.pedido_item_id=i.id left join public.b2b_ofertas f on f.id=s.oferta_id left join public.proveedores v on v.id=f.proveedor_id
 where v_ids @> jsonb_build_array(p.id);
 return jsonb_build_object('pedido_ids',v_ids,'items',v_items,'huella',md5(v_items::text),'pedidos',jsonb_array_length(v_ids));
end $$;
revoke all on function public.vista_previa_cierre_b2b(uuid[]) from public,anon;
grant execute on function public.vista_previa_cierre_b2b(uuid[]) to authenticated;

create function kora_private.cerrar_periodo_pedidos_b2b(p_pedidos uuid[],p_huella text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.b2b_cierres%rowtype; preview jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in('gerencia','auditoria')) then raise exception 'Solo Administración puede cerrar períodos';end if;
 if p_key is null or p_huella is null then raise exception 'Falta la previsualización del cierre';end if;
 perform pg_advisory_xact_lock(726041701);
 select * into v from public.b2b_cierres where creado_por=auth.uid() and solicitud_key=p_key;
 if found then
  if v.huella<>p_huella then raise exception 'El identificador ya corresponde a otro cierre';end if;
  return jsonb_build_object('id',v.id,'numero','CIE-'||lpad(v.consecutivo::text,6,'0'),'repetido',true);
 end if;
 if p_pedidos is null or cardinality(p_pedidos) not between 1 and 1000 or array_position(p_pedidos,null) is not null
 or (select count(distinct x) from unnest(p_pedidos) x)<>cardinality(p_pedidos) then raise exception 'Selecciona entre 1 y 1000 pedidos distintos';end if;
 perform 1 from public.pedidos_b2b where id=any(p_pedidos) order by id for update;
 preview:=public.vista_previa_cierre_b2b(p_pedidos);
 if (preview->>'pedidos')::int<>cardinality(p_pedidos) or preview->>'huella'<>p_huella then raise exception 'Los pedidos cambiaron o ya fueron cerrados. Actualiza y revisa nuevamente';end if;
 if jsonb_array_length(preview->'items')=0 or exists(select 1 from jsonb_array_elements(preview->'items') i where i->>'costo' is null or i->>'proveedor_id' is null or i->>'referencia' is null or (i->>'costo')::numeric<=0 or (i->>'precio')::numeric<=0) then raise exception 'Hay pedidos sin proveedor o costo de origen. Completa sus datos antes del cierre';end if;
 if (select count(distinct i->>'pedido_id') from jsonb_array_elements(preview->'items') i)<>cardinality(p_pedidos) then raise exception 'Hay pedidos sin referencias';end if;
 insert into public.b2b_cierres(creado_por,solicitud_key,huella,reporte) values(auth.uid(),p_key,p_huella,preview) returning * into v;
 insert into public.b2b_cierre_pedidos(pedido_id,cierre_id) select x,v.id from unnest(p_pedidos) x;
 insert into kora_private.b2b_cierre_mail_jobs(cierre_id) values(v.id);
 return jsonb_build_object('id',v.id,'numero','CIE-'||lpad(v.consecutivo::text,6,'0'),'repetido',false);
end $$;
revoke all on function kora_private.cerrar_periodo_pedidos_b2b(uuid[],text,uuid) from public,anon;
grant execute on function kora_private.cerrar_periodo_pedidos_b2b(uuid[],text,uuid) to authenticated;
create function public.cerrar_periodo_pedidos_b2b(p_pedidos uuid[],p_huella text,p_key uuid) returns jsonb
language sql security invoker set search_path='' as $$ select kora_private.cerrar_periodo_pedidos_b2b(p_pedidos,p_huella,p_key); $$;
revoke all on function public.cerrar_periodo_pedidos_b2b(uuid[],text,uuid) from public,anon;
grant execute on function public.cerrar_periodo_pedidos_b2b(uuid[],text,uuid) to authenticated;

create function public.kora_claim_b2b_cierre_mail(p_id uuid,p_token uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_id uuid; result jsonb;
begin
 update kora_private.b2b_cierre_mail_jobs set status='sending',attempts=attempts+1,claimed_at=now()
 where cierre_id=p_id and token=p_token and status in('pending','retry') and due_at<=now() returning cierre_id into v_id;
 if v_id is null then return null;end if;
 update public.b2b_cierres set correo_estado='enviando' where id=v_id;
 select reporte||jsonb_build_object('tipo','cierre','id',id,'numero','CIE-'||lpad(consecutivo::text,6,'0'),'tienda','Consolidado de tiendas','fecha',creado_at) into result from public.b2b_cierres where id=v_id;
 return result;
end $$;
create function public.kora_finish_b2b_cierre_mail(p_id uuid,p_token uuid,p_outcome text,p_message_id text default null) returns boolean
language plpgsql security invoker set search_path='' as $$
declare tries integer;
begin
 if p_outcome is null or p_outcome not in('sent','retry','ambiguous','failed') or (p_outcome='sent' and coalesce(p_message_id,'') !~ '^[a-zA-Z0-9_-]{1,200}$') then raise exception 'Invalid outcome';end if;
 select attempts into tries from kora_private.b2b_cierre_mail_jobs where cierre_id=p_id and token=p_token and status='sending' for update;
 if not found then return false;end if;
 if p_outcome='retry' and tries>=5 then p_outcome:='failed';end if;
 update kora_private.b2b_cierre_mail_jobs set status=p_outcome,token=gen_random_uuid(),due_at=now()+interval '5 minutes' where cierre_id=p_id;
 update public.b2b_cierres set correo_estado=case p_outcome when 'sent' then 'enviado' when 'retry' then 'pendiente' when 'ambiguous' then 'incierto' else 'error' end,correo_enviado_at=case when p_outcome='sent' then now() else null end where id=p_id;
 return true;
end $$;
revoke all on function public.kora_claim_b2b_cierre_mail(uuid,uuid),public.kora_finish_b2b_cierre_mail(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.kora_claim_b2b_cierre_mail(uuid,uuid),public.kora_finish_b2b_cierre_mail(uuid,uuid,text,text) to service_role;
create function kora_private.dispatch_b2b_cierre_mail() returns void language plpgsql security definer set search_path='' as $$
declare j record;
begin
 with expired as(update kora_private.b2b_cierre_mail_jobs set status='ambiguous' where status='sending' and claimed_at<now()-interval '10 minutes' returning cierre_id)
 update public.b2b_cierres set correo_estado='incierto' where id in(select cierre_id from expired);
 for j in select * from kora_private.b2b_cierre_mail_jobs where status in('pending','retry') and due_at<=now() and (last_dispatch_at is null or last_dispatch_at<now()-interval '2 minutes') order by due_at limit 10 for update skip locked loop
  perform net.http_post(url:='https://jfkmiyvcdfbsbwchyvol.supabase.co/functions/v1/b2b-pedido-mail',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('kind','cierre','id',j.cierre_id,'token',j.token),timeout_milliseconds:=60000);
  update kora_private.b2b_cierre_mail_jobs set last_dispatch_at=now() where cierre_id=j.cierre_id;
 end loop;
end $$;
revoke all on function kora_private.dispatch_b2b_cierre_mail() from public,anon,authenticated;
select cron.schedule('kora-b2b-cierre-mail','* * * * *','select kora_private.dispatch_b2b_cierre_mail()');
commit;
