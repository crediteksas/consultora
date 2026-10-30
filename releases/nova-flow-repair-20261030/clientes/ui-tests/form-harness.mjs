import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { File } from 'node:buffer';
import { transformForm } from '../ui-transform.mjs';

export const baseline = fs.readFileSync(new URL('../../baseline/clientes/form.html', import.meta.url), 'utf8');
export const candidate = transformForm(baseline);

class Element {
  constructor(id='') {
    this.id=id;this.value='';this.disabled=false;this.readOnly=false;this.hidden=false;this.checked=false;this.files=[];
    this.style={};this.listeners=new Map();this.children=[];this.classes=new Set();this.textContent='';this.className='';
    this.classList={add:(...xs)=>xs.forEach(x=>this.classes.add(x)),remove:(...xs)=>xs.forEach(x=>this.classes.delete(x)),contains:x=>this.classes.has(x)};
  }
  addEventListener(type,handler){const list=this.listeners.get(type)||[];list.push(handler);this.listeners.set(type,list);}
  async fire(type){for(const handler of this.listeners.get(type)||[])await handler({target:this,preventDefault(){}});}
  append(...children){for(const child of children){if(child.parent)child.parent.children=child.parent.children.filter(x=>x!==child);this.children.push(child);child.parent=this;}}
  appendChild(child){this.append(child);return child;}
  replaceChildren(...children){this.children=[];this.append(...children);}
  before(...children){this.beforeNodes=children;}
  after(...children){this.afterNodes=children;}
  closest(){if(!this.field){this.field=new Element('field:'+this.id);this.field.append(this);}return this.field;}
  querySelectorAll(){return this.controls||[];}
  setAttribute(name,value){this[name]=value;}
  focus(){this.focused=true;}
  reset(){throw Error('Data loss: form.reset()');}
  set innerHTML(_){throw Error('Data loss: DOM replacement');}
}

// This VM executes the actual inline script. All fetches are closed mock routes;
// every unhandled request fails rather than contacting production or OCR.
export function fixture(handle,{base=false,linkToken='synthetic-link'}={}) {
  const html=base?baseline:candidate;
  const nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>[id,new Element(id)]));
  for(const id of ['btnEnviarOtpSms','btnConsultarOtp','otpChannelHelp'])nodes.get(id).hidden=true;
  nodes.get('formRegistro').controls=[...nodes.values()].filter(e=>/^(foto|aut|ref|cedula|celular|nombre|email|ciudad|direccion|producto|financiera|captador|btn|codigo)/.test(e.id));
  let now=1000000,sequence=0,timerId=0;const timers=new Map(),calls=[],fileSnapshots=[];
  const document={
    getElementById(id){assert.ok(nodes.has(id),'Existing element: '+id);return nodes.get(id);},
    createElement:tag=>new Element(tag),querySelectorAll:()=>[],head:new Element('head'),
  };
  const context=vm.createContext({document,window:{addEventListener(){},turnstile:{reset(){}}},location:{search:'?t='+encodeURIComponent(linkToken)},URLSearchParams,
    Date:class extends Date {static now(){return now;}},Set,Map,WeakMap,Promise,Uint8Array,Blob,File,atob,
    crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`},
    AbortSignal:{timeout:()=>({syntheticSignal:true})},
    setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),
    fetch:async(url,options={})=>{
      const body=options.body?JSON.parse(options.body):null,path=new URL(url).pathname;
      calls.push({path,body,method:options.method||'GET'});
      const response=await handle(path,body,calls);
      return {status:response.status||200,ok:(response.status||200)>=200&&(response.status||200)<300,json:async()=>response.data};
    },
  });
  const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function preparedQualityPhotos()'));
  assert.equal(main.split('\ninitRegistroSeguro();').length,2);
  vm.runInContext(main.replace('\ninitRegistroSeguro();','\n// Initial network intentionally disabled in local fixture.'),context);
  const run=source=>vm.runInContext(source,context);
  run("contextoValido=true;turnstileToken='synthetic-turnstile';captadorSelect.value='synthetic-seller';");
  nodes.get('celular').value='3000000000';nodes.get('cedula').value='12345678';nodes.get('nombreCompleto').value='Persona de prueba';
  for(const id of ['fotoFrente','fotoReverso','fotoSelfie']){const file=new File(['synthetic-'+id],id+'.jpg',{type:'image/jpeg'});nodes.get(id).files=[file];fileSnapshots.push(file);}
  return {nodes,calls,run,context,fileSnapshots,
    enable:()=>run('cargarOpcionesOtp()'),
    captcha:()=>run("turnstileToken='synthetic-turnstile';evaluarEnvioOtp();"),
    async click(id){const e=nodes.get(id);if(!e.disabled&&!e.hidden)await e.fire('click');},
    assertFiles(){for(const [i,id]of ['fotoFrente','fotoReverso','fotoSelfie'].entries())assert.equal(nodes.get(id).files[0],fileSnapshots[i]);},
    advance(ms){now+=ms;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},
  };
}

export function completeForm(f){
  for(const [id,value]of Object.entries({ciudad:'Ciudad sintética',direccion:'Dirección sintética',productoInteres:'Equipo',ref1Nombre:'Referencia Uno',ref2Nombre:'Referencia Dos',ref1Telefono:'3000000001',ref2Telefono:'3000000002',ref1Parentesco:'Amiga',ref2Parentesco:'Hermana'}))f.nodes.get(id).value=value;
  for(const id of ['autReferencias','autDatos','autPhotoQuality'])f.nodes.get(id).checked=true;
  f.run('queuePhotoReview=()=>Promise.resolve();');
}
export function verified(f,session='session-A'){
  f.context.fixtureSession=session;
  f.run("registroSession=fixtureSession;otpVerificado=true;celularVerificado=celularInput.value;cedulaVerificada=document.getElementById('cedula').value;photoQualityReceipt='receipt-A';qualityPhotos={frente:'prepared-front',reverso:'prepared-back',selfie:'prepared-selfie'};qualityExpiresAt=2000000;for(const [type,id]of Object.entries(qualityIds)){qualityBlobCache.set(document.getElementById(id).files[0],qualityPhotos[type]);qualityStates[type]={status:'auto_approved'};}evaluarSubmit();");
}
