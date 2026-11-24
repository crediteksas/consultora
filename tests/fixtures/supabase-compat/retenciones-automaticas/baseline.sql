create role anon;create role authenticated;create schema auth;create schema kora_private;
 create table auth.users(id uuid primary key);insert into auth.users values('10000000-0000-0000-0000-000000000001');
 create table perfiles(id uuid primary key,activo boolean,rol text);insert into perfiles values('10000000-0000-0000-0000-000000000001',true,'gerencia');
 create function auth.uid() returns uuid language sql stable as $$select '10000000-0000-0000-0000-000000000001'::uuid$$;
 create function es_central() returns boolean language sql stable as $$select coalesce(current_setting('test.central',true)='yes',false)$$;
 create table proveedores(id uuid primary key default gen_random_uuid(),nombre text);
 insert into proveedores(nombre) values('INITY'),('MR MOVIL SAS'),('COMQUIA SAS'),('COMUNICARIBE'),('CONMOVIL'),('TEKMOBILE'),('OTRO FICTICIO');
 create table facturas_proveedor(id uuid primary key default gen_random_uuid(),proveedor_id uuid,numero text,fecha date,total numeric(16,2),saldo numeric(16,2),origen_registro text,tipo_compra text,fecha_vencimiento date,operacion_idempotency_key uuid unique);
 create table movimientos_tesoreria_central(fecha date,tipo text,fuente_fondos text,monto numeric,referencia_tipo text,referencia_id uuid,soporte_path text,observacion text,idempotency_key uuid unique);
 create table pagos_prueba(factura_id uuid,monto numeric);
 create table pagos_proveedor(factura_id uuid);create table proveedores_ajustes_detalle(factura_id uuid);
 create table audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
 create table inventario_prueba(factura_id uuid,cantidad numeric);
 create function registrar_compra_proveedor(uuid,text,date,jsonb,text,text) returns jsonb language plpgsql set search_path=public as $$
 declare i uuid;t numeric;begin
 select sum((x->>'cantidad')::numeric*(x->>'costo_unitario')::numeric) into t from jsonb_array_elements($4) x;
 insert into facturas_proveedor(proveedor_id,numero,fecha,total,saldo) values($1,$2,$3,t,t) returning id into i;
 insert into inventario_prueba values(i,1);
 return jsonb_build_object('ok',true,'factura_id',i,'total',t);end$$;
 create function registrar_pago_proveedor(uuid,numeric,date,text,text,text,text,uuid) returns jsonb language sql set search_path=public as $$
 insert into pagos_prueba values($1,$2);update facturas_proveedor set saldo=saldo-$2 where id=$1;select '{}'::jsonb$$;
 set test.central='yes';