import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
export const folder='tests/fixtures/supabase-compat/krediya-venta';
export const migration='supabase/migrations/20261126174052_krediya_correccion_precios_por_venta.sql';
export const signatures=['public.aliados_contexto_precio_krediya(uuid)','public.aliados_resolver_precio_krediya(uuid,text,numeric,numeric,text)','krediya_private.utilidad_consulta(uuid)','krediya_private.calcular_y_enviar_aprobacion(uuid)'];
export const read=p=>readFileSync(p,'utf8');
export async function setup(scenario='upgrade'){
 const db=await PGlite.create();try{await db.exec(read(folder+'/setup.sql'));if(scenario==='rebuild')await db.exec('alter default privileges revoke execute on functions from public');await db.exec(read(folder+'/baseline-functions.sql'));await db.exec(read(folder+'/preparar-catalogo.sql'));
 for(const sig of signatures)await db.exec('revoke all on function '+sig+' from public,anon,authenticated,service_role;grant execute on function '+sig+' to authenticated,service_role;');
 return db;}catch(e){await db.close();throw e;}
}
export const seed=db=>db.exec(read(folder+'/seed.sql'));
export const apply=db=>db.exec(read(migration));
