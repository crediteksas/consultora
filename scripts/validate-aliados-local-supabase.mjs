import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const domain = require('../creditek/erp/aliados-liquidaciones-domain.js');
const url = process.env.KORA_ERP_SUPABASE_URL;
const anonKey = process.env.KORA_ERP_SUPABASE_ANON_KEY;
const serviceKey = process.env.KORA_LOCAL_SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url?.startsWith('http://127.0.0.1:'), 'Solo se permite Supabase local');
assert.ok(anonKey && serviceKey, 'Faltan claves del Supabase local');

const admin = createClient(url, serviceKey, { auth:{ persistSession:false, autoRefreshToken:false } });
const credentials = {
  oscar:{ email:'oscar.aprobador@kora.local', password:'KoraLocal-Oscar-2026!' },
  maite:{ email:'maite.revisora@kora.local', password:'KoraLocal-Maite-2026!' },
  blocked:{ email:'usuario.bloqueado@kora.local', password:'KoraLocal-Bloqueado-2026!' },
};
const sourceFiles = {
  payjoy:path.join(os.homedir(),'Downloads','PAYJOY COMO LO RECIBO.xlsx'),
  alo:path.join(os.homedir(),'Downloads','ALO COMO LO RECIBO.xlsx'),
};
for (const file of Object.values(sourceFiles)) assert.ok(fs.existsSync(file), `No existe ${file}`);

function sheetRows(file, sheetName) {
  const workbook = XLSX.readFile(file, { cellDates:true });
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header:1, defval:null, raw:true });
}
const raw = {
  payjoy:sheetRows(sourceFiles.payjoy,'Transacciones'),
  alo:sheetRows(sourceFiles.alo,'Worksheet'),
};
const allyNames = new Set([
  'ARTESANIAS EILEEN ALIADA','ALIADO INNOVACEL COMUNICACIONES SAS','World Seven','Distritoys',
].map(domain.clave));
const firstPass = [domain.importarPayjoy(raw.payjoy,[]),domain.importarAlo(raw.alo,[])];
const establishmentNames = [...new Set(firstPass.flatMap(result=>result.operaciones.map(op=>op.establecimientoNombre)).filter(Boolean))];

async function ensureUser(key, nombre, rol) {
  const { data:list, error:listError } = await admin.auth.admin.listUsers({ perPage:1000 });
  if (listError) throw listError;
  let user = list.users.find(item=>item.email===credentials[key].email);
  if (!user) {
    const created = await admin.auth.admin.createUser({ email:credentials[key].email,password:credentials[key].password,email_confirm:true });
    if (created.error) throw created.error;
    user=created.data.user;
  }
  const profile = await admin.from('perfiles').upsert({ id:user.id,nombre,rol,activo:true },{ onConflict:'id' });
  if (profile.error) throw profile.error;
  return user;
}
async function session(key) {
  const client=createClient(url,anonKey,{ auth:{ persistSession:false,autoRefreshToken:false } });
  const signed=await client.auth.signInWithPassword(credentials[key]);
  if (signed.error) throw signed.error;
  return client;
}
function expectOk(result, label) { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; }

const users = {
  oscar:await ensureUser('oscar','Óscar Local','gerencia'),
  maite:await ensureUser('maite','Maite Local','gerencia'),
  blocked:await ensureUser('blocked','Usuario Tienda Local','admin_tienda'),
};
expectOk(await admin.from('aliados_operadores').upsert([
  { perfil_id:users.oscar.id,capacidad:'aprobador',activo:true,creado_por:users.oscar.id },
  { perfil_id:users.maite.id,capacidad:'revisor',activo:true,creado_por:users.oscar.id },
],{ onConflict:'perfil_id' }),'operadores');

const executives=[];
for (let index=0;index<4;index+=1) executives.push({ id:crypto.randomUUID(),nombre:`Ejecutivo Local ${index+1}`,activo:true });
expectOk(await admin.from('ejecutivos').upsert(executives),'ejecutivos');
const establishments=establishmentNames.map((nombre,index)=>{
  const aliado=allyNames.has(domain.clave(nombre));
  return { codigo:`LOCAL-${String(index+1).padStart(2,'0')}`,nombre,tipo:aliado?'aliado':'propia',ejecutivo_id:aliado?executives[index%executives.length].id:null,activo:true };
});
expectOk(await admin.from('origenes').upsert(establishments,{ onConflict:'codigo' }),'orígenes');
const domainEstablishments=establishments.map(item=>({ ...item,aliases:[item.nombre,item.codigo],ejecutivo:item.ejecutivo_id?{id:item.ejecutivo_id}:null }));
const imported = {
  payjoy:domain.importarPayjoy(raw.payjoy,domainEstablishments),
  alo:domain.importarAlo(raw.alo,domainEstablishments),
};

