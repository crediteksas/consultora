begin;
with numbered as (
  select id,(substring(external_id from '([0-9]+)$'))::int-1 as i from cartera.obligations where external_id like '%:SIM-OBLIGATION-%'
)
update cartera.obligations o set
  balance=case when n.i%12=11 or n.i=39 then 0 else 200000+n.i*1000 end,
  installment_amount=200000,
  status=case when n.i%12=11 then 'PAID' else 'ACTIVE' end,
  updated_at=now()
from numbered n where o.id=n.id;

update cartera.installments i set amount=o.installment_amount,balance=least(o.balance,o.installment_amount),
status=case when o.balance=0 then 'PAID' when o.due_date<current_date then 'OVERDUE' else 'PENDING' end,updated_at=now()
from cartera.obligations o where i.obligation_id=o.id;

do $$ begin
  if (select sum(balance) from cartera.obligations where sandbox_data) <> 9573000 then raise exception 'fixture total mismatch'; end if;
end $$;
commit;
