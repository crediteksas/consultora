begin;
-- Oscar: teléfonos >800000 +30000; >1300000 +50000. Límites estrictos.
-- Solo cambia la validación de NUEVAS publicaciones. No reescribe ofertas,
-- pedidos, costos, inventario, cartera ni caja; las excepciones con motivo siguen permitidas.
do $migration$
declare definition text; old_guard text := $old$if v_precio-v_costo<>(case when v_costo<150000 then round(v_costo*0.12,2) else 20000 end)
   and (v_motivo is null or v_motivo='Política retail: costo menor de $150.000 + 12%; desde $150.000 + $20.000')
   then raise exception 'Indica el origen o motivo del margen especial: menos de $150.000 son 12%% sobre el costo; desde $150.000 son $20.000'; end if;$old$;
begin
 definition := pg_get_functiondef('public.publicar_lista_b2b(text,text,text,jsonb)'::regprocedure);
 if position(old_guard in definition)=0 then raise exception 'El publicador cambió: revisar la regla antes de migrar'; end if;
 definition := replace(definition,old_guard,$guard$if v_precio-v_costo<>(case
   when exists(select 1 from public.productos where id=(v_fila->>'producto_id')::uuid and upper(btrim(categoria))='CELULAR') and v_costo>1300000 then 50000
   when exists(select 1 from public.productos where id=(v_fila->>'producto_id')::uuid and upper(btrim(categoria))='CELULAR') and v_costo>800000 then 30000
   when v_costo<150000 then round(v_costo*0.12,2) else 20000 end)
   and (v_motivo is null or v_motivo in (
    'Política retail: costo menor de $150.000 + 12%; desde $150.000 + $20.000',
    'Política retail: costo menor de $150.000 + 12%; desde $150.000 + $20.000; teléfonos: costo mayor de $800.000 + $30.000; mayor de $1.300.000 + $50.000'))
   then raise exception 'Indica el motivo del margen especial. Teléfonos: más de $800.000 suman $30.000; más de $1.300.000 suman $50.000. Otros: menos de $150.000 suman 12%%; desde $150.000 suman $20.000'; end if;$guard$);
 execute definition;
end $migration$;
commit;
