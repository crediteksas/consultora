import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../../supabase/migrations/20260904031256_presupuesto_manual_prorrateado.sql', import.meta.url), 'utf8');

test('la propuesta prorratea el histórico mensual y conserva el total exacto', () => {
  assert.match(sql, /histórico mensual prorrateado/);
  assert.match(sql, /v_total - s\.suma_base/);
  assert.match(sql, /round\(v_total \* \(\(100\.0 \+ p_pct_crecimiento\) \/ 100\.0\)\) - s\.suma_meta/);
  assert.match(sql, /p_pct_crecimiento < 0 or p_pct_crecimiento > 1000/);
});

test('la propuesta conserva el patrón diario real cuando existe', () => {
  assert.match(sql, /count\(distinct v\.fecha\) > 1/);
  assert.match(sql, /count\(distinct h\.fecha\) > 1/);
  assert.match(sql, /'histórico diario'::text/);
});

test('la función exige un usuario central y no queda expuesta a public', () => {
  assert.match(sql, /not public\.es_central\(\)/);
  assert.match(sql, /revoke all on function .* from public/);
  assert.match(sql, /grant execute on function .* to authenticated/);
});

test('solo Gerencia puede aprobar y el servidor recalcula antes de guardar', () => {
  assert.match(sql, /guardar_presupuesto_manual/);
  assert.match(sql, /rol_actual\(\) is distinct from 'gerencia'/);
  assert.match(sql, /select \* from public\.proponer_presupuesto_manual/);
  assert.match(sql, /Solo gerencia puede aprobar y guardar presupuestos/);
});

test('reparto mensual conserva totales sin negativos incluso con pocas unidades',async()=>{
const {PGlite}=await import('@electric-sql/pglite');
const db=await PGlite.create();try{
await db.exec(`create function rol_actual() returns text language sql as $$select 'gerencia'::text$$;create function es_central() returns boolean language sql as $$select true$$;create table origenes(codigo text,tipo text,activo boolean);insert into origenes values('T','propia',true);create table ventas(tienda_codigo text,fecha date,total numeric,anulada boolean);create table historico_importado(tienda_codigo text,fecha date,venta_total numeric,creditos numeric,equipos_contado_cantidad numeric,accesorios_cantidad numeric,utilidad_neta numeric);create table historico_mensual(tienda_codigo text,anio int,mes int,venta_total numeric,cred_uds numeric,cel_uds numeric,acc_uds numeric,utilidad_neta numeric);insert into historico_mensual values('T',2025,10,1000,8,39,239,0);`);
await db.exec(await readFile(new URL('../../supabase/migrations/20261002193345_presupuestos_reparto_sin_negativos.sql',import.meta.url),'utf8'));
for(const days of [28,29,30,31]){const target=days===28?'2027-02-01':days===29?'2028-02-01':days===30?'2026-04-01':'2026-10-01';const year=Number(target.slice(0,4))-1,month=Number(target.slice(5,7));await db.query('update historico_mensual set anio=$1,mes=$2',[year,month]);for(const units of [0,1,8,17,189,239,310,579])for(const pct of [0,20,25,30,1000]){await db.query('update historico_mensual set acc_uds=$1',[units]);const rows=(await db.query("select * from proponer_presupuesto_manual('T',$1,'meta_uds_acc',$2)",[target,pct])).rows;assert.equal(rows.length,days);assert(rows.every(r=>Number(r.meta_propuesta)>=0&&Number(r.base_anterior)>=0));assert.equal(rows.reduce((s,r)=>s+Number(r.meta_propuesta),0),Math.round(units*(1+pct/100)));assert.equal(rows.reduce((s,r)=>s+Number(r.base_anterior),0),units);}}
console.log('160 escenarios: totales exactos, ningún día negativo, meses de 28/29/30/31 días.');
}finally{await db.close();}

});
