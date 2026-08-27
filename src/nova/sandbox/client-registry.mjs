const cleanDigits=value=>String(value??'').replace(/\D/g,'');
export const normalizeDocument=cleanDigits;
export const normalizePhone=value=>{let digits=cleanDigits(value);if(digits.startsWith('57')&&digits.length===12)digits=digits.slice(2);return digits;};
export const maskDocument=value=>{const v=cleanDigits(value);return v.length>4?`${'*'.repeat(Math.max(3,v.length-4))}${v.slice(-4)}`:'****';};
export const maskPhone=value=>{const v=normalizePhone(value);return v.length>4?`${v.slice(0,3)}****${v.slice(-3)}`:'***';};

export function resolveLocators(customer,sales){
  const sale=sales.find(item=>item.customer_id===customer.id&&item.platform==='PayJoy');
  if(!sale)return{sale:null,type:'NONE',value:null};
  for(const [type,key] of [['IMEI','imei_internal'],['PHONE','phone_internal'],['DEVICE_TAG','device_tag_internal'],['PAYJOY_CUSTOMER_ID','external_customer_id']]){
    if(sale[key])return{sale,type,value:sale[key]};
  }
  return{sale,type:'NONE',value:null};
}

export function createPayJoySignal(check){
  if(!check?.match)return{signal:'REVIEW',reason_code:'PAYJOY_NOT_FOUND',recommendation:'Revisión requerida'};
  if(!check.contract_present)return{signal:'OK',reason_code:'NO_ACTIVE_CONTRACT',recommendation:'Puede continuar a evaluación'};
  if(!check.payment_history_available)return{signal:'REVIEW',reason_code:'PAYMENT_HISTORY_UNAVAILABLE',recommendation:'Revisión requerida'};
  if(check.payment_count===0&&check.remaining_balance>0)return{signal:'HIGH_RISK_SIGNAL',reason_code:'ACTIVE_BALANCE_WITHOUT_OBSERVED_PAYMENTS',recommendation:'NO AUTORIZAR SIN REVISIÓN'};
  if(check.last_payment_at)return{signal:'OK',reason_code:'PAYMENT_HISTORY_OBSERVED',recommendation:'Puede continuar a evaluación'};
  return{signal:'REVIEW',reason_code:'INCOMPLETE_EVIDENCE',recommendation:'Revisión requerida'};
}

export class PayJoyCustomerCheck{
  constructor({gateway,clock=()=>new Date(),maxAgeMinutes=60}={}){this.gateway=gateway;this.clock=clock;this.maxAgeMinutes=maxAgeMinutes;this.cache=new Map();}
  isStale(entry){return !entry||this.clock().getTime()-new Date(entry.checked_at).getTime()>this.maxAgeMinutes*60000;}
  async check(customer,sales,{force=false}={}){
    const cached=this.cache.get(customer.id);if(!force&&!this.isStale(cached))return{...cached,freshness:'FRESH'};
    const resolved=resolveLocators(customer,sales);
    if(!resolved.sale||!resolved.value){const result={match:false,contract_present:false,remaining_balance:null,payment_history_available:false,payment_count:0,last_payment_at:null,monthly_cost:null,weekly_cost:null,months:null,secure_status:null,valid_through:null,source:'PAYJOY',checked_at:this.clock().toISOString(),freshness:'FRESH',...createPayJoySignal({match:false})};this.cache.set(customer.id,result);return result;}
    try{
      const raw=await this.gateway.lookup({type:resolved.type,value:resolved.value});
      const normalized={match:Boolean(raw.match),contract_present:Boolean(raw.contract_present),remaining_balance:raw.remaining_balance??null,payment_history_available:Boolean(raw.payment_history_available),payment_count:Number(raw.payment_count||0),last_payment_at:raw.last_payment_at??null,monthly_cost:raw.monthly_cost??null,weekly_cost:raw.weekly_cost??null,months:raw.months??null,secure_status:raw.secure_status??null,valid_through:raw.valid_through??null,source:'PAYJOY',checked_at:this.clock().toISOString(),freshness:'FRESH'};
      const result={...normalized,...createPayJoySignal(normalized)};this.cache.set(customer.id,result);return result;
    }catch{return{match:false,contract_present:false,remaining_balance:null,payment_history_available:false,payment_count:0,last_payment_at:null,monthly_cost:null,weekly_cost:null,months:null,secure_status:null,valid_through:null,source:'PAYJOY',checked_at:this.clock().toISOString(),freshness:'FRESH',signal:'REVIEW',reason_code:'PAYJOY_UNAVAILABLE',recommendation:'Revisión requerida'};}
  }
}

