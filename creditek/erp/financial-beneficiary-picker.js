(function (root) {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validDocument=v=>/^[0-9.-]{5,20}$/.test(v||'');
  const normalize=row=>({...row,...(row.destination!==undefined?root.KoraPaymentDestination.parse(row.destination):{})});
  const complete=row=>!!(row&&row.verified&&validDocument(row.document)&&row.name?.length>=3&&
    row.bank&&['Ahorros','Corriente','Billetera digital'].includes(row.accountType)&&/^\d{6,20}$/.test(row.number||''));
  const documentKey=value=>String(value||'').replace(/\D/g,'');
  const byDocument=(rows,value)=>validDocument(value)?rows.filter(row=>validDocument(row.document)&&documentKey(row.document)===documentKey(value)):[];
  const signature=row=>`${String(row.document||'').replace(/\D/g,'')}|${row.number||''}`;
  function uniqueRows(rows){const result=[];for(const raw of rows){const row=normalize(raw);
    // Only collapse an old template when the same document/account is already complete.
    if(!row.beneficiaryId&&validDocument(row.document)&&result.some(x=>complete(x)&&signature(x)===signature(row)))continue;
    result.push(row);}return result;}

  async function mount(container,sb,record=null){
    container.innerHTML='<p>Cargando personas guardadas…</p>';
    let rows,selected=null,loadError=null;
    try{const result=await sb.rpc('financial_beneficiaries_list');if(result.error)throw result.error;
      if(!Array.isArray(result.data))throw Error('No se pudo leer el directorio de beneficiarios.');
      rows=uniqueRows(result.data);
    }catch(error){loadError=error;container.innerHTML=`<p role="alert">${esc(error.message)}. Cierra y vuelve a abrir el formulario.</p>`;}
    if(loadError)return {resolve:async()=>{throw loadError;}};
    if(record?.beneficiary){const previous=normalize({key:'current',templateId:record.id,name:record.beneficiary,
      document:record.beneficiary_document,destination:record.destination_account,verified:true});
      const linked=rows.filter(r=>r.templateIds?.includes(record.id));
      const matches=linked.length?linked:byDocument(rows,previous.document).filter(r=>!previous.number||r.number===previous.number);
      if(matches.length===1)selected=matches[0];
      else {rows.push(previous);selected=previous;}
    }
    const id=`beneficiary-${root.crypto.randomUUID()}`;
    container.innerHTML=`<label for="${id}-search">Buscar por cédula, NIT o nombre</label><input id="${id}-search" class="control" data-person-search autocomplete="off" placeholder="Escribe la identificación o el nombre"><p data-person-match role="status"></p><label for="${id}">Persona o empresa beneficiaria</label><select id="${id}" class="control" required><option value="">Selecciona una persona y su cuenta</option>${rows.map((r,i)=>`<option value="${i}">${esc(r.name)} · ${esc(validDocument(r.document)?r.document:'sin identificación')} · ${esc(r.bank||'cuenta por completar')} ${esc(r.number?'•••• '+r.number.slice(-4):'')}${complete(r)?'':' · completar ficha'}</option>`).join('')}<option value="new">＋ Registrar persona que no existe</option></select><div data-person-fields></div>`;
    const select=container.querySelector('select'),fields=container.querySelector('[data-person-fields]');
    const search=container.querySelector('[data-person-search]'),matchNotice=container.querySelector('[data-person-match]');
    function findExisting(value){
      const matches=byDocument(rows,value);
      if(!matches.length)return false;
      if(matches.length===1){select.value=String(rows.indexOf(matches[0]));render();
        matchNotice.textContent='Persona encontrada. Usamos los datos de su ficha.';
      }else{select.value='';selected=null;fields.innerHTML='';
        for(const option of select.options)option.hidden=option.value!==''&&!matches.includes(rows[Number(option.value)]);
        matchNotice.textContent='Esta identificación tiene varias cuentas o fichas. Selecciona la cuenta existente para este pago.';
      }
      return true;
    }
    search.addEventListener('input',()=>{
      const query=search.value.trim().toLocaleLowerCase('es');
      const digits=documentKey(query);
      for(const option of select.options){const row=rows[Number(option.value)];
        option.hidden=option.value!==''&&option.value!=='new'&&!!query&&
          !(row?.name?.toLocaleLowerCase('es').includes(query)||(digits&&documentKey(row?.document).includes(digits)));
      }
      select.value='';selected=null;fields.innerHTML='';matchNotice.textContent='';
    });
    search.addEventListener('change',()=>findExisting(search.value.trim()));
    fields.addEventListener('change',event=>{if(event.target.dataset.person==='document')findExisting(event.target.value.trim());});
    const input=(label,key,value,attrs='',locked=false)=>`<label style="display:block;margin:10px 0">${esc(label)}<input class="control" data-person="${key}" value="${esc(value)}" ${attrs} ${locked?'readonly':''}></label>`;
    function render(){
      selected=select.value==='new'?null:rows[Number(select.value)];
      if(select.value===''){selected=null;fields.innerHTML='';return;}
      if(complete(selected)){fields.innerHTML=`<p>${esc(selected.name)} · ${esc(selected.document)}<br>${esc(selected.bank)} · ${esc(selected.accountType)} · ${esc(selected.number)}</p><small>Datos tomados de la ficha. Solo completa los datos del gasto. No cambia pagos anteriores.</small>`;return;}
      const r=selected||{};
      fields.innerHTML=`<p>${selected?'Completa esta ficha una sola vez. Conservamos los datos que ya existen.':'Escribe primero la cédula o NIT. Si ya existe, recuperamos su ficha sin crear otra persona.'}</p>`+
        input('CC / NIT','document',validDocument(r.document)?r.document:'','required pattern="[0-9.\\-]{5,20}"',validDocument(r.document))+
        input('Nombre / razón social','name',r.name||'','required minlength="3"',!!r.beneficiaryId)+
        input('Banco o billetera','bank',r.bank||'','required minlength="2" maxlength="60"',!!r.bank)+
        `<label style="display:block;margin:10px 0">Tipo de cuenta<select class="control" data-person="accountType" required ${r.accountType?'disabled':''}><option value="">Selecciona</option>${['Ahorros','Corriente','Billetera digital'].map(t=>`<option ${r.accountType===t?'selected':''}>${t}</option>`).join('')}</select></label>`+
        input('Número de cuenta o celular','number',r.number||'','required inputmode="numeric" pattern="[0-9]{6,20}" maxlength="20"',!!r.number)+
        '<p>Guardar la ficha no autoriza ni realiza pagos.</p>';
    }
    select.addEventListener('change',render);
    if(selected)select.value=String(rows.indexOf(selected));
    render();
    return {async resolve(){
      if(!select.value)throw Error('Selecciona la persona beneficiaria.');
      const data={...(selected||{})};
      if(!complete(data))for(const field of fields.querySelectorAll('[data-person]'))data[field.dataset.person]=field.value.trim();
      if(!complete({...data,verified:true}))throw Error('Completa la ficha de la persona una sola vez.');
      const result=await sb.rpc('financial_beneficiary_save',{p_beneficiary_id:data.beneficiaryId||null,
        p_account_id:data.accountId||null,p_name:data.name,p_document:data.document,
        p_bank:data.bank,p_account_type:data.accountType,p_number:data.number,p_template_id:data.templateId||null});
      if(result.error)throw result.error;
      // A retry reuses the saved identity even if registering the expense failed.
      selected=result.data;
      if(select.value==='new'){rows.push(selected);const option=document.createElement('option');
        option.value=String(rows.length-1);option.textContent=selected.name;select.append(option);select.value=option.value;}
      else rows[Number(select.value)]=selected;
      render();return {...selected,destination:root.KoraPaymentDestination.format(selected.bank,selected.accountType,selected.number)};
    }};
  }
  root.KoraFinancialBeneficiary={mount,complete,uniqueRows,byDocument};
})(typeof window==='undefined'?globalThis:window);
