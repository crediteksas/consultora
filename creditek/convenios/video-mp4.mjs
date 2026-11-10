// Browser-local conversion. No upload, account access, camera or microphone use.
export const MAX_VIDEO_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_SOURCE_BYTES = 100 * 1024 * 1024;
export const VIDEO_FILE_ACCEPT = 'video/*,.mp4,.mov,.m4v,.webm,.mkv,.3gp,.3g2,.avi,.mpeg,.mpg,.mts,.m2ts';
const MP4_BRAND = /^(isom|iso[2-9]|mp41|mp42|avc1|M4V |MSNV|dash)$/;
const MIME_CANDIDATES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4'];
const text = bytes => String.fromCharCode(...bytes);
const checkAbort = signal => { if (signal?.aborted) throw new DOMException('Video cancelado.', 'AbortError'); };
export function mp4Name(name) { return String(name || 'video').replace(/\.[^.]+$/, '').replace(/[\\/]/g, '_') + '.mp4'; }
export function recordingMime(MediaRecorderClass) { return MIME_CANDIDATES.find(type => MediaRecorderClass?.isTypeSupported?.(type)) || null; }
export function videoBitrate(duration, maxBytes = MAX_VIDEO_UPLOAD_BYTES) {
  if (!Number.isFinite(duration) || duration <= 0) throw Error('No se pudo determinar la duración del video.');
  const bitrate = Math.min(2000000, Math.floor(maxBytes * 8 * .86 / duration) - 96000);
  if (bitrate < 300000) throw Error('El video es demasiado largo para guardarlo con calidad legible dentro de 20 MB. Adjunta un recorrido más corto.');
  return bitrate;
}
// Inspect top-level ISO-BMFF boxes rather than trust extension or MIME. This is
// container validation, not an assertion about storefront/content suitability.
export async function inspectMp4(blob, { signal } = {}) {
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
export async function prepareAllyVideo(file, { signal, onProgress = () => {}, transcode = transcodeVideoWithFallback, makeFile = (blob, name) => new File([blob], name, { type: 'video/mp4' }) } = {}) {
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
export async function transcodeVideoWithFallback(file, options = {}) {
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
export function awaitVideoPhase(value,{signal,timeoutMs=30000,message='La preparación del video tardó demasiado.',onTimeout=()=>{}}={}) {
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
export async function transcodeBrowserVideo(file, { signal, onProgress = () => {}, maxBytes = MAX_VIDEO_UPLOAD_BYTES, documentRef = globalThis.document, URLApi = globalThis.URL, MediaRecorderClass = globalThis.MediaRecorder, AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext, resumeTimeoutMs = 15000 } = {}) {
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
