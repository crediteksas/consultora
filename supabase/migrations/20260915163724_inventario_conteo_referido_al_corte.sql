-- Regla de Gerencia: comparar lo reportado por la tienda SOLO contra el corte.
-- Las ventas/entradas posteriores las reconcilia la tienda antes de entregar el Excel.
-- No se recalculan ni aplican conteos históricos con esta migración.
begin;
alter table inventario_control.cortes add column base_conteo text not null
 default 'observacion_fisica' check (base_conteo in ('observacion_fisica','corte_fijo'));
alter table inventario_control.cortes alter column base_conteo set default 'corte_fijo';
create or replace function inventario_control.api(p_accion text,p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 v_perfil public.perfiles%rowtype; v_corte inventario_control.cortes%rowtype;
 v_producto public.productos%rowtype; v_linea inventario_control.lineas%rowtype;
 v_tienda text; v_nombre text; v_autoriza boolean; v_central boolean;
 v_id uuid; v_fecha timestamptz; v_ahora timestamptz; v_rows jsonb; v_row jsonb;
 v_imei text; v_fisico integer; v_esperado integer; v_actual integer; v_delta integer;
 v_costo numeric; v_unidad public.unidades%rowtype; v_result jsonb; v_prev text;
begin
 select * into v_perfil from public.perfiles where id=auth.uid() and activo=true;
 if not found then raise exception 'Sesión sin perfil activo'; end if;
 v_central := coalesce(v_perfil.rol in ('gerencia','auditoria'),false);
 v_autoriza := v_central and exists(select 1 from inventario_control.responsables where perfil_id=v_perfil.id);
 if p_accion='config' then
   return jsonb_build_object('metodo_conteo','corte_fijo','autoriza',v_autoriza,'central',v_central,'tiendas',(
     select coalesce(jsonb_agg(jsonb_build_object('codigo',codigo,'nombre',nombre) order by nombre),'[]'::jsonb)
     from public.origenes where activo=true and tipo='propia' and codigo<>'CENTRAL'
     and (v_central or codigo=v_perfil.tienda_codigo)));
 end if;
 if p_accion='cerrar_solicitud' then
   if not v_autoriza then raise exception 'Solo Mayte u Óscar pueden cerrar solicitudes'; end if;
   if length(btrim(coalesce(p_datos->>'motivo','')))<5 then raise exception 'Documenta por qué se cierra sin ajustar'; end if;
   update public.ajustes_inventario set estado='rechazado',nota_rechazo=p_datos->>'motivo',
     autorizado_por=v_perfil.id,autorizado_at=clock_timestamp()
     where id=(p_datos->>'id')::uuid and estado='pendiente';
   if not found then raise exception 'Solicitud no encontrada o ya procesada'; end if;
   return jsonb_build_object('ok',true,'estado','rechazado');
 end if;
 if p_accion='informe' then
   if (p_datos->>'desde')::date is null or (p_datos->>'hasta')::date is null
     or (p_datos->>'hasta')::date < (p_datos->>'desde')::date then raise exception 'Selecciona un rango válido'; end if;
   return jsonb_build_object('cortes',(
     select coalesce(jsonb_agg(to_jsonb(s) order by s.corte_at,s.id),'[]'::jsonb) from (
       select c.* from inventario_control.cortes c
       where c.corte_at >= ((p_datos->>'desde')::date::timestamp at time zone 'America/Bogota')
       and c.corte_at < (((p_datos->>'hasta')::date+1)::timestamp at time zone 'America/Bogota')
       and (v_central or c.tienda_codigo=v_perfil.tienda_codigo)
       and (nullif(p_datos->>'tienda','') is null or c.tienda_codigo=p_datos->>'tienda')
       and (nullif(p_datos->>'responsable','') is null or
         concat_ws(' ',c.creado_nombre,c.contado_nombre,c.autorizado_nombre) ilike '%'||(p_datos->>'responsable')||'%')
       and (nullif(p_datos->>'despues_id','') is null or
         (c.corte_at,c.id)>((p_datos->>'despues_fecha')::timestamptz,(p_datos->>'despues_id')::uuid))
       order by c.corte_at,c.id limit 200
     ) s));
 end if;
 if p_accion='crear' then
   v_tienda:=p_datos->>'tienda';
   if not v_central and v_tienda is distinct from v_perfil.tienda_codigo then raise exception 'No puedes contar otra tienda'; end if;
   select nombre into v_nombre from public.origenes where codigo=v_tienda and activo=true and tipo='propia' and codigo<>'CENTRAL';
   if not found then raise exception 'Selecciona una tienda activa'; end if;
   -- Fotografía atómica: espera ventas/recepciones abiertas y evita lecturas mixtas.
   lock table public.stock_cantidad,public.unidades in share mode;
   v_ahora:=clock_timestamp();
   insert into inventario_control.cortes(tienda_codigo,tienda_nombre,corte_at,creado_por,creado_nombre)
     values(v_tienda,v_nombre,v_ahora,v_perfil.id,v_perfil.nombre) returning id into v_id;
   insert into inventario_control.lineas(corte_id,producto_id,imei,codigo,nombre,tipo,cantidad_corte,costo_tienda)
     select v_id,s.producto_id,'',p.codigo,p.nombre,p.tipo,s.cantidad,s.precio_tienda
       from public.stock_cantidad s join public.productos p on p.id=s.producto_id
       where s.tienda_codigo=v_tienda and p.tipo='cantidad'
     union all
     select v_id,u.producto_id,u.imei,p.codigo,p.nombre,p.tipo,1,u.precio_tienda
       from public.unidades u join public.productos p on p.id=u.producto_id
       where u.tienda_actual=v_tienda and u.estado='disponible';
 else
   v_id:=(p_datos->>'id')::uuid;
 end if;
 select * into v_corte from inventario_control.cortes where id=v_id for update;
 if not found then raise exception 'Corte no encontrado'; end if;
 if not v_central and v_corte.tienda_codigo is distinct from v_perfil.tienda_codigo then raise exception 'El corte pertenece a otra tienda'; end if;
 if p_accion='subir' then
   if v_corte.estado<>'abierto' then raise exception 'Este corte ya tiene un conteo registrado; no se puede sobrescribir'; end if;
   if p_datos->>'base_conteo' is distinct from 'corte_fijo' then
     raise exception 'Actualiza la pantalla y confirma que las cantidades están reconstruidas a la fecha del corte'; end if;
   v_fecha:=v_corte.corte_at;
   if nullif(p_datos->>'contado_at','') is not null and (p_datos->>'contado_at')::timestamptz is distinct from v_fecha then
     raise exception 'El conteo se compara únicamente con la fecha del corte; la tienda concilia manualmente salidas y entradas posteriores'; end if;
   if coalesce(p_datos->>'sha256','') !~ '^[a-f0-9]{64}$' or length(btrim(coalesce(p_datos->>'archivo','')))=0 then raise exception 'Falta identificación del archivo'; end if;
   v_rows:=p_datos->'filas';
   if jsonb_typeof(v_rows) is distinct from 'array' then raise exception 'Formato de conteo inválido'; end if;
   if jsonb_array_length(v_rows)>20000 then raise exception 'El conteo supera 20.000 filas'; end if;
   if exists(select 1 from jsonb_array_elements(v_rows) x group by x->>'codigo',coalesce(x->>'imei','') having count(*)>1) then raise exception 'Producto/IMEI duplicado'; end if;
   lock table public.stock_cantidad,public.unidades in share mode;
   if exists(select 1 from inventario_control.eventos where tienda_codigo=v_corte.tienda_codigo and ocurrido_at>v_corte.corte_at and ajuste) then
     raise exception 'Hubo otro ajuste desde este corte. Genera un corte nuevo para no aplicarlo dos veces'; end if;
   for v_row in select value from jsonb_array_elements(v_rows) loop
     if jsonb_typeof(v_row->'cantidad') is distinct from 'number' or (v_row->>'cantidad') !~ '^[0-9]+$' then raise exception 'Cantidad reportada al corte inválida o vacía'; end if;
     v_fisico:=(v_row->>'cantidad')::integer; v_imei:=btrim(coalesce(v_row->>'imei',''));
     select * into v_producto from public.productos where codigo=v_row->>'codigo';
     if not found then raise exception 'Referencia desconocida: %. Mayte debe identificarla en el catálogo antes de continuar',v_row->>'codigo'; end if;
     if (v_producto.tipo='cantidad' and v_imei<>'') or
       (v_producto.tipo='serializado' and (length(v_imei)<6 or v_fisico>1)) then raise exception 'Accesorios sin IMEI; equipos: un serial y cantidad 0 o 1'; end if;
     if exists(select 1 from public.unidades where imei=v_imei and producto_id<>v_producto.id) then raise exception 'El IMEI corresponde a otro producto'; end if;
     insert into inventario_control.lineas(corte_id,producto_id,imei,codigo,nombre,tipo,cantidad_corte,costo_tienda)
       values(v_id,v_producto.id,v_imei,v_producto.codigo,v_producto.nombre,v_producto.tipo,0,null)
       on conflict do nothing;
     select * into v_linea from inventario_control.lineas where corte_id=v_id and producto_id=v_producto.id and imei=v_imei;
     -- La tienda entrega la cantidad reconstruida al corte. No se suman ventas
     -- ni recepciones del sistema a la base de comparación.
     v_esperado:=v_linea.cantidad_corte;
     update inventario_control.lineas set cantidad_fisica=v_fisico,esperado_conteo=v_esperado,
       diferencia=v_fisico-v_esperado,nota=btrim(coalesce(v_row->>'nota',''))
       where corte_id=v_id and producto_id=v_producto.id and imei=v_imei;
   end loop;
   if exists(select 1 from inventario_control.lineas where corte_id=v_id and cantidad_fisica is null) then
     raise exception 'Faltan filas del corte. No se considera cero una fila borrada'; end if;
   update inventario_control.cortes set estado='pendiente',base_conteo='corte_fijo',contado_at=v_fecha,recibido_at=clock_timestamp(),
     contado_por=v_perfil.id,contado_nombre=v_perfil.nombre,archivo_nombre=p_datos->>'archivo',archivo_sha256=p_datos->>'sha256' where id=v_id;
 elsif p_accion in ('aplicar','rechazar') then
   if not v_autoriza then raise exception 'Solo Mayte u Óscar pueden autorizar ajustes'; end if;
   if v_corte.estado not in ('abierto','pendiente') then raise exception 'Este corte ya está cerrado; no se aplicará dos veces'; end if;
   if length(btrim(coalesce(p_datos->>'motivo','')))<5 then raise exception 'Documenta el motivo (mínimo 5 caracteres)'; end if;
   if p_accion='rechazar' then
     update inventario_control.cortes set estado='rechazado',motivo=p_datos->>'motivo',autorizado_at=clock_timestamp(),
       autorizado_por=v_perfil.id,autorizado_nombre=v_perfil.nombre where id=v_id;
   else
     if v_corte.estado<>'pendiente' then raise exception 'Primero registra el conteo referido al corte'; end if;
     if v_corte.base_conteo<>'corte_fijo' or p_datos->>'base_conteo' is distinct from 'corte_fijo' then
       raise exception 'Este conteo requiere confirmar la regla de corte fijo; cierra los conteos del método anterior sin aplicar y registra uno nuevo'; end if;
     if coalesce(p_datos->>'clasificacion','') not in ('correccion_registro','faltante','sobrante_por_aclarar','mixto') then raise exception 'Clasifica la diferencia'; end if;
     if length(btrim(coalesce(p_datos->>'soporte','')))<5 then raise exception 'Registra el soporte o referencia documental de la revisión'; end if;
     lock table public.stock_cantidad,public.unidades in share row exclusive mode;
     if exists(select 1 from inventario_control.eventos where tienda_codigo=v_corte.tienda_codigo and ocurrido_at>v_corte.corte_at and ajuste) then
       raise exception 'Otro ajuste modificó la base. Rechaza este conteo y toma un corte nuevo'; end if;
     v_prev:=current_setting('kora.conteo_ajuste',true);
     perform set_config('kora.conteo_ajuste','si',true);
     for v_linea in select * from inventario_control.lineas where corte_id=v_id order by producto_id,imei loop
       v_delta:=v_linea.diferencia;
       if v_linea.tipo='cantidad' then
         select cantidad,precio_tienda into v_actual,v_costo from public.stock_cantidad where tienda_codigo=v_corte.tienda_codigo and producto_id=v_linea.producto_id;
         v_actual:=coalesce(v_actual,0);
       else
         select * into v_unidad from public.unidades where imei=v_linea.imei;
         v_actual:=case when found and v_unidad.tienda_actual=v_corte.tienda_codigo and v_unidad.estado='disponible' then 1 else 0 end;
         v_costo:=v_unidad.precio_tienda;
       end if;
       v_costo:=coalesce(v_linea.costo_tienda,v_costo);
       if v_delta<>0 then
         -- Costo de nuevos sobrantes lo confirma administración, nunca se infiere del PVP/proveedor.
         if v_costo is null or v_costo<=0 then
           select (x->>'costo_tienda')::numeric into v_costo from jsonb_array_elements(coalesce(p_datos->'costos','[]'::jsonb)) x
             where x->>'codigo'=v_linea.codigo and coalesce(x->>'imei','')=v_linea.imei;
           if v_costo is null or v_costo<=0 or v_costo::text in ('NaN','Infinity','-Infinity') then raise exception 'Confirma costo de tienda de % %',v_linea.codigo,v_linea.imei; end if;
         end if;
         if v_actual+v_delta<0 then raise exception 'El ajuste dejaría negativo %; revisa ventas y fecha del conteo',v_linea.nombre; end if;
         if v_linea.tipo='cantidad' then
           update public.stock_cantidad set cantidad=cantidad+v_delta,
             precio_tienda=case when precio_tienda is null or precio_tienda<=0 then v_costo else precio_tienda end,
             updated_at=clock_timestamp()
             where producto_id=v_linea.producto_id and tienda_codigo=v_corte.tienda_codigo;
           if not found then
             insert into public.stock_cantidad(producto_id,tienda_codigo,cantidad,precio_tienda,costo_promedio)
               values(v_linea.producto_id,v_corte.tienda_codigo,v_delta,v_costo,0);
           end if;
         elsif v_delta=-1 then
           if v_actual<>1 then raise exception 'El equipo ya no está disponible; no se anula una venta ni traslado desde el conteo'; end if;
           update public.unidades set estado='anulado_reingreso' where id=v_unidad.id;
         elsif v_delta=1 then
           if v_unidad.id is not null then raise exception 'Este IMEI ya existe; concilia su venta/remisión, no lo dupliques'; end if;
           insert into public.unidades(producto_id,imei,estado,tienda_actual,precio_tienda,costo_remision)
             values(v_linea.producto_id,v_linea.imei,'disponible',v_corte.tienda_codigo,v_costo,0) returning * into v_unidad;
         else raise exception 'Diferencia serializada inválida';
         end if;
         insert into public.movimientos(tipo,tienda_codigo,producto_id,unidad_id,cantidad,costo,costo_tienda,referencia_tipo,referencia_id,usuario,nota)
           values(case when v_delta>0 then 'ajuste_entrada' else 'ajuste_salida' end,v_corte.tienda_codigo,v_linea.producto_id,
             case when v_linea.tipo='serializado' then v_unidad.id else null end,abs(v_delta),v_costo,v_costo,
             'conteo_inventario',v_id::text,v_perfil.id,concat_ws(' · ',p_datos->>'motivo',p_datos->>'clasificacion',p_datos->>'soporte'));
       end if;
       update inventario_control.lineas set anterior=v_actual,posterior=v_actual+v_delta,
         costo_tienda=v_costo,valor_ajuste=v_delta*coalesce(v_costo,0)
         where corte_id=v_id and producto_id=v_linea.producto_id and imei=v_linea.imei;
     end loop;
     perform set_config('kora.conteo_ajuste',coalesce(v_prev,''),true);
     update inventario_control.cortes set estado=case when exists(select 1 from inventario_control.lineas where corte_id=v_id and diferencia<>0) then 'aplicado' else 'sin_diferencias' end,
       autorizado_at=clock_timestamp(),autorizado_por=v_perfil.id,autorizado_nombre=v_perfil.nombre,
       motivo=p_datos->>'motivo',soporte=p_datos->>'soporte',clasificacion=p_datos->>'clasificacion' where id=v_id;
   end if;
 elsif p_accion not in ('crear','ver') then raise exception 'Acción desconocida';
 end if;
 select to_jsonb(c) into v_result from inventario_control.cortes c where id=v_id;
 return jsonb_build_object('corte',v_result,'lineas',(
   select coalesce(jsonb_agg(to_jsonb(s) order by s.codigo,s.imei),'[]'::jsonb) from (
     select l.*,case when l.tipo='cantidad' then coalesce((select cantidad from public.stock_cantidad where producto_id=l.producto_id and tienda_codigo=v_corte.tienda_codigo),0)
       else (select count(*)::integer from public.unidades where imei=l.imei and estado='disponible' and tienda_actual=v_corte.tienda_codigo) end actual
       from inventario_control.lineas l where corte_id=v_id
   ) s));
end $$;

notify pgrst,'reload schema';
commit;
