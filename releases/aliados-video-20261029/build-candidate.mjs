import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
const dir=path.dirname(new URL(import.meta.url).pathname), root=path.resolve(dir,'../..'), baseline=path.join(dir,'baseline'), sourceDir=path.join(root,'creditek/convenios');
const pins=JSON.parse(fs.readFileSync(path.join(dir,'baseline-manifest.json'),'utf8'));
const {createHash}=await import('node:crypto');
for(const [name,sha]of Object.entries(pins.capturedSnapshots)){if(createHash('sha256').update(fs.readFileSync(path.join(baseline,name))).digest('hex')!==sha)throw Error('Frozen baseline changed: '+name);}
await import('./build-codec-assets.mjs');
const helper=fs.readFileSync(path.join(sourceDir,'video-mp4.mjs'),'utf8').replace(/^export /gm,'');
const globalHelper='const AllyVideo = (()=>{\n'+helper+'\nreturn {prepareAllyVideo,VIDEO_FILE_ACCEPT};\n})();\n';
const registrationHandler=`// Video: prepare a real MP4 before adding it to the existing form payload.
let allyVideoPreparation=null, allyVideoError='', allyVideoSequence=0, allyVideoAbort=null;
document.getElementById('inputVideo').accept=AllyVideo.VIDEO_FILE_ACCEPT;
document.getElementById('inputVideo').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file){allyVideoError='';return;}
 const sequence=++allyVideoSequence;allyVideoAbort?.abort();allyVideoAbort=new AbortController();allyVideoError='';
 const item=document.getElementById('up_video'),status=document.getElementById('videoStatus'),progress=document.getElementById('videoProgress'),bar=document.getElementById('videoBar'),label=document.getElementById('videoLabel');
 status.style.display='inline';status.textContent='Preparando video…';progress.style.display='block';label.style.display='block';label.textContent='Preparando MP4. Mantén esta pestaña visible hasta que termine.';
 const task=(async()=>{
  const prepared=await AllyVideo.prepareAllyVideo(file,{signal:allyVideoAbort.signal,onProgress:s=>{if(sequence!==allyVideoSequence)return;bar.style.width=Math.round(s.progress*100)+'%';label.textContent=s.phase==='ready'?'MP4 listo para enviar':s.phase==='loading_converter'?'Cargando el conversor de video. Puede tardar la primera vez; el original se conserva.':'Convirtiendo a MP4: '+Math.round(s.progress*100)+'%. Mantén esta pestaña visible.';}});
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('No se pudo leer el MP4 preparado.'));reader.readAsDataURL(prepared.file);});
  if(sequence!==allyVideoSequence)return;
  archivos.video360={base64:data.split(',')[1],tipo:'video/mp4',nombre:prepared.file.name};
  item.classList.add('filled');status.textContent='✓ MP4 '+(prepared.file.size/1024/1024).toFixed(1)+' MB';
 })();allyVideoPreparation=task;
 try{await task;}catch(error){if(sequence===allyVideoSequence){allyVideoError=error.message;status.textContent=archivos.video360?.base64?'Se conserva el video anterior':'Video sin preparar';label.textContent=error.message;}}finally{if(sequence===allyVideoSequence){allyVideoPreparation=null;progress.style.display='none';}}
});
`;
const registrationScriptStart = '<script>\n// ── CONFIGURACIÓN ────────────────────────────────────────────';
const originalHandler=fs.readFileSync(path.join(baseline,'form.html'),'utf8').match(/\/\/ Video: sube directo[\s\S]*?(?=\/\/ ── VENDEDORES DINÁMICOS)/)[0];
const submitStart="document.getElementById('formAliado').addEventListener('submit',async e=>{\n  e.preventDefault();";
const guard="\n  if(allyVideoPreparation){alert('El video sigue convirtiéndose. Espera a que indique MP4 listo; los demás datos se conservan.');return;}\n  if(allyVideoError){alert(allyVideoError);return;}";
function one(source,from,to){if(source.split(from).length!==2)throw Error('Se esperaba una coincidencia exacta: '+from.slice(0,70));return source.replace(from,to);}
let form=fs.readFileSync(path.join(baseline,'form.html'),'utf8');form=one(form,registrationScriptStart,'<script data-ally-video="mp4-20261029">\n'+globalHelper+registrationScriptStart.slice(9));form=one(form,originalHandler,registrationHandler+'\n');form=one(form,submitStart,submitStart+guard);fs.writeFileSync(path.join(dir,'form-candidate.html'),form);fs.writeFileSync(path.join(sourceDir,'index.html'),form);
let pending=fs.readFileSync(path.join(baseline,'pendientes-app.js'),'utf8');pending=globalHelper+pending;
pending=one(pending,"esc(i.accept)","esc(i.type==='video'?AllyVideo.VIDEO_FILE_ACCEPT:i.accept)");
pending=one(pending," MP4; debe mostrar exterior e interior y coincidir con las fotos."," Se preparará como MP4 antes de guardar; debe mostrar exterior e interior y coincidir con las fotos.");
pending=one(pending,"const f=$('file-'+id).files[0];if(item.type==='video'&&!/\\.mp4$/i.test(f?.name||''))throw Error('Selecciona un video en formato MP4.');", "const selectedInput=$('file-'+id),selectedFile=selectedInput.files[0];let f=selectedFile;if(item.type==='video')selectedInput.disabled=true;try{if(item.type==='video'){const prepared=await AllyVideo.prepareAllyVideo(f,{onProgress:s=>message(s.phase==='ready'?'MP4 preparado; guardando…':s.phase==='loading_converter'?'Cargando el conversor de video. Puede tardar la primera vez; el original se conserva.':'Convirtiendo a MP4: '+Math.round(s.progress*100)+'%. Mantén esta pestaña visible. Los demás datos se conservan.')});f=prepared.file;}");
pending=one(pending,"const d=await api('pending_upload',{","const preparedData=await fileData(f);if(item.type==='video'&&selectedInput.files[0]!==selectedFile)throw Error('El video seleccionado cambió. No se guardó otro archivo; vuelve a pulsar Guardar.');const d=await api('pending_upload',{");
pending=one(pending,"file:await fileData(f),fechaCamara:","file:preparedData,fechaCamara:");
pending=one(pending,"message('Soporte guardado. Al terminar, envía las correcciones a revisión.');}));","message('Soporte guardado. Al terminar, envía las correcciones a revisión.');}finally{selectedInput.disabled=false;}}));");
fs.writeFileSync(path.join(dir,'pendientes-app-candidate.js'),pending);new vm.Script(pending);
const validation=`  // Validate final video before claims, folders, mail or any registration side effect.
  if(data.documentos && data.documentos.video360){
    try{auraArchivo_(data.documentos.video360,'video');}
    catch(videoError){return respuestaSolicitud_({ok:false,error:videoError.message||'El video debe estar preparado como MP4 antes de enviar.'});}
  }
`;
// Patch insertion only. Current production Código.gs v33 has unrelated email text
// changes; apply this anchored insertion to its live source, not the old full file.
fs.writeFileSync(path.join(dir,'Codigo-video-validation-insertion.txt'),validation);
// Narrow runtime transform avoids replacing existing static Assets. Fail closed
// if live HTML drifted: caller must compare the public live form before deploy.
const transform='function patchAliadosVideoHtml(html){\n if(html.includes(\"<script data-ally-video=\\\"mp4-20261029\\\">\"))return html;\n const replacements='+JSON.stringify([[registrationScriptStart,'<script data-ally-video="mp4-20261029">\n'+globalHelper+registrationScriptStart.slice(9)],[originalHandler,registrationHandler+'\n'],[submitStart,submitStart+guard]])+';\n for(const [oldText,newText] of replacements){if(html.split(oldText).length!==2)throw Error("ALLY_VIDEO_FORM_DRIFT");html=html.replace(oldText,newText);}\n return html;\n}\n';
fs.writeFileSync(path.join(dir,'worker-form-transform.mjs'),transform+'export {patchAliadosVideoHtml};\n');
const wrapper = `// Local candidate: exact frozen predecessor is imported without rewriting it.
import baseline from './baseline/registro-alo.mjs';
import {serveFFmpegAsset} from '../../creditek/convenios/video-codec/asset-routes.mjs';
import {patchAliadosVideoHtml} from './worker-form-transform.mjs';
import {PENDING_SCRIPT} from './pending-script.generated.mjs';
export default {
 async fetch(request,env,ctx){
  const codec=await serveFFmpegAsset(request);if(codec)return codec;
  const response=await baseline.fetch(request,env,ctx),path=new URL(request.url).pathname;
  if(request.method==='GET'&&path==='/creditek/convenios/pendientes/app.js'&&response.ok){
   await response.body?.cancel();const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
   return new Response(PENDING_SCRIPT,{status:response.status,headers});
  }
  if(request.method==='GET'&&/^\\/creditek\\/convenios(?:\\/|\\/index\\.html)?$/.test(path)&&response.ok){
   const html=patchAliadosVideoHtml(await response.text()),headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');headers.set('x-ally-video','mp4-20261029');return new Response(html,{status:response.status,headers});
  }
  return response;
 }
};
`;
fs.writeFileSync(path.join(dir,'pending-script.generated.mjs'),'export const PENDING_SCRIPT = '+JSON.stringify(pending)+';\n');
fs.writeFileSync(path.join(dir,'registro-video-candidate.mjs'),wrapper);
console.log('Candidates built, syntax checked; no external calls or deployments.');
