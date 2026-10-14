import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

const leer=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');
const base=await leer('supabase/migrations/20260925161938_banco_abonos_proveedores_final.sql');
const destinos=await leer('supabase/migrations/20260924205132_b2b_client_payment_destinations.sql');
const vigente=await leer('supabase/migrations/20261006190104_proveedores_saldos_a_favor.sql');
const tesoreria=await leer('creditek/erp/migrations/20260805_tesoreria_tercerizacion_b2b.sql');
const parche=await leer('supabase/migrations/20261014224147_b2b_abonos_banco_unico.sql');
const pagina=await leer('creditek/erp/cartera-b2b.html');
const gerente='11111111-1111-4111-8111-111111111111';
const auditor='22222222-2222-4222-8222-222222222222';
const tienda='33333333-3333-4333-8333-333333333333';
const cuenta='44444444-4444-4444-8444-444444444444';
const soporte='b2b/clientes/PRUEBA/comprobante.pdf';
function tabla(sql,nombre){const inicio=sql.indexOf('create table public.'+nombre+' (');assert.ok(inicio>=0);return sql.slice(inicio,sql.indexOf('\n);',inicio)+4);}
function privada(nombre){const inicio=vigente.indexOf('CREATE OR REPLACE FUNCTION proveedores_control_private.'+nombre+'(');assert.ok(inicio>=0);return vigente.slice(inicio,vigente.indexOf('$function$;',vigente.indexOf('AS $function$',inicio))+11);}
async function fixture(){
  const db=await PGlite.create();
  await db.exec(`
    create role anon;create role authenticated;
    create schema auth;create schema kora_private;create schema proveedores_control_private;
    grant usage on schema auth,proveedores_control_private to authenticated;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table perfiles(id uuid primary key,rol text,activo boolean);
    insert into perfiles values('${gerente}','gerencia',true),('${auditor}','auditoria',true),('${tienda}','admin_tienda',true);
    create table origenes(codigo text primary key,nombre text,tipo text,activo boolean);
    insert into origenes values('PRUEBA','Cliente ficticio','cliente_b2b',true);
    create table cuentas_cartera(id uuid primary key,tienda_codigo text,tipo_cuenta text,activo boolean);
    insert into cuentas_cartera values('${cuenta}','PRUEBA','cliente_b2b',true);
    create table movimientos_cartera(id uuid primary key default gen_random_uuid(),cuenta_id uuid,tienda_codigo text,
      efecto text,monto numeric,concepto text,referencia_tipo text,referencia_id text,fecha_efectiva date,metadatos jsonb,creado_por uuid);
    insert into movimientos_cartera(cuenta_id,tienda_codigo,efecto,monto) values('${cuenta}','PRUEBA','debito',10000);
    create table proveedores(id uuid primary key default gen_random_uuid(),nombre text,activo boolean default true);
    create table facturas_proveedor(id uuid primary key default gen_random_uuid(),proveedor_id uuid,numero text,
      fecha date,created_at timestamptz default now(),total numeric,saldo numeric);
    create table pagos_proveedor(id uuid primary key default gen_random_uuid(),factura_id uuid,proveedor_id uuid,
      monto numeric,fecha date,metodo text,referencia text,soporte_path text,nota text,registrado_por uuid,idempotency_key uuid unique);
    create table audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
    create table treasury_unit_balances(unit text primary key,balance numeric,updated_at timestamptz default now());
    insert into treasury_unit_balances values('b2b',100,now());
    create table treasury_movements(id uuid primary key default gen_random_uuid(),unit text,direction text,type text,
      beneficiary text,concept text,amount numeric,destination_account text,movement_date date,support_path text,
      balance_before numeric,balance_after numeric,status text,requested_by uuid,authorized_by uuid,paid_by uuid,
      idempotency_key text unique,created_at timestamptz default now(),updated_at timestamptz default now());
    create table banco_creditek_pagos_proveedor(id uuid primary key);
  `);
  await db.exec(tabla(base,'banco_creditek_cuentas'));
  await db.exec(tabla(base,'banco_creditek_movimientos'));
  await db.exec(`
    create table cobros_deposits(id uuid primary key,estado text,created_by uuid,fuente_tipo text,cuenta_ultimos4 text,
      importe numeric,created_at timestamptz,plataforma text,referencia text,soporte text);
    create table payment_orders(id uuid primary key,estado text,fecha_pagada timestamptz,authorized_by uuid,
      soporte_path text,historico_inicial boolean,bank_snapshot jsonb,payment_kind text,valor numeric,concept text,paid_by uuid);
    create table financial_entries(id uuid primary key,status text,business_unit text,paid_at timestamptz,
      paid_by uuid,support_path text,amount numeric,concept text);
    create function public.finanzas_registrar_pago(uuid,text) returns public.financial_entries
      language sql as $$select * from financial_entries limit 1$$;
  `);
  await db.exec(await leer('supabase/migrations/20260930213125_banco_movimientos_reales.sql'));
  await db.exec(await leer('supabase/migrations/20261002195421_banco_reverso_cobro_anulado.sql'));
  // Esquema real y RPC privada vigente, no una simulación del abono.
  await db.exec(destinos.slice(destinos.indexOf('create table public.abonos_clientes_b2b_destino'),destinos.indexOf('alter table public.treasury_movements')));
  const saldoInicio=tesoreria.indexOf('create or replace function public.tesoreria_aplicar_saldo(');
  await db.exec(tesoreria.slice(saldoInicio,tesoreria.indexOf('-- El motor vigente',saldoInicio)));
  await db.exec(privada('registrar_abono_cliente_b2b_destino'));
  await db.exec(privada('registrar_pago_proveedor'));
  await db.exec(`create function public.registrar_pago_proveedor(uuid,numeric,date,text,text,text,text,uuid)
    returns jsonb language sql as $$select proveedores_control_private.registrar_pago_proveedor($1,$2,$3,$4,$5,$6,$7,$8)$$`);
  const wrapperInicio=vigente.indexOf('create or replace function public.registrar_abono_cliente_b2b_destino(');
  await db.exec(vigente.slice(wrapperInicio,vigente.indexOf('create or replace function public.decidir_instruccion_consignacion',wrapperInicio)));
  await db.exec(`
    alter table banco_creditek_cuentas enable row level security;
    alter table banco_creditek_movimientos enable row level security;
    insert into banco_creditek_cuentas(titular,numero_cuenta,banco,tipo_cuenta,saldo_inicial,saldo_actual,
      fecha_corte,sincronizado_por,sincronizado_at)
    values('Empresa ficticia','87600004006','Banco de prueba','ahorros',1000,1000,current_date-3,'${gerente}',now());
    set request.jwt.claim.sub='${gerente}';
  `);
  const fila=async(q,args=[])=> (await db.query(q,args)).rows[0];
  const estado=()=>fila(`select
    (select saldo_actual from banco_creditek_cuentas) banco,
    (select balance from treasury_unit_balances where unit='b2b') tesoreria,
    (select sum(case when efecto='debito' then monto else -monto end) from movimientos_cartera) cartera,
    (select count(*)::int from banco_creditek_movimientos) ingresos,
    (select count(*)::int from abonos_clientes_b2b_destino) abonos,
    (select count(*)::int from treasury_movements) movimientos_tesoreria`);
  const fecha=(await fila("select ((now() at time zone 'America/Bogota')::date-1)::text fecha")).fecha;
  const abonar=async({id=randomUUID(),destino='creditek',proveedor=null,monto=120,dia=fecha}={})=>
    (await fila('select registrar_abono_cliente_b2b_destino($1,$2,$3,$4,$5,$6,$7,$8) resultado',
      [id,'PRUEBA',dia,monto,destino,proveedor,'REF-'+id,soporte])).resultado;
  return {db,fila,estado,abonar,fecha};
}

