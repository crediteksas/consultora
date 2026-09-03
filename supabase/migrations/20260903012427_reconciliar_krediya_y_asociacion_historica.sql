alter table public.creditos_historicos_plataforma
  add column if not exists ejecutivo_historico_id uuid references public.ejecutivos(id);

update public.creditos_historicos_plataforma
set bonos_historicos=case when tipo_establecimiento='aliado' then 30000 else 0 end,
    utilidad_neta_historica=utilidad_antes_bonos_historica-case when tipo_establecimiento='aliado' then 30000 else 0 end,
    politica_historica_snapshot=politica_historica_snapshot||jsonb_build_object('fuente_utilidad','columna_UTILIDAD_OSCAR_liquidacion_Krediya','bono_historico_aliado',30000,'reconciliada_el','2026-09-02')
where plataforma='krediya' and historico_inicial is true;

create or replace function public.aliados_asociar_historico(p_establecimiento text,p_ejecutivo_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para asociar históricos de Aliados'; end if;
 if not exists(select 1 from public.ejecutivos where id=p_ejecutivo_id and activo) then raise exception 'El ejecutivo no existe o está inactivo'; end if;
 update public.creditos_historicos_plataforma set ejecutivo_historico_id=p_ejecutivo_id,calculo_historico_estado='calculado_con_bonos',actualizado_at=now(),politica_historica_snapshot=politica_historica_snapshot||jsonb_build_object('ejecutivo_asociado',p_ejecutivo_id,'asociado_at',now())
 where historico_inicial is true and tipo_establecimiento='aliado' and establecimiento=p_establecimiento;
 get diagnostics v_count=row_count;
 if v_count=0 then raise exception 'No se encontraron créditos para asociar'; end if;
 insert into public.audit_log(usuario,accion,tabla,detalle) values(auth.uid(),'aliados_historico_asociado','creditos_historicos_plataforma',jsonb_build_object('establecimiento',p_establecimiento,'ejecutivo_id',p_ejecutivo_id,'creditos',v_count));
 return v_count;
end $$;
revoke all on function public.aliados_asociar_historico(text,uuid) from public,anon;
grant execute on function public.aliados_asociar_historico(text,uuid) to authenticated;
