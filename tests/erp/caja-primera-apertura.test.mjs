import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const migration=await readFile(new URL('../../supabase/migrations/20260926221259_caja_primera_apertura_sin_doble_descuento.sql',import.meta.url),'utf8');
let db;
const calcular=async(fecha='2026-09-26',tienda='TEST-A')=>(await db.query('select public.caja_calcular_interno($1,$2) c',[tienda,fecha])).rows[0].c;
const movimiento=(fecha,importe,tienda='TEST-A')=>db.query('insert into flujo values($1,$2,$3)',[tienda,fecha,importe]);
const cierre=(fecha,apertura,esperado,contado,arrastre=0,tienda='TEST-A')=>db.query("insert into caja_diaria(tienda_codigo,fecha,estado,apertura,efectivo_esperado,efectivo_contado,arrastre_movimientos_incorporado) values($1,$2,'cerrada',$3,$4,$5,$6)",[tienda,fecha,apertura,esperado,contado,arrastre]);
const nuevoCierre=async(fecha,tienda='TEST-A')=>{const c=await calcular(fecha,tienda);await cierre(fecha,c.apertura,c.esperado,c.esperado,c.arrastre_movimientos_total,tienda);return c;};
before(async()=>{
  db=await PGlite.create();
  await db.exec(`create role anon;create role authenticated;
    create table caja_diaria(id bigint generated always as identity primary key,tienda_codigo text,fecha date,estado text,
      apertura numeric,efectivo_esperado numeric,efectivo_contado numeric,arrastre_movimientos_incorporado numeric not null default 0,unique(tienda_codigo,fecha));
    create table caja_ciclo_config(id boolean primary key,fecha_inicio date);insert into caja_ciclo_config values(true,'2026-09-21');
    create table flujo(tienda text,fecha date,importe numeric);
    create function caja_componentes_rango(text,date,date) returns jsonb language sql stable as $$
      select jsonb_build_object('neto',coalesce(sum(importe),0)) from flujo where tienda=$1 and fecha between $2 and $3 $$;`);
  await db.exec(migration);
});
beforeEach(async()=>{await db.exec('reset role;truncate caja_diaria,flujo;');});
after(async()=>db?.close());

test('Creditel Chinú: conserva 2.995.400 contados y resta solo 2.585.000 reales',async()=>{
  await movimiento('2026-09-20',2427800);
  await movimiento('2026-09-21',567600);
  await cierre('2026-09-21',2427800,2995400,2995400,2427800);
  await movimiento('2026-09-22',-1805000);await movimiento('2026-09-23',-780000);
  const antes=(await db.query('select * from caja_diaria')).rows;
  const flujo=(await db.query('select * from flujo')).rows;
  for(let i=0;i<3;i++){
    const c=await calcular();assert.equal(c.apertura_cierre_anterior,2995400);
    assert.equal(c.ajuste_arrastre_movimientos,-2585000);assert.equal(c.esperado,410400);
  }
  assert.deepEqual((await db.query('select * from caja_diaria')).rows,antes);
  assert.deepEqual((await db.query('select * from flujo')).rows,flujo);
  assert.equal((await calcular('2026-09-21')).esperado,2995400,'el primer día no cambia');
});

test('primer cierre y dos cierres posteriores no pierden ni duplican su apertura',async()=>{
  await movimiento('2026-09-20',2427800);await movimiento('2026-09-21',567600);
  await nuevoCierre('2026-09-21');assert.equal((await calcular('2026-09-22')).esperado,2995400);
  await movimiento('2026-09-22',-1805000);await nuevoCierre('2026-09-22');
  await movimiento('2026-09-23',-780000);await nuevoCierre('2026-09-23');
  assert.equal((await calcular('2026-09-24')).esperado,410400);assert.equal((await calcular()).ajuste_arrastre_movimientos,0);
});

test('movimiento tardío posterior al primer cierre entra una sola vez tras nuevos cierres',async()=>{
  await movimiento('2026-09-20',1000);await nuevoCierre('2026-09-21');
  await movimiento('2026-09-21',-200);
  const c=await nuevoCierre('2026-09-22');assert.equal(c.esperado,800);assert.equal(c.arrastre_movimientos_total,-200);
  assert.equal((await calcular('2026-09-23')).esperado,800);
  await movimiento('2026-09-21',50);assert.equal((await calcular('2026-09-23')).esperado,850);
  await nuevoCierre('2026-09-23');assert.equal((await calcular()).esperado,850);
});

test('conserva el conteo físico y diferencias autorizadas; no reemplaza por ventas históricas',async()=>{
  await movimiento('2026-09-20',1000);await movimiento('2026-09-21',100);
  await cierre('2026-09-21',1000,1100,1050,1000);
  assert.equal((await calcular()).esperado,1050);
  await movimiento('2026-09-19',99999);assert.equal((await calcular()).esperado,1050,'la apertura del primer cierre es el ancla declarada');
});

test('ajustes de auditoría ya incluidos en el neto cerrado no se repiten',async()=>{
  await cierre('2026-09-23',1000,1000,1000);
  await movimiento('2026-09-24',400);await nuevoCierre('2026-09-24');
  await movimiento('2026-09-25',-150);await nuevoCierre('2026-09-25');
  assert.equal((await calcular()).esperado,1250);assert.equal((await calcular()).ajuste_arrastre_movimientos,0);
});

test('Chinucell: respeta cierres posteriores y ajuste autorizado; queda 537.849',async()=>{
  await cierre('2026-09-16',651400,651400,651400,651400);
  await cierre('2026-09-17',0,0,0,0);
  await movimiento('2026-09-18',3165594);
  await movimiento('2026-09-21',-2029250);await cierre('2026-09-21',3165594,1136344,1136344,3165594);
  await movimiento('2026-09-24',2761998);await cierre('2026-09-24',1136344,3898342,3898342,3165594);
  await movimiento('2026-09-25',-1413450);await cierre('2026-09-25',3898342,2484892,2484892,3165594);
  await movimiento('2026-09-26',-1554736);await movimiento('2026-09-26',-392307);
  assert.equal((await calcular()).esperado,537849);
});

test('sin cierre muestra todo el flujo; cajas abiertas no sustituyen el ancla y tiendas se aíslan',async()=>{
  await movimiento('2026-09-20',100);await movimiento('2026-09-26',25);await movimiento('2026-09-27',10000);
  await movimiento('2026-09-20',300,'TEST-B');
  await db.exec("insert into caja_diaria(tienda_codigo,fecha,estado,efectivo_contado) values('TEST-A','2026-09-21','abierta',9999)");
  assert.equal((await calcular()).esperado,125);assert.equal((await calcular()).apertura_sin_arqueo,true);
  assert.equal((await calcular('2026-09-26','TEST-B')).esperado,300);
});

test('precisión exacta, idempotencia de migración y helper privado',async()=>{
  await movimiento('2026-09-20',1000.25);await nuevoCierre('2026-09-21');await movimiento('2026-09-22',-0.01);
  assert.equal((await calcular()).esperado,1000.24);await nuevoCierre('2026-09-23');
  await db.exec(migration);assert.equal((await calcular()).esperado,1000.24);
  for(const rol of ['anon','authenticated']) assert.equal((await db.query("select has_function_privilege($1,'public.caja_calcular_interno(text,date)','execute') permitido",[rol])).rows[0].permitido,false);
  assert.doesNotMatch(migration,/\b(?:insert\s+into|update|delete\s+from|truncate)\b/i,'no modifica datos contables');
});
