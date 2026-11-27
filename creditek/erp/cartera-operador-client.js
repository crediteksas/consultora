(function(root){
 'use strict';
 const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
 const fail=()=>Error('No se pudo verificar el acceso de Cartera. Vuelve a iniciar sesión.');
 function resolveBootstrap(response,user){
  if(response?.error||!response?.data||Array.isArray(response.data)||typeof response.data!=='object')throw fail();
  const d=response.data;if(d.restricted===false)return{restricted:false};
  if(d.restricted!==true||!uuid(user)||d.profile?.id!==user||d.profile.rol!=='operador_cartera'||d.profile.activo!==true||typeof d.profile.nombre!=='string'||!(d.profile.tienda_codigo===null||typeof d.profile.tienda_codigo==='string')||d.read!==true||typeof d.manage!=='boolean'||d.importer!==false||d.authorizer!==false)throw fail();
  return{restricted:true,read:true,manage:d.manage,importer:false,authorizer:false,profile:{id:user,nombre:d.profile.nombre,rol:'operador_cartera',activo:true,tienda_codigo:d.profile.tienda_codigo}};
 }
 function create(client,boot){
  if(!boot?.restricted||!client?.auth||!client.rpc)throw fail();
  const user=boot.profile.id,deny=()=>{throw Error('Esta acción no está habilitada para el perfil de Cartera.');};
  class Request{
   constructor(factory){this.factory=factory;this.headers={};this.signal=null;this.promise=null;}
   setHeader(k,v){if(this.promise)throw fail();this.headers[k]=v;return this;}
   abortSignal(s){if(this.promise)throw fail();this.signal=s;return this;}
   then(ok,bad){if(!this.promise)this.promise=Promise.resolve().then(()=>this.factory(this.headers,this.signal));return this.promise.then(ok,bad);}
  }
  async function call(name,args,headers,signal){let r=client.rpc(name,args);for(const[k,v]of Object.entries(headers))r=r.setHeader(k,v);if(signal)r=r.abortSignal(signal);const response=await r;
   if(response?.error||!response?.data||Array.isArray(response.data)||!Object.hasOwn(response.data,'__cartera_error'))return response;
   const e=response.data.__cartera_error;if(!e||typeof e.code!=='string'||typeof e.message!=='string')throw fail();
   const status=({'PT400':400,'PT403':403,'PT404':404,'PT429':429,'42501':403,'P0001':400,'23514':400,'23505':409,'22P02':400,'22003':400})[e.code]||500;
   return{...response,data:null,error:{code:e.code,message:e.message},status};
  }
  function accessMap(project){return new Request(async(h,s)=>{const r=await call('cartera_operador_inicio',undefined,h,s);if(r.error)return r;const b=resolveBootstrap(r,user);if(!b.restricted)throw fail();return{...r,data:project(b)};});}
  function rpc(name,args={}){
   if(name==='cobra_quality_operator')return accessMap(b=>b.manage);
   // These are unconditional denials for this adapter, so no permission read
   // or costly catalog fingerprint is needed to deny the action.
   if(name==='cobra_quality_importer'||name==='cobra_provision_authorizer')return new Request(async()=>({data:false,error:null,status:200}));
   if(name==='cobra_provision_book')return new Request((h,s)=>call('cartera_operador_datos',{p_dataset:'fund_book'},h,s));
   if(name==='cobra_krediya_history_cuts')return new Request((h,s)=>call('cartera_operador_datos',{p_dataset:'customer_history',p_id:args.p_operation_id},h,s));
   if(name==='cobra_krediya_save_collection')return new Request((h,s)=>call('cartera_operador_guardar_gestion',args,h,s));
   if(name==='cobra_provision_save'&&args.p_kind==='action'&&args.p_payload?.kind==='request')return new Request((h,s)=>call('cartera_operador_solicitar_provision',{p_request_id:args.p_request_id,p_payload:args.p_payload},h,s));
   return new Request(()=>deny());
  }
  const normalize=s=>String(s).replaceAll(' ','');
  const CUT='id,request_id,file_sha256,payload_sha256,cohort_month,cutoff,source_name,row_count,received_by,received_at,schema_version';
  const EVENT='id,client_request_id,operation_id,obligation_id,event_type,channel,note,promise_date,promise_amount,created_by,created_at';
  const LEGACY='id,obligation_id,operation_id,event_type,channel,note,promise_date,promise_amount,created_at,actor_type';
  class Query extends Request{
   constructor(table){super((h,s)=>this.run(h,s));this.table=table;this.columns=null;this.filters={};this.after=null;this.count=100;this.offset=0;this.singular=false;}
   select(c){if(this.columns!==null)deny();this.columns=normalize(c);return this;}
   eq(k,v){if(Object.hasOwn(this.filters,k))deny();this.filters[k]=v;return this;}
   gt(k,v){if(k!=='id'||this.after!==null)deny();this.after=v;return this;}
   order(k,options={}){if(!['id','created_at','ally_paid_at'].includes(k))deny();return this;}
   limit(n){if(!Number.isSafeInteger(n)||n<1||n>500)deny();this.count=n;return this;}
   range(from,to){if(!Number.isSafeInteger(from)||from<0||!Number.isSafeInteger(to)||to<from||to-from>=500)deny();this.offset=from;this.count=to-from+1;return this;}
   single(){this.singular=true;return this;}
   maybeSingle(){this.singular=true;return this;}
   async run(headers,signal){
    const f=this.filters,keys=Object.keys(f).sort().join(','),p={p_limit:this.count,p_offset:this.offset};let dataset;
    if(this.table==='creditos_cartera_operaciones'&&this.columns==='*'&&keys===''){dataset='portfolio';}
    else if(this.table==='credit_portfolio_settings'&&this.columns==='*'&&keys==='singleton'&&f.singleton===true&&this.singular){dataset='settings';}
    else if(this.table==='credit_collection_events'){
     if(this.columns===LEGACY&&keys===''){dataset='events';}
     else if(this.columns===EVENT&&keys==='operation_id'){dataset='collection_history';p.p_id=f.operation_id;p.p_after=this.after;}
     else if(this.columns===EVENT&&keys==='client_request_id,created_by'&&f.created_by===user){dataset='collection_lookup';p.p_request=f.client_request_id;}
     else deny();
    }else if(this.table==='cobra_krediya_cuts'){
     if(this.columns===CUT&&keys==='cohort_month'){dataset='cuts';p.p_month=f.cohort_month;p.p_after=this.after;}
     else if(this.columns===CUT+',observations'&&keys==='id'&&this.singular){dataset='cut';p.p_id=f.id;}
     else deny();
    }else if(this.table==='cobra_provision_actions'&&this.columns==='id,request_id,payload,created_by'&&keys==='created_by,request_id'&&f.created_by===user){dataset='fund_lookup';p.p_request=f.request_id;}
    else deny();
    if(!dataset)deny();return call('cartera_operador_datos',{...p,p_dataset:dataset},headers,signal);
   }
  }
  return Object.freeze({auth:client.auth,supabaseUrl:client.supabaseUrl,rpc,from:table=>new Query(table)});
 }
 const api={resolveBootstrap,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KoraPortfolioClient=api;
})(typeof window!=='undefined'?window:globalThis);
