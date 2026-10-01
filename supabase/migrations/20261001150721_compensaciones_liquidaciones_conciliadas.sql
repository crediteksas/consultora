-- Reconciliation does not revoke the existing authorization. Recognize that
-- terminal state only with its original approval and frozen calculation.
-- This migration changes no payment, compensation, ledger entry or balance.
do $$
declare definition text; old_guard text:= $old$and l.estado in ('aprobada','pagada','cerrada') and l.frozen_at is not null$old$;
 new_guard text:= $new$and l.estado in ('aprobada','pagada','cerrada','conciliada') and l.frozen_at is not null
      and (l.estado<>'conciliada' or (l.approved_at is not null and l.approved_by is not null))$new$;
begin
 definition:=pg_get_functiondef('compensaciones_private.aplicar(uuid[])'::regprocedure);
 if position(old_guard in definition)=0 then raise exception 'La validación de compensaciones cambió; revisar antes de aplicar'; end if;
 execute replace(definition,old_guard,new_guard);
end $$;
