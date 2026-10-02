import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cartas = require('../../creditek/erp/presupuestos-retail-cartas.js');

test('selecciona una tienda o todas sin aceptar códigos inexistentes', () => {
  const tiendas = [{ codigo: 'CK-01', nombre: 'Móvil Shopping' }, { codigo: 'CK-02', nombre: 'Celfiao' }];
  assert.equal(cartas.tiendasElegidas(tiendas, 'CK-02').length, 1);
  assert.equal(cartas.tiendasElegidas(tiendas, '__todas__').length, 2);
  assert.throws(() => cartas.tiendasElegidas(tiendas, 'CK-99'));
});

test('la carta incluye cuatro metas mensuales y el administrador sin mezclar tiendas', () => {
  const tienda = { codigo: 'CK-01', nombre: 'Móvil Shopping' };
  const filas = Array.from({ length: 31 }, (_, i) => ({
    tienda_codigo: 'CK-01', fecha: `2026-10-${String(i + 1).padStart(2, '0')}`,
    meta_venta_total: 1000, meta_creditos: 1, meta_uds_cel: 2,
    meta_uds_acc: 3, meta_utilidad: 100,
  }));
  filas.push({ ...filas[0], tienda_codigo: 'CK-02', meta_venta_total: 999999 });
  const resumen = cartas.resumen(tienda, '2026-10', filas, [
    { tienda_codigo: 'CK-01', nombre: 'Ana <Administradora>' },
  ]);
  assert.equal(resumen.completo, true);
  assert.equal(resumen.totales.meta_venta_total, 31000);
  assert.equal(resumen.totales.meta_creditos, 31);
  assert.equal(resumen.totales.meta_uds_cel, 62);
  assert.equal(resumen.totales.meta_uds_acc, 93);
  assert.equal(resumen.totales.meta_utilidad, undefined);
  const html = cartas.cartaHtml(resumen);
  assert.match(html, /Ana &lt;Administradora&gt;/);
  assert.doesNotMatch(html, /Detalle por día|<table/);
  assert.match(html, /Imprimir \/ guardar PDF/);
  assert.doesNotMatch(html, /Utilidad/);
  assert.doesNotMatch(html, /999999/);
});

test('no emite una carta si faltan días del presupuesto registrado', () => {
  const resumen = cartas.resumen({ codigo: 'CK-01', nombre: 'Tienda' }, '2026-10', [
    { tienda_codigo: 'CK-01', fecha: '2026-10-01', meta_creditos: 2 },
  ]);
  assert.equal(resumen.diasRegistrados, 1);
  assert.equal(resumen.completo, false);
  assert.throws(() => cartas.cartaHtml(resumen), /días sin presupuesto/);
});


test('premios se muestran solo guardados y activos, separados por nivel y con texto escapado',()=>{
 const c={completo:true,mes:'2026-10',tienda:{codigo:'T',nombre:'Tienda'},administradores:['Ana'],totales:{meta_venta_total:1000,meta_creditos:5,meta_uds_cel:10,meta_uds_acc:20}};
 assert.doesNotMatch(cartas.cartaHtml(c),/PREMIO POR CUMPLIMIENTO/);
 c.premio={activo:true,estrategia:'Octubre <especial>',premio_tres:100000,premio_cuatro:200000,revision:2};
 const html=cartas.cartaHtml(c);assert.match(html,/Octubre &lt;especial&gt;/);assert.match(html,/exactamente 3 de las 4/);assert.match(html,/Si cumples las 4/);assert.match(html,/no se suman/);assert.match(html,/100.000/);assert.match(html,/200.000/);
 const p=cartas.premioPayload(c.mes,c.premio,{activo:true,estrategia:'Octubre',tres:'100000',cuatro:'200000'});
 assert.equal(p.p_revision,2);assert.equal(p.p_tienda,undefined);assert.equal(p.p_mes,'2026-10-01');
 for(const v of ['-1','NaN','0.001','1000000001'])assert.throws(()=>cartas.premioPayload(c.mes,c.premio,{activo:true,estrategia:'E',tres:v,cuatro:''}));
 assert.throws(()=>cartas.premioPayload(c.mes,c.premio,{activo:true,estrategia:'E',tres:'',cuatro:''}));
 assert.equal(cartas.premioPayload(c.mes,c.premio,{activo:false,estrategia:'E',tres:'',cuatro:''}).p_premio_tres,null);
 c.accesoriosPendientes=true;assert.match(cartas.cartaHtml(c),/Pendiente de verificar/);assert.match(cartas.cartaHtml(c),/disabled title=/);
});

