(function(root){
 'use strict';
 const routes={listas:'listasGuardadas',catalogo:'catalogoTiendas',pedidos:'cierrePedidos',compras:'gestionCompras'};
 const legacy={listasWhatsApp:'listas',listasPrecios:'listas',comparativoProveedores:'listas',listasGuardadas:'listas',catalogoTiendas:'catalogo',cierrePedidos:'pedidos',gestionCompras:'compras'};
 const route=hash=>legacy[String(hash||'').replace(/^#/,'')]||'listas';
 function mount({container,nav,host=root,onReveal}){
  const buttons=[...nav.querySelectorAll('[data-workspace]')],panels=[...container.querySelectorAll('[data-workspace-panel]')];
  function show(key,{updateHash=true,reveal=null,focus=true}={}){
   if(!routes[key])key='listas';
   for(const panel of panels)panel.hidden=panel.dataset.workspacePanel!==key;
   for(const button of buttons){const selected=button.dataset.workspace===key;button.setAttribute('aria-selected',String(selected));button.classList.toggle('active',selected);button.tabIndex=selected?0:-1;}
   if(updateHash&&host.location.hash!=='#'+routes[key])host.history.pushState(null,'','#'+routes[key]);
   if(focus)buttons.find(button=>button.dataset.workspace===key)?.focus({preventScroll:true});
   onReveal?.(key,reveal);return key;
  }
  const hashChange=()=>show(route(host.location.hash),{updateHash:false,reveal:host.location.hash.slice(1),focus:false});
  for(const button of buttons){
   button.onclick=()=>show(button.dataset.workspace);
   button.onkeydown=event=>{let index=buttons.indexOf(button);if(event.key==='ArrowRight')index=(index+1)%buttons.length;else if(event.key==='ArrowLeft')index=(index+buttons.length-1)%buttons.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=buttons.length-1;else return;event.preventDefault();buttons[index].focus();show(buttons[index].dataset.workspace);};
  }
  host.addEventListener('hashchange',hashChange);hashChange();
  return{show,destroy(){host.removeEventListener('hashchange',hashChange);}};
 }
 const api={route,routes,mount};if(typeof module==='object'&&module.exports)module.exports=api;else root.KoraB2BWorkspace=api;
})(typeof globalThis!=='undefined'?globalThis:this);
