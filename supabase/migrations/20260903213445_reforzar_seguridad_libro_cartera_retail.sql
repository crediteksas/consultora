alter view public.v_saldos_cartera set (security_invoker = true);

grant select on public.cartera_retail_retiros_auditoria to authenticated;
create policy cartera_retail_retiros_solo_central
on public.cartera_retail_retiros_auditoria
for select to authenticated
using ((select public.es_central()));

revoke all on function public.enrutar_movimiento_cartera_retail() from public, anon, authenticated;
revoke all on function public.proteger_libro_cartera_retail() from public, anon, authenticated;
