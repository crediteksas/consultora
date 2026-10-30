const AllyVideo = (()=>{
// Browser-local conversion. No upload, account access, camera or microphone use.
const MAX_VIDEO_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_SOURCE_BYTES = 100 * 1024 * 1024;
const VIDEO_FILE_ACCEPT = 'video/*,.mp4,.mov,.m4v,.webm,.mkv,.3gp,.3g2,.avi,.mpeg,.mpg,.mts,.m2ts';
const MP4_BRAND = /^(isom|iso[2-9]|mp41|mp42|avc1|M4V |MSNV|dash)$/;
const MIME_CANDIDATES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4'];
const text = bytes => String.fromCharCode(...bytes);
const checkAbort = signal => { if (signal?.aborted) throw new DOMException('Video cancelado.', 'AbortError'); };
function mp4Name(name) { return String(name || 'video').replace(/\.[^.]+$/, '').replace(/[\\/]/g, '_') + '.mp4'; }
function recordingMime(MediaRecorderClass) { return MIME_CANDIDATES.find(type => MediaRecorderClass?.isTypeSupported?.(type)) || null; }
function videoBitrate(duration, maxBytes = MAX_VIDEO_UPLOAD_BYTES) {
  if (!Number.isFinite(duration) || duration <= 0) throw Error('No se pudo determinar la duración del video.');
  const bitrate = Math.min(2000000, Math.floor(maxBytes * 8 * .86 / duration) - 96000);
  if (bitrate < 300000) throw Error('El video es demasiado largo para guardarlo con calidad legible dentro de 20 MB. Adjunta un recorrido más corto.');
  return bitrate;
}
// Inspect top-level ISO-BMFF boxes rather than trust extension or MIME. This is
// container validation, not an assertion about storefront/content suitability.
async function inspectMp4(blob, { signal } = {}) {
  if (!blob || !Number.isSafeInteger(blob.size) || blob.size < 32 || typeof blob.slice !== 'function') return false;
  let position = 0, ftyp = false, moov = false, media = false, boxes = 0;
  while (position < blob.size && boxes++ < 2048) {
    checkAbort(signal);
    if (blob.size - position < 8) return false;
    const header = new Uint8Array(await blob.slice(position, Math.min(position + 24, blob.size)).arrayBuffer());
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    let size = view.getUint32(0), headerLength = 8;
    const kind = text(header.slice(4, 8));
    if (size === 1) { if (header.length < 16) return false; const extended = view.getBigUint64(8); if (extended > BigInt(Number.MAX_SAFE_INTEGER)) return false; size = Number(extended); headerLength = 16; }
    if (size === 0) size = blob.size - position;
    if (size < headerLength || position + size > blob.size) return false;
    if (kind === 'ftyp') { if (position !== 0 || headerLength !== 8 || size < 16 || !MP4_BRAND.test(text(header.slice(8, 12)))) return false; ftyp = true; }
    if (kind === 'moov' && size > headerLength) moov = true;
    if (kind === 'mdat' && size > headerLength) media = true;
    position += size;
  }
  return position === blob.size && ftyp && moov && media;
}
async function prepareAllyVideo(file, { signal, onProgress = () => {}, transcode = transcodeVideoWithFallback, makeFile = (blob, name) => new File([blob], name, { type: 'video/mp4' }) } = {}) {
  if (!file || !Number.isSafeInteger(file.size) || !file.size) throw Error('Selecciona un video.');
  if (file.size > MAX_VIDEO_SOURCE_BYTES) throw Error('El video original supera 100 MB. Adjunta un archivo más pequeño.');
  checkAbort(signal);
  if (file.size <= MAX_VIDEO_UPLOAD_BYTES && await inspectMp4(file, { signal })) { onProgress({ phase: 'ready', progress: 1 }); return { file: makeFile(file, mp4Name(file.name)), converted: false }; }
  onProgress({ phase: 'converting', progress: 0 });
  const output = await transcode(file, { signal, onProgress, maxBytes: MAX_VIDEO_UPLOAD_BYTES });
  checkAbort(signal);
  if (!output || output.size > MAX_VIDEO_UPLOAD_BYTES || !await inspectMp4(output, { signal })) throw Error('No se obtuvo un MP4 válido de máximo 20 MB. El video original se conserva; no se cargó ni sustituyó el soporte anterior.');
  const prepared = makeFile(output, mp4Name(file.name));
  onProgress({ phase: 'ready', progress: 1 });
  return { file: prepared, converted: true };
}
async function transcodeVideoWithFallback(file, options = {}) {
  const {nativeTranscode = transcodeBrowserVideo, wasmTranscode, importWasmModule = ()=>import('/creditek/convenios/video-codec/video-ffmpeg-20261029.2.mjs'), fallbackLoadTimeoutMs = 180000, ...forward} = options;
  try { return await nativeTranscode(file, forward); }
  catch (error) {
    checkAbort(options.signal);
    if (error?.name === 'AbortError' || globalThis.document?.hidden) throw error;
    options.onProgress?.({phase:'loading_converter',progress:0});
    const fallback = wasmTranscode || (await awaitVideoPhase(importWasmModule(),{signal:options.signal,timeoutMs:fallbackLoadTimeoutMs,message:'No se pudo cargar el conversor a tiempo. El original se conserva.'})).transcodeWasmVideo;
    return fallback(file, forward);
  }
}
function awaitVideoPhase(value,{signal,timeoutMs=30000,message='La preparación del video tardó demasiado.',onTimeout=()=>{}}={}) {
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
async function transcodeBrowserVideo(file, { signal, onProgress = () => {}, maxBytes = MAX_VIDEO_UPLOAD_BYTES, documentRef = globalThis.document, URLApi = globalThis.URL, MediaRecorderClass = globalThis.MediaRecorder, AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext, resumeTimeoutMs = 15000 } = {}) {
  checkAbort(signal);
  const mime = recordingMime(MediaRecorderClass);
  if (!mime) throw Error('Este navegador no puede convertir a MP4. El original y los demás datos se conservan. Intenta desde Chrome o Safari actualizado, o adjunta un MP4.');
  const canvas = documentRef.createElement('canvas');
  if (typeof canvas.captureStream !== 'function') throw Error('Este navegador no permite preparar el MP4. El video original se conserva.');
  const video = documentRef.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.loop = false;
  let audioContext, mediaStream, recorder, source, audioDestination, drawTimer, timeout, objectUrl;
  const waitEvent = (element, event, errorMessage, milliseconds) => new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timer); element.removeEventListener(event, success); element.removeEventListener('error', failure); signal?.removeEventListener('abort', aborted); };
    const success = () => { done(); resolve(); }; const failure = () => { done(); reject(Error(errorMessage)); }; const aborted = () => { done(); reject(new DOMException('Video cancelado.', 'AbortError')); };
    const timer = setTimeout(failure, milliseconds); element.addEventListener(event, success, { once: true }); element.addEventListener('error', failure, { once: true }); signal?.addEventListener('abort', aborted, { once: true });
  });
  try {
    // Resume is bounded/cancellable and all resources belong to this finally.
    if(AudioContextClass){audioContext=new AudioContextClass();await awaitVideoPhase(audioContext.resume(),{signal,timeoutMs:resumeTimeoutMs,message:'No se pudo preparar el audio. El original se conserva.'});}
    checkAbort(signal);objectUrl=URLApi.createObjectURL(file);
    const loaded = waitEvent(video, 'loadedmetadata', 'Este video no se puede leer en este navegador. El original se conserva; intenta desde otro navegador o adjunta un MP4.', 30000);
    video.src = objectUrl; video.load(); await loaded; checkAbort(signal);
    if (!video.videoWidth || !video.videoHeight) throw Error('El archivo no contiene una imagen de video legible.');
    const duration = video.duration, bitrate = videoBitrate(duration, maxBytes);
    if (!audioContext) throw Error('Este navegador no permite conservar el audio al convertir. El original se conserva.');
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2); canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
    const context = canvas.getContext('2d', { alpha: false }); if (!context) throw Error('No se pudo preparar la imagen del video.');
    mediaStream = canvas.captureStream(24);
    source = audioContext.createMediaElementSource(video); audioDestination = audioContext.createMediaStreamDestination(); source.connect(audioDestination);
    for (const track of audioDestination.stream.getAudioTracks()) mediaStream.addTrack(track);
    const chunks = []; let bytes = 0;
    recorder = new MediaRecorderClass(mediaStream, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 96000 });
    const finished = new Promise((resolve, reject) => {
      let settled = false;
      const stop = () => { if (recorder.state !== 'inactive') recorder.stop(); };
      const failure = message => { if (settled) return; settled = true; cleanup(); stop(); reject(Error(message)); };
      const onAbort = () => failure('Conversión cancelada. El original y el soporte anterior se conservan.');
      const onHidden = () => { if (documentRef.hidden) failure('La conversión se pausó al salir de la pantalla. Mantén esta pestaña visible y vuelve a seleccionar el video; el original se conserva.'); };
      const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', onAbort); documentRef.removeEventListener('visibilitychange', onHidden); video.removeEventListener('ended', stop); video.removeEventListener('error', error); };
      const error = () => failure('No se pudo convertir el video completo. El original se conserva.');
      recorder.ondataavailable = event => { if (!event.data.size || settled) return; bytes += event.data.size; if (bytes > maxBytes) return failure('El MP4 convertido supera 20 MB. El original se conserva; adjunta un recorrido más corto.'); chunks.push(event.data); };
      recorder.onerror = error;
      recorder.onstop = () => { cleanup(); if (settled) return; settled = true; if (!video.ended || video.currentTime < duration - .6) return reject(Error('No se pudo convertir el video completo. El original se conserva.')); resolve(new Blob(chunks, { type: 'video/mp4' })); };
      signal?.addEventListener('abort', onAbort, { once: true }); documentRef.addEventListener('visibilitychange', onHidden); video.addEventListener('ended', stop, { once: true }); video.addEventListener('error', error, { once: true });
      timeout = setTimeout(() => failure('La conversión no terminó. El original se conserva; intenta de nuevo manteniendo esta pestaña abierta.'), duration * 1000 + 45000);
      try{recorder.start(1000);}catch{failure('No se pudo iniciar la conversión. El original se conserva.');}
    });
    finished.catch(() => {}); // play()/visibility failure must not leave an unhandled recorder rejection.
    const draw = () => { if (video.readyState >= 2) context.drawImage(video, 0, 0, canvas.width, canvas.height); onProgress({ phase: 'converting', progress: Math.min(.99, video.currentTime / duration) }); };
    draw(); drawTimer = setInterval(draw, 1000 / 24); await awaitVideoPhase(video.play(),{signal,timeoutMs:30000,message:'No se pudo iniciar la reproducción para convertir. El original se conserva.'});
    return await finished;
  } finally {
    clearInterval(drawTimer); clearTimeout(timeout);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    video.pause(); video.removeAttribute('src'); video.load(); if(objectUrl)URLApi.revokeObjectURL(objectUrl);
    for (const track of mediaStream?.getTracks?.() || []) track.stop();
    if (source) source.disconnect(); if (audioContext) await awaitVideoPhase(audioContext.close(),{timeoutMs:1000}).catch(() => {});
  }
}

