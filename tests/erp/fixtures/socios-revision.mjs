import{readFileSync}from'node:fs';
import{createDb,user,id,cut,admin}from'./socios-inventario.mjs';
import{sqlStatements}from'../../../scripts/supabase-compat/sql-statements.mjs';
export const revisionMigration='supabase/migrations/20261027192103_socios_revision_retiros_por_corte.sql';
const read=p=>readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
const isClosure=s=>{const t=s.tokens.map(x=>x.value),i=t[1]==='or'?3:1;return t[0]==='create'&&t[i]==='function'&&t[i+1]==='inventario_control'&&t[i+3]==='cierre_utilidad_api';};
export async function installRevision(db,{realClosure=false}={}){
 await db.exec('reset role');
 // Consumer tests keep the existing synthetic calculation seam. The real
 // calculation is exercised independently below and in native full-schema QA.
 const rows=sqlStatements(read(revisionMigration));
 await db.exec(rows.filter(s=>realClosure||!isClosure(s)).map(s=>s.raw).join('\n'));
 await user(db);
}
export async function reviewDb(t,options={}){
 const db=await createDb(options);t.after(()=>db.close());
 await installRevision(db);return db;
}
export async function legacy(db,{stores=[{store:'T1',amount:'200'}],from='2026-08-01',to='2026-09-05',key=id(90)}={}){
 await admin(db,"update origenes set inventario_control_activo=false,inventario_control_desde=null");
 await admin(db,`insert into financial_entries(id,entry_type,business_unit,status,amount,source_period_from,source_period_to,retail_funding)
 values($1,'retiro_utilidad','retail','pagado',$5,$2,$3,$4)`,[key,from,to,{request:{stores}},stores.reduce((n,s)=>n+Number(s.amount||0),0)]);
 await admin(db,"update origenes set inventario_control_activo=true,inventario_control_desde='2026-09-01'where tipo='propia'");
 return key;
}
export const listReview=async(db,corte=cut.positive)=>(await db.query("select public.socios_inventario('revisar_retiros',$1,null)r",[{corte_id:corte}])).rows[0].r;
export async function reviewPayload(db,decision='anterior',corte=cut.positive){
 const data=await listReview(db,corte),row=data.retiros.find(r=>r.requiere_revision);
 return {corte_id:corte,retiro_id:row.retiro_id,huella_fuente:row.huella_fuente,decision,motivo:'Período comprobado en soporte ficticio',confirmado:true};
}
export const confirmReview=async(db,data,key=id(91))=>(await db.query("select public.socios_inventario('conciliar_retiro',$1,$2)r",[data,key])).rows[0].r;
export async function changeFunding(db,key,stores){
 await admin(db,"update origenes set inventario_control_activo=false,inventario_control_desde=null");
 await admin(db,'update financial_entries set retail_funding=$2 where id=$1',[key,{request:{stores}}]);
 await admin(db,"update origenes set inventario_control_activo=true,inventario_control_desde='2026-09-01'where tipo='propia'");
}
export async function closureDb(t,options={}){
 const db=await createDb(options);t.after(()=>db.close());await db.exec('reset role');
 await db.exec(`create table inventario_control.cierres_utilidad(id uuid primary key default gen_random_uuid(),corte_id uuid unique,corte_inicio_id uuid,
 tienda_codigo text,inicio_at timestamptz,fin_at timestamptz,ventas_totales numeric,costo_vendido numeric,gastos_totales numeric,
 perdidas_ajustes numeric,ganancias_ajustes numeric,ajuste_conciliacion numeric,utilidad_neta numeric,inventario_inicial numeric,
 inventario_final numeric,detalle jsonb,cerrado_por uuid,cerrado_at timestamptz default now());
 create table inventario_control.lineas(corte_id uuid,cantidad_fisica numeric,costo_tienda numeric,valor_ajuste numeric,diferencia numeric);
 create table public.ventas(id uuid primary key,tienda_codigo text,created_at timestamptz,fecha date,total numeric,anulada boolean default false);
 create table public.venta_items(venta_id uuid,costo_tienda_congelado numeric,cantidad numeric);
 alter table public.gastos add column tienda_codigo text,add column created_at timestamptz,add column fecha date,add column monto numeric,add column estado text;
 create table public.periodos(tienda_codigo text,fecha_inicio date,fecha_fin date);
 create table public.creditos(venta_id uuid,valor_real_financiera numeric,valor_esperado_financiera numeric,estado_conciliacion text,conciliado_at timestamptz);
 update origenes set inventario_control_desde='2026-09-01T05:00Z';`);
 await db.exec(read('tests/fixtures/socios-cierre-original.sql'));
 // Match the source function ACL; CREATE OR REPLACE must preserve it.
 await db.exec('revoke all on function inventario_control.cierre_utilidad_api(text,uuid,text) from public,anon,authenticated,service_role;grant execute on function inventario_control.cierre_utilidad_api(text,uuid,text) to authenticated');
 await user(db);return db;
}
export const view=async(db,corte=cut.positive)=>(await db.query("select inventario_control.cierre_utilidad_api('vista',$1,null)r",[corte])).rows[0].r;
