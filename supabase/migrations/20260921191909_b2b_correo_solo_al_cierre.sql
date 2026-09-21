begin;
-- Correo únicamente al cerrar el período. Conservar pedidos, cierres e historial.
drop trigger if exists enqueue_b2b_pedido_mail on public.pedidos_b2b;
select cron.unschedule(jobid) from cron.job where jobname='kora-b2b-pedido-mail';
-- Bloquear también despachos en tránsito; no reutilizar pendientes antiguos
-- como avisos WhatsApp ni reintentarlos por correo.
create or replace function public.kora_claim_b2b_pedido_mail(p_id uuid,p_token uuid)
returns jsonb language sql security invoker set search_path='' as $$select null::jsonb$$;
revoke all on function public.kora_claim_b2b_pedido_mail(uuid,uuid) from public,anon,authenticated;
grant execute on function public.kora_claim_b2b_pedido_mail(uuid,uuid) to service_role;
comment on function public.kora_claim_b2b_pedido_mail(uuid,uuid) is 'Retirado: correo individual deshabilitado; usar cierre consolidado.';
commit;
