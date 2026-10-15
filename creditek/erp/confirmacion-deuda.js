(function (global) {
  'use strict';
  const money = n => new Intl.NumberFormat('es-CO', {style:'currency',currency:'COP',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(n));
  function el(tag,text){const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;}
  async function mount({sb,profile}){
    if(profile?.rol!=='admin_tienda'||global.__koraDeudaMounted)return;
    global.__koraDeudaMounted=true;
    const css=el('style');css.textContent=`
#koraConfirmacionDeuda {visibility:visible!important;border:1px solid #dce5ef;border-top:4px solid #00bcc8;border-radius:18px;padding:26px;width:min(540px,calc(100vw - 32px));max-height:90vh;overflow:auto;color:#102444;background:white;font:15px/1.5 system-ui;box-sizing:border-box}
#koraConfirmacionDeuda::backdrop{background:rgba(11,30,61,.6)}
#koraConfirmacionDeuda h2{font-size:22px;margin:0 0 12px} #koraConfirmacionDeuda .saldo{font-size:30px;font-weight:750;margin:10px 0}
#koraConfirmacionDeuda label{display:block;margin:12px 0} #koraConfirmacionDeuda input,#koraConfirmacionDeuda textarea{display:block;box-sizing:border-box;width:100%;padding:12px;border:1px solid #b8c6d7;border-radius:8px;font:inherit}
#koraConfirmacionDeuda button,#koraDeudaRecordatorio button{border:0;border-radius:9px;padding:12px 16px;cursor:pointer;font:inherit;background:#102444;color:white;margin:6px 6px 0 0}
#koraConfirmacionDeuda button:disabled{opacity:.55;cursor:wait} #koraConfirmacionDeuda .error{color:#b42318} #koraConfirmacionDeuda [hidden]{display:none!important}
#koraDeudaRecordatorio{padding:12px 18px;background:#eefcfc;border-bottom:1px solid #00bcc8;color:#102444;position:sticky;top:0;z-index:2000}
`;document.head.append(css);
    const dialog=el('dialog');dialog.id='koraConfirmacionDeuda';dialog.setAttribute('aria-labelledby','koraDeudaTitulo');
    const title=el('h2','Confirma la deuda de tu tienda');title.id='koraDeudaTitulo';
    const subtitle=el('p'),amount=el('p');amount.className='saldo';
    const info=el('p','Revisa cuánto debe tu tienda a Creditek. Confirmar no registra pagos ni modifica la deuda.');
    const form=el('form');
    const modeLabel=el('label');const mode=el('input');mode.type='checkbox';mode.style.width='auto';mode.style.display='inline';modeLabel.append(mode,document.createTextNode(' El saldo no coincide con mi revisión'));
    const difference=el('div');difference.hidden=true;
    const valueLabel=el('label','Saldo según mi revisión (COP)');const value=el('input');value.type='number';value.step='0.01';valueLabel.append(value);
    const noteLabel=el('label','Explica la diferencia para Mayte u Óscar');const note=el('textarea');note.maxLength=2000;noteLabel.append(note);difference.append(valueLabel,noteLabel);
    const error=el('p');error.className='error';error.setAttribute('role','alert');
    const submit=el('button','Confirmar saldo');submit.type='submit';
    const later=el('button','Revisar antes de las 11:00 a. m.');later.type='button';
    const retry=el('button','Actualizar saldo');retry.type='button';
    const logout=el('button','Cerrar sesión');logout.type='button';
    form.append(modeLabel,difference,error,submit,later,retry,logout);dialog.append(title,subtitle,amount,info,form);document.body.append(dialog);
    const banner=el('div');banner.id='koraDeudaRecordatorio';banner.hidden=true;
    const bannerText=el('span','Pendiente: confirma hoy la deuda de tu tienda con Creditek antes de las 11:00 a. m. ');
    const open=el('button','Revisar saldo');open.type='button';banner.append(bannerText,open);document.body.prepend(banner);
    let state=null,locked=true,busy=false,reading=false,timer=null,serverAt=0,monoAt=0,promptedDate=null,requestId=crypto.randomUUID(),retryPayload=null;
    const serverNow=()=>serverAt+(performance.now()-monoAt);
    function show(){if(!dialog.open)dialog.showModal();}
    function deadline(){return state?.pendiente && serverNow()>=Date.parse(state.limite);}
    function render(){
      locked=!state||Boolean(state.bloqueada)||Boolean(deadline());
      later.hidden=locked;submit.disabled=!state||busy||!state.pendiente;mode.disabled=busy;
      if(!state){subtitle.textContent='No se pudo verificar la confirmación diaria. Actualiza para continuar.';amount.textContent='';show();return;}
      subtitle.textContent=`${state.tienda_nombre||state.tienda_codigo} · ${state.fecha} · Hora de Colombia`;
      amount.textContent=money(state.saldo);
      banner.hidden=!state.pendiente;
      if(!state.pendiente){dialog.close();return;}
      if(locked||promptedDate!==state.fecha){promptedDate=state.fecha;show();}
    }
    function schedule(){
      clearTimeout(timer);if(!state)return;
      const next=state.pendiente&&serverNow()<Date.parse(state.limite)?Date.parse(state.limite):Date.parse(state.siguiente_dia);
      timer=setTimeout(()=>{if(deadline()){locked=true;later.hidden=true;show();}refresh();},Math.max(1,next-serverNow()+20));
    }
    async function refresh(){
      if(reading||busy)return;reading=true;
      try{
        const {data,error:err}=await sb.rpc('estado_confirmacion_deuda_tienda');if(err||!data)throw err||new Error('Respuesta incompleta');
        if(!data.aplica){banner.hidden=true;dialog.close();clearTimeout(timer);return;}
        // Conserva el saldo que la persona está revisando; el servidor rechazará una versión antigua.
        if(!dialog.open||!state||data.fecha!==state.fecha||!data.pendiente){state=data;requestId=crypto.randomUUID();retryPayload=null;}
        else {state.bloqueada=data.bloqueada;state.pendiente=data.pendiente;}
        serverAt=Date.parse(data.ahora);monoAt=performance.now();error.textContent='';render();schedule();
      }catch(e){error.textContent='No se pudo comprobar el saldo. Reintenta cuando haya conexión.';if(!state||deadline()||serverNow()>=Date.parse(state.siguiente_dia)){state=null;render();}}
      finally{reading=false;}
    }
    for(const input of [value,note])input.addEventListener('input',()=>{retryPayload=null;requestId=crypto.randomUUID();});
    mode.addEventListener('change',()=>{difference.hidden=!mode.checked;value.required=note.required=mode.checked;submit.textContent=mode.checked?'Reportar diferencia y continuar':'Confirmar saldo';retryPayload=null;});
    later.addEventListener('click',()=>{if(!locked&&!deadline())dialog.close();});
    dialog.addEventListener('cancel',e=>{if(locked||deadline())e.preventDefault();});
    open.addEventListener('click',()=>{show();refresh();});
    retry.addEventListener('click',()=>{state=null;retryPayload=null;refresh();});
    logout.addEventListener('click',async()=>{await sb.auth.signOut();location.reload();});
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(busy||!state?.pendiente)return;
      if(mode.checked&&(!value.value.trim()||note.value.trim().length<5)){error.textContent='Escribe el saldo y explica la diferencia.';return;}
      if(mode.checked&&Number(value.value)===Number(state.saldo)){error.textContent='El valor coincide. Puedes confirmar el saldo sin reportar diferencia.';return;}
      const payload=retryPayload||{p_id:requestId,p_fecha:state.fecha,p_version:state.version,p_saldo:mode.checked?Number(value.value):Number(state.saldo),p_observacion:mode.checked?note.value.trim():null};
      busy=true;submit.disabled=true;later.hidden=true;retry.disabled=true;value.disabled=note.disabled=mode.disabled=true;
      try{
        const {error:err}=await sb.rpc('confirmar_deuda_tienda',payload);if(err)throw err;
        retryPayload=null;dialog.close();banner.hidden=true;location.reload();
      }catch(e){retryPayload=payload;error.textContent=e.message||'No se pudo confirmar. Reintenta con la misma información o actualiza el saldo.';}
      finally{busy=false;submit.disabled=false;retry.disabled=false;value.disabled=note.disabled=mode.disabled=false;later.hidden=locked||Boolean(deadline());}
    });
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
    setInterval(()=>{if(!document.hidden)refresh();},30000);
    await refresh();
  }
  global.KoraConfirmacionDeuda={mount};
})(window);
