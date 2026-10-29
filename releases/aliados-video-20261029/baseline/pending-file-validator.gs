function auraArchivo_(f,type){
 if(!f||typeof f.base64!=='string'||!f.base64.length||f.base64.length>29*1024*1024||!/^[A-Za-z0-9+/=\r\n]+$/.test(f.base64))throw new Error('Archivo inválido o mayor de 20 MB.');
 const bytes=Utilities.base64Decode(f.base64);if(bytes.length>20*1024*1024)throw new Error('Cada archivo debe pesar máximo 20 MB.');
 const mime=String(f.tipo||'');const h=bytes.slice(0,12).map(function(b){return (b+256)%256;});
 const pdf=h[0]===37&&h[1]===80&&h[2]===68&&h[3]===70;
 const image=(mime==='image/jpeg'&&h[0]===255&&h[1]===216)||(mime==='image/png'&&h[0]===137&&h[1]===80&&h[2]===78&&h[3]===71)||(mime==='image/webp'&&h.slice(0,4).map(function(c){return String.fromCharCode(c);}).join('')==='RIFF'&&h.slice(8,12).map(function(c){return String.fromCharCode(c);}).join('')==='WEBP');
 if(type==='video'){
  if(mime!=='video/mp4'||h[4]!==102||h[5]!==116||h[6]!==121||h[7]!==112||!/^(isom|iso[2-9]|mp41|mp42|avc1|M4V |MSNV|dash)$/.test(h.slice(8,12).map(function(c){return String.fromCharCode(c);}).join(''))||!/\.mp4$/i.test(f.nombre||''))throw new Error('Adjunta un video MP4 real; cambiar la extensión no convierte el video.');
 }else if(type==='firma'||type==='alo_firma'){if(mime!=='application/pdf'||!pdf)throw new Error('El convenio debe ser PDF.');}
 else if(!image&&!(pdf&&mime==='application/pdf'&&['camara','cedula','vendedor','servicio'].indexOf(type)!==-1))throw new Error('Formato no permitido para este soporte. Adjunta una imagen JPG/PNG/WebP o PDF cuando corresponda.');
 return {bytes:bytes,mime:mime,hash:hashSolicitud_(f.base64)};
}
