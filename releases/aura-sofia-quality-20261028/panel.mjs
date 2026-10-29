export function integrateQualityPanel(original) {
  function between(start,end,replacement){const a=original.indexOf(start),b=original.indexOf(end,a+start.length);if(a<0||b<0||original.indexOf(start,a+1)>=0)throw Error('Quality panel predecessor changed: '+start);original=original.slice(0,a)+replacement+original.slice(b);}
  between('<section id="login">','<div id="app" hidden>','<section id="login" hidden></section>\n');
  between('const config=','const $=',"let state=null;");
  between('async function api(action,body){','function node(',"async function api(action,body){if(parent===window||typeof parent.auraSofiaQualityRequest!=='function')throw Error('Abre este panel desde Sofía en AURA.');return parent.auraSofiaQualityRequest(action,body)}");
  between("$('loginForm').onsubmit=", "$('refresh').onclick=",'');
  between("$('logout').onclick=", ";$('propose').onclick=", "$('logout').onclick=()=>parent.postMessage({type:'aura-sofia-quality-close'},location.origin);");
  original=original.replace('<button id="logout" class="secondary">Cerrar sesión</button>','<button id="logout" class="secondary">Volver a conversaciones</button>');
  original=original.replace('</script></html>',";refresh().catch(e=>notify(e.message));</script></html>");
  if(/loginForm|grant_type=password|Contraseña de AURA|let token=/.test(original))throw Error('Standalone sign-in remains');
  return original;
}