return {prepareAllyVideo,VIDEO_FILE_ACCEPT};
})();
// Extensión privada del panel existente. No solicita firmas ni envía correos.
function aloPanel(r){
 if(!(r.plataformasSolicitadas||[]).includes('alo_credit'))return '';
 const a=r.alo||{},data=(r.data||{}).alo||{};
 return '<article class="item"><h2>Aló Credit · ALO-FO-CA-001</h2><p>'+esc(a.status||'Formato pendiente de preparar')+'</p>'+
 '<p>Jennifer firma por Creditek antes de enviar a firma electrónica a la tienda. El KAM firma al recibir en Aló. Cada paso se registra después de comprobarlo.</p>'+
 (a.configMissing?.length?'<p class="notice">Datos por completar: '+a.configMissing.map(esc).join('; ')+'.</p>':'')+
 '<label>Razón social o titular según Cámara<input id="aloLegal" maxlength="180" value="'+esc(data.razonSocial)+'"></label>'+
 '<label>Matrícula del establecimiento<input id="aloRegistration" maxlength="180" value="'+esc(data.matricula)+'"></label>'+
 '<label class="check"><input type="checkbox" id="aloDataChecked">Contrasté estos datos con la Cámara y la identificación.</label><button type="button" id="aloSaveData">Guardar datos Aló</button> '+
 '<button type="button" id="aloGenerate">Preparar borrador Aló</button>'+
 (a.draft?'<p><a target="_blank" rel="noopener noreferrer" href="https://drive.google.com/file/d/'+encodeURIComponent(a.draft.fileId)+'/view">Abrir borrador oficial · versión '+esc(a.draft.revision)+'</a></p>':'')+
 '<details><summary>Registrar documento preparado y firma de la tienda</summary><p>Registra únicamente acciones que ya comprobaste en Google. Estos controles no envían solicitudes.</p>'+
 '<label>ID del PDF en la carpeta original<input id="aloFileId"></label>'+
 '<label class="check"><input type="checkbox" id="aloCompanyChecked">La firma de Jennifer está insertada y revisé que los datos y el diseño estén completos.</label>'+
 '<button type="button" id="aloCompany">Registrar documento con firma de Creditek</button>'+
 '<label>Identificador de la solicitud confirmada en Google<input id="aloRequestId" value="'+esc(a.subSignature?.requestId)+'"></label>'+
 '<label class="check"><input type="checkbox" id="aloRequestChecked">Google confirmó la solicitud a la tienda y comprobé que no existe otra.</label>'+
 '<button type="button" id="aloRequested">Registrar solicitud de firma enviada</button>'+
 '<label>Fecha de firma según auditoría, con zona horaria<input id="aloSignedAt" placeholder="2026-10-29T15:00:00-05:00"></label>'+
 '<label class="check"><input type="checkbox" id="aloAuditChecked">Abrí el PDF final y su auditoría: coinciden la solicitud, la identidad del representante, la fecha y la firma de Creditek.</label>'+
 '<button type="button" id="aloSigned">Registrar firma comprobada de la tienda</button></details>'+
 '<details><summary>Preparar paquete y registrar envío a Aló</summary><p>Selecciona abajo los archivos del expediente. Incluye el PDF firmado y su auditoría.</p>'+
 Object.entries({camara:'Cámara completa del establecimiento',fachada:'Foto de fachada',interior:'Foto de interior',vitrinas:'Foto de vitrinas',datos:'Datos conciliados con Cámara e identificación',firma:'Firma de Creditek y firma de la tienda con auditoría'}).map(([k,v])=>'<label class="check"><input type="checkbox" data-alo-control="'+k+'">'+esc(v)+'</label>').join('')+
 '<button type="button" id="aloPackage">Preparar paquete Aló</button>'+
 '<label>ID del correo realmente enviado a Aló<input id="aloMailId"></label><button type="button" id="aloSubmitted">Registrar envío comprobado</button>'+
 '<label>ID de confirmación de creación por Aló<input id="aloConfirmationId"></label><button type="button" id="aloCreated">Registrar creación confirmada</button></details></article>';
}
function bindAlo(){
 if(!document.getElementById('aloSaveData'))return;
 const action=async(operation,payload={})=>{const result=await api('pending_alo',{radicado:record.radicado,version:record.version,operation,...payload});record=result.record;render();message('Estado de Aló guardado. No se enviaron correos ni solicitudes de firma desde este control.');};
 $('aloSaveData').onclick=()=>run(()=>action('data',{data:{razonSocial:$('aloLegal').value.trim(),matricula:$('aloRegistration').value.trim()},confirmed:$('aloDataChecked').checked}));
 $('aloGenerate').onclick=()=>run(()=>action('generate'));
 $('aloCompany').onclick=()=>run(()=>action('company_prepared',{fileId:$('aloFileId').value.trim(),checked:$('aloCompanyChecked').checked,layoutChecked:$('aloCompanyChecked').checked}));
 $('aloRequested').onclick=()=>run(()=>action('requested',{requestId:$('aloRequestId').value.trim(),checked:$('aloRequestChecked').checked}));
 $('aloSigned').onclick=()=>run(()=>action('signed',{fileId:$('aloFileId').value.trim(),requestId:$('aloRequestId').value.trim(),signedAt:$('aloSignedAt').value.trim(),auditChecked:$('aloAuditChecked').checked,identityChecked:$('aloAuditChecked').checked,companySignatureChecked:$('aloAuditChecked').checked}));
 $('aloPackage').onclick=()=>run(()=>action('package',{checklist:Object.fromEntries([...document.querySelectorAll('[data-alo-control]')].map(x=>[x.dataset.aloControl,x.checked])),selectedFiles:[...document.querySelectorAll('[data-pack]:checked')].map(x=>x.dataset.pack)}));
 $('aloSubmitted').onclick=()=>run(()=>action('submitted',{gmailMessageId:$('aloMailId').value.trim(),checked:!!$('aloMailId').value.trim()}));
 $('aloCreated').onclick=()=>run(()=>action('created',{confirmationId:$('aloConfirmationId').value.trim(),checked:!!$('aloConfirmationId').value.trim()}));
}

