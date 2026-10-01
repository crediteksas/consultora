-- Resolve new expense snapshots from the existing identity directory. Concepts
-- (payroll, bonus, etc.) never create a separate beneficiary. Paid rows are untouched.
create function kora_private.financial_existing_destination(p_document text,p_destination text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare person_id uuid; result jsonb; requested_number text;
begin
  if btrim(coalesce(p_document,'')) !~ '^[0-9.-]{5,20}$' then return null; end if;
  -- Never guess between two identities or between multiple bank accounts.
  if (select count(*) from public.liquidation_beneficiaries b where b.activo
    and regexp_replace(b.identificacion,'[^0-9]','','g')=regexp_replace(p_document,'[^0-9]','','g'))<>1
    then return null; end if;
  select b.id into person_id from public.liquidation_beneficiaries b where b.activo
    and regexp_replace(b.identificacion,'[^0-9]','','g')=regexp_replace(p_document,'[^0-9]','','g');
  if btrim(coalesce(p_destination,'')) ~ '^[0-9]{6,20}$' then requested_number:=btrim(p_destination);
  elsif cardinality(string_to_array(coalesce(p_destination,''),' · '))=3 then
    requested_number:=btrim(split_part(p_destination,' · ',3));
  elsif nullif(btrim(p_destination),'') is not null then return null;
  end if;
  select case when count(*)=1 then (jsonb_agg(jsonb_build_object(
    'beneficiary_id',b.id,'account_id',a.id,'name',b.nombre,'document',b.identificacion,
    'destination',btrim(a.banco)||' · '||case lower(btrim(a.tipo_cuenta))
      when 'ahorros' then 'Ahorros' when 'corriente' then 'Corriente'
      when 'billetera digital' then 'Billetera digital' end||' · '||a.numero_cuenta)))->0 end
    into result from public.liquidation_beneficiaries b
    join public.beneficiary_bank_accounts a on a.beneficiary_id=b.id
    where b.id=person_id and a.activo and a.validada
      and length(btrim(a.banco))>=2 and position('·' in a.banco)=0
      and lower(btrim(a.tipo_cuenta)) in ('ahorros','corriente','billetera digital')
      and a.numero_cuenta ~ '^[0-9]{6,20}$'
      and (requested_number is null or a.numero_cuenta=requested_number);
  return result;
end $$;
revoke all on function kora_private.financial_existing_destination(text,text) from public,anon,authenticated;

create function kora_private.financial_entry_reuse_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare person jsonb; source_document text; source_destination text;
begin
  -- A complete explicitly selected destination is preserved, including a
  -- different account chosen for this payment. No historical row is updated.
  if nullif(btrim(new.beneficiary_document),'') is not null
    and cardinality(string_to_array(coalesce(new.destination_account,''),' · '))=3
    and btrim(split_part(new.destination_account,' · ',1))<>''
    and btrim(split_part(new.destination_account,' · ',2)) in ('Ahorros','Corriente','Billetera digital')
    and btrim(split_part(new.destination_account,' · ',3)) ~ '^[0-9]{6,20}$' then return new; end if;
  source_document:=new.beneficiary_document;source_destination:=new.destination_account;
  -- A linked recurring template supplies identity even if its old snapshot
  -- predates identification capture. Never match beneficiaries by name alone.
  if new.template_id is not null and nullif(btrim(source_document),'') is null then
    select b.identificacion into source_document from public.financial_recurring_templates t
      join public.liquidation_beneficiaries b on b.id=t.beneficiary_id and b.activo
      where t.id=new.template_id;
  end if;
  person:=kora_private.financial_existing_destination(source_document,source_destination);
  if person is not null then
    new.beneficiary:=person->>'name';new.beneficiary_document:=person->>'document';
    new.destination_account:=person->>'destination';
  end if;
  return new;
end $$;
revoke all on function kora_private.financial_entry_reuse_identity() from public,anon,authenticated;
create trigger financial_entry_reuse_identity before insert on public.financial_entries
  for each row execute function kora_private.financial_entry_reuse_identity();

-- Keep the recurring source up to date with the data already prepared and
-- applied to its unpaid occurrence. Only replace the exact original snapshot;
-- a subsequent manual change to the obligation is never overwritten.
with prepared as (
  select distinct on(e.template_id) e.template_id,c.proposed_document,c.proposed_account,
    c.original_document,c.original_account,c.original_beneficiary
  from public.payment_destination_corrections c
  join public.financial_entries e on e.id=c.item_id and c.item_kind='financial_entry'
  where c.status='confirmado' and e.template_id is not null
    and e.status='aprobado' and e.paid_at is null and e.paid_by is null
    and e.beneficiary_document=c.proposed_document and e.destination_account=c.proposed_account
  order by e.template_id,c.prepared_at desc
)
update public.financial_recurring_templates t
  set beneficiary_document=p.proposed_document,destination_account=p.proposed_account
  from prepared p where t.id=p.template_id
    and t.beneficiary is not distinct from p.original_beneficiary
    and t.beneficiary_document is not distinct from p.original_document
    and t.destination_account is not distinct from p.original_account;
