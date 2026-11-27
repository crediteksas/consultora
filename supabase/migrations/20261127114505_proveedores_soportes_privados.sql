-- The private bucket must be provisioned through the Storage API before
-- deploying the application. Policies can safely exist before the bucket,
-- allowing clean database replays; without the bucket access fails closed.
-- Existing photos remain public. Legacy paths retain their exact names.
begin;
set local search_path = '';
do $guard$
begin
 if exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname like 'proveedores_soportes_%') then
  raise exception 'Existen políticas de proveedores que requieren revisión';
 end if;
end$guard$;
create policy proveedores_soportes_privados_select on storage.objects
 for select to authenticated using (bucket_id='proveedores-soportes-privados' and (select public.es_central()));
create policy proveedores_soportes_privados_insert on storage.objects
 for insert to authenticated with check (bucket_id='proveedores-soportes-privados' and (select public.es_central()) and name ~ '^(compras|pagos-proveedores|saldos-iniciales-proveedores)/');
-- Restrictive bounds remain effective even if a broad permissive policy is
-- introduced later. Anonymous clients have no access to this bucket.
create policy proveedores_soportes_privados_bound on storage.objects as restrictive
 for all to authenticated using (bucket_id<>'proveedores-soportes-privados' or (select public.es_central()))
 with check (bucket_id<>'proveedores-soportes-privados' or (select public.es_central()));
create policy proveedores_soportes_privados_anon on storage.objects as restrictive
 for all to anon using (bucket_id<>'proveedores-soportes-privados') with check (bucket_id<>'proveedores-soportes-privados');
-- Prevent stale app clients from putting confidential documents back in the
-- public photo bucket after cutover. Unrelated photo paths remain unchanged.
create policy proveedores_soportes_no_publicos on storage.objects as restrictive
 for insert to anon, authenticated with check (bucket_id<>'productos-fotos' or name !~ '^(compras|pagos-proveedores|saldos-iniciales-proveedores)/');
-- The public URL endpoint still bypasses RLS; these rules hide metadata and
-- prevent both overwrites and renames into confidential prefixes. The original
-- objects are removed only after private copies and live links are verified.
create policy proveedores_soportes_no_publicos_update on storage.objects as restrictive
 for update to anon, authenticated using (bucket_id<>'productos-fotos' or name !~ '^(compras|pagos-proveedores|saldos-iniciales-proveedores)/')
 with check (bucket_id<>'productos-fotos' or name !~ '^(compras|pagos-proveedores|saldos-iniciales-proveedores)/');
create policy proveedores_soportes_no_publicos_delete on storage.objects as restrictive
 for delete to anon, authenticated using (bucket_id<>'productos-fotos' or name !~ '^(compras|pagos-proveedores|saldos-iniciales-proveedores)/');
create policy proveedores_soportes_no_publicos_select on storage.objects as restrictive
 for select to anon, authenticated using (bucket_id<>'productos-fotos' or name !~ '^(compras|pagos-proveedores|saldos-iniciales-proveedores)/');
-- Existing supplier balances and payments already live in the private
-- soportes bucket. Its broad authenticated policies must not expose them.
create policy proveedores_soportes_central_select on storage.objects as restrictive
 for select to authenticated using (bucket_id<>'soportes' or name !~ '^proveedores/' or (select public.es_central()));
create policy proveedores_soportes_central_insert on storage.objects as restrictive
 for insert to authenticated with check (bucket_id<>'soportes' or name !~ '^proveedores/' or (select public.es_central()));
create policy proveedores_soportes_central_update on storage.objects as restrictive
 for update to authenticated using (bucket_id<>'soportes' or name !~ '^proveedores/' or (select public.es_central()))
 with check (bucket_id<>'soportes' or name !~ '^proveedores/' or (select public.es_central()));
create policy proveedores_soportes_central_delete on storage.objects as restrictive
 for delete to authenticated using (bucket_id<>'soportes' or name !~ '^proveedores/' or (select public.es_central()));
commit;
