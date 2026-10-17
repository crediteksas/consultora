(function () {
  'use strict';
  const states = new Map();
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const weekdays = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  const pad = value => String(value).padStart(2, '0');
  const isoDate = value => `${String(value.getUTCFullYear()).padStart(4,'0')}-${pad(value.getUTCMonth()+1)}-${pad(value.getUTCDate())}`;
  function dateAt(year, month, day) {
    const value = new Date(0);
    value.setUTCFullYear(year, month, day);
    value.setUTCHours(12, 0, 0, 0);
    return value;
  }
  function parseDate(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/), local = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!iso && !local) return null;
    const [year, month, day] = iso ? [+iso[1], +iso[2], +iso[3]] : [+local[3], +local[2], +local[1]];
    if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = dateAt(year, month-1, day);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month-1 && date.getUTCDate() === day ? isoDate(date) : null;
  }
  function formatDate(value) {
    const iso = parseDate(value);
    return iso ? `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}` : '';
  }
  function today(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bogota', year:'numeric', month:'2-digit', day:'2-digit'})
      .formatToParts(now).reduce((out, part) => (out[part.type] = part.value, out), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function moveMonth(value, amount) {
    const date = new Date(`${value}T12:00:00Z`), day = date.getUTCDate();
    const first = dateAt(date.getUTCFullYear(), date.getUTCMonth()+amount, 1);
    const last = dateAt(first.getUTCFullYear(), first.getUTCMonth()+1, 0).getUTCDate();
    return isoDate(dateAt(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day,last)));
  }
  function allowed(state, value) {
    return Boolean(parseDate(value)) && (!state.source.min || value >= state.source.min) && (!state.source.max || value <= state.source.max);
  }
  function refresh(state) {
    state.input.value = formatDate(state.source.value);
    state.input.disabled = state.source.disabled;
    state.open.disabled = state.source.disabled;
    state.input.removeAttribute('aria-invalid');
    state.error.textContent = '';
    state.open.setAttribute('aria-label', `Elegir fecha · ${state.label}${state.source.value ? ` · ${formatDate(state.source.value)}` : ''}`);
  }
  function commit(state, value) {
    if (value === null || (value && !allowed(state,value))) {
      refresh(state);
      state.input.setAttribute('aria-invalid','true');
      state.error.textContent = 'No se cambió el filtro. Ingresa una fecha válida en formato dd/mm/aaaa.';
      return false;
    }
    const changed = state.source.value !== value;
    state.source.value = value;
    refresh(state);
    if (changed) {
      state.source.dispatchEvent(new Event('input',{bubbles:true}));
      state.source.dispatchEvent(new Event('change',{bubbles:true}));
    }
    return true;
  }
  function close(state) {
    state.dialog.close();
    state.open.setAttribute('aria-expanded','false');
    state.open.focus();
  }
  function renderCalendar(state, focus = false) {
    const date = new Date(`${state.focused}T12:00:00Z`), year = date.getUTCFullYear(), month = date.getUTCMonth();
    const first = dateAt(year,month,1), offset = (first.getUTCDay()+6)%7;
    const count = dateAt(year,month+1,0).getUTCDate(), current = today();
    state.monthTitle.textContent = `${months[month]} de ${year}`;
    state.grid.replaceChildren();
    for (let index=0; index<Math.ceil((offset+count)/7)*7; index++) {
      if (index%7 === 0) state.grid.appendChild(document.createElement('tr'));
      const cell = document.createElement('td'), day = index-offset+1;
      state.grid.lastElementChild.appendChild(cell);
      if (day < 1 || day > count) continue;
      const value = isoDate(dateAt(year,month,day)), button = document.createElement('button');
      button.type = 'button'; button.className = 'secondary'; button.textContent = day; button.dataset.date = value;
      button.setAttribute('aria-label', `${day} de ${months[month].toLowerCase()} de ${year}`);
      button.tabIndex = value === state.focused ? 0 : -1;
      button.disabled = !allowed(state,value);
      if (value === state.source.value) cell.setAttribute('aria-selected','true');
      if (value === current) button.setAttribute('aria-current','date');
      cell.appendChild(button);
    }
    if (focus) state.grid.querySelector(`button[data-date="${state.focused}"]`)?.focus();
  }
  function shiftFocus(state, amount, byMonth = false) {
    const date = new Date(`${state.focused}T12:00:00Z`);
    const value = byMonth ? moveMonth(state.focused,amount) : isoDate(dateAt(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+amount));
    if (!allowed(state,value)) return;
    state.focused = value;
    renderCalendar(state,true);
  }
  function mount(source) {
    if (states.has(source)) return;
    const label = source.getAttribute('aria-label') || 'Fecha', id = source.id;
    if (!id || source.type !== 'date' || typeof HTMLDialogElement === 'undefined') return;
    const field = document.createElement('div');
    field.className = 'field kora-date-field';
    const title = document.createElement('label');
    title.className = 'kora-date-label'; title.htmlFor = `${id}-display`; title.textContent = label;
    const control = document.createElement('div'); control.className = 'kora-date-control';
    const input = document.createElement('input');
    input.id = `${id}-display`; input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 10;
    input.className = 'control kora-date-input'; input.placeholder = 'dd/mm/aaaa'; input.autocomplete = 'off';
    input.setAttribute('aria-label',label); input.setAttribute('aria-describedby',`${id}-error`);
    const open = document.createElement('button'); open.type = 'button'; open.className = 'kora-date-open secondary';
    open.setAttribute('aria-haspopup','dialog'); open.setAttribute('aria-controls',`${id}-calendar`); open.setAttribute('aria-expanded','false');
    open.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>';
    const error = document.createElement('span'); error.id = `${id}-error`; error.className = 'kora-date-error';
    error.setAttribute('role','alert'); error.setAttribute('data-kora-no-export','');
    source.before(field); field.append(title,control,error); control.append(source,input,open);
    const dialog = document.createElement('dialog'); dialog.id = `${id}-calendar`; dialog.className = 'kora-date-dialog';
    dialog.setAttribute('aria-labelledby',`${id}-calendar-title`); dialog.setAttribute('data-kora-no-export','');
    dialog.innerHTML = `<h2 id="${id}-calendar-title"></h2><div class="kora-calendar-nav"><button type="button" data-month="-12" aria-label="Año anterior">«</button><button type="button" data-month="-1" aria-label="Mes anterior">‹</button><h3 id="${id}-month" aria-live="polite"></h3><button type="button" data-month="1" aria-label="Mes siguiente">›</button><button type="button" data-month="12" aria-label="Año siguiente">»</button></div><table role="grid" aria-labelledby="${id}-month"><thead><tr>${weekdays.map(day=>`<th scope="col" abbr="${day}">${day.slice(0,2)}</th>`).join('')}</tr></thead><tbody></tbody></table><p class="kora-calendar-help">Formato dd/mm/aaaa · usa las flechas para recorrer los días.</p><div class="kora-calendar-actions"><button type="button" data-action="today">Hoy</button><button type="button" data-action="clear">Borrar fecha</button><button type="button" data-action="cancel">Cerrar</button></div>`;
    dialog.querySelector('h2').textContent = `Elegir fecha · ${label}`;
    dialog.querySelectorAll('button').forEach(button=>button.classList.add('secondary'));
    document.body.appendChild(dialog);
    const state = {source,input,open,error,dialog,label,grid:dialog.querySelector('tbody'),monthTitle:dialog.querySelector('h3'),focused:''};
    states.set(source,state);
    source.hidden = true; source.setAttribute('aria-hidden','true');
    refresh(state);
    input.addEventListener('change',()=>commit(state,parseDate(input.value)));
    input.addEventListener('keydown',event=>{
      if (event.key === 'Enter') { event.preventDefault(); commit(state,parseDate(input.value)); }
      if (event.altKey && event.key === 'ArrowDown') { event.preventDefault(); open.click(); }
    });
    source.addEventListener('change',()=>refresh(state));
    // Commit on click, not pointerdown: a validation message can otherwise move
    // the calendar button between press and release and swallow the click.
    open.addEventListener('pointerdown',event=>{if(event.button === 0) event.preventDefault();});
    open.addEventListener('click',()=>{
      document.activeElement?.blur();
      state.focused = source.value || today();
      if (source.min && state.focused < source.min) state.focused = source.min;
      if (source.max && state.focused > source.max) state.focused = source.max;
      renderCalendar(state);
      dialog.showModal(); open.setAttribute('aria-expanded','true');
      state.grid.querySelector(`button[data-date="${state.focused}"]`)?.focus();
    });
    dialog.addEventListener('click',event=>{
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.dataset.date && commit(state,button.dataset.date)) close(state);
      if (button.dataset.month) shiftFocus(state,Number(button.dataset.month),true);
      if (button.dataset.action === 'today') { const value = today(); if (allowed(state,value)) { state.focused = value; renderCalendar(state,true); } }
      if (button.dataset.action === 'clear') { commit(state,''); close(state); }
      if (button.dataset.action === 'cancel') close(state);
    });
    dialog.addEventListener('cancel',event=>{event.preventDefault();close(state);});
    dialog.addEventListener('close',()=>open.setAttribute('aria-expanded','false'));
    dialog.addEventListener('keydown',event=>{
      if (!event.target.dataset.date) return;
      const day = (new Date(`${state.focused}T12:00:00Z`).getUTCDay()+6)%7;
      const moves = {ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-day,End:6-day};
      if (Object.hasOwn(moves,event.key)) { event.preventDefault(); shiftFocus(state,moves[event.key]); }
      if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault();shiftFocus(state,(event.key === 'PageUp' ? -1 : 1)*(event.shiftKey ? 12 : 1),true); }
    });
  }
  function sync() {
    document.querySelectorAll('input[data-kora-date-picker]').forEach(mount);
    states.forEach(refresh);
  }
  window.KoraDatePicker = Object.freeze({sync,parseDate,formatDate,today,moveMonth});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',sync,{once:true});
  else sync();
})();
