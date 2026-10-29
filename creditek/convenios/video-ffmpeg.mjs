// Broad local fallback. Only code assets are fetched: source video bytes stay in
// this browser's memory until the existing authorized AURA upload takes place.
export const FFMPEG_ASSET_BASE = '/creditek/convenios/video-codec/';
export const FFMPEG_PINS = Object.freeze({
 wrapper: '0.12.15', core: '0.12.10',
 coreJs: {name:'core-0.12.10/ffmpeg-core.js',bytes:111804,sha256:'67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3',mime:'text/javascript'},
 wasm: {name:'core-0.12.10/ffmpeg-core.wasm',bytes:32232419,sha256:'9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7',mime:'application/wasm'}
});
function aborted(signal){if(signal?.aborted)throw new DOMException('Conversión cancelada.','AbortError');}
export async function verifiedCodecAsset(asset,{fetcher=fetch,cryptoApi=crypto,origin=location.origin,signal,fetchTimeoutMs=180000}={}){
 aborted(signal);
 const url=new URL(FFMPEG_ASSET_BASE+asset.name,origin);
 if(url.origin!==new URL(origin).origin||(asset!==FFMPEG_PINS.coreJs&&asset!==FFMPEG_PINS.wasm))throw Error('CODEC_ASSET_DENIED');
 const controller=new AbortController(),cancel=()=>controller.abort();let timedOut=false;
 signal?.addEventListener('abort',cancel,{once:true});const timer=setTimeout(()=>{timedOut=true;controller.abort();},fetchTimeoutMs);
 try{
  const response=await fetcher(url.href,{method:'GET',credentials:'omit',redirect:'error',cache:'force-cache',signal:controller.signal});
  if(!response.ok||!response.body?.getReader)throw Error('No se pudo cargar el conversor. El video original se conserva.');
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{while(true){aborted(signal);const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>asset.bytes)throw Error('El conversor no coincide con la versión verificada.');chunks.push(chunk.value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  if(length!==asset.bytes)throw Error('La descarga del conversor quedó incompleta. Vuelve a intentarlo; el video se conserva.');
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const digest=[...new Uint8Array(await cryptoApi.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(digest!==asset.sha256)throw Error('El conversor no coincide con la versión verificada.');return bytes;
 }catch(error){if(timedOut)throw Error('La descarga del conversor tardó demasiado. El video original se conserva; vuelve a intentarlo.');throw error;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
export function ffmpegMp4Args(duration,maxBytes){
 if(!Number.isFinite(duration)||duration<=0)throw Error('No se pudo determinar la duración del video.');
 const videoRate=Math.min(2000000,Math.floor(maxBytes*8*.84/duration)-96000);
 if(videoRate<300000)throw Error('El video es demasiado largo para guardarlo con calidad legible dentro de 20 MB. Adjunta un recorrido más corto.');
 return ['-i','input.bin','-map','0:v:0','-map','0:a:0?','-vf',"scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",'-c:v','libx264','-preset','veryfast','-b:v',String(videoRate),'-maxrate',String(videoRate),'-bufsize',String(videoRate*2),'-pix_fmt','yuv420p','-c:a','aac','-b:a','96000','-ac','2','-map_metadata','-1','-movflags','+faststart','-f','mp4','output.mp4'];
}
export function readVideoProbe(value,exitCode=0){
 // core0.12.10 ffprobe writes successful JSON while leaving its initial ret=-1.
 // Never use this sentinel alone: require a fresh complete metadata document.
 if(exitCode!==0&&exitCode!==-1)throw Error('El conversor no pudo leer este video. El original se conserva.');
 const p=typeof value==='string'?JSON.parse(value):value;
 const stream=p?.streams?.find(s=>Number(s.width)>0&&Number(s.height)>0);
 const duration=Number(p?.format?.duration||stream?.duration);
 if(!stream||!Number.isFinite(duration)||duration<=0)throw Error('El archivo no contiene un video legible y completo.');
 return {duration,width:Number(stream.width),height:Number(stream.height),hasAudio:p.streams.some(s=>s.codec_type==='audio'),videoCodec:stream.codec_name,audioCodecs:p.streams.filter(s=>s.codec_type==='audio').map(s=>s.codec_name)};
}
export function awaitCodecPhase(value,{signal,timeoutMs=30000,message='La preparación del video tardó demasiado.',onTimeout=()=>{}}={}) {
 const work=Promise.resolve(value);
 return new Promise((resolve,reject)=>{
  let done=false,timer;
  const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);error?reject(error):resolve(result);};
  const cancel=()=>finish(new DOMException('Video cancelado. El original se conserva.','AbortError'));
  work.then(value=>finish(null,value),error=>finish(error));
  if(signal?.aborted){cancel();return;}
  signal?.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>{try{onTimeout();}catch{}finish(Error(message));},timeoutMs);
 });
}
export async function transcodeWasmVideo(file,{signal,onProgress=()=>{},maxBytes=20*1024*1024,fetcher=fetch,cryptoApi=crypto,origin=location.origin,URLApi=URL,assetLoader=verifiedCodecAsset,importModule=url=>import(url),timeoutMs=10*60*1000,loadTimeoutMs=180000}={}){
 aborted(signal);
 let ffmpeg,timer,coreUrl,wasmUrl,stop;
 const loadingController=new AbortController(),cancelLoading=()=>loadingController.abort();signal?.addEventListener('abort',cancelLoading,{once:true});
 const report=p=>onProgress({phase:'converting',engine:'ffmpeg',progress:Math.max(0,Math.min(.99,p))});
 try{
  onProgress({phase:'loading_converter',engine:'ffmpeg',progress:0});
  const wrapperUrl=new URL(FFMPEG_ASSET_BASE+'ffmpeg-0.12.15/index.js',origin);
  const [module,js,wasm]=await awaitCodecPhase(Promise.all([importModule(wrapperUrl.href),assetLoader(FFMPEG_PINS.coreJs,{fetcher,cryptoApi,origin,signal:loadingController.signal}),assetLoader(FFMPEG_PINS.wasm,{fetcher,cryptoApi,origin,signal:loadingController.signal})]),{signal,timeoutMs:loadTimeoutMs,onTimeout:cancelLoading,message:'No se pudo cargar el conversor a tiempo. El original se conserva.'});
  aborted(signal);ffmpeg=new module.FFmpeg();
  coreUrl=URLApi.createObjectURL(new Blob([js],{type:'text/javascript'}));wasmUrl=URLApi.createObjectURL(new Blob([wasm],{type:'application/wasm'}));
  const operation=(async()=>{
   ffmpeg.on('progress',event=>report(event.progress));
   await awaitCodecPhase(ffmpeg.load({coreURL:coreUrl,wasmURL:wasmUrl,classWorkerURL:new URL(FFMPEG_ASSET_BASE+'ffmpeg-0.12.15/worker.js',origin).href},{signal}),{signal,timeoutMs:loadTimeoutMs,onTimeout:()=>ffmpeg.terminate(),message:'El conversor no inició a tiempo. El original se conserva.'});
   aborted(signal);await ffmpeg.writeFile('input.bin',new Uint8Array(await file.arrayBuffer()),{signal});
   const probeExit=await ffmpeg.ffprobe(['-v','error','-show_entries','stream=codec_type,codec_name,width,height,duration:format=duration','-of','json','-o','probe.json','input.bin'],30000,{signal});
   const before=readVideoProbe(await ffmpeg.readFile('probe.json','utf8',{signal}),probeExit);
   const exit=await ffmpeg.exec(ffmpegMp4Args(before.duration,maxBytes),timeoutMs,{signal});
   if(exit!==0)throw Error('No se pudo convertir el video completo. El original y los demás datos se conservan.');
   const data=await ffmpeg.readFile('output.mp4','binary',{signal});
   if(!(data instanceof Uint8Array)||!data.length||data.length>maxBytes)throw Error('No se obtuvo un MP4 dentro del límite de 20 MB. El original se conserva.');
   const check=await ffmpeg.ffprobe(['-v','error','-show_entries','stream=codec_type,codec_name,width,height,duration:format=duration','-of','json','-o','output-probe.json','output.mp4'],30000,{signal});
   const after=readVideoProbe(await ffmpeg.readFile('output-probe.json','utf8',{signal}),check);
   if(before.hasAudio&&!after.hasAudio)throw Error('El MP4 no conserva el audio del video original. No se sustituyó el video anterior.');
   if(after.videoCodec!=='h264'||after.hasAudio&&after.audioCodecs.some(codec=>codec!=='aac'))throw Error('El MP4 no quedó en el formato de video y audio esperado. El original se conserva.');
   if(Math.abs(after.duration-before.duration)>Math.max(.7,before.duration*.01))throw Error('El MP4 no conserva la duración completa del original. No se sustituyó el video anterior.');
   aborted(signal);return new Blob([data],{type:'video/mp4'});
  })();
  operation.catch(()=>{});
  const interruption=new Promise((_,reject)=>{stop=()=>{ffmpeg.terminate();reject(new DOMException('Conversión cancelada. El original se conserva.','AbortError'));};signal?.addEventListener('abort',stop,{once:true});timer=setTimeout(()=>{ffmpeg.terminate();reject(Error('La conversión tardó demasiado. El original se conserva; intenta con un recorrido más corto.'));},timeoutMs+45000);});
  return await Promise.race([operation,interruption]);
 }finally{cancelLoading();signal?.removeEventListener('abort',cancelLoading);clearTimeout(timer);signal?.removeEventListener('abort',stop);ffmpeg?.terminate();if(coreUrl)URLApi.revokeObjectURL(coreUrl);if(wasmUrl)URLApi.revokeObjectURL(wasmUrl);}
}
