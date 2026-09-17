begin;
create table public.b2b_pedido_avisos (
 pedido_id uuid primary key references public.pedidos_b2b(id), estado text not null default 'pendiente',
 creado_at timestamptz not null default now(), enviado_at timestamptz, error text,
 check(estado in ('pendiente','enviando','enviado','error','incierto'))
);
alter table public.b2b_pedido_avisos enable row level security;
revoke all on public.b2b_pedido_avisos from public,anon,authenticated;
grant select on public.b2b_pedido_avisos to authenticated;
create policy avisos_lectura on public.b2b_pedido_avisos for select to authenticated using(exists(select 1 from public.perfiles p where p.id=(select auth.uid()) and p.activo and (p.rol in ('gerencia','auditoria') or (p.rol in ('admin_tienda','asesor') and exists(select 1 from public.pedidos_b2b o where o.id=pedido_id and o.tienda_codigo=p.tienda_codigo)))));
create table kora_private.b2b_pedido_mail_jobs (
 pedido_id uuid primary key references public.pedidos_b2b(id), token uuid not null default gen_random_uuid(),
 status text not null default 'pending', attempts integer not null default 0,
 due_at timestamptz not null default now(), claimed_at timestamptz,last_dispatch_at timestamptz,
 check(status in ('pending','sending','retry','sent','failed','ambiguous'))
);
alter table kora_private.b2b_pedido_mail_jobs enable row level security;
revoke all on kora_private.b2b_pedido_mail_jobs from public,anon,authenticated;
grant all on kora_private.b2b_pedido_mail_jobs,public.b2b_pedido_avisos to service_role;
create policy b2b_mail_service on kora_private.b2b_pedido_mail_jobs to service_role using(true) with check(true);
create function kora_private.enqueue_b2b_pedido_mail() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Only new catalog orders. No historical emails, no mail for drafts outside this flow.
 if new.solicitud_key is not null then
  insert into public.b2b_pedido_avisos(pedido_id) values(new.id) on conflict do nothing;
  insert into kora_private.b2b_pedido_mail_jobs(pedido_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function kora_private.enqueue_b2b_pedido_mail() from public,anon,authenticated;
create trigger enqueue_b2b_pedido_mail after insert on public.pedidos_b2b for each row execute function kora_private.enqueue_b2b_pedido_mail();

create function public.kora_claim_b2b_pedido_mail(p_id uuid,p_token uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_id uuid; result jsonb;
begin
 update kora_private.b2b_pedido_mail_jobs set status='sending',attempts=attempts+1,claimed_at=now()
 where pedido_id=p_id and token=p_token and status in('pending','retry') and due_at<=now() returning pedido_id into v_id;
 if v_id is null then return null;end if;
 update public.b2b_pedido_avisos set estado='enviando' where pedido_id=v_id;
 select jsonb_build_object('id',p.id,'numero','PED-'||lpad(p.consecutivo::text,6,'0'),'tienda',o.nombre,'ciudad',o.ciudad,'fecha',p.solicitado_at,'nota',p.nota,
 'items',(select jsonb_agg(jsonb_build_object('referencia',pr.nombre,'cantidad',i.cantidad_solicitada,'precio',i.precio_catalogo,'proveedor',v.nombre,'costo',f.costo) order by pr.nombre,i.id)
 from public.pedido_b2b_items i join public.productos pr on pr.id=i.producto_id
 join public.b2b_pedido_fuente s on s.pedido_item_id=i.id join public.b2b_ofertas f on f.id=s.oferta_id join public.proveedores v on v.id=f.proveedor_id where i.pedido_id=p.id)) into result
 from public.pedidos_b2b p join public.origenes o on o.codigo=p.tienda_codigo where p.id=v_id;
 return result;
end $$;
create function public.kora_finish_b2b_pedido_mail(p_id uuid,p_token uuid,p_outcome text,p_message_id text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare tries integer;
begin
 if p_outcome not in('sent','retry','ambiguous','failed') or (p_outcome='sent' and coalesce(p_message_id,'') !~ '^[a-zA-Z0-9_-]{1,200}$') then raise exception 'Invalid outcome';end if;
 select attempts into tries from kora_private.b2b_pedido_mail_jobs where pedido_id=p_id and token=p_token and status='sending' for update;
 if not found then return false;end if;
 if p_outcome='retry' and tries>=5 then p_outcome:='failed';end if;
 update kora_private.b2b_pedido_mail_jobs set status=p_outcome,token=gen_random_uuid(),due_at=now()+interval '5 minutes' where pedido_id=p_id;
 update public.b2b_pedido_avisos set estado=case p_outcome when 'sent' then 'enviado' when 'retry' then 'pendiente' when 'ambiguous' then 'incierto' else 'error' end,
 enviado_at=case when p_outcome='sent' then now() else null end,error=case when p_outcome='sent' then null else 'mail_'||p_outcome end where pedido_id=p_id;
 return true;
end $$;
revoke all on function public.kora_claim_b2b_pedido_mail(uuid,uuid),public.kora_finish_b2b_pedido_mail(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.kora_claim_b2b_pedido_mail(uuid,uuid),public.kora_finish_b2b_pedido_mail(uuid,uuid,text,text) to service_role;
create function kora_private.dispatch_b2b_pedido_mail() returns void language plpgsql security definer set search_path='' as $$
declare j record;
begin
 with expired as(update kora_private.b2b_pedido_mail_jobs set status='ambiguous' where status='sending' and claimed_at<now()-interval '10 minutes' returning pedido_id)
 update public.b2b_pedido_avisos set estado='incierto',error='mail_ambiguous' where pedido_id in(select pedido_id from expired);
 for j in select * from kora_private.b2b_pedido_mail_jobs where status in('pending','retry') and due_at<=now() and (last_dispatch_at is null or last_dispatch_at<now()-interval '2 minutes') order by due_at limit 10 for update skip locked loop
  perform net.http_post(url:='https://jfkmiyvcdfbsbwchyvol.supabase.co/functions/v1/b2b-pedido-mail',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('id',j.pedido_id,'token',j.token),timeout_milliseconds:=60000);
  update kora_private.b2b_pedido_mail_jobs set last_dispatch_at=now() where pedido_id=j.pedido_id;
 end loop;
end $$;
revoke all on function kora_private.dispatch_b2b_pedido_mail() from public,anon,authenticated;
select cron.schedule('kora-b2b-pedido-mail','* * * * *','select kora_private.dispatch_b2b_pedido_mail()');
commit;