test('abonos externos B2B: Banco, cartera y Tesorería son atómicos; no se reaplica el historial',async t=>{
  const f=await fixture();
  try{
    const historico=await f.abonar({monto:50});
    const previo=await f.estado();
    assert.equal(Number(previo.banco),1000);
    await f.db.exec(parche);
    assert.deepEqual(await f.estado(),previo,'la migración no cambia abonos ni saldos existentes');

    await t.test('el abono nuevo reduce deuda y aumenta únicamente Banco exactamente una vez',async()=>{
      const id=randomUUID();
      await f.db.exec('set role authenticated');
      const resultado=await f.abonar({id});
      await f.db.exec('reset role');
      const actual=await f.estado();
      assert.equal(Number(actual.banco),1120);assert.equal(Number(actual.cartera),9830);assert.equal(Number(actual.tesoreria),150);
      const movimiento=await f.fila('select * from banco_creditek_movimientos where fuente_id=$1',[id]);
      assert.equal(movimiento.tipo,'ingreso_cliente_b2b');assert.equal(movimiento.fuente_tabla,'abonos_clientes_b2b_destino');
      assert.equal(Number(movimiento.saldo_antes),1000);assert.equal(Number(movimiento.saldo_despues),1120);
      assert.equal(new Date(movimiento.fecha).toISOString().slice(0,10),f.fecha);assert.equal(movimiento.soporte_path,soporte);assert.equal(movimiento.registrado_por,gerente);
      assert.equal(new Date(movimiento.ocurrido_at).toISOString(),f.fecha+'T05:00:00.000Z');
      assert.equal((await f.abonar({id})).reutilizado,true);
      await assert.rejects(f.abonar({id,monto:121}),/identificador ya corresponde/);
      assert.deepEqual(await f.estado(),actual);
      assert.ok(resultado.movimiento_cartera_id&&resultado.movimiento_tesoreria_id);
    });

    await t.test('reintentar un abono previo al parche no lo suma retroactivamente a Banco',async()=>{
      const antes=await f.estado();assert.equal((await f.abonar({id:historico.id,monto:50})).reutilizado,true);
      assert.deepEqual(await f.estado(),antes);
    });

    await t.test('pago directo a proveedor reduce ambas deudas, sin entrada ni salida de Banco',async()=>{
      const proveedor=randomUUID();await f.db.query('insert into proveedores(id,nombre) values($1,$2)',[proveedor,'Proveedor ficticio']);
      await f.db.query('insert into facturas_proveedor(proveedor_id,fecha,total,saldo) values($1,current_date,500,500)',[proveedor]);
      const antes=await f.estado();const id=randomUUID();
      await f.abonar({id,destino:'proveedor',proveedor,monto:75});
      const actual=await f.estado();
      assert.equal(actual.banco,antes.banco);assert.equal(actual.tesoreria,antes.tesoreria);
      assert.equal(actual.ingresos,antes.ingresos);assert.equal(Number(actual.cartera),Number(antes.cartera)-75);
      assert.equal(Number((await f.fila('select saldo from facturas_proveedor where proveedor_id=$1',[proveedor])).saldo),425);
      await f.abonar({id,destino:'proveedor',proveedor,monto:75});assert.deepEqual(await f.estado(),actual);
    });

    await t.test('un crédito interno de Tesorería no se convierte en ingreso bancario',async()=>{
      const antes=await f.estado();
      await f.db.exec("insert into treasury_movements(unit,direction,type,status,amount) values('b2b','credit','compensacion_retail','pagado',25)");
      const actual=await f.estado();assert.equal(actual.banco,antes.banco);assert.equal(actual.ingresos,antes.ingresos);
    });

    await t.test('apertura faltante aborta el abono completo, incluida la reducción de cartera',async()=>{
      await f.db.exec('begin;update banco_creditek_cuentas set saldo_inicial=null,saldo_actual=null,fecha_corte=null,sincronizado_por=null,sincronizado_at=null');
      await assert.rejects(f.abonar(),/saldo inicial de Banco/);await f.db.exec('rollback');
      const antes=await f.estado();
      await f.db.exec('begin;update banco_creditek_cuentas set activa=false');
      await assert.rejects(f.abonar(),/saldo inicial de Banco/);await f.db.exec('rollback');assert.deepEqual(await f.estado(),antes);
    });

    await t.test('fecha del corte/anterior/futura no duplica apertura ni deja registros parciales',async()=>{
      const antes=await f.estado();const corte=await f.fila('select fecha_corte::text dia from banco_creditek_cuentas');
      const pasada=await f.fila('select (fecha_corte-1)::text dia from banco_creditek_cuentas');
      for(const dia of [corte.dia,pasada.dia])await assert.rejects(f.abonar({dia}),/posterior al corte de Banco/);
      const futura=await f.fila("select ((now() at time zone 'America/Bogota')::date+1)::text dia");
      await assert.rejects(f.abonar({dia:futura.dia}),/no puede ser futura/);assert.deepEqual(await f.estado(),antes);
      // El día de corte se interpreta en Bogotá incluso si UTC ya es el día siguiente.
      await f.db.exec('begin');
      await f.db.query('update banco_creditek_cuentas set fecha_corte_at=$1',[f.fecha+'T02:00:00Z']);
      await f.abonar({monto:1});await f.db.exec('rollback');assert.deepEqual(await f.estado(),antes);
    });

    await t.test('si falla la escritura bancaria, tampoco quedan abono, cartera ni Tesorería',async()=>{
      const antes=await f.estado();
      await f.db.exec("alter table banco_creditek_movimientos add constraint rechazo_prueba check(tipo<>'ingreso_cliente_b2b') not valid");
      await assert.rejects(f.abonar(),/rechazo_prueba/);
      await f.db.exec('alter table banco_creditek_movimientos drop constraint rechazo_prueba');assert.deepEqual(await f.estado(),antes);
    });

    await t.test('un enlace de Tesorería inconsistente se rechaza y revierte todo el abono',async()=>{
      const antes=await f.estado();
      for(const cambio of ["new.amount:=new.amount+1", "new.unit:='tercerizacion'", "new.direction:='debit'",
        "new.type:='compensacion_retail'", "new.status:='pendiente'", "new.movement_date:=new.movement_date-1",
        "new.support_path:='otro.pdf'", "new.idempotency_key:='otra-clave'", `new.paid_by:='${auditor}'`]){
        await f.db.exec(`create or replace function alterar_tesoreria_prueba() returns trigger language plpgsql as
          $$begin ${cambio};return new;end$$;
          create trigger alterar_tesoreria_prueba before insert on treasury_movements for each row execute function alterar_tesoreria_prueba()`);
        await assert.rejects(f.abonar(),/no coincide con su ingreso autorizado/);
        await f.db.exec('drop trigger alterar_tesoreria_prueba on treasury_movements');assert.deepEqual(await f.estado(),antes);
      }
      await f.db.exec('drop function alterar_tesoreria_prueba()');
    });

    await t.test('permisos: administrador de tienda, anónimo e inactivo no registran abonos',async()=>{
      const antes=await f.estado();
      for(const actor of [tienda,'']){
        await f.db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
        await assert.rejects(f.abonar(),/Solo Gestión o Gerencia/);
      }
      await f.db.exec(`set request.jwt.claim.sub='${gerente}';update perfiles set activo=false where id='${gerente}'`);
      await assert.rejects(f.abonar(),/Solo Gestión o Gerencia/);
      await f.db.exec(`update perfiles set activo=true where id='${gerente}';set role authenticated`);
      await assert.rejects(f.db.exec("insert into abonos_clientes_b2b_destino(id) values(gen_random_uuid())"),/permission denied/);
      await assert.rejects(f.db.exec('update banco_creditek_cuentas set saldo_actual=99999'),/permission denied/);
      await f.db.exec('reset role');
      assert.equal((await f.fila("select has_function_privilege('authenticated','kora_private.banco_creditek_abono_b2b_trigger()','execute') permitido")).permitido,false);
      assert.equal((await f.fila("select has_function_privilege('anon','kora_private.banco_creditek_abono_b2b_trigger()','execute') permitido")).permitido,false);
      assert.deepEqual(await f.estado(),antes);
    });

    await t.test('auditor autorizado y varios abonos mantienen continuidad de saldos sin duplicados',async()=>{
      await f.db.exec(`set request.jwt.claim.sub='${auditor}'`);const antes=await f.estado();
      const ids=[randomUUID(),randomUUID()];
      await Promise.all(ids.map(id=>f.abonar({id,monto:10})));
      await Promise.all(ids.map(id=>f.abonar({id,monto:10})));
      const actual=await f.estado();assert.equal(Number(actual.banco),Number(antes.banco)+20);
      assert.equal(Number(actual.cartera),Number(antes.cartera)-20);assert.equal(actual.ingresos,antes.ingresos+2);
      assert.equal(Number(actual.tesoreria),Number(antes.tesoreria));
      assert.match(parche,/for update/,'la serialización entre sesiones reales se mantiene con el candado de la cuenta');
    });

    await t.test('plataformas y gastos conservan sus signos y no generan un segundo ingreso B2B',async()=>{
      const antes=await f.estado();
      await f.db.query(`insert into cobros_deposits(id,estado,created_by,fuente_tipo,cuenta_ultimos4,importe,created_at,plataforma,referencia,soporte)
        values($1,'activo',$2,'abono_bancario','4006',30,now(),'payjoy','PRUEBA', $3)`,[randomUUID(),auditor,soporte]);
      await f.db.query(`insert into treasury_movements(type,direction,status,paid_by,support_path,amount,concept)
        values('gasto_administrativo','debit','pagado',$1,$2,5,'Gasto ficticio')`,[auditor,soporte]);
      const actual=await f.estado();assert.equal(Number(actual.banco),Number(antes.banco)+25);
      assert.equal(actual.cartera,antes.cartera);assert.equal(actual.ingresos,antes.ingresos+2);
    });
  }finally{await f.db.close();}
});

test('formulario distingue deuda del cliente, Banco externo y pago directo al proveedor',()=>{
  assert.match(pagina,/A Banco Creditek · reduce cartera y aumenta Banco/);
  assert.match(pagina,/Directamente a un proveedor · reduce cartera, sin mover Banco/);
  assert.match(pagina,/las compensaciones internas no van aquí/);
  assert.match(pagina,/No aumenta ni disminuye Banco Creditek/);
  assert.doesNotMatch(pagina,/suma al saldo B2B|aumenta el saldo B2B de Tesorería/);
});