'use strict';
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let adminKey='',token='',record=null,records=[],types={},busy=false,inventory=[];
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.has('admin')){adminKey=fragment.get('admin');sessionStorage.setItem('auraPendingAdmin',adminKey);history.replaceState(null,'',location.pathname+location.search);}else adminKey=sessionStorage.getItem('auraPendingAdmin')||'';
const statusNames={pending:'Pendiente de corregir',rejected:'Requiere corrección',staged:'Guardado; falta enviar a revisión',review:'Recibido; pendiente de revisión',approved:'Aprobado'};
function message(text,error=false){$('message').className=error?'error':'success';$('message').textContent=text;}
async function api(action,body={}){const r=await fetch('/api/pendientes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...body,...(adminKey?{adminKey}:{token})}),cache:'no-store'});const d=await r.json();if(!d.ok)throw Error(d.error||'No se pudo confirmar la operación.');return d;}
async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(x=>x.disabled=true);try{await fn();}catch(e){message(e.message,true);}finally{busy=false;document.querySelectorAll('button').forEach(x=>x.disabled=false);}}
function uuid(){return crypto.randomUUID();}
$('radicado').value=new URLSearchParams(location.search).get('radicado')||'';
$('loginForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{const radicado=$('radicado').value.trim().toUpperCase(),identificacion=$('identificacion').value.trim();if(!radicado&&!identificacion)throw Error('Escribe el radicado o la identificación del representante.');const d=await api('pending_login',{radicado,identificacion});$('identificacion').value='';if(d.matches){$('detail').hidden=false;$('detail').innerHTML='<div class="card"><h2>Selecciona el negocio que vas a corregir</h2>'+d.matches.map((x,n)=>'<p><button type="button" data-match="'+n+'">'+esc(x.record.business)+' · '+esc(x.record.radicado)+'</button></p>').join('')+'</div>';$('detail').querySelectorAll('[data-match]').forEach(b=>b.onclick=()=>{const selected=d.matches[Number(b.dataset.match)];token=selected.token;record=selected.record;render();message('Expediente consultado. Solo se muestran sus pendientes.');});message('Hay varios negocios con esa identificación. Selecciona el que corresponde.');return;}token=d.token;record=d.record;render();message('Expediente consultado. Solo se muestran sus pendientes.');});});
$('refresh').onclick=()=>run(loadList);$('filter').oninput=renderList;
async function loadList(){const d=await api('pending_list');records=d.records;types=d.types;$('login').hidden=true;$('adminList').hidden=false;renderList();}
function renderList(){const q=$('filter').value.toLowerCase();const rows=records.filter(r=>[r.business,r.owner,...r.radicados].join(' ').toLowerCase().includes(q));$('records').innerHTML='<p class="hint">'+rows.length+' expedientes</p><table><thead><tr><th>Negocio / radicado</th><th>Responsable</th><th>Estado</th><th></th></tr></thead><tbody>'+rows.map(r=>'<tr><td><strong>'+esc(r.business)+'</strong><br>'+esc(r.radicados.join('; '))+'</td><td>'+esc(r.owner)+'</td><td>'+esc(r.state)+'</td><td><button data-open="'+esc(r.radicado)+'">Revisar</button></td></tr>').join('')+'</tbody></table>';$('records').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>run(()=>openRecord(b.dataset.open)));}
async function openRecord(rad){const d=await api('pending_login',{radicado:rad});record=d.record;token=d.token;inventory=[];render();}
function render(){const r=record;$('login').hidden=true;$('detail').hidden=false;if(adminKey)$('adminList').hidden=true;
 $('detail').innerHTML='<div class="card"><h1>'+esc(r.business)+'</h1><p><strong>'+esc(r.radicado)+'</strong> · '+esc(r.owner)+'</p><span class="status">'+esc(r.state)+'</span><div class="links"><a target="_blank" rel="noopener noreferrer" href="'+esc(r.folderUrl)+'">Abrir carpeta original</a>'+(r.packageUrl?'<a target="_blank" rel="noopener noreferrer" href="'+esc(r.packageUrl)+'">Documentos vigentes del expediente</a>':'')+'</div>'+(!r.auditComplete?'<p class="notice">La revisión integral del expediente sigue pendiente. Los soportes aún no revisados pueden generar observaciones adicionales.</p>':'')+(adminKey?adminContent(r):execContent(r))+'<button id="back" class="secondary">'+(adminKey?'Volver al listado':'Consultar otro radicado')+'</button></div>';
 $('back').onclick=()=>{record=null;token='';$('detail').hidden=true;if(adminKey){$('adminList').hidden=false;run(loadList);}else $('login').hidden=false;};
 if(adminKey){bindAdmin();bindAlo();}else bindExecutive();window.scrollTo({top:0,behavior:'smooth'});
}
function execContent(r){return '<h2>Pendientes por corregir</h2>'+(!r.items.length?'<p>No tienes correcciones por cargar. Consulta el estado de la revisión.</p>':'')+r.items.map(i=>'<article class="item" data-item="'+esc(i.id)+'"><h3>'+esc(i.label)+'</h3><p>'+esc(i.detail)+'</p><span class="status">'+esc(statusNames[i.status])+'</span>'+i.files.map(f=>'<p><a target="_blank" rel="noopener noreferrer" href="'+esc(f.url)+'">Ver soporte cargado</a></p>').join('')+(i.internal?'<p class="hint">Esta revisión corresponde al equipo interno; no necesitas cargar otro archivo aquí.</p>':i.status==='review'?'<p class="hint">Espera el resultado de la revisión. Si se devuelve, podrás corregir este soporte.</p>':i.text?'<label for="response-'+esc(i.id)+'">Corrección / aclaración</label><textarea id="response-'+esc(i.id)+'" data-response="'+esc(i.id)+'" maxlength="3000">'+esc(i.response)+'</textarea>':'<label for="file-'+esc(i.id)+'">'+(i.status==='staged'?'Reemplazar carga guardada':'Adjuntar corrección')+'</label><input type="file" id="file-'+esc(i.id)+'" data-file="'+esc(i.id)+'" accept="'+esc(i.type==='video'?AllyVideo.VIDEO_FILE_ACCEPT:i.accept)+'">'+(i.type==='camara'&&!((r.plataformasSolicitadas||[]).length===1&&r.plataformasSolicitadas[0]==='alo_credit')?'<div class="row"><div><label for="date-'+esc(i.id)+'">Fecha de expedición</label><input type="date" id="date-'+esc(i.id)+'"></div><div><label for="ciiu-'+esc(i.id)+'">Códigos CIIU del certificado</label><input id="ciiu-'+esc(i.id)+'" placeholder="4741"></div></div><p class="hint">Menos de 60 días de expedición y actividad 4741. Adjunta el certificado completo.</p>':'')+'<p class="hint">Máximo 20 MB por archivo.'+(i.type==='video'?' Se preparará como MP4 antes de guardar; debe mostrar exterior e interior y coincidir con las fotos.':i.type==='fachada'?' Deben verse el nombre del establecimiento y la nomenclatura.':'')+'</p><button type="button" data-upload="'+esc(i.id)+'">Guardar este soporte</button>')+'</article>').join('')+'<p class="notice">Guarda cada soporte y luego pulsa “Enviar correcciones a revisión”. La carga no aprueba automáticamente los documentos.</p><button id="submitCorrections">Enviar correcciones a revisión</button>';}
async function fileData(file){if(!file)throw Error('Selecciona el archivo corregido.');if(file.size>20*1024*1024)throw Error('El archivo supera 20 MB.');const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('No se pudo leer el archivo.'));reader.onload=()=>resolve(reader.result);reader.readAsDataURL(file);});if(file.type.startsWith('image/')){const img=await new Promise((resolve,reject)=>{const v=new Image();v.onload=()=>resolve(v);v.onerror=()=>reject(Error('No se pudo convertir la fotografía. Adjunta una imagen JPG, PNG o WebP.'));v.src=url;});const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(img,0,0,canvas.width,canvas.height);return {base64:canvas.toDataURL('image/jpeg',.82).split(',')[1],tipo:'image/jpeg',nombre:file.name.replace(/\.[^.]+$/,'')+'.jpg'};}return {base64:url.split(',')[1],tipo:file.type||(/\.mp4$/i.test(file.name)?'video/mp4':/\.pdf$/i.test(file.name)?'application/pdf':''),nombre:file.name};}
function bindExecutive(){document.querySelectorAll('[data-upload]').forEach(b=>b.onclick=()=>run(async()=>{const id=b.dataset.upload;const item=record.items.find(i=>i.id===id);if(item.type==='fachada'&&!window.confirm('Confirma que en la foto se ven el nombre del establecimiento y la nomenclatura del local.'))return;const selectedInput=$('file-'+id),selectedFile=selectedInput.files[0];let f=selectedFile;if(item.type==='video')selectedInput.disabled=true;try{if(item.type==='video'){const prepared=await AllyVideo.prepareAllyVideo(f,{onProgress:s=>message(s.phase==='ready'?'MP4 preparado; guardando…':s.phase==='loading_converter'?'Cargando el conversor de video. Puede tardar la primera vez; el original se conserva.':'Convirtiendo a MP4: '+Math.round(s.progress*100)+'%. Mantén esta pestaña visible. Los demás datos se conservan.')});f=prepared.file;}const requestId=uuid();message('Guardando soporte en la carpeta original…');const preparedData=await fileData(f);if(item.type==='video'&&selectedInput.files[0]!==selectedFile)throw Error('El video seleccionado cambió. No se guardó otro archivo; vuelve a pulsar Guardar.');const d=await api('pending_upload',{radicado:record.radicado,version:record.version,itemId:id,requestId,file:preparedData,fechaCamara:$('date-'+id)?.value,ciiu:$('ciiu-'+id)?.value});record=d.record;render();message('Soporte guardado. Al terminar, envía las correcciones a revisión.');}finally{selectedInput.disabled=false;}}));
 $('submitCorrections').onclick=()=>run(async()=>{const responses=[...document.querySelectorAll('[data-response]')].filter(x=>x.value.trim()).map(x=>({id:x.dataset.response,value:x.value.trim()}));let saved;try{saved=JSON.parse(sessionStorage.getItem('aura-submit-'+record.radicado)||'null');}catch{}const requestId=saved&&saved.version===record.version?saved.id:uuid();sessionStorage.setItem('aura-submit-'+record.radicado,JSON.stringify({id:requestId,version:record.version}));const d=await api('pending_submit',{radicado:record.radicado,version:record.version,requestId,responses});sessionStorage.removeItem('aura-submit-'+record.radicado);record=d.record;render();message(d.mailState==='awaiting_review'?'Correcciones guardadas para revisar. El informe se enviará al terminar la revisión; no necesitas volver a cargar los archivos.':d.mailState==='sent'?'Correcciones enviadas. Óscar recibió el aviso para revisar.':'Correcciones guardadas. El envío del aviso no pudo confirmarse; no repitas la carga.');});}
