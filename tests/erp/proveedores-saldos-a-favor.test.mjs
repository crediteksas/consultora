import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

const leer=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');
const sql=await leer('supabase/migrations/20261006190104_proveedores_saldos_a_favor.sql');
const banco=await leer('supabase/migrations/20260925161938_banco_abonos_proveedores_final.sql');
const ajustes=await leer('supabase/migrations/20261001202848_proveedores_ajustes_y_retenciones.sql');
const maite='d1782db6-bacc-4caf-af6f-ce1b8d1c0391',oscar='6de0ad26-64af-4966-8cd9-d468880af627';
const soporte='aliados/tesoreria/prueba.pdf';
async function fixture(){
  const db=await PGlite.create();
  await db.exec(`
    create role anon;create role authenticated;create schema auth;create schema storage;create schema kora_private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create table public.perfiles(id uuid primary key,activo boolean,rol text);
    insert into perfiles values('${maite}',true,'auditoria'),('${oscar}',true,'gerencia');
    grant select on perfiles to authenticated;
    create table public.proveedores(id uuid primary key default gen_random_uuid(),nombre text,activo boolean default true);
    create table public.facturas_proveedor(id uuid primary key default gen_random_uuid(),proveedor_id uuid references proveedores(id),
      numero text,fecha date,total numeric,saldo numeric,nota text,soporte_path text,origen_registro text,registrado_por uuid,created_at timestamptz default now());
    create table public.pagos_proveedor(id uuid primary key default gen_random_uuid(),factura_id uuid,proveedor_id uuid,monto numeric,
      fecha date,metodo text,referencia text,soporte_path text,nota text,registrado_por uuid,idempotency_key uuid unique);
    create table public.audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
    create table storage.objects(bucket_id text,name text);
    insert into storage.objects values('soportes','${soporte}');
    create table kora_private.cuenta_recaudo_creditek(id boolean,titular text,numero_cuenta text,banco text,tipo_cuenta text,activa boolean);
    insert into kora_private.cuenta_recaudo_creditek values(true,'Creditek','87600004006','Bancolombia','Ahorros',true);
    create function public.registrar_pago_proveedor(uuid,numeric,date,text,text,text,text,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.registrar_pago_proveedor_desde_saldo_b2b(uuid,uuid,numeric,date,text,text,text,text) returns jsonb language sql as $$select '{}'::jsonb$$;
    create table public.treasury_movements(id uuid default gen_random_uuid(),unit text,direction text,type text,beneficiary text,
      concept text,amount numeric,destination_account text,movement_date date,support_path text,supplier_id uuid,supplier_invoice_id uuid,
      balance_before numeric,balance_after numeric,status text,requested_by uuid,authorized_by uuid,paid_by uuid,idempotency_key text);
    create table public.disponibilidad_b2b(saldo numeric);insert into disponibilidad_b2b values(1000);
    create function public.tesoreria_aplicar_saldo(p_unit text,p_direction text,p_amount numeric,p_key text) returns jsonb language plpgsql as $$
    declare previo numeric;siguiente numeric;begin
      select saldo into previo from public.disponibilidad_b2b for update;
      siguiente:=previo+case when p_direction='debit' then -p_amount else p_amount end;
      if siguiente<0 then raise exception 'Fondos B2B insuficientes';end if;
      update public.disponibilidad_b2b set saldo=siguiente;return jsonb_build_object('before',previo,'after',siguiente);
    end$$;
    create table public.abonos_clientes_b2b_destino(id uuid,cliente_codigo text,fecha date,monto numeric,destino text,
      proveedor_id uuid,referencia_bancaria text,soporte_path text,movimiento_cartera_id uuid,movimiento_tesoreria_id uuid,registrado_por uuid);
    create table public.origenes(codigo text,nombre text,tipo text,activo boolean);
    create table public.cuentas_cartera(id uuid,tienda_codigo text,tipo_cuenta text,activo boolean);
    create table public.movimientos_cartera(id uuid default gen_random_uuid(),cuenta_id uuid,tienda_codigo text,efecto text,monto numeric,
      concepto text,referencia_tipo text,referencia_id text,fecha_efectiva date,metadatos jsonb,creado_por uuid);
    create table public.aplicaciones_abono_cliente_b2b_proveedor(abono_id uuid,factura_id uuid,pago_id uuid,monto numeric,orden integer);
    create table public.instrucciones_consignacion(id uuid,estado text,tipo_destino text,proveedor_id uuid,tienda_codigo text,
      valor_esperado numeric,fecha date,decision_idempotency_key uuid,decidida_por uuid,decidida_at timestamptz,motivo_decision text);
    create table public.comprobantes_consignacion(id uuid,instruccion_id uuid,estado text,version integer,valor_confirmado numeric,
      soporte_path text,enviado_por uuid,decidido_por uuid,decidido_at timestamptz,motivo_decision text);
    create table public.abonos(id uuid default gen_random_uuid(),tienda_codigo text,monto numeric,soporte_path text,registrado_por uuid,
      fecha date,tipo_movimiento text,tercero text,concepto text,fuente_fondos text,observacion text,idempotency_key uuid,
      instruccion_id uuid,movimiento_caja_id uuid);
    create table public.cuenta_corriente(tienda_codigo text,tipo text,concepto text,monto numeric,referencia_tipo text,referencia_id uuid,usuario uuid);
    create table public.movimientos_caja_tienda(id uuid default gen_random_uuid(),tienda_codigo text,fecha date,tipo text,monto numeric,
      soporte_path text,observacion text,autorizado_por uuid,creado_por uuid,idempotency_key uuid);
    create table public.aplicaciones_consignacion_proveedor(instruccion_id uuid,factura_id uuid,pago_id uuid,monto_aplicado numeric,orden_fifo integer);
  `);
  await db.exec(banco);await db.exec(ajustes);await db.exec(sql);
  const proveedor=randomUUID();await db.query('insert into proveedores(id,nombre) values($1,$2)',[proveedor,'Prueba']);
  const login=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  const factura=async(saldo,fecha='2026-09-01')=>{
    const id=randomUUID();await db.query('insert into facturas_proveedor(id,proveedor_id,numero,fecha,total,saldo) values($1,$2,$3,$4,$5,$5)',[id,proveedor,id,fecha,saldo]);return id;
  };
  const total=async(tabla,columna)=>Number((await db.query(`select coalesce(sum(${columna}),0) n from ${tabla}`)).rows[0].n);
  const prepararGiro=async monto=>{
    const id=randomUUID();await login(maite);await db.query('select banco_creditek_solicitar_pago_proveedor($1,$2,$3,$4)',[id,proveedor,monto,'Abono real / anticipo']);
    await login(oscar);await db.query('select banco_creditek_decidir_pago_proveedor($1,true,null)',[id]);return id;
  };
  const girar=async id=>{await login(maite);return db.query('select banco_creditek_registrar_giro_proveedor($1,$2,$3,$4)',[id,'2026-10-06','REF-REAL',soporte]);};
  await login(oscar);await db.query('select banco_creditek_sincronizar_saldo(1000,$1,$2)',['2026-10-01','Saldo inicial de prueba']);
  return {db,proveedor,login,factura,total,prepararGiro,girar};
}

