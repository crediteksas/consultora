CREATE OR REPLACE FUNCTION public.publicar_lista_b2b(p_archivo text, p_huella text, p_alcance text, p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_fila jsonb; v_costo numeric; v_precio numeric; v_motivo text;
begin
 if auth.uid() is null or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in ('gerencia','auditoria')) then
  raise exception 'Solo Maite/Gestión o Gerencia pueden publicar listas'; end if;
 if p_alcance not in ('proveedores','catalogo') or p_alcance is null or nullif(btrim(p_archivo),'') is null or p_huella !~ '^[a-f0-9]{64}$' or p_huella is null then raise exception 'Archivo o alcance inválido'; end if;
 if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) not between 1 and 5000 then raise exception 'La lista debe contener entre 1 y 5000 filas'; end if;
 perform pg_advisory_xact_lock(726041701);
 select id into v_id from public.b2b_listas_precios where creado_por=auth.uid() and huella=p_huella;
 if v_id is not null then return jsonb_build_object('id',v_id,'repetida',true); end if;
 if exists(select 1 from jsonb_array_elements(p_filas) f group by f->>'producto_id',f->>'proveedor_id' having count(*)>1) then raise exception 'Referencia y proveedor duplicados: resuelve la diferencia antes de publicar'; end if;
 for v_fila in select * from jsonb_array_elements(p_filas) loop
  if not exists(select 1 from public.productos where id=(v_fila->>'producto_id')::uuid and activo) then raise exception 'Referencia sin vincular o inactiva'; end if;
  if not exists(select 1 from public.proveedores where id=(v_fila->>'proveedor_id')::uuid and activo) then raise exception 'Proveedor sin vincular o inactivo'; end if;
  v_costo:=round((v_fila->>'costo')::numeric,0); v_precio:=round((v_fila->>'precio_tienda')::numeric,0);
  if v_costo is null or v_precio is null or v_costo<=0 or v_precio<=0 or v_costo::text in ('NaN','Infinity','-Infinity') or v_precio::text in ('NaN','Infinity','-Infinity') or v_costo<>round(v_costo,0) or v_precio<>round(v_precio,0) then raise exception 'Costo real y precio a tienda deben ser valores válidos en pesos enteros'; end if;
  v_motivo:=nullif(btrim(v_fila->>'motivo'),'');
  if v_precio-v_costo<>(case
   when exists(select 1 from public.productos where id=(v_fila->>'producto_id')::uuid and upper(btrim(categoria))='CELULAR') and v_costo>1300000 then 50000
   when exists(select 1 from public.productos where id=(v_fila->>'producto_id')::uuid and upper(btrim(categoria))='CELULAR') and v_costo>800000 then 30000
   when v_costo<150000 then round(v_costo*0.12,0) else 20000 end)
   and (v_motivo is null or v_motivo in (
    'Política retail: costo menor de $150.000 + 12%; desde $150.000 + $20.000',
    'Política retail: costo menor de $150.000 + 12%; desde $150.000 + $20.000; teléfonos: costo mayor de $800.000 + $30.000; mayor de $1.300.000 + $50.000'))
   then raise exception 'Indica el motivo del margen especial. Teléfonos: más de $800.000 suman $30.000; más de $1.300.000 suman $50.000. Otros: menos de $150.000 suman 12%%; desde $150.000 suman $20.000'; end if;
 end loop;
 insert into public.b2b_listas_precios(archivo,huella,alcance,filas,creado_por) values(p_archivo,p_huella,p_alcance,p_filas,auth.uid()) returning id into v_id;
 update public.b2b_ofertas set vigente=false where vigente and (p_alcance='catalogo' or proveedor_id in (select (f->>'proveedor_id')::uuid from jsonb_array_elements(p_filas) f));
 insert into public.b2b_ofertas(lista_id,producto_id,proveedor_id,costo,precio_tienda,motivo)
 select v_id,(f->>'producto_id')::uuid,(f->>'proveedor_id')::uuid,round((f->>'costo')::numeric,0),round((f->>'precio_tienda')::numeric,0),nullif(btrim(f->>'motivo'),'') from jsonb_array_elements(p_filas) f;
 return jsonb_build_object('id',v_id,'filas',jsonb_array_length(p_filas),'repetida',false);
end $function$;