function dataContent(r){if((r.plataformasSolicitadas||[]).length===1&&r.plataformasSolicitadas[0]==='alo_credit')return '';const d=r.data||{};return '<article class="item"><h2>Datos del M3</h2><p class="hint">Corrige los datos después de contrastarlos con los documentos. Actualizar el M3 conserva los enlaces de los Excel existentes.</p><div class="row">'+Object.entries({nombreComercial:'Nombre del negocio',direccion:'Dirección',departamento:'Departamento',municipio:'Municipio',nombre:'Nombre del representante',cedula:'Identificación del representante',telefono:'Celular de la tienda',correo:'Correo de la tienda',nit:'NIT'}).map(([k,v])=>'<div><label for="m3-'+k+'">'+v+'</label><input id="m3-'+k+'" data-m3="'+k+'" value="'+esc(d[k])+'"></div>').join('')+'</div><h3>Usuarios M3 · hasta cinco</h3>'+Array.from({length:5},(_,n)=>{const u=(d.vendedores||[])[n]||{};return '<details '+(u.nombres?'open':'')+'><summary>Usuario '+(n+1)+'</summary><div class="row" data-vendor="'+n+'">'+Object.entries({nombres:'Nombres',apellidos:'Apellidos',cedula:'Identificación',celular:'Celular',correo:'Correo'}).map(([k,v])=>'<div><label for="vendor-'+n+'-'+k+'">'+v+'</label><input id="vendor-'+n+'-'+k+'" data-v="'+k+'" value="'+esc(u[k])+'"></div>').join('')+'</div></details>';}).join('')+'<label class="check"><input type="checkbox" id="m3Confirmed">Contrasté estos datos con los documentos y las correcciones recibidas.</label><button id="updateM3" class="secondary">Actualizar M3 en las carpetas originales</button></article>'; }
function adminContent(r){return aloPanel(r)+'<h2>Calificación interna</h2><p class="hint">Aprueba solo después de abrir y revisar el soporte. Puedes devolverlo con una observación concreta.</p>'+r.items.map(i=>'<article class="item" data-review="'+esc(i.id)+'"><h3>'+esc(i.label)+'</h3><label>Observación que verá el ejecutivo<textarea data-detail maxlength="3000">'+esc(i.detail)+'</textarea></label><label>Estado<select data-state>'+Object.entries(statusNames).map(([k,v])=>'<option value="'+k+'" '+(i.status===k?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label><label class="check"><input type="checkbox" data-checked '+(i.status==='approved'?'checked':'')+'>He revisado este soporte o dato y confirmo su resultado.</label>'+i.files.map(f=>'<p><a href="'+esc(f.url)+'" target="_blank" rel="noopener noreferrer">'+esc(f.name)+'</a></p>').join('')+(i.response?'<p><strong>Respuesta del ejecutivo:</strong> '+esc(i.response)+'</p>':'')+'</article>').join('')+'<article class="item"><h3>Agregar un pendiente</h3><label for="addType">Soporte o dato</label><select id="addType"><option value="">No agregar</option>'+Object.entries(types).filter(([k,v])=>!v.retired).map(([k,v])=>'<option value="'+k+'">'+esc(v.label)+'</option>').join('')+'</select><label for="addDetail">Qué debe corregir</label><textarea id="addDetail" maxlength="3000"></textarea></article><label class="check"><input type="checkbox" id="auditComplete" '+(r.auditComplete?'checked':'')+'>Completé la auditoría integral de este expediente.</label><label for="reviewNote">Observación interna del resultado</label><textarea id="reviewNote" maxlength="3000"></textarea><button id="saveReview">Guardar revisión y avisarme por correo</button>'+dataContent(r)+'<article class="item"><h2>Archivos y paquete del expediente</h2><p>Selecciona solo los archivos que deben enviarse. Para Aló usa su control específico. El control general prepara el paquete de PayJoy.</p><button id="loadFiles" class="secondary">Ver archivos del expediente</button><div id="fileList"></div><div class="row"><div><label for="finalCameraDate">Fecha de Cámara verificada en el documento</label><input type="date" id="finalCameraDate"></div><div><label for="finalCiiu">CIIU verificados</label><input id="finalCiiu" placeholder="4741"></div></div><h3>Controles antes de enviar</h3>'+Object.entries({camara:'Cámara completa, legible y con menos de 60 días',ciiu:'Actividad económica 4741 en la Cámara',fachada:'Fachada con nombre y nomenclatura legibles',video:'Video MP4: exterior e interior concordantes',cedulas:'Identificaciones completas y concordantes',firma:'Convenio firmado por quien corresponde',m3:'M3 vigente completo, datos y usuarios conciliados',direccion:'Dirección del local contrastada con soporte'}).map(([k,v])=>'<label class="check"><input type="checkbox" data-control="'+k+'">'+esc(v)+'</label>').join('')+'<button id="prepare">Aprobar y preparar paquete para Diana</button></article>';}
function reviewPayload(prepare=false){return {radicado:record.radicado,version:record.version,items:[...document.querySelectorAll('[data-review]')].map(el=>({id:el.dataset.review,status:el.querySelector('[data-state]').value,detail:el.querySelector('[data-detail]').value,checked:el.querySelector('[data-checked]').checked})),add:$('addType').value?[{type:$('addType').value,detail:$('addDetail').value}]:[],auditComplete:$('auditComplete').checked,note:$('reviewNote').value,preparePackage:prepare,camera:{fechaCamara:$('finalCameraDate').value,ciiu:$('finalCiiu').value},selectedFiles:[...document.querySelectorAll('[data-pack]:checked')].map(x=>x.dataset.pack),checklist:Object.fromEntries([...document.querySelectorAll('[data-control]')].map(x=>[x.dataset.control,x.checked]))};}
function bindAdmin(){if($('updateM3'))$('updateM3').onclick=()=>run(async()=>{const data=Object.fromEntries([...document.querySelectorAll('[data-m3]')].map(x=>[x.dataset.m3,x.value.trim()]));data.vendedores=[...document.querySelectorAll('[data-vendor]')].map(el=>Object.fromEntries([...el.querySelectorAll('[data-v]')].map(x=>[x.dataset.v,x.value.trim()]))).filter(v=>Object.values(v).some(Boolean));const d=await api('pending_data',{radicado:record.radicado,version:record.version,data,regenerate:true,confirmed:$('m3Confirmed').checked});record=d.record;render();message('M3 actualizado en las carpetas originales. Continúa la revisión de los soportes.');});const save=prepare=>run(async()=>{const d=await api('pending_review',reviewPayload(prepare));record=d.record;render();message(d.mailState==='sent'?'Revisión guardada y correo enviado a Óscar.':'Revisión guardada. El envío del correo requiere comprobarse.');});$('saveReview').onclick=()=>save(false);$('prepare').onclick=()=>save(true);if((record.plataformasSolicitadas||[]).length===1&&record.plataformasSolicitadas[0]==='alo_credit'){$('prepare').hidden=true;document.querySelectorAll('[data-control]').forEach(x=>x.closest('label').hidden=true);$('finalCameraDate').closest('.row').hidden=true;}$('loadFiles').onclick=()=>run(async()=>{const d=await api('pending_files',{radicado:record.radicado});inventory=d.files;$('fileList').innerHTML=inventory.map(f=>'<label class="check"><input type="checkbox" data-pack="'+esc(f.id)+'"><span>'+esc(f.name)+'<br><span class="small">'+esc(f.path)+'</span> · <a href="'+esc(f.url)+'" target="_blank" rel="noopener noreferrer">Abrir</a></span></label>').join('');});}
if(adminKey)run(async()=>{await loadList();const rad=new URLSearchParams(location.search).get('radicado');if(rad)await openRecord(rad);}).catch(e=>message(e.message,true));