test('giro completo: FIFO a dos facturas y excedente trazado, Banco descontado una vez',async()=>{
  const f=await fixture();try{
    const a=await f.factura(100),b=await f.factura(200,'2026-09-20');
    const id=await f.prepararGiro(350);
    assert.equal(await f.total('pagos_proveedor','monto'),0);
    await f.girar(id);
    assert.equal(await f.total('banco_creditek_cuentas','saldo_actual'),650);
    assert.equal(await f.total('facturas_proveedor','saldo'),-50);
    assert.equal(await f.total('facturas_proveedor','total'),300);
    const aplicaciones=(await f.db.query('select factura_id,monto from banco_creditek_aplicaciones_proveedor order by orden')).rows;
    assert.deepEqual(aplicaciones.slice(0,2).map(x=>[x.factura_id,Number(x.monto)]),[[a,100],[b,200]]);
    const credito=(await f.db.query("select id,total,saldo,origen_registro from facturas_proveedor where origen_registro='anticipo_proveedor'")).rows[0];
    assert.equal(Number(credito.saldo),-50);assert.equal(Number(credito.total),0);
    assert.equal(aplicaciones[2].factura_id,credito.id);assert.equal(Number(aplicaciones[2].monto),50);
    assert.equal(await f.total('pagos_proveedor','monto'),350);
    assert.equal(await f.total('banco_creditek_pagos_proveedor','saldo_favor_generado'),50);
    await f.girar(id);
    assert.equal(await f.total('pagos_proveedor','monto'),350);assert.equal(await f.total('banco_creditek_cuentas','saldo_actual'),650);
    await assert.rejects(f.db.query('select banco_creditek_registrar_giro_proveedor($1,$2,$3,$4)',[id,'2026-10-06','OTRA-REF',soporte]),/otra evidencia/);
  }finally{await f.db.close();}
});

