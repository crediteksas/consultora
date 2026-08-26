begin;

with fixture as (
  select n,
    (array['payjoy','alo','addi','krediya'])[1+((n-1)%4)] as platform,
    (array[3,0,-3,-7,-20,-95,10,1,-1,-30,-61,0])[1+((n-1)%12)] as due_offset
  from generate_series(1,48) n
), inserted_customers as (
  insert into cartera.customers(external_id,name,phone,sandbox_data)
  select platform||':SIM-CUSTOMER-'||lpad(n::text,3,'0'),
         'Cliente Sandbox '||lpad(n::text,2,'0'),null,true
  from fixture
  on conflict(external_id) do update set name=excluded.name
  returning id,external_id
)
insert into cartera.obligations(customer_id,external_id,platform,store_id,status,balance,installment_amount,due_date,source_updated_at,sandbox_data)
select c.id,
       f.platform||':SIM-OBLIGATION-'||lpad(f.n::text,3,'0'),
       f.platform,'sandbox-store-'||lpad((1+((f.n-1)%10))::text,2,'0'),
       case when f.n%12=0 then 'PAID' else 'ACTIVE' end,
       case when f.n%12=0 then 0 else (180000+(f.n*17500))::numeric end,
       (60000+((f.n%5)*10000))::numeric,
       current_date+f.due_offset,now(),true
from fixture f
join inserted_customers c on c.external_id=f.platform||':SIM-CUSTOMER-'||lpad(f.n::text,3,'0')
on conflict(external_id) do update set
  status=excluded.status,
  balance=excluded.balance,
  installment_amount=excluded.installment_amount,
  due_date=excluded.due_date,
  source_updated_at=greatest(cartera.obligations.source_updated_at,excluded.source_updated_at);

insert into cartera.installments(obligation_id,external_id,due_date,amount,balance,status,sandbox_data)
select o.id,o.platform||':SIM-INSTALLMENT-'||lpad(row_number() over(order by o.external_id)::text,3,'0'),
       o.due_date,o.installment_amount,least(o.balance,o.installment_amount),
       case when o.balance=0 then 'PAID' when o.due_date<current_date then 'OVERDUE' else 'PENDING' end,true
from cartera.obligations o where o.external_id like '%:SIM-OBLIGATION-%'
on conflict(external_id) do update set
  due_date=excluded.due_date,amount=excluded.amount,balance=excluded.balance,status=excluded.status;

do $$
begin
  if (select count(*) from cartera.customers where sandbox_data) <> 48 then raise exception 'fixture customer count mismatch'; end if;
  if exists(select 1 from cartera.customers where phone is not null or not sandbox_data) then raise exception 'unsafe fixture'; end if;
end $$;

commit;
