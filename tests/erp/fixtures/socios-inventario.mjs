import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
export const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
export const who={mayte:id(1),oscar:id(2),store:id(3),auditor:id(4),off:id(5)};
export const cut={positive:id(11),negative:id(12),second:id(13),other:id(14),prior:id(15)};
export const migration='supabase/migrations/20261023032131_socios_inventario_retiros_aportes.sql';
export async function user(db,actor=who.mayte){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role authenticated');}
export async function createDb({supabaseFutureDefaults=false}={}){
 const db=await PGlite.create();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema storage;create schema inventario_control;create schema proveedores_control_private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table perfiles(id uuid primary key,rol text,activo boolean);
 insert into perfiles values('${who.mayte}','auditoria',true),('${who.oscar}','gerencia',true),('${who.store}','admin_tienda',true),('${who.auditor}','auditoria',true),('${who.off}','auditoria',false);
 create function public.es_controlador_financiero() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.perfiles where id=auth.uid() and activo and id in ('${who.mayte}','${who.oscar}'))$$;
 create table origenes(codigo text primary key,nombre text,tipo text,activo boolean,inventario_control_activo boolean default true,inventario_control_desde timestamptz);
 insert into origenes(codigo,nombre,tipo,activo,inventario_control_desde) select 'T'||n,'Tienda ficticia '||n,'propia',true,'2026-09-01' from generate_series(1,9) n;
 insert into origenes values('ALIADO','No propia','aliada',true,true,'2026-09-01');
 create table inventario_control.cortes(id uuid primary key,tienda_codigo text references origenes,tienda_nombre text,corte_at timestamptz,
   estado text,autorizado_at timestamptz,base_conteo text default 'corte_fijo',revision_fuente jsonb default '{}');
 insert into inventario_control.cortes values
 ('${cut.positive}','T1','Tienda ficticia 1','2026-10-07T15:00Z','aplicado','2026-10-07T16:00Z','corte_fijo','{}'),
 ('${cut.negative}','T2','Tienda ficticia 2','2026-10-08T15:00Z','sin_diferencias','2026-10-08T16:00Z','corte_fijo','{}'),
 ('${cut.second}','T3','Tienda ficticia 3','2026-10-09T15:00Z','aplicado','2026-10-09T16:00Z','corte_fijo','{}'),
 ('${cut.other}','T4','Tienda ficticia 4','2026-10-06T15:00Z','aplicado','2026-10-06T16:00Z','corte_fijo','{}'),
 ('${cut.prior}','T2','Tienda ficticia 2','2026-09-08T15:00Z','aplicado','2026-09-08T16:00Z','corte_fijo','{}');
 -- El cálculo entre cortes ya tiene su suite propia. Aquí fijamos resultados sintéticos,
 -- con la misma interfaz/huella/bloqueos, para probar el consumidor sin datos reales.
 create table fixture_results(corte_id uuid primary key,result jsonb);
 insert into fixture_results select id,jsonb_build_object('corte_id',id,'tienda_codigo',tienda_codigo,'tienda_nombre',tienda_nombre,
   'inicio_at',case when id='${cut.prior}' then '2026-08-01T00:00:00Z' else '2026-09-01T00:00:00Z' end,
   'fin_at',corte_at,'utilidad_neta',case when id='${cut.positive}' then 1000 when id='${cut.second}' then -200 else -300 end,
   'listo',true,'cerrado',false,'bloqueos','[]'::jsonb,'huella',md5(id::text)) from inventario_control.cortes;
 create function inventario_control.cierre_utilidad_api(text,uuid,text) returns jsonb language sql stable set search_path='' as $$select result from public.fixture_results where corte_id=$2$$;
 create table proveedores(id uuid primary key,nombre text,activo boolean);
 insert into proveedores values('${id(31)}','Proveedor ficticio',true),('${id(32)}','Proveedor inactivo',false);
 create table facturas_proveedor(id uuid primary key,proveedor_id uuid references proveedores,numero text,fecha date,saldo numeric);
 insert into facturas_proveedor values('${id(41)}','${id(31)}','QA-01','2026-10-01',1000),('${id(42)}','${id(32)}','QA-02','2026-10-01',1000);
 create table pagos_proveedor(id uuid primary key default gen_random_uuid(),factura_id uuid,proveedor_id uuid,monto numeric,fecha date,
   metodo text,referencia text,soporte_path text,nota text,registrado_por uuid,idempotency_key uuid unique);
 create table movimientos_caja_tienda(id uuid primary key default gen_random_uuid(),tienda_codigo text,fecha date,tipo text,monto numeric,
   soporte_path text,observacion text,autorizado_por uuid,creado_por uuid,idempotency_key uuid unique);
 create table cuenta_corriente(id bigint generated always as identity primary key,tienda_codigo text,tipo text,concepto text,monto numeric,
   referencia_tipo text,referencia_id text,usuario uuid,created_at timestamptz default now());
 insert into cuenta_corriente(tienda_codigo,tipo,concepto,monto) values('T1','cargo','Saldo de prueba',2000),('T2','cargo','Saldo de prueba',2000),('T3','cargo','Saldo de prueba',2000);
 create table financial_entries(id uuid primary key default gen_random_uuid(),scope text,business_unit text,entry_type text,category text,concept text,beneficiary text,
   amount numeric,due_date date,status text,source text,source_period_from date,source_period_to date,created_by uuid,approved_by uuid,
   approved_at timestamptz,paid_by uuid,paid_at timestamptz,support_path text,retail_funding jsonb,retail_request_id uuid unique);
 create table instrucciones_consignacion(id uuid primary key default gen_random_uuid(),tienda_codigo text,valor_esperado numeric,estado text,tipo_destino text);
 create table storage.objects(bucket_id text,name text);
 create table audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
 create table fixture_cash(tienda text primary key,amount numeric,closed boolean default false);
 insert into fixture_cash values('T1',2000,false),('T2',1000,false),('T3',1000,false);
 create table banco_creditek(id uuid);create table movimientos_tesoreria_central(id uuid);create table gastos(id uuid);
 create function public.calcular_efectivo_esperado_tienda(text,date) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('esperado',(select amount from public.fixture_cash where tienda=$1)-coalesce((select sum(monto) from public.movimientos_caja_tienda where tienda_codigo=$1 and tipo='retiro'),0))$$;
 create function public.caja_exigir_apertura(text,date,boolean) returns void language plpgsql set search_path='' as $$begin
 perform pg_advisory_xact_lock(hashtextextended('caja-arrastre:'||$1,0));
 if exists(select 1 from public.fixture_cash where tienda=$1 and closed) then raise exception 'El día ya tiene arqueo validado'; end if;end$$;
 grant usage on schema public,auth,inventario_control to authenticated;
 grant execute on function auth.uid(),public.es_controlador_financiero() to authenticated;
 `);
 await db.exec(read('tests/fixtures/socios-inventario-proveedor.sql'));
 await db.exec(`create function public.registrar_pago_proveedor(uuid,numeric,date,text,text,text,text,uuid) returns jsonb language sql security invoker set search_path='' as $$select proveedores_control_private.registrar_pago_proveedor($1,$2,$3,$4,$5,$6,$7,$8)$$;`);
 if(supabaseFutureDefaults)await db.exec(`
 -- Supabase's legacy FUNCTION defaults remain after the October table change.
 alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;
 alter default privileges for role postgres in schema public revoke select,insert,update,delete on tables from anon,authenticated,service_role;
 alter default privileges for role postgres in schema public revoke usage,select on sequences from anon,authenticated,service_role;
 `);
 try{await db.exec(read(migration));}catch(error){await db.close();throw new Error('Migración local: '+error.message+' posición '+error.position);}
 await user(db);
 return db;
}
export async function admin(db,sql,args=[]){await db.exec('reset role');const out=await db.query(sql,args);await user(db);return out;}
export async function payload(db){
 const data={corte_id:cut.positive,huella:'',fecha:'2026-10-20',motivo:'Pago ficticio de socios y cobertura',socios_comunes:true,
  destinos:[{tipo:'socio',monto:'700',beneficiario:'Socio ficticio',soporte_path:`finanzas/${id(70)}.pdf`},
    {tipo:'aporte',monto:'300',corte_id:cut.negative,huella:'',factura_id:id(41),soporte_path:`finanzas/${id(71)}.jpg`}]};
 const rows=(await admin(db,'select corte_id,result from fixture_results')).rows;
 data.huella=rows.find(x=>x.corte_id===cut.positive).result.huella;data.destinos[1].huella=rows.find(x=>x.corte_id===cut.negative).result.huella;
 for(const a of data.destinos)await admin(db,"insert into storage.objects values('soportes',$1)",[a.soporte_path]);
 return data;
}
export async function register(db,p,key=id(80)){return (await db.query("select public.socios_inventario('registrar',$1,$2) result",[p,key])).rows[0].result;}
export async function consult(db,mes='2026-10'){return (await db.query("select public.socios_inventario('consultar',$1) result",[{mes}])).rows[0].result;}
export async function state(db){return (await admin(db,`select
 (select count(*)::int from inventario_control.socios_operaciones) operations,
 (select count(*)::int from inventario_control.socios_destinos) allocations,
 (select count(*)::int from movimientos_caja_tienda) cash_movements,
 (select coalesce(sum(monto),0) from movimientos_caja_tienda) cash_out,
 (select sum(case when tipo='cargo' then monto else -monto end) from cuenta_corriente where tienda_codigo='T1') source_debt,
 (select sum(case when tipo='cargo' then monto else -monto end) from cuenta_corriente where tienda_codigo='T2') target_debt,
 (select saldo from facturas_proveedor where id='${id(41)}') supplier_debt,
 (select count(*)::int from pagos_proveedor) supplier_payments,
 (select count(*)::int from financial_entries where status='pagado') withdrawals,
 (select count(*)::int from banco_creditek) bank,
 (select count(*)::int from movimientos_tesoreria_central) treasury,
 (select count(*)::int from gastos) expenses`)).rows[0];}

// Integración adicional: sustituye únicamente el doble de caja por las funciones
// productivas conservadas en el fixture del ciclo. Nunca consulta producción.
export async function attachCashCycle(db){
 await db.exec('reset role');
 await db.exec(`drop function public.caja_exigir_apertura(text,date,boolean);
 alter table perfiles add column tienda_codigo text;
 create function public.rol_actual() returns text language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid()$$;
 create table caja_diaria(id uuid primary key default gen_random_uuid(),tienda_codigo text,fecha date,estado text default 'abierta',
 apertura numeric default 0,contado_ventas numeric default 0,financiado_ventas numeric default 0,iniciales numeric default 0,
 otros_ingresos numeric default 0,gastos_efectivo numeric default 0,salidas_explicitas numeric default 0,
 efectivo_esperado numeric,efectivo_contado numeric,diferencia numeric,cerrada_por uuid,cerrada_at timestamptz,
 nota text,cierre_idempotency_key uuid,unique(tienda_codigo,fecha));
 create table ventas(id uuid primary key default gen_random_uuid(),tienda_codigo text,fecha date,tipo text,total numeric,anulada boolean default false);
 create table creditos(id uuid primary key default gen_random_uuid(),venta_id uuid,cuota_inicial numeric,valor_esperado_financiera numeric);
 create table venta_items(id uuid primary key default gen_random_uuid(),venta_id uuid,precio_venta numeric,cantidad numeric);
 create table conceptos_gasto(id uuid primary key,preautorizado boolean);
 alter table gastos add column tienda_codigo text,add column fecha date,add column monto numeric,add column concepto_id uuid,add column estado text;
 grant usage on schema storage to authenticated;`);
 await db.exec(read('tests/fixtures/retiros-retail-cash-cycle.sql'));
 await db.exec("update caja_ciclo_config set fecha_inicio='2026-10-20'");
 await user(db);
 await admin(db,"insert into ventas(tienda_codigo,fecha,tipo,total) values('T1','2026-10-20','contado',2000)");
}
