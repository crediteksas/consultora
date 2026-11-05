import legacy from './sofia-ui.mjs';
const HIDE_PREVIOUS=`  iv.classList.remove('visible');\n  iframe.src = 'about:blank';`;
const SHOW_LOADING=`  document.getElementById('main-content').style.display = 'none';
  iv.classList.add('visible');
  document.getElementById('iframe-status-title').textContent = \`Abriendo \${title}…\`;
  document.getElementById('iframe-status-copy').textContent = 'Espera un momento.';
  document.getElementById('iframe-status-actions').hidden = true;
  document.getElementById('iframe-status').classList.add('visible');
  iframe.src = 'about:blank';`;
const OLD_FETCH="fetch(embeddedDestination.href, { cache:'no-store', credentials:'same-origin' })";
const TIMED_FETCH="fetch(embeddedDestination.href, { cache:'no-store', credentials:'same-origin', signal:AbortSignal.timeout(15000) })";
function patchShellVisibility(html,css){
 for(const needle of [HIDE_PREVIOUS,OLD_FETCH,'</head>'])if(html.split(needle).length!==2)throw Error('AURA visibility contract differs');
 if(html.includes('id="aura-shell-visibility-20261028"'))throw Error('Visibility patch already present');
 return html.replace(HIDE_PREVIOUS,SHOW_LOADING).replace(OLD_FETCH,TIMED_FETCH)
  .replace('</head>','<style id="aura-shell-visibility-20261028">'+css+'</style>\n</head>');
}
function shellVisibilityOverlay(legacy,css){
 return {...legacy,async fetch(request,env,ctx){
  const path=new URL(request.url).pathname,response=await legacy.fetch(request,env,ctx);
  if(request.method!=='GET'||!['/creditek/agentes/','/creditek/agentes/index.html'].includes(path)||response.status!==200||!response.headers.get('content-type')?.includes('text/html'))return response;
  const html=await response.text();let body;try{body=patchShellVisibility(html,css);}catch{return new Response(html,response);}
  const headers=new Headers(response.headers);for(const key of ['etag','content-length','last-modified','content-encoding'])headers.delete(key);
  headers.set('cache-control','no-store');headers.set('x-aura-shell-visibility','20261028-1');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
 }};
}

export default shellVisibilityOverlay(legacy,"/* AURA shell only: separate brand and menu button at all supported widths. */\n#app .sidebar-logo {\n display:grid!important; grid-template-columns:minmax(0,1fr) 44px;\n align-items:center; gap:12px; padding:12px; min-height:110px!important; flex:0 0 auto;\n}\n#app .sidebar-logo .sidebar-home {\n width:100%!important; min-width:0; min-height:44px; padding:4px 0!important;\n margin:0!important; align-items:flex-start; box-shadow:none!important;\n}\n#app .sidebar-logo .sidebar-toggle {\n position:static!important; inset:auto!important; margin:0!important;\n width:44px!important; height:44px!important; min-width:44px!important;\n min-height:44px!important; padding:0!important; justify-self:center;\n}\n#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-logo {\n grid-template-columns:1fr; justify-items:center; gap:8px;\n padding:8px 5px; min-height:112px!important;\n}\n#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-home {\n width:44px!important; height:44px; min-height:44px; align-items:center; justify-content:center; gap:4px;\n}\n#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-brand-name {\n display:block!important; font-size:11px!important; line-height:1.1; letter-spacing:.08em;\n}\n#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-brand-name::after { content:none!important; }\n#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-brand-logo {\n display:block!important; width:44px; height:18px; object-fit:contain;\n padding:0; border:0; border-radius:0; background:transparent;\n}\n#app #iframe-status-actions[hidden] { display:none!important; }\n");
