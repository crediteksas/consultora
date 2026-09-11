import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const sql=readFileSync(new URL('../../supabase/migrations/20260911194715_conciliacion_retail_no_bloquea_liquidacion.sql',import.meta.url),'utf8');
test('conciliación tardía no bloquea; conserva cierres, otras alertas y abonos',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`
   create table liquidations(id int,approved_at timestamptz,frozen_at timestamptz);
   create table liquidation_operations(id int,liquidation_id int,tipo_establecimiento text);
   create table liquidation_incidents(id serial,operation_id int,liquidation_id int,tipo text,descripcion text,bloquea_aprobacion boolean,estado text default 'abierta');
   create table cuenta_corriente(id int,monto numeric);
   insert into cuenta_corriente values(1,123);
   insert into liquidations values(1,null,null),(2,now(),now());
   insert into liquidation_operations values(1,1,'propia'),(2,2,'propia'),(3,1,'aliado');
   insert into liquidation_incidents(operation_id,liquidation_id,tipo,descripcion,bloquea_aprobacion)
   values(1,1,'imei_sin_venta_vinculada','original',true),(1,1,'imei_no_existe','original',true),
   (1,1,'imei_duplicado','original',true),(1,1,'imei_otra_tienda','original',true),
   (2,2,'imei_sin_venta_vinculada','original',true),(3,1,'imei_no_existe','original',true);
   create function aliados_resolver_operaciones_propias(uuid) returns integer language plpgsql as $$
   begin
    insert into liquidation_incidents(operation_id,liquidation_id,tipo,descripcion,bloquea_aprobacion)
    values(1,1,'imei_sin_venta_vinculada','El IMEI está en el inventario de la tienda correcta, pero no tiene una venta con crédito válido vinculada en KORA. Revisar la conciliación de esta operación sin volver a liquidarla ni duplicar el abono.',true),
    (1,1,'imei_no_existe','El IMEI no tiene una venta o crédito válido en KORA',true);
    return 0;
   end; $$;
  `);
  await db.exec(sql);
  const rows=(await db.query('select * from liquidation_incidents order by id')).rows;
  assert.deepEqual(rows.map(r=>r.bloquea_aprobacion),[false,false,true,true,true,true]);
  assert.ok(rows.every(r=>r.estado==='abierta'));
  await db.exec('select aliados_resolver_operaciones_propias(null)');
  assert.deepEqual((await db.query('select bloquea_aprobacion from liquidation_incidents where id>6')).rows.map(r=>r.bloquea_aprobacion),[false,false]);
  assert.equal((await db.query('select count(*)::int n from cuenta_corriente')).rows[0].n,1);
  assert.equal((await db.query('select monto from cuenta_corriente')).rows[0].monto,'123');
  assert.equal((await db.query('select count(*)::int n from liquidations where approved_at is not null')).rows[0].n,1);
 } finally {await db.close();}
});