test('anticipo sin facturas: se permite crédito, pero no giro sin autorización/fondos/soporte',async()=>{
  const f=await fixture();try{
    const id=await f.prepararGiro(100);await f.girar(id);
    assert.equal(await f.total('facturas_proveedor','saldo'),-100);
    const segundo=await f.prepararGiro(25);await f.girar(segundo);
    assert.equal(await f.total('facturas_proveedor','saldo'),-125);
    const excesivo=await f.prepararGiro(900);
    await assert.rejects(f.girar(excesivo),/Saldo bancario insuficiente/);
    assert.equal(await f.total('banco_creditek_cuentas','saldo_actual'),875);
    assert.equal(await f.total('pagos_proveedor','monto'),125);
    const pendiente=randomUUID();await f.login(maite);
    await f.db.query('select banco_creditek_solicitar_pago_proveedor($1,$2,10,$3)',[pendiente,f.proveedor,'Sin autorización']);
    await assert.rejects(f.girar(pendiente),/autorización previa/);
    await f.db.exec("set role authenticated");
    await assert.rejects(f.db.query("update banco_creditek_pagos_proveedor set estado='pagado'"),/permission denied/);
    await assert.rejects(f.db.query("select proveedores_control_private.registrar_excedente($1,1,current_date,'x','x',null,'x',$2)",[f.proveedor,randomUUID()]),/permission denied/);
    await f.db.exec('reset role');
    assert.equal((await f.db.query("select has_function_privilege('anon','public.registrar_pago_proveedor(uuid,numeric,date,text,text,text,text,uuid)','execute') permitido")).rows[0].permitido,false);
  }finally{await f.db.close();}
});

test('descuento/garantía después de pagar: Maite prepara, Óscar autoriza, sin otro pago ni Banco',async()=>{
  const f=await fixture();try{
    const original=await f.factura(0),id=randomUUID();await f.login(maite);
    const preparar=(key,base,objetivo)=>f.db.query('select preparar_ajuste_proveedor($1,$2,$3,$4,$5)',[key,f.proveedor,base,objetivo,'Nota del proveedor por garantía NC-2026-01']);
    await preparar(id,0,-80);
    assert.equal(await f.total('facturas_proveedor','saldo'),0);
    await assert.rejects(f.db.query('select decidir_ajuste_proveedor($1,true,null)',[id]),/Solo Óscar/);
    await f.login(oscar);await f.db.query('select decidir_ajuste_proveedor($1,true,null)',[id]);
    await f.db.query('select decidir_ajuste_proveedor($1,true,null)',[id]);
    assert.equal(await f.total('facturas_proveedor','saldo'),-80);
    assert.equal(await f.total('banco_creditek_cuentas','saldo_actual'),1000);
    assert.equal(await f.total('pagos_proveedor','monto'),0);
    assert.equal(await f.total('facturas_proveedor','total'),0);
    assert.equal((await f.db.query('select saldo from facturas_proveedor where id=$1',[original])).rows[0].saldo,'0');
    await f.login(maite);const siguiente=randomUUID();await preparar(siguiente,-80,-100);
    await f.login(oscar);await f.db.query('select decidir_ajuste_proveedor($1,true,null)',[siguiente]);
    assert.equal(await f.total('facturas_proveedor','saldo'),-100);
    await f.login(maite);const stale=randomUUID();await preparar(stale,-100,-150);
    await f.db.query('update facturas_proveedor set saldo=saldo-1 where id=$1',[original]);
    await f.login(oscar);await assert.rejects(f.db.query('select decidir_ajuste_proveedor($1,true,null)',[stale]),/facturas cambiaron/);
    assert.equal(await f.total('facturas_proveedor','saldo'),-101);
  }finally{await f.db.close();}
});

