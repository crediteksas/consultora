import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const html=await fs.readFile(new URL('form.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('const qualityIds='),html.indexOf('async function preparePhotoQuality('));
function setup({session=null,name='',consent=true}={}){
 const elements=new Map(),file={name:'existing-photo.jpg'},calls=[];
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',checked:false,files:[],textContent:'',disabled:false,style:{},listeners:{},addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);},closest(){return{before(){}};},after(){}});return elements.get(id);}
 el('fotoFrente').files=[file];el('nombreCompleto').value=name;el('autPhotoQuality').checked=consent;
 const context=vm.createContext({document:{getElementById:el,querySelectorAll:()=>[],createElement:()=>el('retry')},console,AbortSignal,API:'https://fixture.test',enlaceToken:'fixture',comprimirImagen:async()=>{},blobABase64:async()=>{},evaluarSubmit(){},mostrarErrorRegistro(message){calls.push({message});},fetch:async(url,init)=>{calls.push(JSON.parse(init.body));return{ok:true,json:async()=>({photoStates:{frente:{status:'auto_approved'}}})};}});
 vm.runInContext(`let documentosSession=null,registroSession=${JSON.stringify(session)},photoQualityReceipt=null,qualityPhotos=null,qualityExpiresAt=0,qualityBusy=false,recoveryMode=false;const uploadedTypes=new Set();`+source+`;preparedQualityPhotos=async()=>({frente:'fixture-image'});globalThis.controls={reviewCapturedPhoto,queuePhotoReview,lockPhotoSteps,setSession:s=>registroSession=s,setBusy:v=>qualityBusy=v,setFinal:v=>documentosSession=v};`,context);
 return{el,file,calls,controls:context.controls};
}
test('selected photo survives missing name and resumes when name change fires',async()=>{
 const{el,file,calls,controls}=setup({session:'verified'});
 await controls.reviewCapturedPhoto();assert.equal(calls.length,0);assert.match(el('fotoFrenteQuality').textContent,/completar tu nombre/);assert.doesNotMatch(el('fotoFrenteQuality').textContent,/Falta verificar/);
 el('nombreCompleto').value='Cliente de prueba';for(const listener of el('nombreCompleto').listeners.change)listener({target:el('nombreCompleto')});await controls.queuePhotoReview();
 assert(calls.length>0);assert.equal(el('fotoFrente').files[0],file);assert.equal(el('nombreCompleto').value,'Cliente de prueba');assert.equal(el('fotoReverso').disabled,false);assert.equal(el('fotoSelfie').disabled,true);
});
test('retry preserves photo and fields while requiring verified session and consent',async()=>{
 const{el,file,calls,controls}=setup({name:'Cliente de prueba'});
 el('direccion').value='Direccion conservada';await controls.reviewCapturedPhoto();assert.equal(calls.length,0);assert.match(el('fotoFrenteQuality').textContent,/verificar tu celular/);
 controls.setSession('verified');el('autPhotoQuality').checked=false;await controls.reviewCapturedPhoto();assert.equal(calls.length,0);assert.match(el('fotoFrenteQuality').textContent,/autorizar la revisión/);
 el('autPhotoQuality').checked=true;el('retry').listeners.click[0]();await controls.queuePhotoReview();assert(calls.length>0);assert.equal(el('fotoFrente').files[0],file);assert.equal(el('direccion').value,'Direccion conservada');
});
test('retry is unavailable during a review or after final registration',()=>{
 const{el,controls}=setup();controls.setBusy(true);controls.lockPhotoSteps();assert.equal(el('retry').disabled,true);controls.setBusy(false);controls.setFinal('completed');controls.lockPhotoSteps();assert.equal(el('retry').disabled,true);assert.equal(el('fotoFrente').disabled,true);
});
test('deployment replaces only the form literal in the exact live worker',async()=>{
 const base=await fs.readFile(new URL('current.mjs',import.meta.url),'utf8'),built=await fs.readFile(new URL('index.mjs',import.meta.url),'utf8');
 const marker='var pilot_form_default = ',start=base.indexOf(marker)+marker.length;let end=start+1;
 while(end<base.length){if(base[end]==='\\'){end+=2;continue;}if(base[end]==='`')break;end++;}
 assert.equal(built,base.slice(0,start)+JSON.stringify(html)+base.slice(end+1));
});