test('premio mensual: una configuración se conserva como borrador y Gerencia la activa para todas', async () => {
 const {PGlite}=await import('@electric-sql/pglite');const {readFile}=await import('node:fs/promises');const db=await PGlite.create();
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema presupuestos_control_private;
  create table auth.users(id uuid primary key);insert into auth.users values('00000000-0000-4000-8000-000000000001');
  create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
  grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
  create function public.rol_actual() returns text language sql as $$select coalesce(current_setting('test.rol',true),'gerencia')$$;
  create function public.es_central() returns boolean language sql as $$select public.rol_actual() in ('gerencia','auditoria')$$;
  create table public.origenes(codigo text primary key,tipo text,activo boolean);
  insert into origenes values('A','propia',true),('B','propia',true);`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261002201550_presupuesto_premios_por_cumplimiento.sql',import.meta.url),'utf8'));
  await db.exec("insert into presupuesto_premios(tienda_codigo,mes,activo,estrategia,premio_tres,premio_cuatro,revision,actualizado_por) values('A','2026-10-01',false,'Premio guardado',300000,500000,1,'00000000-0000-4000-8000-000000000001')");
  await db.exec(await readFile(new URL('../../supabase/migrations/20261002205030_premio_mensual_retail.sql',import.meta.url),'utf8'));
  await db.exec('set role authenticated');
  const inicial=(await db.query("select * from presupuesto_premio_mensual where mes='2026-10-01'")).rows[0];
  assert.equal(inicial.activo,false);assert.equal(inicial.premio_tres,'300000.00');assert.equal(inicial.revision,1);
  const save=(revision=1,mes='2026-10-01')=>db.query("select guardar_presupuesto_premio_mensual($1,true,'Premio general',300000,500000,$2) r",[mes,revision]);
  const guardado=(await save()).rows[0].r;assert.equal(guardado.activo,true);assert.equal(guardado.revision,2);
  await assert.rejects(()=>save(),/otra sesión/);
  await assert.rejects(()=>db.exec('update presupuesto_premio_mensual set premio_tres=1'),/permission denied/);
  await db.exec("select set_config('test.rol','admin_tienda',false)");
  await assert.rejects(()=>save(0,'2026-11-01'),/Solo Gerencia/);
  assert.equal((await db.query('select count(*)::int n from presupuesto_premio_mensual')).rows[0].n,0);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from presupuestos_control_private.premios_mensuales_historial')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from presupuesto_premios')).rows[0].n,1,'ficha vieja se conserva sin alterarla');
 } finally { await db.close(); }
});

test('premios: Gerencia guarda con auditoría, aislamiento y revisión; demás roles no escriben',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const {readFile}=await import('node:fs/promises');const db=await PGlite.create();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema presupuestos_control_private;
 create table auth.users(id uuid primary key);insert into auth.users values('00000000-0000-4000-8000-000000000001');
 create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create function public.rol_actual() returns text language sql as $$select coalesce(current_setting('test.rol',true),'gerencia')$$;
 create function public.es_central() returns boolean language sql as $$select public.rol_actual() in ('gerencia','auditoria')$$;
 create table public.origenes(codigo text primary key,tipo text,activo boolean);insert into origenes values('A','propia',true),('B','propia',true),('C','aliado',true);`);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261002201550_presupuesto_premios_por_cumplimiento.sql',import.meta.url),'utf8'));
 const save=(code='A',month='2026-10-01',revision=0,three=100000)=>db.query("select guardar_presupuesto_premio($1,$2,true,'Octubre',$3,200000,$4) r",[code,month,three,revision]);
 await db.exec('set role authenticated');
 const a=(await save()).rows[0].r;assert.equal(a.revision,1);assert.equal(a.premio_tres,100000);
 await assert.rejects(()=>save(),/otra sesión/);
 await save('A','2026-10-01',1,150000);await save('B');await save('A','2026-11-01');
 await assert.rejects(()=>save('C'),/Retail activa/);await assert.rejects(()=>save('A','2026-12-01',0,-1),/premio válido/);
 await assert.rejects(()=>db.exec("update presupuesto_premios set premio_tres=9"),/permission denied/);
 await db.exec("select set_config('test.rol','auditoria',false)");
 assert.equal((await db.query('select count(*)::int n from presupuesto_premios')).rows[0].n,3);
 await assert.rejects(()=>save('B','2026-11-01'),/Solo Gerencia/);
 await db.exec("select set_config('test.rol','admin_tienda',false)");
 assert.equal((await db.query('select count(*)::int n from presupuesto_premios')).rows[0].n,0);
 await assert.rejects(()=>save('B','2026-11-01'),/Solo Gerencia/);
 await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int n from presupuestos_control_private.premios_historial')).rows[0].n,4);
 assert.equal((await db.query("select premio_tres from presupuesto_premios where tienda_codigo='B'")).rows[0].premio_tres,'100000.00');
 }finally{await db.close();}
});
