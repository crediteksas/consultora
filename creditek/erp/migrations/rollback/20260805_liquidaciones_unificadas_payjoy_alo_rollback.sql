-- Rollback no destructivo. Conserva liquidaciones, operaciones, cálculos y snapshots.
begin;
do $guard$
begin
  if exists(select 1 from public.liquidation_calculations c
    join public.liquidations l on l.id=c.liquidation_id
    join public.settlement_policy_versions p on p.id=c.policy_version_id
    where l.frozen_at is not null and p.vigente_desde=date '2026-08-05' and p.base_field='valor_comercial') then
    raise exception 'Rollback bloqueado: existen liquidaciones aprobadas bajo la política futura';
  end if;
end;
$guard$;
update public.settlement_policy_versions set estado='inactiva'
where vigente_desde=date '2026-08-05' and base_field='valor_comercial'
  and (plataforma,tipo_establecimiento) in (('payjoy','propia'),('alo','propia'),('payjoy','aliado'),('alo','aliado'));
update public.settlement_policy_versions set vigente_hasta=null
where estado='aprobada' and vigente_hasta=date '2026-08-04'
  and (plataforma,tipo_establecimiento) in (('payjoy','aliado'),('alo','aliado'));
-- Se conserva el bloqueo de solapamientos porque protege también las políticas históricas.
commit;
