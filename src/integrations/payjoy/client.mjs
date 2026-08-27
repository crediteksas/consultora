import https from 'node:https';
import {PAYJOY_ERROR,PayJoyError,classifyPayJoyError} from './errors.mjs';
export class PayJoyClient{
  constructor({apiKeyProvider,timeoutMs=15000,transport=https}={}){this.apiKeyProvider=apiKeyProvider;this.timeoutMs=timeoutMs;this.transport=transport;}
  async request(endpoint,params={}){const apiKey=await this.apiKeyProvider?.();if(!apiKey)throw new PayJoyError(PAYJOY_ERROR.AUTH);return new Promise((resolve,reject)=>{const url=new URL(`https://partner.payjoy.com/v1/${endpoint}`);for(const[k,v]of Object.entries(params))if(v!==undefined&&v!==null)url.searchParams.set(k,String(v));url.searchParams.set('key',apiKey);const req=this.transport.get(url,{headers:{Accept:'application/json'}},res=>{let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>{if(res.statusCode<200||res.statusCode>=300){body='';return reject(new PayJoyError(classifyPayJoyError(res.statusCode),{status:res.statusCode}));}try{const parsed=JSON.parse(body);body='';resolve(parsed);}catch{body='';reject(new PayJoyError(PAYJOY_ERROR.BAD_RESPONSE,{status:res.statusCode}));}});});req.setTimeout(this.timeoutMs,()=>req.destroy(new PayJoyError(PAYJOY_ERROR.TIMEOUT)));req.on('error',error=>reject(error instanceof PayJoyError?error:new PayJoyError(PAYJOY_ERROR.UNAVAILABLE)));req.end();});}
  listMerchants(){return this.request('list-merchants.php');}
  lookupCustomer(customerLocator){return this.request('lookup-customer.php',{customerLocator});}
  listTransactions(params){return this.request('list-transactions.php',params);}
}
