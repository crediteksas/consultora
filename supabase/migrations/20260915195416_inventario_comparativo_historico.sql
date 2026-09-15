-- Comparativos asistidos de archivos anteriores: evidencia sin afectar existencias.
begin;
alter table inventario_control.cortes add column revision_fuente jsonb
 check(revision_fuente is null or jsonb_typeof(revision_fuente)='object');
create unique index cortes_fuente_historica_unica on inventario_control.cortes(tienda_codigo,archivo_sha256)
 where revision_fuente is not null;
create function inventario_control.proteger_comparativo() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.revision_fuente->>'solo_comparativo'='true' and new.estado in ('aplicado','sin_diferencias') then
   raise exception 'Comparativo histórico pendiente de validar referencias y base documental. No se aplicó ningún ajuste';
 end if;
 return new;
end $$;
revoke all on function inventario_control.proteger_comparativo() from public,anon,authenticated;
create trigger proteger_comparativo before update on inventario_control.cortes
 for each row execute function inventario_control.proteger_comparativo();
comment on column inventario_control.cortes.revision_fuente is 'Fechas originales, fecha confirmada por usuario, archivos SHA256 y filas pendientes. Solo comparativo: impide aplicación, incluida actualización conjunta del estado y metadatos.';
notify pgrst,'reload schema';
commit;
