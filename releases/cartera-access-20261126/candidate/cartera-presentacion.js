/* Scoped presentation and keyboard behavior. No network, storage or permissions. */
(() => {
  'use strict';
  if (window.visualBaseline || !document.querySelector('#portfolioFilters') || !document.querySelector('#q-root')) return;
  const main=document.querySelector('#app'), nav=document.querySelector('.page>nav.tabs');
  const bg=document.getElementById('modalBg'),form=document.getElementById('actionForm'),cancel=document.getElementById('modalCancel');
  if(!main||!nav||!bg||!form||!cancel||main.contains(bg))return;
  const tabs=[...nav.querySelectorAll('button[data-tab]')];
  if(!tabs.length||tabs.some(button=>!document.getElementById(button.dataset.tab)))return;
  if(['query','platform','status','origin'].some(id=>!document.getElementById(id)))return;
  document.body.dataset.portfolioUi = 'cartera-v1';
  nav.setAttribute('role','tablist');
  const sync=()=>tabs.forEach(button=>{button.tabIndex=button.getAttribute('aria-selected')==='true'?0:-1;});
  tabs.forEach(button=>{
    button.id=button.id||'portfolio-tab-'+button.dataset.tab;
    button.setAttribute('role','tab');
    button.setAttribute('aria-controls',button.dataset.tab);
    const panel=document.getElementById(button.dataset.tab);
    panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
    button.addEventListener('click',sync);
    button.addEventListener('keydown',event=>{
      if(event.altKey||event.ctrlKey||event.metaKey||event.isComposing)return;
      const i=tabs.indexOf(button), n=tabs.length;
      const next=event.key==='ArrowRight'?(i+1)%n:event.key==='ArrowLeft'?(i+n-1)%n:event.key==='Home'?0:event.key==='End'?n-1:null;
      if(next===null)return; event.preventDefault();tabs[next].focus();tabs[next].click();
    });
  });sync();
  new MutationObserver(sync).observe(nav,{attributes:true,subtree:true,attributeFilter:['aria-selected']});
  for(const [id,text] of [['query','Buscar crédito'],['platform','Plataforma'],['status','Estado'],['origin','Tienda o aliado']]){
    const control=document.getElementById(id), label=document.createElement('label'), title=document.createElement('span');
    label.className='portfolio-filter';label.htmlFor=id;title.textContent=text;
    control.before(label);label.append(title,control);
  }
  let tableSequence=0;
  const enhanceTables=()=>document.querySelectorAll('.table-wrap,.q-scroll,.ce-scroll').forEach(wrap=>{
    if(wrap.dataset.portfolioScroll)return;
    wrap.dataset.portfolioScroll='true';wrap.tabIndex=0;wrap.setAttribute('role','region');
    if(!wrap.hasAttribute('aria-label'))wrap.setAttribute('aria-label','Tabla de '+(wrap.closest('.panel')?.id==='nova'?'autorizaciones Nova':'créditos'));
    const hint=document.createElement('p');hint.className='table-hint';hint.id='portfolio-scroll-hint-'+(++tableSequence);
    hint.textContent='Si no ves todas las columnas, desplaza la tabla horizontalmente.';
    wrap.before(hint);wrap.setAttribute('aria-describedby',hint.id);
  });
  enhanceTables();new MutationObserver(enhanceTables).observe(main,{childList:true,subtree:true});
  document.getElementById('q-dialog')?.setAttribute('aria-labelledby','q-client');
  let open=false,returnFocus=null,trigger=null,background=[];
  document.addEventListener('click',event=>{
    if(!bg.contains(event.target))trigger=event.target.closest('button,a[href]');
  },true);
  const focusables=()=>[...form.querySelectorAll('button,input:not([type=hidden]),select,textarea,a[href],[tabindex]')].filter(e=>!e.disabled&&!e.hidden&&e.tabIndex>=0&&e.getClientRects().length);
  form.setAttribute('role','dialog');form.setAttribute('aria-modal','true');form.setAttribute('aria-labelledby','modalTitle');
  new MutationObserver(()=>{
    if(bg.hidden===!open)return;
    open=!bg.hidden;
    if(open){
      returnFocus=trigger||(!bg.contains(document.activeElement)?document.activeElement:null);trigger=null;
      background=[...document.body.children].filter(e=>e!==bg&&!e.contains(bg)&&!['SCRIPT','STYLE','LINK'].includes(e.tagName)).map(e=>[e,e.inert]);
      background.forEach(([e])=>{e.inert=true;});
      form.querySelectorAll('.field').forEach((field,i)=>{
        const label=field.querySelector('label'),input=field.querySelector('input,select,textarea');
        if(label&&input&&!label.htmlFor){input.id=input.id||'portfolio-modal-field-'+i;label.htmlFor=input.id;}
      });
      form.tabIndex=-1;(focusables()[0]||form).focus();
    }else{background.forEach(([e,inert])=>{e.inert=inert;});background=[];if(returnFocus?.isConnected)returnFocus.focus();returnFocus=null;}
  }).observe(bg,{attributes:true,attributeFilter:['hidden']});
  form.addEventListener('keydown',event=>{
    if(!open||event.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();cancel.click();return;}
    if(event.key!=='Tab')return;
    const all=focusables(),first=all[0],last=all.at(-1);
    if(!first){event.preventDefault();form.focus();}
    else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
})();
