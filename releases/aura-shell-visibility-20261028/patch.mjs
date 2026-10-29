export const HIDE_PREVIOUS=`  iv.classList.remove('visible');\n  iframe.src = 'about:blank';`;
export const SHOW_LOADING=`  document.getElementById('main-content').style.display = 'none';
  iv.classList.add('visible');
  document.getElementById('iframe-status-title').textContent = \`Abriendo \${title}…\`;
  document.getElementById('iframe-status-copy').textContent = 'Espera un momento.';
  document.getElementById('iframe-status-actions').hidden = true;
  document.getElementById('iframe-status').classList.add('visible');
  iframe.src = 'about:blank';`;
export const OLD_FETCH="fetch(embeddedDestination.href, { cache:'no-store', credentials:'same-origin' })";
export const TIMED_FETCH="fetch(embeddedDestination.href, { cache:'no-store', credentials:'same-origin', signal:AbortSignal.timeout(15000) })";
export function patchShellVisibility(html,css){
 for(const needle of [HIDE_PREVIOUS,OLD_FETCH,'</head>'])if(html.split(needle).length!==2)throw Error('AURA visibility contract differs');
 if(html.includes('id="aura-shell-visibility-20261028"'))throw Error('Visibility patch already present');
 return html.replace(HIDE_PREVIOUS,SHOW_LOADING).replace(OLD_FETCH,TIMED_FETCH)
  .replace('</head>','<style id="aura-shell-visibility-20261028">'+css+'</style>\n</head>');
}
export function shellVisibilityOverlay(legacy,css){
 return {...legacy,async fetch(request,env,ctx){
  const path=new URL(request.url).pathname,response=await legacy.fetch(request,env,ctx);
  if(request.method!=='GET'||!['/creditek/agentes/','/creditek/agentes/index.html'].includes(path)||response.status!==200||!response.headers.get('content-type')?.includes('text/html'))return response;
  const html=await response.text();let body;try{body=patchShellVisibility(html,css);}catch{return new Response(html,response);}
  const headers=new Headers(response.headers);for(const key of ['etag','content-length','last-modified','content-encoding'])headers.delete(key);
  headers.set('cache-control','no-store');headers.set('x-aura-shell-visibility','20261028-1');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
 }};
}