const beneficiaries=[];
for (const origin of establishments.filter(item=>item.tipo==='aliado')) beneficiaries.push({ id:crypto.randomUUID(),tipo:'aliado',identificacion:`NIT-${origin.codigo}`,nombre:origin.nombre,origen_codigo:origin.codigo,activo:true });
for (const executive of executives) beneficiaries.push({ id:crypto.randomUUID(),tipo:'ejecutivo',identificacion:`CC-${executive.id.slice(0,8)}`,nombre:executive.nombre,ejecutivo_id:executive.id,activo:true });
expectOk(await admin.from('liquidation_beneficiaries').upsert(beneficiaries),'beneficiarios');
expectOk(await admin.from('beneficiary_bank_accounts').upsert(beneficiaries.map((item,index)=>({ beneficiary_id:item.id,banco:'BANCO LOCAL',tipo_cuenta:'ahorros',numero_cuenta:`LOCAL-${index+1}`,validada:true,validada_por:users.oscar.id,validada_at:new Date().toISOString(),activo:true }))),'cuentas');

const oscar=await session('oscar');
const maite=await session('maite');
const blocked=await session('blocked');
expectOk(await oscar.rpc('aliados_seed_politica_inicial',{ p_vigente_desde:'2020-01-01' }),'política inicial');
const blockedRead=await blocked.from('liquidations').select('id');
assert.equal(blockedRead.error,null);assert.equal(blockedRead.data.length,0);
const blockedRpc=await blocked.rpc('aliados_seed_politica_inicial',{ p_vigente_desde:'2020-01-01' });
assert.ok(blockedRpc.error,'El usuario no autorizado no debe ejecutar RPC');

const expected={
  payjoy:{ operations:4,total_operaciones:2760000,total_pago_aliados:1849200,total_bonos:230000,total_utilidad_creditek:680800,total_pagar:2079200 },
  alo:{ operations:4,total_operaciones:3257600,total_pago_aliados:1693952,total_bonos:100000,total_utilidad_creditek:1463648,total_pagar:1793952 },
};
const bonusValues={ payjoy:{'payjoy|DBTRVJXB':65000,'payjoy|DCBMKRV':75000,'payjoy|DBTQWCB':45000,'payjoy|DVJPTKH':45000} };
const report={ users:{ oscar:users.oscar.id,maite:users.maite.id,blocked:users.blocked.id },rls:{ blockedRead:0,blockedRpc:'denegado' },platforms:{} };

