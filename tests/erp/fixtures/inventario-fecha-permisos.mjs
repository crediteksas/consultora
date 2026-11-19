import{readFileSync}from'node:fs';import{createDb}from'./socios-inventario.mjs';
const read=p=>readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
export const migrations=[
 'supabase/migrations/20261023032131_socios_inventario_retiros_aportes.sql',
 'supabase/migrations/20261021161019_kora_compat_select_krediya_price_rules.sql',
 'supabase/migrations/20261027192103_socios_revision_retiros_por_corte.sql',
 'supabase/migrations/20261027203123_pagos_realizados_fecha_conciliacion.sql',
 'supabase/migrations/20261119181116_inventario_conciliar_fecha_registro.sql'];
export async function combinedDb(scenario){
 const db=await createDb({preSocios:true,supabaseFutureDefaults:true});
 await db.exec(`create schema kora_private;
 create table inventario_control.cierres_utilidad(id uuid primary key default gen_random_uuid(),corte_id uuid unique,corte_inicio_id uuid,
 tienda_codigo text,inicio_at timestamptz,fin_at timestamptz,ventas_totales numeric,costo_vendido numeric,gastos_totales numeric,
 perdidas_ajustes numeric,ganancias_ajustes numeric,ajuste_conciliacion numeric,utilidad_neta numeric,inventario_inicial numeric,
 inventario_final numeric,detalle jsonb,cerrado_por uuid,cerrado_at timestamptz default now());
 create table inventario_control.lineas(corte_id uuid,cantidad_fisica numeric,costo_tienda numeric,valor_ajuste numeric,diferencia numeric);
 create table ventas(id uuid primary key,tienda_codigo text,created_at timestamptz,fecha date,total numeric,anulada boolean default false);
 create table venta_items(venta_id uuid,costo_tienda_congelado numeric,cantidad numeric);
 alter table gastos add column tienda_codigo text,add column created_at timestamptz,add column fecha date,add column monto numeric,add column estado text;
 create table periodos(tienda_codigo text,fecha_inicio date,fecha_fin date);
 create table creditos(venta_id uuid,valor_real_financiera numeric,valor_esperado_financiera numeric,estado_conciliacion text,conciliado_at timestamptz);
 alter table financial_entries add column pagado_desde_banco_creditek boolean;
 create table banco_creditek_cuentas(id uuid,numero_cuenta text,activa boolean,saldo_actual numeric,fecha_corte_at timestamptz,fecha_corte date,
 constraint banco_creditek_cuentas_saldo_actual_check check(saldo_actual>=0));
 create table banco_creditek_movimientos(id uuid,cuenta_id uuid,tipo text,monto numeric,saldo_antes numeric,saldo_despues numeric,fecha date,
 referencia text,soporte_path text,registrado_por uuid,fuente_tabla text,fuente_id uuid,ocurrido_at timestamptz);
 create function public.finanzas_registrar_pago(uuid,text) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function public.finanzas_registrar_pago_con_origen(uuid,text,boolean) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function public.tiene_capacidad_aliados(text) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null$$;
 revoke all on function public.tiene_capacidad_aliados(text) from public,anon;grant execute on function public.tiene_capacidad_aliados(text) to authenticated;
 `);
 const root=JSON.parse(read('tests/fixtures/supabase-compat/inventario-fecha-combined/prior-native-release.json'));
 // The prior reviewed native catalogs supply column shapes only; no business rows are loaded.
 const prior=JSON.parse(read(root.upgrade.after.path));
 const columns=prior.relations.find(x=>x.schema==='public'&&x.name==='krediya_price_rules').columns;
 await db.exec('create table public.krediya_price_rules('+columns.map(c=>'"'+c.name+'" '+c.type).join(',')+');alter table public.krediya_price_rules enable row level security;'+
 "create policy krediya_price_rules_select on public.krediya_price_rules for select to authenticated using(public.tiene_capacidad_aliados('revisor'));"+
 "create policy krediya_price_rules_write on public.krediya_price_rules for all to authenticated using(public.tiene_capacidad_aliados('revisor')) with check(public.tiene_capacidad_aliados('revisor'));");
 if(scenario==='upgrade'){
  const baseline=JSON.parse(read(root.upgrade.before.path)).relations.find(x=>x.schema==='public'&&x.name==='krediya_price_rules');
  for(const g of baseline.grants.filter(g=>g.grantee!==baseline.owner)){
   if(!['PUBLIC','anon','authenticated','service_role'].includes(g.grantee)||!['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'].includes(g.privilege))throw Error('Unexpected reviewed fixture grant');
   await db.exec('grant '+g.privilege+' on public.krediya_price_rules to '+(g.grantee==='PUBLIC'?'PUBLIC':'"'+g.grantee+'"')+(g.grantable?' with grant option':'')+';');
  }
 }
 await db.exec(read('tests/fixtures/socios-cierre-original.sql'));
 await db.exec('revoke all on function inventario_control.cierre_utilidad_api(text,uuid,text) from public,anon,authenticated,service_role;grant execute on function inventario_control.cierre_utilidad_api(text,uuid,text) to authenticated;');
 return db;
}
export const applyCombined=async db=>{for(const file of migrations)await db.exec(read(file));};
