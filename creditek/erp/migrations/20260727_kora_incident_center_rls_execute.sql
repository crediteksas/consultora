-- Corrección aditiva: permite que las políticas RLS invoquen su predicado.
begin;

revoke all on function public.kora_incident_can_view(public.kora_incidents)
  from public, anon;
grant execute on function public.kora_incident_can_view(public.kora_incidents)
  to authenticated;

commit;