export function createClientRegistry({customers=[],sales=[],obligations=[],payjoyService,clock=()=>new Date()}={}){
  const audit=[];const emit=(event,customer_id)=>audit.push({event,customer_id,at:clock().toISOString(),metadata:{pii:false}});
  return{
    search(query){const id=normalizeDocument(query),phone=normalizePhone(query);const customer=customers.find(item=>normalizeDocument(item.document)===id||normalizePhone(item.phone)===phone)||null;emit('CLIENT_SEARCHED',customer?.id||null);return customer;},
    create(input){const customer={id:`SANDBOX-C-${customers.length+1}`,name:String(input.name||'').trim(),document:normalizeDocument(input.document),phone:normalizePhone(input.phone),city:String(input.city||''),store:String(input.store||''),authorization:Boolean(input.authorization),authorized_at:input.authorized_at||clock().toISOString(),origin:input.origin||'AURA_SANDBOX',created_at:clock().toISOString()};customers.push(customer);emit('CLIENT_CREATED',customer.id);return customer;},
    profile(id){const customer=customers.find(item=>item.id===id);if(!customer)return null;return{customer:{...customer,document:maskDocument(customer.document),phone:maskPhone(customer.phone)},sales:sales.filter(x=>x.customer_id===id).map(({imei_internal,phone_internal,device_tag_internal,external_customer_id,...safe})=>safe),obligations:obligations.filter(x=>x.customer_id===id)};},
    async payjoyCheck(id,options){const customer=customers.find(item=>item.id===id);if(!customer)return null;emit('PAYJOY_CHECK_STARTED',id);const result=await payjoyService.check(customer,sales,options);emit('PAYJOY_CHECK_COMPLETED',id);emit('PAYJOY_SIGNAL_CREATED',id);if(result.signal!=='OK')emit('PRE_CREDIT_REVIEW_REQUIRED',id);return result;},
    audit,customers,sales,obligations
  };
}

export const sandboxFixtures=()=>{
  const customers=[
    {id:'SANDBOX-C-1',name:'Cliente Ficticio Aurora',document:'1000000001',phone:'3000000001',city:'Corozal',store:'Corozal 01',authorization:true,authorized_at:'2026-08-25T14:00:00Z',origin:'SANDBOX',created_at:'2026-08-25T14:00:00Z'},
    {id:'SANDBOX-C-2',name:'Cliente Ficticio Brisa',document:'1000000002',phone:'3000000002',city:'Chinú',store:'Chinu 1',authorization:true,authorized_at:'2026-08-25T15:00:00Z',origin:'SANDBOX',created_at:'2026-08-25T15:00:00Z'},
    {id:'SANDBOX-C-3',name:'Cliente Ficticio Coral',document:'1000000003',phone:'3000000003',city:'Tolú',store:'Tolu',authorization:false,authorized_at:null,origin:'SANDBOX',created_at:'2026-08-25T16:00:00Z'}
  ];
  const sales=[
    {id:'SANDBOX-S-1',customer_id:'SANDBOX-C-1',date:'25/08/2026',store:'Corozal 01',platform:'PayJoy',reference:'Equipo ficticio A',status:'ACTIVE',value:900000,platform_reference:'PJ-SIM-1',imei_internal:'SIMULATED-IMEI-1'},
    {id:'SANDBOX-S-2',customer_id:'SANDBOX-C-2',date:'25/08/2026',store:'Chinu 1',platform:'PayJoy',reference:'Equipo ficticio B',status:'ACTIVE',value:750000,platform_reference:'PJ-SIM-2',phone_internal:'3000000002'},
    {id:'SANDBOX-S-3',customer_id:'SANDBOX-C-3',date:'25/08/2026',store:'Tolu',platform:'Addi',reference:'Equipo ficticio C',status:'ACTIVE',value:620000,platform_reference:'ADDI-SIM-1'}
  ];
  const obligations=[{id:'SIM-OBLIGATION-1',customer_id:'SANDBOX-C-1',platform:'PayJoy',status:'CURRENT',balance:420000},{id:'SIM-OBLIGATION-2',customer_id:'SANDBOX-C-2',platform:'PayJoy',status:'REVIEW',balance:510000}];
  const gateway={async lookup({value}){if(value==='SIMULATED-IMEI-1')return{match:true,contract_present:true,remaining_balance:420000,payment_history_available:true,payment_count:3,last_payment_at:'2026-08-20T12:00:00Z',monthly_cost:90000,weekly_cost:22500,months:10,secure_status:'SECURED',valid_through:'2026-09-02T00:00:00Z'};return{match:true,contract_present:true,remaining_balance:510000,payment_history_available:true,payment_count:0,last_payment_at:null,monthly_cost:85000,weekly_cost:21250,months:9,secure_status:'SECURED',valid_through:'2026-08-20T00:00:00Z'};}};
  return{customers,sales,obligations,gateway};
};
