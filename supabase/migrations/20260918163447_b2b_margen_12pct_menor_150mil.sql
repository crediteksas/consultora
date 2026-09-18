begin;
-- User-approved policy: supplier cost < 150000 => 12%; otherwise 20000.
-- Preserve authorisation, signatures and existing publication behaviour.
do $migration$
declare definition text; old_guard text := 'if v_precio-v_costo<>20000 and v_motivo is null then raise exception ''Indica el origen o motivo del margen diferente de $20.000''; end if;';
begin
 definition := pg_get_functiondef('public.publicar_lista_b2b(text,text,text,jsonb)'::regprocedure);
 if position(old_guard in definition)=0 then raise exception 'El publicador cambió: revisar la regla antes de migrar'; end if;
 definition := replace(definition,old_guard,$guard$if v_precio-v_costo<>(case when v_costo<150000 then round(v_costo*0.12,2) else 20000 end)
   and (v_motivo is null or v_motivo='Política retail: costo menor de $150.000 + 12%; desde $150.000 + $20.000')
   then raise exception 'Indica el origen o motivo del margen especial: menos de $150.000 son 12%% sobre el costo; desde $150.000 son $20.000'; end if;$guard$);
 execute definition;
end $migration$;

-- Recoverable backup, private and inaccessible to browser roles.
create table kora_private.b2b_margen_20260918_respaldo (
 borrador_id uuid primary key,
 filas_antes jsonb not null,
 filas_despues jsonb not null,
 guardado_at timestamptz not null default now()
);
alter table kora_private.b2b_margen_20260918_respaldo enable row level security;
revoke all on kora_private.b2b_margen_20260918_respaldo from public,anon,authenticated;

-- Lock drafts so a simultaneous publication cannot be rewritten afterwards.
lock table public.b2b_catalogo_borradores in share row exclusive mode;
insert into kora_private.b2b_margen_20260918_respaldo(borrador_id,filas_antes,filas_despues)
select d.id,d.filas,x.filas
from public.b2b_catalogo_borradores d
cross join lateral (
 select jsonb_agg(case when jsonb_typeof(f->'costo')='number'
  and (f->>'costo')::numeric>0 and (f->>'costo')::numeric<150000
  and jsonb_typeof(f->'precio_tienda')='number'
  and (f->>'precio_tienda')::numeric-(f->>'costo')::numeric=20000
  and nullif(btrim(f->>'motivo'),'') is null
 then jsonb_set(f,'{precio_tienda}',to_jsonb(round((f->>'costo')::numeric*1.12,2)))
 else f end order by ord) filas
 from jsonb_array_elements(d.filas) with ordinality t(f,ord)
) x
where d.lista_id is null and d.filas is distinct from x.filas;
update public.b2b_catalogo_borradores d set filas=b.filas_despues
from kora_private.b2b_margen_20260918_respaldo b
where d.id=b.borrador_id and d.lista_id is null and d.filas=b.filas_antes;
-- No change to published offers, costs, quantities, memory mappings or orders.
commit;