test('pago directo y desde fondos B2B: conserva sobrepago y no duplica una salida',async()=>{
  const f=await fixture();try{
    const factura=await f.factura(100),id=randomUUID();await f.login(maite);
    const pagar=()=>f.db.query('select registrar_pago_proveedor($1,150,$2,$3,$4,null,$5,$6)',[factura,'2026-10-06','externo','REF-DIRECTA','Excedente real registrado',id]);
    await pagar();await pagar();assert.equal(await f.total('facturas_proveedor','saldo'),-50);
    assert.equal(await f.total('pagos_proveedor','monto'),150);
    const b2b=randomUUID();await f.db.query('select registrar_pago_proveedor_desde_saldo_b2b($1,$2,50,$3,$4,$5,$6,$7)',[b2b,factura,'2026-10-06','transferencia','REF-B2B',soporte,'Anticipo adicional']);
    await f.db.query('select registrar_pago_proveedor_desde_saldo_b2b($1,$2,50,$3,$4,$5,$6,$7)',[b2b,factura,'2026-10-06','transferencia','REF-B2B',soporte,'Anticipo adicional']);
    assert.equal(await f.total('facturas_proveedor','saldo'),-100);assert.equal(await f.total('disponibilidad_b2b','saldo'),950);
    assert.equal(await f.total('banco_creditek_cuentas','saldo_actual'),1000);
    await assert.rejects(f.db.query('select registrar_pago_proveedor($1,1,$2,null,null,null,null,$3)',[factura,'2026-10-06',randomUUID()]),/referencia y motivo/);
  }finally{await f.db.close();}
});

test('Luis consigna al proveedor por encima de la deuda: baja cartera, excedente a favor, sin Banco',async()=>{
  const f=await fixture();try{
    await f.factura(100);const cuenta=randomUUID();
    await f.db.query("insert into cuentas_cartera values($1,'LUIS','cliente_b2b',true)",[cuenta]);
    await f.db.exec("insert into origenes values('LUIS','Luis','cliente_b2b',true)");
    await f.db.query("insert into movimientos_cartera(cuenta_id,efecto,monto) values($1,'debito',1000)",[cuenta]);
    await f.login(maite);const id=randomUUID();
    const abonar=()=>f.db.query("select registrar_abono_cliente_b2b_destino($1,'LUIS',$2,150,'proveedor',$3,$4,$5)",[id,'2026-10-06',f.proveedor,'REF-LUIS',soporte]);
    await abonar();await abonar();assert.equal(await f.total('facturas_proveedor','saldo'),-50);
    assert.equal((await f.db.query("select sum(case when efecto='debito' then monto else -monto end)::int n from movimientos_cartera")).rows[0].n,850);
    assert.equal(await f.total('disponibilidad_b2b','saldo'),1000);assert.equal(await f.total('banco_creditek_cuentas','saldo_actual'),1000);
    assert.equal(await f.total('aplicaciones_abono_cliente_b2b_proveedor','monto'),150);
    await assert.rejects(f.db.query("select registrar_abono_cliente_b2b_destino($1,'LUIS',$2,900,'proveedor',$3,$4,$5)",[randomUUID(),'2026-10-06',f.proveedor,'REF-LUIS',soporte]),/supera la deuda actual del cliente/);
  }finally{await f.db.close();}
});

test('consignación de tienda a proveedor: sobrante trazado y caja/cartera solo una vez, no Banco',async()=>{
  const f=await fixture();try{
    await f.factura(100);const instruccion=randomUUID(),request=randomUUID();
    await f.db.query("insert into instrucciones_consignacion(id,estado,tipo_destino,proveedor_id,tienda_codigo,valor_esperado,fecha) values($1,'en_validacion','PROVEEDOR',$2,'CK-01',150,'2026-10-06')",[instruccion,f.proveedor]);
    await f.db.query("insert into comprobantes_consignacion(id,instruccion_id,estado,version,valor_confirmado,soporte_path,enviado_por) values($1,$2,'enviado',1,150,$3,$4)",[randomUUID(),instruccion,soporte,maite]);
    await f.login(maite);const aplicar=()=>f.db.query("select decidir_instruccion_consignacion($1,'validado',null,$2)",[instruccion,request]);
    await aplicar();await aplicar();assert.equal(await f.total('facturas_proveedor','saldo'),-50);
    assert.equal(await f.total('movimientos_caja_tienda','monto'),150);assert.equal(await f.total('cuenta_corriente','monto'),150);
    assert.equal(await f.total('aplicaciones_consignacion_proveedor','monto_aplicado'),150);
    assert.equal(await f.total('banco_creditek_cuentas','saldo_actual'),1000);
  }finally{await f.db.close();}
});