for (const platform of ['payjoy','alo']) {
  const original=fs.readFileSync(sourceFiles[platform]);
  const hash=crypto.createHash('sha256').update(original).digest('hex');
  const uploadId=crypto.randomUUID();
  const storagePath=`aliados/originales/${uploadId}.xlsx`;
  expectOk(await maite.storage.from('soportes').upload(storagePath,original,{ contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',upsert:false }),`${platform} storage`);
  const operations=imported[platform].operaciones;
  const rows=operations.flatMap(op=>op.movimientos.map(m=>({ sheet:platform==='payjoy'?'Transacciones':'Worksheet',row_number:m.fila,movement_type:m.tipo,source_key:op.sourceKey,original:m.original })));
  const key=crypto.randomUUID();
  const liquidationId=expectOk(await maite.rpc('aliados_importar_liquidacion',{ p_plataforma:platform,p_nombre:path.basename(sourceFiles[platform]),p_sha256:hash,p_storage_path:storagePath,p_size:original.length,p_mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',p_periodo_desde:null,p_periodo_hasta:null,p_fecha_corte:null,p_rows:rows,p_operations:operations,p_incidents:[],p_idempotency_key:key }),`${platform} importación`);
  const duplicate=await maite.rpc('aliados_importar_liquidacion',{ p_plataforma:platform,p_nombre:path.basename(sourceFiles[platform]),p_sha256:hash,p_storage_path:`aliados/originales/${crypto.randomUUID()}.xlsx`,p_size:original.length,p_mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',p_periodo_desde:null,p_periodo_hasta:null,p_fecha_corte:null,p_rows:rows,p_operations:operations,p_incidents:[],p_idempotency_key:crypto.randomUUID() });
  assert.match(duplicate.error?.message||'',/archivo_duplicado/);
  expectOk(await maite.rpc('aliados_cambiar_estado',{ p_id:liquidationId,p_estado:'validada',p_comentario:'Validación local' }),`${platform} validación`);
  const dbOperations=expectOk(await maite.from('liquidation_operations').select('id,source_key,ejecutivo_id,tipo_establecimiento').eq('liquidation_id',liquidationId),`${platform} operaciones`);
  const allies=dbOperations.filter(item=>item.tipo_establecimiento==='aliado');
  assert.equal(allies.length,expected[platform].operations);
  for (const operation of allies) {
    const executiveBeneficiary=beneficiaries.find(item=>item.tipo==='ejecutivo'&&item.ejecutivo_id===operation.ejecutivo_id);
    const value=platform==='payjoy'?bonusValues.payjoy[operation.source_key]:25000;
    expectOk(await maite.rpc('aliados_guardar_bono',{ p_liquidation_id:liquidationId,p_operation_id:operation.id,p_beneficiary_id:executiveBeneficiary.id,p_tipo:'histórico_validado',p_valor:value,p_motivo:'Conciliación histórica local',p_idempotency_key:crypto.randomUUID() }),`${platform} bono`);
  }
  const calculated=expectOk(await maite.rpc('aliados_calcular_liquidacion',{ p_id:liquidationId }),`${platform} cálculo`);
  for (const field of ['total_operaciones','total_pago_aliados','total_bonos','total_utilidad_creditek','total_pagar']) assert.equal(Number(calculated[field]),expected[platform][field],`${platform} ${field}`);
  expectOk(await maite.rpc('aliados_cambiar_estado',{ p_id:liquidationId,p_estado:'revisada',p_comentario:'Revisada por Maite local' }),`${platform} revisión`);
  expectOk(await oscar.rpc('aliados_cambiar_estado',{ p_id:liquidationId,p_estado:'aprobada',p_comentario:'Aprobada por Óscar local' }),`${platform} aprobación`);
  const immutable=await admin.from('liquidations').update({ total_pagar:1 }).eq('id',liquidationId);
  assert.match(immutable.error?.message||'',/inmutable/);
  const payments=expectOk(await maite.from('payment_orders').select('id,valor').eq('liquidation_id',liquidationId),`${platform} pagos`);
  let supportPath=null;
  for (const [index,payment] of payments.entries()) {
    if (index===0) {
      supportPath=`aliados/pagos/${crypto.randomUUID()}.pdf`;
      expectOk(await maite.storage.from('soportes').upload(supportPath,Buffer.from('%PDF-1.4\n% KORA LOCAL\n'),{ contentType:'application/pdf',upsert:false }),`${platform} soporte pago`);
    }
    expectOk(await maite.rpc('aliados_cambiar_estado_pago',{ p_id:payment.id,p_estado:'programado',p_soporte_path:index===0?supportPath:null }),`${platform} programar`);
    expectOk(await oscar.rpc('aliados_cambiar_estado_pago',{ p_id:payment.id,p_estado:'pagado',p_soporte_path:null }),`${platform} pagar`);
    expectOk(await oscar.rpc('aliados_cambiar_estado_pago',{ p_id:payment.id,p_estado:'conciliado',p_soporte_path:null }),`${platform} conciliar`);
  }
  const events=expectOk(await oscar.from('liquidation_domain_events').select('event_type').eq('aggregate_id',liquidationId),`${platform} eventos liquidación`);
  const paymentEvents=expectOk(await oscar.from('liquidation_domain_events').select('event_type').in('aggregate_id',payments.map(item=>item.id)),`${platform} eventos pagos`);
  const audit=expectOk(await oscar.from('audit_log').select('accion').or(`and(tabla.eq.liquidations,registro_id.eq.${liquidationId}),and(tabla.eq.payment_orders,registro_id.in.(${payments.map(item=>item.id).join(',')}))`),`${platform} auditoría`);
  report.platforms[platform]={ liquidationId,operations:allies.length,totals:Object.fromEntries(Object.keys(expected[platform]).filter(key=>key!=='operations').map(key=>[key,Number(calculated[key])])),payments:payments.length,finalState:'conciliada',auditEvents:audit.length,domainEvents:[...events,...paymentEvents].map(item=>item.event_type).sort(),duplicateImport:'bloqueada',immutable:'bloqueada',storage:{ original:storagePath,paymentSupport:supportPath } };
}

const blockedUpload=await blocked.storage.from('soportes').upload(`aliados/pagos/${crypto.randomUUID()}.pdf`,Buffer.from('%PDF'),{ contentType:'application/pdf' });
assert.ok(blockedUpload.error,'Storage debe negar al usuario sin permiso');
report.rls.blockedStorage='denegado';
report.policy=expectOk(await oscar.from('settlement_policy_versions').select('plataforma,version,porcentaje,base_field,estado').order('plataforma'),'políticas');
report.objectCounts={ liquidations:Number((await admin.from('liquidations').select('*',{count:'exact',head:true})).count),operations:Number((await admin.from('liquidation_operations').select('*',{count:'exact',head:true})).count),payments:Number((await admin.from('payment_orders').select('*',{count:'exact',head:true})).count) };
console.log(JSON.stringify(report,null,2));
