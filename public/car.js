(() => {
  const tg = window.Telegram?.WebApp;
  const API = '/api/index?route=car';
  const state = { car:null, weather:null, loading:false, documents:null, documentsLoading:false };
  let pendingNoteUndo=null;
  let pendingNoteUndoTimer=null;

  function formatKm(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number).toLocaleString('ru-RU') + ' км' : '—';
  }

  function formatUpdated(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return 'Сохранено ' + new Intl.DateTimeFormat('ru-RU', {
      day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'
    }).format(date);
  }

  function weatherLabel(code) {
    const labels = {
      0:'ясно',1:'в основном ясно',2:'облачно',3:'пасмурно',
      45:'туман',48:'туман',51:'морось',53:'морось',55:'морось',
      61:'дождь',63:'дождь',65:'сильный дождь',
      71:'снег',73:'снег',75:'сильный снег',
      80:'ливень',81:'ливень',82:'сильный ливень',95:'гроза'
    };
    return labels[Number(code)] || 'погода';
  }

  async function api(operation,payload={}) {
    const backup=window.RUDI_STATE_BACKUP;
    const backupToken=typeof backup?.getToken==='function'?backup.getToken():'';
    const response = await fetch(API, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({initData:tg?.initData||'',backupToken,operation,...payload}),
      cache:'no-store'
    });
    const data = await response.json().catch(()=>({}));
    if(!response.ok || !data.ok) throw new Error(data.error || 'car-request-failed');
    if(data.backupToken&&typeof backup?.storeToken==='function'){
      await backup.storeToken(data.backupToken).catch(()=>false);
    }
    return data;
  }

  function setWashGuideOpen(open) {
    const page=document.getElementById('carWashGuidePage');
    const tile=document.getElementById('carPage');
    if(!page) return;
    setupCarWashModal();
    const isOpen=Boolean(open);
    page.hidden=!isOpen;
    tile?.classList.toggle('is-wash-guide-open',isOpen);
    document.body.classList.toggle('car-wash-modal-open',isOpen);
    if(isOpen){
      requestAnimationFrame(()=>document.getElementById('carWashGuideBack')?.focus());
      try{tg?.HapticFeedback?.impactOccurred?.('light')}catch(_){}
    }else{
      document.getElementById('carWashGuideOpen')?.focus?.({preventScroll:true});
    }
  }

  function setStatus(text,kind='') {
    const node=document.getElementById('carStatus');
    if(!node) return;
    node.textContent=String(text||'');
    node.className='car-status'+(kind?' is-'+kind:'');
    node.hidden=!node.textContent;
  }

  function moscowInputValue(value=new Date()) {
    const parts=Object.fromEntries(
      new Intl.DateTimeFormat('en-CA',{
        timeZone:'Europe/Moscow',
        year:'numeric',
        month:'2-digit',
        day:'2-digit',
        hour:'2-digit',
        minute:'2-digit',
        hourCycle:'h23'
      }).formatToParts(value).filter(part=>part.type!=='literal').map(part=>[part.type,part.value])
    );
    return parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute;
  }

  function errorIsoFromInput(value) {
    const raw=String(value||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return '';
    const date=new Date(raw+':00+03:00');
    return Number.isNaN(date.getTime())?'':date.toISOString();
  }

  function formatErrorDate(value) {
    const date=new Date(value);
    if(Number.isNaN(date.getTime())) return 'Дата не указана';
    return new Intl.DateTimeFormat('ru-RU',{
      timeZone:'Europe/Moscow',
      day:'numeric',
      month:'short',
      year:'numeric',
      hour:'2-digit',
      minute:'2-digit'
    }).format(date);
  }

  function setErrorFormOpen(open) {
    const form=document.getElementById('carErrorForm');
    if(!form) return;
    form.hidden=!open;
    if(open){
      const dateInput=document.getElementById('carErrorOccurredAt');
      if(dateInput && !dateInput.value) dateInput.value=moscowInputValue();
      requestAnimationFrame(()=>document.getElementById('carErrorTitle')?.focus());
    }else{
      form.reset();
    }
  }

  let carConfirmResolve=null;

  function ensureCarConfirmModal(){
    let modal=document.getElementById('carConfirmModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='carConfirmModal';
    modal.className='car-confirm-modal';
    modal.hidden=true;
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML=
      '<button class="car-confirm-backdrop" type="button" aria-label="Отмена"></button>'+
      '<section class="car-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="carConfirmTitle" aria-describedby="carConfirmText">'+
        '<div class="car-confirm-icon" aria-hidden="true">×</div>'+
        '<strong id="carConfirmTitle">Удалить запись?</strong>'+
        '<p id="carConfirmText"></p>'+
        '<div class="car-confirm-actions">'+
          '<button class="car-confirm-cancel" type="button">Отмена</button>'+
          '<button class="car-confirm-delete" type="button">Удалить</button>'+
        '</div>'+
      '</section>';
    document.body.appendChild(modal);
    const settle=value=>{
      if(modal.hidden)return;
      modal.hidden=true;
      modal.setAttribute('aria-hidden','true');
      document.body.classList.remove('car-confirm-open');
      const resolve=carConfirmResolve;
      carConfirmResolve=null;
      resolve?.(Boolean(value));
    };
    modal.querySelector('.car-confirm-backdrop')?.addEventListener('click',()=>settle(false));
    modal.querySelector('.car-confirm-cancel')?.addEventListener('click',()=>settle(false));
    modal.querySelector('.car-confirm-delete')?.addEventListener('click',()=>settle(true));
    modal.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();settle(false);}
    });
    return modal;
  }

  function carConfirm(message){
    const modal=ensureCarConfirmModal();
    if(carConfirmResolve){
      carConfirmResolve(false);
      carConfirmResolve=null;
    }
    const text=modal.querySelector('#carConfirmText');
    if(text)text.textContent=String(message||'Удалить запись?');
    modal.hidden=false;
    modal.setAttribute('aria-hidden','false');
    document.body.classList.add('car-confirm-open');
    requestAnimationFrame(()=>modal.querySelector('.car-confirm-cancel')?.focus?.({preventScroll:true}));
    return new Promise(resolve=>{carConfirmResolve=resolve});
  }

  function confirmRemoveError(title) {
    return carConfirm('Убрать запись «'+String(title||'Ошибка на приборке')+'» из журнала?');
  }

  function confirmArchiveDelete(message) {
    return carConfirm(String(message||'Удалить запись из истории?'));
  }

  function renderErrors(car) {
    const root=document.getElementById('carErrorsList');
    const meta=document.getElementById('carErrorsMeta');
    if(!root) return;
    root.replaceChildren();
    const errors=Array.isArray(car?.state?.errors)?car.state.errors:[];
    if(meta) meta.textContent=errors.length ? String(errors.length) : '';

    if(!errors.length){
      const empty=document.createElement('div');
      empty.className='car-errors-empty';
      empty.textContent='Сейчас ремонт не требуется';
      root.appendChild(empty);
    }

    for(const error of errors){
      const row=document.createElement('article');
      row.className='car-error-row';

      const marker=document.createElement('span');
      marker.className='car-error-marker';
      marker.setAttribute('aria-hidden','true');
      marker.textContent='!';

      const copy=document.createElement('div');
      copy.className='car-error-copy';

      const title=document.createElement('strong');
      title.textContent=error.title||'Ошибка на приборке';

      const date=document.createElement('span');
      date.className='car-error-date';
      date.textContent=formatErrorDate(error.occurredAt);

      copy.append(title,date);

      if(error.comment){
        const comment=document.createElement('p');
        comment.textContent='Когда заметил: '+error.comment;
        copy.appendChild(comment);
      }

      const actions=document.createElement('div');
      actions.className='car-error-row-actions';

      const repaired=document.createElement('button');
      repaired.type='button';
      repaired.className='car-error-repair';
      repaired.textContent='Починил';
      repaired.addEventListener('click',()=>repairDashboardError(error,repaired));

      const remove=document.createElement('button');
      remove.type='button';
      remove.className='car-error-remove';
      remove.textContent='Убрать';
      remove.addEventListener('click',async()=>{
        if(!(await confirmRemoveError(error.title))) return;
        await removeDashboardError(error,remove);
      });

      actions.append(repaired,remove);
      row.append(marker,copy,actions);
      root.appendChild(row);
    }

    const archive=Array.isArray(car?.state?.repairArchive)?car.state.repairArchive:[];
    if(archive.length){
      const details=document.createElement('details');
      details.className='car-repair-archive';
      const summary=document.createElement('summary');
      summary.innerHTML='<span>Архив</span><strong>'+String(archive.length)+'</strong>';
      const list=document.createElement('div');
      list.className='car-repair-archive-list';
      for(const item of archive){
        const archivedRow=document.createElement('article');
        archivedRow.className='car-repair-archive-row';
        const archivedTitle=document.createElement('strong');
        archivedTitle.textContent=item.title||'Ремонт';
        const archivedMeta=document.createElement('span');
        const repairCost=item.repairCost==null||item.repairCost===''
          ? null
          : (Number.isInteger(Number(item.repairCost))&&Number(item.repairCost)>=0
            ? Number(item.repairCost)
            : null);
        archivedMeta.textContent='Починено '+formatErrorDate(item.repairedAt)
          +(repairCost==null?'':' · '+new Intl.NumberFormat('ru-RU').format(repairCost)+' ₽');
        archivedRow.append(archivedTitle,archivedMeta);
        if(item.comment){
          const archivedComment=document.createElement('p');
          archivedComment.textContent=item.comment;
          archivedRow.appendChild(archivedComment);
        }
        const archivedRemove=document.createElement('button');
        archivedRemove.type='button';
        archivedRemove.className='car-archive-remove';
        archivedRemove.setAttribute('aria-label','Удалить запись из истории ремонтов');
        archivedRemove.textContent='×';
        archivedRemove.addEventListener('click',async()=>{
          if(!(await confirmArchiveDelete('Удалить «'+String(item.title||'Ремонт')+'» из истории ремонтов?'))) return;
          await removeRepairArchiveItem(item,archivedRemove);
        });
        archivedRow.appendChild(archivedRemove);
        list.appendChild(archivedRow);
      }
      details.append(summary,list);
      root.appendChild(details);
    }
  }

  async function removeRepairArchiveItem(item,button) {
    if(!item?.id || button?.disabled) return;
    button.disabled=true;
    try{
      const data=await api('remove-repair-archive',{errorId:item.id});
      state.car={...state.car,...data};
      renderErrors(state.car);
      setStatus('Удалено из истории ремонтов','success');
      try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(_){
      button.disabled=false;
      setStatus('Не удалось удалить из истории ремонтов','error');
      try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }
  }

  async function saveDashboardError(event) {
    event?.preventDefault?.();
    const titleInput=document.getElementById('carErrorTitle');
    const dateInput=document.getElementById('carErrorOccurredAt');
    const commentInput=document.getElementById('carErrorComment');
    const button=document.getElementById('carErrorSave');
    const title=String(titleInput?.value||'').trim();
    const occurredAt=errorIsoFromInput(dateInput?.value);
    const comment=String(commentInput?.value||'').trim();

    if(!title){
      setStatus('Укажи, какая ошибка высветилась','error');
      titleInput?.focus();
      return;
    }
    if(!occurredAt){
      setStatus('Укажи дату и время ошибки','error');
      dateInput?.focus();
      return;
    }

    if(button){
      button.disabled=true;
      button.textContent='Сохраняю…';
    }
    try{
      const data=await api('add-error',{title,occurredAt,comment});
      state.car={...state.car,...data};
      renderErrors(state.car);
      applyCarSmartOrder({animate:true});
      setErrorFormOpen(false);
      setStatus('Ошибка добавлена в журнал','success');
      try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(_){
      setStatus('Не удалось сохранить ошибку','error');
      try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }finally{
      if(button){
        button.disabled=false;
        button.textContent='Сохранить';
      }
    }
  }

  function openRepairCostEditor(error,button) {
    if(!error?.id || button?.disabled) return;
    const row=button.closest('.car-error-row');
    if(!row || row.querySelector('.car-repair-cost-editor')) return;

    const actions=row.querySelector('.car-error-row-actions');
    const buttons=[...(actions?.querySelectorAll('button')||[])];
    buttons.forEach(node=>node.disabled=true);

    const editor=document.createElement('form');
    editor.className='car-repair-cost-editor';

    const field=document.createElement('label');
    field.className='car-repair-cost-field';
    const label=document.createElement('span');
    label.textContent='Сумма ремонта, ₽';
    const input=document.createElement('input');
    input.type='number';
    input.min='0';
    input.max='99999999';
    input.step='1';
    input.inputMode='numeric';
    input.placeholder='Необязательно';
    field.append(label,input);

    const editorActions=document.createElement('div');
    editorActions.className='car-repair-cost-actions';
    const cancel=document.createElement('button');
    cancel.type='button';
    cancel.className='car-repair-cost-cancel';
    cancel.textContent='Отмена';
    const save=document.createElement('button');
    save.type='submit';
    save.className='car-repair-cost-save';
    save.textContent='Сохранить';
    editorActions.append(cancel,save);
    editor.append(field,editorActions);
    row.appendChild(editor);

    const close=()=>{
      editor.remove();
      buttons.forEach(node=>node.disabled=false);
    };
    cancel.addEventListener('click',close);
    editor.addEventListener('submit',async event=>{
      event.preventDefault();
      const raw=String(input.value||'').trim();
      const repairCost=raw===''?null:Number(raw);
      if(repairCost!==null&&(!Number.isInteger(repairCost)||repairCost<0||repairCost>99999999)){
        setStatus('Укажи сумму ремонта целым числом в рублях','error');
        input.focus();
        return;
      }

      input.disabled=true;
      cancel.disabled=true;
      save.disabled=true;
      save.textContent='Сохраняю…';
      try{
        const data=await api('repair-error',{errorId:error.id,repairCost});
        state.car={...state.car,...data};
        renderErrors(state.car);
        applyCarSmartOrder({animate:true});
        setStatus(repairCost==null
          ?'Перенесено в историю ремонтов'
          :'Ремонт сохранён · '+new Intl.NumberFormat('ru-RU').format(repairCost)+' ₽','success');
        try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
      }catch(_){
        input.disabled=false;
        cancel.disabled=false;
        save.disabled=false;
        save.textContent='Сохранить';
        setStatus('Не удалось отправить в архив','error');
        try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
      }
    });

    requestAnimationFrame(()=>input.focus());
  }

  async function repairDashboardError(error,button) {
    openRepairCostEditor(error,button);
  }

  async function removeDashboardError(error,button) {
    if(!error?.id || button?.disabled) return;
    if(button){
      button.disabled=true;
      button.textContent='…';
    }
    try{
      const data=await api('remove-error',{errorId:error.id});
      state.car={...state.car,...data};
      renderErrors(state.car);
      applyCarSmartOrder({animate:true});
      setStatus('Запись удалена','success');
      try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(_){
      if(button){
        button.disabled=false;
        button.textContent='Удалить';
      }
      setStatus('Не удалось удалить запись','error');
      try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }
  }

  function serviceRemaining(car) {
    const mileage=Number(car?.state?.mileage);
    const next=Number(car?.nextService?.mileage);
    if(!Number.isFinite(mileage)||!Number.isFinite(next)) return null;
    return Math.max(0,next-mileage);
  }

  const CAR_SMART_DEFAULT_ORDER=['mileage','errors','tasks','documents','notes'];
  const CAR_SMART_FALLBACK_PRIORITY={
    base:{mileage:60,errors:50,tasks:40},
    tasks:{overdue:1000,today:900,tomorrow:650,week:500,any:250},
    service:{due:980,within500:860,within1000:780,within2500:560,within5000:320},
    mileage:{missing:700},
    errors:{active:950,perError:8}
  };
  let carTabObserver=null;

  function carPrioritySection(name){
    const fallback=CAR_SMART_FALLBACK_PRIORITY[name]||{};
    const remote=state.car?.priorityConfig?.[name];
    const source=remote&&typeof remote==='object'&&!Array.isArray(remote)?remote:{};
    return Object.fromEntries(Object.entries(fallback).map(([key,value])=>{
      const number=Number(source[key]);
      return [key,Number.isFinite(number)?number:value];
    }));
  }

  function clientMoscowDateKey(value=new Date()){
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
      timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(value).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
    return parts.year+'-'+parts.month+'-'+parts.day;
  }

  function daysFromToday(dateKey){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey||''))) return null;
    const today=Date.parse(clientMoscowDateKey()+'T00:00:00Z');
    const target=Date.parse(String(dateKey)+'T00:00:00Z');
    if(!Number.isFinite(today)||!Number.isFinite(target)) return null;
    return Math.round((target-today)/86400000);
  }

  function carCardPriority(id){
    const base=carPrioritySection('base');
    let score=Number(base[id]||0);
    let reason='Обычный порядок';

    if(id==='tasks'){
      const rules=carPrioritySection('tasks');
      const tasks=Array.isArray(state.car?.ticktick?.tasks)?state.car.ticktick.tasks:[];
      if(tasks.some(task=>String(task?.timing||'')==='overdue')){
        score=Math.max(score,rules.overdue);reason='Есть просроченная задача';
      }else if(tasks.some(task=>String(task?.timing||'')==='today')){
        score=Math.max(score,rules.today);reason='Есть задача на сегодня';
      }else{
        const offsets=tasks.map(task=>daysFromToday(task?.date)).filter(value=>Number.isFinite(value)&&value>0);
        const nearest=offsets.length?Math.min(...offsets):null;
        if(nearest===1){score=Math.max(score,rules.tomorrow);reason='Есть задача на завтра';}
        else if(Number.isFinite(nearest)&&nearest<=7){score=Math.max(score,rules.week);reason='Есть задача на ближайшую неделю';}
        else if(tasks.length){score=Math.max(score,rules.any);reason='Есть актуальные задачи';}
      }
    }

    if(id==='mileage'){
      const mileageRules=carPrioritySection('mileage');
      const serviceRules=carPrioritySection('service');
      const remaining=serviceRemaining(state.car);
      if(state.car?.state?.mileage==null){
        score=Math.max(score,mileageRules.missing);reason='Нужен пробег для расчёта ТО';
      }else if(remaining===0){
        score=Math.max(score,serviceRules.due);reason='Пора на ТО';
      }else if(Number.isFinite(remaining)&&remaining<=500){
        score=Math.max(score,serviceRules.within500);reason='До ТО не больше 500 км';
      }else if(Number.isFinite(remaining)&&remaining<=1000){
        score=Math.max(score,serviceRules.within1000);reason='До ТО не больше 1 000 км';
      }else if(Number.isFinite(remaining)&&remaining<=2500){
        score=Math.max(score,serviceRules.within2500);reason='ТО приближается';
      }else if(Number.isFinite(remaining)&&remaining<=5000){
        score=Math.max(score,serviceRules.within5000);reason='ТО уже стоит планировать';
      }
    }

    if(id==='errors'){
      const rules=carPrioritySection('errors');
      const count=Array.isArray(state.car?.state?.errors)?state.car.state.errors.length:0;
      if(count){
        score=Math.max(score,rules.active+Math.max(0,count-1)*rules.perError);
        reason='Есть активная ошибка на приборке';
      }
    }

    return {score,reason};
  }

  function carCardViewKey(id){
    return 'car-card:'+String(id||'');
  }

  function carCardLegacyStorageKey(id){
    return 'rudi:'+carCardViewKey(id)+':collapsed';
  }

  function readCarCardCollapsed(id){
    const key=carCardViewKey(id);
    const legacyKey=carCardLegacyStorageKey(id);
    try{
      const preferences=window.RUDI_UI_PREFERENCES;
      const legacy=localStorage.getItem(legacyKey);
      if(typeof preferences?.getViewState==='function'){
        if(legacy!==null){
          const value=legacy==='1';
          preferences.setViewState?.(key,value);
          localStorage.removeItem(legacyKey);
          return value;
        }
        return Boolean(preferences.getViewState(key,false));
      }
      return legacy==='1';
    }catch(_){return false}
  }

  function writeCarCardCollapsed(id,collapsed){
    const key=carCardViewKey(id);
    const legacyKey=carCardLegacyStorageKey(id);
    const value=Boolean(collapsed);
    try{
      if(typeof window.RUDI_UI_PREFERENCES?.setViewState==='function'){
        window.RUDI_UI_PREFERENCES.setViewState(key,value);
        localStorage.removeItem(legacyKey);
        return;
      }
      localStorage.setItem(legacyKey,value?'1':'0');
    }catch(_){}
  }

  function setCarCardCollapsed(card,collapsed,{persist=true}={}){
    if(!card) return;
    const value=Boolean(collapsed);
    card.classList.toggle('is-collapsed',value);
    const button=card.querySelector('[data-car-collapse]');
    button?.setAttribute('aria-expanded',value?'false':'true');
    if(persist) writeCarCardCollapsed(card.dataset.carCard,value);
  }

  function syncCarCardCollapseStates(){
    document.querySelectorAll('#carBody > .car-smart-card[data-car-card]').forEach(card=>{
      setCarCardCollapsed(card,readCarCardCollapsed(card.dataset.carCard),{persist:false});
    });
  }

  function carSmartIcon(source){
    return source?.querySelector?.('.car-card-icon,.car-section-icon,.car-wash-guide-open-icon')?.cloneNode(true)||null;
  }

  function buildCarSmartCard(id,title,source){
    if(!source) return null;
    const card=document.createElement('section');
    card.className='car-smart-card panel';
    card.dataset.carCard=id;
    card.dataset.carDefaultRank=String(CAR_SMART_DEFAULT_ORDER.indexOf(id));

    const head=document.createElement('div');
    head.className='car-smart-card-head';
    const titleWrap=document.createElement('div');
    titleWrap.className='car-smart-card-title';
    const icon=carSmartIcon(source);
    if(icon) titleWrap.appendChild(icon);
    const titleNode=document.createElement('strong');
    titleNode.textContent=title;
    titleNode.id='carSmartTitle-'+id;
    titleWrap.appendChild(titleNode);

    if(id==='tasks'){
      const badge=document.createElement('span');
      badge.id='carTasksTodayBadge';
      badge.className='car-card-notification-badge';
      badge.hidden=true;
      titleWrap.appendChild(badge);
    }

    const actions=document.createElement('div');
    actions.className='car-smart-card-actions';
    const collapse=document.createElement('button');
    collapse.type='button';
    collapse.className='car-card-collapse';
    collapse.dataset.carCollapse='1';
    collapse.setAttribute('aria-label','Свернуть или развернуть '+title);
    collapse.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>';
    actions.append(collapse);
    head.append(titleWrap,actions);

    const body=document.createElement('div');
    body.className='car-smart-card-body';
    const inner=document.createElement('div');
    inner.className='car-smart-card-body-inner';
    body.appendChild(inner);
    inner.appendChild(source);
    card.append(head,body);

    collapse.addEventListener('click',()=>{
      setCarCardCollapsed(card,!card.classList.contains('is-collapsed'));
      try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
    });
    setCarCardCollapsed(card,readCarCardCollapsed(id),{persist:false});
    return card;
  }

  function ensureCarEnhancementUi(){
    const page=document.getElementById('carPage');
    const body=document.getElementById('carBody');
    if(!page||!body) return;

    if(!document.getElementById('carAttentionSummary')){
      const summary=document.createElement('section');
      summary.id='carAttentionSummary';
      summary.className='car-attention-summary is-loading';
      summary.setAttribute('aria-live','polite');
      summary.innerHTML=
        '<div class="car-attention-main">'
        +'<span id="carAttentionIndicator" class="car-attention-indicator" aria-hidden="true"></span>'
        +'<div class="car-attention-copy"><strong id="carAttentionTitle">Проверяю состояние машины…</strong><span id="carAttentionText"></span></div>'
        +'</div>'
        +'<div id="carAttentionChips" class="car-attention-chips"></div>'
        +'<div class="car-tyre-status">'
        +'<div class="car-tyre-status-copy"><span>Шины</span><strong id="carTyreInstalled">Установленные не указаны</strong><small id="carTyreRecommended">Рекомендация загружается…</small></div>'
        +'<div class="car-tyre-buttons" role="group" aria-label="Какие шины установлены">'
        +'<button type="button" data-car-tyre-season="summer">Летние</button>'
        +'<button type="button" data-car-tyre-season="winter">Зимние</button>'
        +'</div></div>';
      const anchor=page.querySelector('.car-hero-recommendations')||body;
      page.insertBefore(summary,anchor);
    }

    const mileageContent=body.querySelector('[data-car-card="mileage"] .car-mileage-service-content');
    if(mileageContent&&!document.getElementById('carMileageInsights')){
      const insights=document.createElement('section');
      insights.id='carMileageInsights';
      insights.className='car-mileage-insights';
      insights.innerHTML=
        '<div class="car-service-dimensions">'
        +'<div><span>По пробегу</span><strong id="carServiceByMileage">—</strong><small id="carServiceByMileageMeta"></small></div>'
        +'<div><span>По времени</span><strong id="carServiceByTime">—</strong><small id="carServiceByTimeMeta"></small></div>'
        +'</div>'
        +'<div class="car-mileage-stats">'
        +'<div><span>За 30 дней</span><strong id="carMileage30d">—</strong></div>'
        +'<div><span>Средний темп</span><strong id="carMileageDaily">—</strong></div>'
        +'<div><span>ТО примерно</span><strong id="carMileageEta">—</strong></div>'
        +'</div>'
        +'<form id="carLastServiceForm" class="car-last-service-form">'
        +'<label><span>Последнее ТО</span><input id="carLastServiceInput" type="date"></label>'
        +'<button id="carLastServiceSave" type="submit">Сохранить</button>'
        +'</form>'
        +'<details class="car-mileage-history"><summary><span>История пробега</span><strong id="carMileageHistoryCount">0</strong></summary><div id="carMileageHistoryList"></div></details>';
      mileageContent.appendChild(insights);
    }

    const taskCard=body.querySelector('[data-car-card="tasks"]');
    const tasks=taskCard?.querySelector('.car-tasks');
    if(taskCard&&tasks&&!document.getElementById('carTaskAdd')){
      const add=document.createElement('button');
      add.id='carTaskAdd';
      add.className='car-task-add';
      add.type='button';
      add.textContent='+ Задача';
      taskCard.querySelector('.car-smart-card-actions')?.prepend(add);

      const form=document.createElement('form');
      form.id='carTaskForm';
      form.className='car-task-form';
      form.hidden=true;
      form.innerHTML=
        '<label class="car-task-field"><span>Задача</span><input id="carTaskTitle" maxlength="120" autocomplete="off" placeholder="Например переобуться" required></label>'
        +'<label class="car-task-field"><span>Дата</span><input id="carTaskDate" type="date"></label>'
        +'<div class="car-task-form-actions"><button id="carTaskCancel" type="button">Отмена</button><button id="carTaskSave" type="submit">Добавить</button></div>';
      tasks.prepend(form);
    }

    if(page.dataset.carEnhancementsReady==='1') return;
    page.dataset.carEnhancementsReady='1';
    page.querySelectorAll('[data-car-tyre-season]').forEach(button=>{
      button.addEventListener('click',()=>saveTyreSeason(button.dataset.carTyreSeason,button));
    });
    document.getElementById('carLastServiceForm')?.addEventListener('submit',saveLastServiceDate);
    document.getElementById('carTaskAdd')?.addEventListener('click',()=>setTaskFormOpen(true));
    document.getElementById('carTaskCancel')?.addEventListener('click',()=>setTaskFormOpen(false));
    document.getElementById('carTaskForm')?.addEventListener('submit',saveCarTask);
  }

  function setupCarSmartCards(){
    const page=document.getElementById('carPage');
    const body=document.getElementById('carBody');
    if(!page||!body||body.dataset.smartCardsReady==='1') return;
    body.dataset.smartCardsReady='1';
    body.classList.add('car-smart-cards');

    const recommendations=body.querySelector('.car-recommendations');
    if(recommendations){
      recommendations.classList.add('car-hero-recommendations');
      page.insertBefore(recommendations,body);
    }

    const service=body.querySelector('.car-service-card');
    const mileage=body.querySelector('.car-mileage-panel');
    const errors=body.querySelector('.car-errors');
    const tasks=body.querySelector('.car-tasks');
    const documents=body.querySelector('.car-documents');
    const notes=body.querySelector('.car-notes');
    const progress=body.querySelector(':scope > .car-service-progress');
    const status=body.querySelector('#carStatus');

    const mileageService=document.createElement('div');
    mileageService.className='car-mileage-service-content';
    if(mileage) mileageService.appendChild(mileage);
    if(service) mileageService.appendChild(service);
    if(progress) mileageService.appendChild(progress);

    const cards=[
      buildCarSmartCard('mileage','Пробег и ТО',mileageService),
      buildCarSmartCard('errors','Нужно починить',errors),
      buildCarSmartCard('tasks','Что сделать по машине',tasks),
      buildCarSmartCard('documents','Автодокументы',documents),
      buildCarSmartCard('notes','Заметки',notes)
    ].filter(Boolean);

    service?.querySelector('.car-card-title')?.remove();
    mileage?.querySelector('.car-card-title')?.remove();

    const errorCard=cards.find(card=>card.dataset.carCard==='errors');
    const errorActions=errors?.querySelector('.car-errors-head-actions');
    if(errorActions&&errorCard) errorCard.querySelector('.car-smart-card-actions')?.prepend(errorActions);
    errors?.querySelector('.car-section-head')?.remove();

    const taskCard=cards.find(card=>card.dataset.carCard==='tasks');
    const taskMeta=tasks?.querySelector('#carTasksMeta');
    if(taskMeta&&taskCard) taskCard.querySelector('.car-smart-card-actions')?.prepend(taskMeta);
    tasks?.querySelector('.car-section-head')?.remove();

    const documentsCard=cards.find(card=>card.dataset.carCard==='documents');
    const documentsMeta=documents?.querySelector('#carDocumentsMeta');
    if(documentsMeta&&documentsCard) documentsCard.querySelector('.car-smart-card-actions')?.prepend(documentsMeta);
    documents?.querySelector('.car-section-head')?.remove();

    const noteCard=cards.find(card=>card.dataset.carCard==='notes');
    const noteActions=notes?.querySelector('.car-notes-head-actions');
    if(noteActions&&noteCard) noteCard.querySelector('.car-smart-card-actions')?.prepend(noteActions);
    notes?.querySelector('.car-section-head')?.remove();

    const fragment=document.createDocumentFragment();
    cards.forEach(card=>fragment.appendChild(card));
    if(status) fragment.appendChild(status);
    body.replaceChildren(fragment);
    ensureCarEnhancementUi();
    applyCarSmartOrder({animate:false});
  }

  function carCardRects(host){
    return new Map([...host.querySelectorAll(':scope > .car-smart-card')].map(card=>[card,card.getBoundingClientRect()]));
  }

  function animateCarCardOrder(host,before,skip=null){
    if(!before||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    requestAnimationFrame(()=>{
      host.querySelectorAll(':scope > .car-smart-card').forEach(card=>{
        if(card===skip) return;
        const old=before.get(card);
        if(!old) return;
        const next=card.getBoundingClientRect();
        const dy=old.top-next.top;
        if(Math.abs(dy)<1) return;
        try{card.animate([{transform:'translate3d(0,'+dy+'px,0)'},{transform:'translate3d(0,0,0)'}],{duration:220,easing:'cubic-bezier(.2,.82,.2,1)'})}catch(_){}
      });
    });
  }

  function applyCarSmartOrder({animate=true}={}){
    const host=document.getElementById('carBody');
    if(!host||host.dataset.smartCardsReady!=='1') return;
    const cards=[...host.querySelectorAll(':scope > .car-smart-card')];
    if(cards.length<2) return;
    const before=animate?carCardRects(host):null;
    const documentsCard=cards.find(card=>card.dataset.carCard==='documents')||null;
    const notesCard=cards.find(card=>card.dataset.carCard==='notes')||null;
    const ranked=cards.filter(card=>card!==notesCard&&card!==documentsCard).map(card=>{
      const priority=carCardPriority(card.dataset.carCard);
      card.dataset.priorityScore=String(priority.score);
      card.dataset.priorityReason=priority.reason;
      return {card,score:priority.score,rank:Number(card.dataset.carDefaultRank)||0};
    }).sort((a,b)=>b.score-a.score||a.rank-b.rank);

    ranked.forEach(({card})=>host.insertBefore(card,document.getElementById('carStatus')||null));
    const taskCard=host.querySelector(':scope > .car-smart-card[data-car-card="tasks"]');
    if(documentsCard&&taskCard) host.insertBefore(documentsCard,taskCard.nextSibling);
    else if(documentsCard) host.insertBefore(documentsCard,document.getElementById('carStatus')||null);
    if(notesCard&&documentsCard) host.insertBefore(notesCard,documentsCard.nextSibling);
    else if(notesCard&&taskCard) host.insertBefore(notesCard,taskCard.nextSibling);
    else if(notesCard) host.insertBefore(notesCard,document.getElementById('carStatus')||null);
    if(animate) animateCarCardOrder(host,before);
  }

  function setupCarTabObserver(){
    if(carTabObserver) return;
    let previous=String(document.body.dataset.appTab||'');
    carTabObserver=new MutationObserver(()=>{
      const next=String(document.body.dataset.appTab||'');
      if(next==='car'&&previous!=='car'){
        requestAnimationFrame(()=>applyCarSmartOrder({animate:false}));
        loadCarDocuments().catch(()=>{});
      }
      previous=next;
    });
    carTabObserver.observe(document.body,{attributes:true,attributeFilter:['data-app-tab']});
  }

  function setupCarWashModal(){
    const page=document.getElementById('carWashGuidePage');
    if(!page||page.dataset.modalReady==='1') return;
    page.dataset.modalReady='1';
    const dialog=document.createElement('div');
    dialog.className='car-wash-guide-dialog';
    dialog.setAttribute('tabindex','-1');
    while(page.firstChild) dialog.appendChild(page.firstChild);
    const backdrop=document.createElement('button');
    backdrop.type='button';
    backdrop.className='car-wash-guide-backdrop';
    backdrop.setAttribute('aria-label','Закрыть инструкцию');
    page.append(backdrop,dialog);
    // Portal the modal to <body>. On iOS/WebView a fixed element inside the app
    // section can inherit a transformed containing block and sit under the tab bar.
    if(page.parentElement!==document.body) document.body.appendChild(page);
    const close=dialog.querySelector('#carWashGuideBack');
    if(close){
      close.setAttribute('aria-label','Закрыть');
      close.innerHTML='<svg viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
    }
    backdrop.addEventListener('click',()=>setWashGuideOpen(false));
    page.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();setWashGuideOpen(false);}
    });
  }

  const CAR_PURCHASE_DATE='2023-09-07';

  function russianCount(value,one,few,many){
    const n=Math.abs(Number(value)||0)%100;
    const last=n%10;
    if(n>=11&&n<=14) return many;
    if(last===1) return one;
    if(last>=2&&last<=4) return few;
    return many;
  }

  function carAgeLabel(now=new Date()){
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
      timeZone:'Europe/Moscow',
      year:'numeric',
      month:'2-digit',
      day:'2-digit'
    }).formatToParts(now).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
    const currentYear=Number(parts.year);
    const currentMonth=Number(parts.month);
    const currentDay=Number(parts.day);
    const [purchaseYear,purchaseMonth,purchaseDay]=CAR_PURCHASE_DATE.split('-').map(Number);

    let totalMonths=(currentYear-purchaseYear)*12+(currentMonth-purchaseMonth);
    if(currentDay<purchaseDay) totalMonths-=1;
    totalMonths=Math.max(0,totalMonths);

    const years=Math.floor(totalMonths/12);
    const months=totalMonths%12;
    const yearsLabel=years+' '+russianCount(years,'год','года','лет');
    if(months===0) return yearsLabel;
    if(years===0) return months+' '+russianCount(months,'месяц','месяца','месяцев');
    return yearsLabel+' '+months+' '+russianCount(months,'месяц','месяца','месяцев');
  }

  function renderCarAge(){
    const label=carAgeLabel();
    for(const id of ['carHomeAge','carPageAge']){
      const node=document.getElementById(id);
      if(node) node.textContent=label;
    }
  }

  function mileageHistoryEntries(car){
    const rows=Array.isArray(car?.state?.mileageHistory)?car.state.mileageHistory:[];
    return rows.map(row=>({
      mileage:Number(row?.mileage),
      at:new Date(row?.at)
    })).filter(row=>Number.isFinite(row.mileage)&&Number.isFinite(row.at.getTime()))
      .sort((a,b)=>a.at-b.at);
  }

  function mileageAnalytics(car,now=new Date()){
    const history=mileageHistoryEntries(car);
    if(history.length<2) return {history,delta30:null,avgDaily:null,spanDays:null};
    const latest=history[history.length-1];
    const cutoff=latest.at.getTime()-30*86400000;
    let baseline=history[0];
    for(const row of history){
      if(row.at.getTime()<=cutoff) baseline=row;
      else if(baseline===history[0]&&history[0].at.getTime()>cutoff) baseline=history[0];
    }
    const spanDays=Math.max((latest.at-baseline.at)/86400000,0);
    const delta=Math.max(0,latest.mileage-baseline.mileage);
    const avgDaily=spanDays>=0.5&&delta>0?delta/spanDays:null;
    return {
      history,
      delta30:spanDays>0?delta:null,
      avgDaily:Number.isFinite(avgDaily)?avgDaily:null,
      spanDays
    };
  }

  function addYearDateKey(dateKey){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey||''))) return null;
    const date=new Date(String(dateKey)+'T12:00:00Z');
    if(!Number.isFinite(date.getTime())) return null;
    date.setUTCFullYear(date.getUTCFullYear()+1);
    return date;
  }

  function shortDate(value){
    const date=value instanceof Date?value:new Date(value);
    if(!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}).format(date);
  }

  function fullDate(value){
    const date=value instanceof Date?value:new Date(value);
    if(!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric'}).format(date);
  }

  function serviceInsight(car,now=new Date()){
    const mileage=Number(car?.state?.mileage);
    const nextMileage=Number(car?.nextService?.mileage);
    const remaining=Number.isFinite(mileage)&&Number.isFinite(nextMileage)?Math.max(0,nextMileage-mileage):null;
    const analytics=mileageAnalytics(car,now);
    let mileageDueAt=null;
    if(Number.isFinite(remaining)&&remaining===0) mileageDueAt=new Date(now);
    else if(Number.isFinite(remaining)&&Number.isFinite(analytics.avgDaily)&&analytics.avgDaily>0){
      mileageDueAt=new Date(now.getTime()+(remaining/analytics.avgDaily)*86400000);
    }

    const timeDueAt=addYearDateKey(car?.state?.lastServiceAt);
    const timeDays=timeDueAt?Math.ceil((timeDueAt.getTime()-now.getTime())/86400000):null;
    const mileageDays=mileageDueAt?Math.ceil((mileageDueAt.getTime()-now.getTime())/86400000):null;

    let primary='mileage';
    if(timeDueAt&&mileageDueAt) primary=timeDueAt<=mileageDueAt?'time':'mileage';
    else if(timeDueAt&&!mileageDueAt) primary='time';

    const due=(Number.isFinite(remaining)&&remaining<=0)||(Number.isFinite(timeDays)&&timeDays<=0);
    const soon=!due&&(
      (Number.isFinite(remaining)&&remaining<=2500)
      ||(Number.isFinite(timeDays)&&timeDays<=30)
    );
    return {mileage,nextMileage,remaining,analytics,mileageDueAt,mileageDays,timeDueAt,timeDays,primary,due,soon};
  }

  function renderMileageInsights(car,insight){
    const byMileage=document.getElementById('carServiceByMileage');
    const byMileageMeta=document.getElementById('carServiceByMileageMeta');
    const byTime=document.getElementById('carServiceByTime');
    const byTimeMeta=document.getElementById('carServiceByTimeMeta');
    const delta=document.getElementById('carMileage30d');
    const daily=document.getElementById('carMileageDaily');
    const eta=document.getElementById('carMileageEta');
    const input=document.getElementById('carLastServiceInput');
    const historyList=document.getElementById('carMileageHistoryList');
    const historyCount=document.getElementById('carMileageHistoryCount');

    if(byMileage){
      byMileage.textContent=Number.isFinite(insight.remaining)?(insight.remaining===0?'Пора на ТО':'Осталось '+formatKm(insight.remaining)):'Добавь пробег';
    }
    if(byMileageMeta){
      byMileageMeta.textContent=insight.mileageDueAt&&insight.remaining>0?'Примерно '+fullDate(insight.mileageDueAt):'';
    }
    if(byTime){
      if(!insight.timeDueAt) byTime.textContent='Дата не указана';
      else if(insight.timeDays<=0) byTime.textContent='Срок наступил';
      else byTime.textContent='До '+fullDate(insight.timeDueAt);
    }
    if(byTimeMeta){
      byTimeMeta.textContent=insight.timeDueAt&&insight.timeDays>0?insight.timeDays+' дн.':'';
    }
    if(delta) delta.textContent=Number.isFinite(insight.analytics.delta30)?'+'+formatKm(insight.analytics.delta30):'—';
    if(daily) daily.textContent=Number.isFinite(insight.analytics.avgDaily)?Math.round(insight.analytics.avgDaily)+' км/день':'—';
    if(eta) eta.textContent=insight.mileageDueAt&&insight.remaining>0?shortDate(insight.mileageDueAt):'—';
    if(input&&document.activeElement!==input) input.value=String(car?.state?.lastServiceAt||'');

    if(historyList){
      historyList.replaceChildren();
      const rows=[...insight.analytics.history].sort((a,b)=>b.at-a.at).slice(0,8);
      if(historyCount) historyCount.textContent=String(insight.analytics.history.length);
      if(!rows.length){
        const empty=document.createElement('div');
        empty.className='car-mileage-history-empty';
        empty.textContent='История появится после обновлений пробега';
        historyList.appendChild(empty);
      }else{
        rows.forEach(row=>{
          const item=document.createElement('div');
          item.className='car-mileage-history-row';
          const value=document.createElement('strong');
          value.textContent=formatKm(row.mileage);
          const date=document.createElement('span');
          date.textContent=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric'}).format(row.at);
          const remove=document.createElement('button');
          remove.type='button';
          remove.className='car-archive-remove car-mileage-history-remove';
          remove.setAttribute('aria-label','Удалить запись из истории пробега');
          remove.textContent='×';
          remove.addEventListener('click',async()=>{
            if(!(await confirmArchiveDelete('Удалить '+formatKm(row.mileage)+' из истории пробега?'))) return;
            await removeMileageHistoryItem(row,remove);
          });
          item.append(value,date,remove);
          historyList.appendChild(item);
        });
      }
    }
  }

  async function removeMileageHistoryItem(row,button) {
    if(!row || button?.disabled) return;
    const at=row.at instanceof Date ? row.at.toISOString() : new Date(row.at).toISOString();
    button.disabled=true;
    try{
      const data=await api('remove-mileage-history',{mileage:row.mileage,at});
      state.car={...state.car,...data};
      renderService(state.car);
      renderCarAttention(state.car,state.weather);
      setStatus('Запись пробега удалена из истории','success');
      try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(_){
      button.disabled=false;
      setStatus('Не удалось удалить запись пробега','error');
      try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }
  }

  function renderService(car) {
    renderCarAge();
    const mileage=car?.state?.mileage;
    const next=car?.nextService;
    const insight=serviceInsight(car);
    const mileageNode=document.getElementById('carMileageValue');
    const updatedNode=document.getElementById('carMileageUpdated');
    const input=document.getElementById('carMileageInput');
    const nextNode=document.getElementById('carNextService');
    const meta=document.getElementById('carServiceMeta');
    const progress=document.getElementById('carServiceProgress');
    const modelNode=document.querySelector('#carPage .car-model');
    const collapsedMileageNode=document.getElementById('carCollapsedMileageValue');
    const collapsedServiceNode=document.getElementById('carCollapsedServiceValue');
    const collapsedProgress=document.getElementById('carCollapsedServiceProgress');
    const collapsedPercent=document.getElementById('carCollapsedServicePercent');
    const homeMileageNode=document.getElementById('carHomeMileageValue');
    const homeServiceNode=document.getElementById('carHomeServiceValue');
    const homeProgress=document.getElementById('carHomeServiceProgress');
    const homePercent=document.getElementById('carHomeServicePercent');

    const mileageText=mileage==null?'Не указан':formatKm(mileage);
    let serviceText=next?'ТО-'+next.number+' · '+formatKm(next.mileage):'Не определено';
    if(next&&insight.primary==='time'&&insight.timeDueAt){
      serviceText='ТО-'+next.number+' · до '+shortDate(insight.timeDueAt);
    }

    if(modelNode){
      modelNode.dataset.mileage=mileage==null?'Пробег не указан':'Пробег · '+formatKm(mileage);
      modelNode.dataset.service='Следующее ТО · '+serviceText;
    }
    if(collapsedMileageNode) collapsedMileageNode.textContent=mileageText;
    if(collapsedServiceNode) collapsedServiceNode.textContent=serviceText;
    if(homeMileageNode) homeMileageNode.textContent=mileageText;
    if(homeServiceNode) homeServiceNode.textContent=serviceText;
    if(mileageNode) mileageNode.textContent=mileageText;
    if(updatedNode) updatedNode.textContent=formatUpdated(car?.state?.mileageUpdatedAt||car?.state?.updatedAt);
    if(input&&document.activeElement!==input) input.value=mileage==null?'':String(mileage);

    renderMileageInsights(car,insight);

    if(!next||mileage==null) {
      if(nextNode) nextNode.textContent=insight.timeDueAt?'По времени · '+(insight.timeDays<=0?'срок наступил':'до '+shortDate(insight.timeDueAt)):'Добавь пробег';
      if(meta) meta.textContent=insight.timeDueAt?'Добавь пробег, чтобы сравнить оба лимита':'Добавь пробег и дату последнего ТО';
      [progress,collapsedProgress,homeProgress].forEach(node=>{if(node)node.style.width='0%'});
      if(collapsedPercent) collapsedPercent.textContent=insight.timeDueAt?(insight.timeDays<=0?'Срок':insight.timeDays+' дн.'):'—';
      if(homePercent) homePercent.textContent=insight.timeDueAt?(insight.timeDays<=0?'Срок':insight.timeDays+' дн.'):'—';
      return;
    }

    if(nextNode){
      nextNode.textContent=insight.primary==='time'&&insight.timeDueAt
        ?'ТО-'+next.number+' · до '+shortDate(insight.timeDueAt)
        :'ТО-'+next.number+' · '+formatKm(next.mileage);
    }
    if(meta){
      if(insight.due) meta.textContent='Пора на ТО · сработал ближайший лимит';
      else if(insight.primary==='time'&&insight.timeDueAt) meta.textContent='Раньше наступает срок по времени';
      else if(insight.mileageDueAt) meta.textContent='По текущему темпу раньше наступает лимит пробега';
      else meta.textContent='Сравниваю пробег и срок после последнего ТО';
    }

    const previous=next.mileage===5000?0:next.mileage-10000;
    const span=Math.max(1,next.mileage-previous);
    const mileagePct=Math.max(0,Math.min(100,((Number(mileage)-previous)/span)*100));
    let combinedPct=mileagePct;
    if(insight.primary==='time'&&car?.state?.lastServiceAt&&insight.timeDueAt){
      const start=new Date(String(car.state.lastServiceAt)+'T12:00:00Z');
      const total=Math.max(1,insight.timeDueAt-start);
      combinedPct=Math.max(0,Math.min(100,((Date.now()-start.getTime())/total)*100));
    }
    [progress,collapsedProgress,homeProgress].forEach(node=>{if(node)node.style.width=combinedPct.toFixed(1)+'%'});
    const remainingLabel=insight.primary==='time'&&Number.isFinite(insight.timeDays)
      ?(insight.timeDays<=0?'Срок':insight.timeDays+' дн.')
      :(Number.isFinite(insight.remaining)?formatKm(insight.remaining):'—');
    if(collapsedPercent) collapsedPercent.textContent=remainingLabel;
    if(homePercent) homePercent.textContent=remainingLabel;
  }

  function tyreForecastAdvice(weather) {
    const min=Number(weather?.minForecast);
    const avg=Number(weather?.avgMean);
    const hasMin=Number.isFinite(min);
    const hasAvg=Number.isFinite(avg);

    if(hasAvg&&avg<=7) {
      return {season:'winter',kind:'change',text:'Средняя температура недели ниже +7 °C'};
    }
    if(hasAvg&&avg>=10&&hasMin&&min>5) {
      return {season:'summer',kind:'keep',text:'Прогноз устойчиво тёплый'};
    }
    if(hasMin&&min<=0) {
      return {season:'',kind:'frost',text:'Возможны ночные заморозки · подготовься к смене'};
    }
    if(hasAvg||hasMin) {
      return {season:'',kind:'borderline',text:'Пограничная температура · пока без смены'};
    }
    return {season:'',kind:'unknown',text:'Прогноз недоступен · сезон не меняю автоматически'};
  }

  function tyreSeason(weather) {
    return tyreForecastAdvice(weather).season;
  }

  function renderTyreSeason(weather) {
    const advice=tyreForecastAdvice(weather);
    const recommended=advice.season;
    const installed=String(state.car?.state?.tyreSeasonInstalled||'');
    const recommendedText=recommended==='winter'?'зимние':recommended==='summer'?'летние':'';
    const installedText=installed==='winter'?'Зимние':installed==='summer'?'Летние':'Не указаны';
    const mismatch=Boolean(installed&&recommended&&installed!==recommended);

    for(const id of ['carHomeTyreSticker','carPageTyreSticker']){
      const node=document.getElementById(id);
      if(!node) continue;
      node.hidden=!installed;
      if(installed){
        node.textContent=installedText+' стоят';
        node.dataset.season=installed;
        node.setAttribute('aria-label','Сейчас установлены '+installedText.toLowerCase()+' шины');
      }
    }

    const installedNode=document.getElementById('carTyreInstalled');
    const recommendedNode=document.getElementById('carTyreRecommended');
    if(installedNode) installedNode.textContent='Установлены: '+installedText.toLowerCase();
    if(recommendedNode){
      recommendedNode.textContent=recommended
        ?(mismatch?'По прогнозу нужны '+recommendedText+' · пора менять':'По прогнозу '+recommendedText+' подходят')
        :advice.text;
      recommendedNode.classList.toggle('is-mismatch',mismatch);
    }
    document.querySelectorAll('[data-car-tyre-season]').forEach(button=>{
      const active=button.dataset.carTyreSeason===installed;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
    });
  }

  function carWashDayPhrase(dateValue,index){
    if(index===0) return 'сегодня';
    const date=new Date(String(dateValue||'')+'T12:00:00+03:00');
    if(Number.isNaN(date.getTime())) return '';
    const day=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',weekday:'long'}).format(date);
    const forms={
      'понедельник':'в понедельник',
      'вторник':'во вторник',
      'среда':'в среду',
      'четверг':'в четверг',
      'пятница':'в пятницу',
      'суббота':'в субботу',
      'воскресенье':'в воскресенье'
    };
    return forms[day]||('в '+day);
  }

  function bestCarWashDay(weather,{startIndex=0}={}){
    if(!weather) return null;
    const precipitation=(Array.isArray(weather.dailyPrecipitation)?weather.dailyPrecipitation:[]).slice(0,7).map(Number);
    const mins=(Array.isArray(weather.dailyMin)?weather.dailyMin:[]).slice(0,7).map(Number);
    const codes=(Array.isArray(weather.dailyCodes)?weather.dailyCodes:[]).slice(0,7).map(Number);
    const dates=(Array.isArray(weather.dailyDates)?weather.dailyDates:[]).slice(0,7);
    const length=Math.max(precipitation.length,codes.length,dates.length);
    if(!length) return null;
    const wetCodes=new Set([51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
    const wet=index=>{
      const mm=Number(precipitation[index]);
      const code=Number(codes[index]);
      return (Number.isFinite(mm)&&mm>=1)||wetCodes.has(code);
    };
    const dryWindow=index=>{
      let count=0;
      for(let i=index;i<Math.min(length,index+3);i++){
        if(wet(i)) break;
        count++;
      }
      return count;
    };

    const firstIndex=Math.max(0,Math.min(length-1,Number(startIndex)||0));
    let candidate=-1;
    for(let i=firstIndex;i<length;i++){
      if(wet(i)) continue;
      if(dryWindow(i)>=2&&Number(mins[i])>0){candidate=i;break}
    }
    if(candidate<0){
      for(let i=firstIndex;i<length;i++){
        if(!wet(i)&&dryWindow(i)>=2){candidate=i;break}
      }
    }
    if(candidate<0){
      let bestScore=Infinity;
      for(let i=firstIndex;i<length;i++){
        if(wet(i)) continue;
        const mm=Number(precipitation[i]);
        const score=(Number.isFinite(mm)?mm:0)+(Number(mins[i])<=0?1.5:0)+i*.05;
        if(score<bestScore){bestScore=score;candidate=i}
      }
    }
    if(candidate<0) return null;
    const phrase=carWashDayPhrase(dates[candidate],candidate);
    return phrase?{index:candidate,phrase,text:'Лучше помыть '+phrase}:null;
  }

  function carWashAdvice(weather) {
    if(!weather) {
      return {kind:'info',title:'Проверь погоду',text:'Прогноз на неделю недоступен. Лучше проверить погоду перед мойкой.'};
    }

    const precipitation=(Array.isArray(weather.dailyPrecipitation)?weather.dailyPrecipitation:[])
      .slice(0,7).map(Number);
    const mins=(Array.isArray(weather.dailyMin)?weather.dailyMin:[])
      .slice(0,7).map(Number);
    const codes=(Array.isArray(weather.dailyCodes)?weather.dailyCodes:[])
      .slice(0,7).map(Number);
    const wetCodes=new Set([51,53,55,61,63,65,71,73,75,80,81,82,95]);
    const wetDays=[];
    for(let i=0;i<Math.max(precipitation.length,codes.length);i++){
      const mm=Number(precipitation[i]);
      const code=Number(codes[i]);
      if((Number.isFinite(mm)&&mm>=1)||wetCodes.has(code)) wetDays.push(i);
    }

    const bestDay=bestCarWashDay(weather);
    const futureBestDay=bestCarWashDay(weather,{startIndex:1});
    const bestDayText=bestDay?.text||'';
    const futureBestDayText=futureBestDay?.text||'';
    const firstWet=wetDays.length?wetDays[0]:-1;
    const total=precipitation.filter(Number.isFinite).reduce((sum,value)=>sum+value,0);
    const snowSoon=codes.slice(0,3).some(code=>[71,73,75].includes(Number(code)));
    const frost=mins.some(value=>Number.isFinite(value)&&value<=0);

    if(snowSoon) {
      return {kind:'cold',title:'Лучше отложить',text:'В ближайшие дни возможен снег, машина быстро снова испачкается.',bestDayText:futureBestDayText};
    }
    if(firstWet===0||firstWet===1) {
      return {kind:'rain',title:'Лучше отложить',text:'Дождь или другие осадки ожидаются в ближайшие 1–2 дня.',bestDayText:futureBestDayText};
    }
    if(wetDays.length>=3||total>=8) {
      return {kind:'rain',title:'Скорее отложить',text:'Неделя ожидается влажной, чистой машина останется ненадолго.',bestDayText:futureBestDayText};
    }
    if(firstWet>=2) {
      const days=firstWet;
      return {kind:'info',title:'Можно мыть',text:'Примерно через '+days+' '+(days===2?'дня':'дней')+' ожидаются осадки.',canWash:true,bestDayText};
    }
    if(frost) {
      return {kind:'cold',title:'Можно, но с просушкой',text:'На неделе возможны заморозки — после мойки хорошо просушить кузов, уплотнители и замки.',canWash:true,bestDayText};
    }
    return {kind:'ok',title:'Да, можно мыть',text:'На ближайшую неделю существенных осадков не видно — хороший момент для мойки.',canWash:true,bestDayText};
  }

  function compactWashAdvice(weather) {
    const advice=carWashAdvice(weather);
    const text=String(advice?.text||'');
    const best=String(advice?.bestDayText||'').replace(/^Лучше помыть\s+/i,'');
    if(/снег/i.test(text)) return best?'Отложить · лучше '+best+'.':'Отложить · возможен снег.';
    if(/1–2 дня/i.test(text)) return best?'Отложить · лучше '+best+'.':'Отложить · осадки в ближайшие 1–2 дня.';
    if(/неделя ожидается влажной/i.test(text)) return best?'Скорее не стоит · лучше '+best+'.':'Скорее не стоит · на неделе ожидаются осадки.';
    const delayed=text.match(/через\s+(\d+)\s+/i);
    if(delayed) return 'Можно · осадки примерно через '+delayed[1]+' дн.';
    if(/замороз/i.test(text)) return best?'Можно · лучше '+best+'.':'Можно · после мойки хорошо просушить.';
    if(advice?.kind==='ok') return best&&best!=='сегодня'?'Да · лучше '+best+'.':'Да · существенных осадков на неделе не ожидается.';
    return 'Проверь погоду перед мойкой.';
  }

  function buildRecommendations(car,weather) {
    return [carWashAdvice(weather)];
  }

  function renderCarWashGuideAction(weather) {
    const button=document.getElementById('carWashGuideOpen');
    if(!button)return;
    const advice=carWashAdvice(weather);
    button.hidden=!Boolean(advice?.canWash);
    button.setAttribute('aria-hidden',button.hidden?'true':'false');
  }

  function renderWeather(weather) {
    const now=document.getElementById('carWeatherNow');
    if(now) {
      now.textContent=weather
        ? Math.round(Number(weather.temperature))+'°C · '+weatherLabel(weather.code)
        : 'Погода недоступна';
    }
    renderTyreSeason(weather);
    const washText=compactWashAdvice(weather);
    const collapsedWash=document.getElementById('carCollapsedWashValue');
    const homeWash=document.getElementById('carHomeWashValue');
    if(collapsedWash) collapsedWash.textContent=washText;
    if(homeWash) homeWash.textContent=washText;
  }

  async function saveTyreSeason(season,button){
    const value=season==='winter'?'winter':'summer';
    const buttons=[...document.querySelectorAll('[data-car-tyre-season]')];
    buttons.forEach(node=>node.disabled=true);
    try{
      const data=await api('set-tyre-season',{season:value});
      state.car={...state.car,...data};
      render();
      setStatus('Комплект шин сохранён','success');
      try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(_){
      setStatus('Не удалось сохранить комплект шин','error');
      try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }finally{
      buttons.forEach(node=>node.disabled=false);
    }
  }

  async function saveLastServiceDate(event){
    event?.preventDefault?.();
    const input=document.getElementById('carLastServiceInput');
    const button=document.getElementById('carLastServiceSave');
    const date=String(input?.value||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){
      setStatus('Укажи дату последнего ТО','error');
      input?.focus();
      return;
    }
    if(button){button.disabled=true;button.textContent='Сохраняю…';}
    try{
      const data=await api('set-last-service',{date});
      state.car={...state.car,...data};
      render();
      setStatus('Дата последнего ТО сохранена','success');
      try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(_){
      setStatus('Не удалось сохранить дату ТО','error');
      try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }finally{
      if(button){button.disabled=false;button.textContent='Сохранить';}
    }
  }

  function setTaskFormOpen(open){
    const form=document.getElementById('carTaskForm');
    if(!form) return;
    form.hidden=!open;
    if(open){
      const date=document.getElementById('carTaskDate');
      if(date&&!date.value) date.value=clientMoscowDateKey();
      requestAnimationFrame(()=>document.getElementById('carTaskTitle')?.focus());
    }else{
      form.reset();
    }
  }

  async function saveCarTask(event){
    event?.preventDefault?.();
    const titleInput=document.getElementById('carTaskTitle');
    const dateInput=document.getElementById('carTaskDate');
    const button=document.getElementById('carTaskSave');
    const title=String(titleInput?.value||'').trim();
    const date=String(dateInput?.value||'').trim();
    if(!title){
      setStatus('Напиши задачу по машине','error');
      titleInput?.focus();
      return;
    }
    if(button){button.disabled=true;button.textContent='Добавляю…';}
    try{
      const data=await api('add-task',{title,date});
      state.car={...state.car,ticktick:data.ticktick};
      renderTasks(state.car.ticktick);
      renderCarAttention(state.car,state.weather);
      setTaskFormOpen(false);
      setStatus('Задача добавлена в TickTick','success');
      try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(_){
      setStatus('Не удалось добавить задачу в TickTick','error');
      try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }finally{
      if(button){button.disabled=false;button.textContent='Добавить';}
    }
  }

  function attentionCountLabel(count){
    const n=Math.max(0,Number(count)||0);
    const mod100=n%100;
    const mod10=n%10;
    const word=mod100>=11&&mod100<=14?'пунктов':mod10===1?'пункт':mod10>=2&&mod10<=4?'пункта':'пунктов';
    return n+' '+word+' требуют внимания';
  }

  function ensureHomeCarAlert(id,className,label){
    const title=document.getElementById('carHomeTitle');
    if(!title) return null;
    let badge=document.getElementById(id);
    if(!badge){
      badge=document.createElement('span');
      badge.id=id;
      badge.className='car-home-alert '+className;
      badge.hidden=true;
      badge.textContent=label;
      title.appendChild(badge);
    }
    return badge;
  }

  function renderCarAttention(car,weather){
    const summary=document.getElementById('carAttentionSummary');
    if(!summary) return;
    const errors=Array.isArray(car?.state?.errors)?car.state.errors:[];
    const tasks=Array.isArray(car?.ticktick?.tasks)?car.ticktick.tasks:[];
    const overdue=tasks.filter(task=>task.timing==='overdue').length;
    const today=tasks.filter(task=>task.timing==='today').length;
    const insight=serviceInsight(car);
    const tyreAdvice=tyreForecastAdvice(weather);
    const recommended=tyreAdvice.season;
    const installed=String(car?.state?.tyreSeasonInstalled||'');
    const tyreMismatch=Boolean(installed&&recommended&&installed!==recommended);

    const items=[];
    if(errors.length) items.push({kind:'danger',text:errors.length===1?'1 неисправность':errors.length+' неисправности'});
    if(insight.due) items.push({kind:'danger',text:'Пора на ТО'});
    else if(insight.soon) items.push({kind:'warn',text:'ТО приближается'});
    if(overdue) items.push({kind:'danger',text:overdue===1?'1 просроченная задача':overdue+' просроченных задач'});
    else if(today) items.push({kind:'warn',text:today===1?'1 задача сегодня':today+' задачи сегодня'});
    if(tyreMismatch) items.push({kind:'warn',text:'Пора менять шины'});
    else if(installed==='summer'&&tyreAdvice.kind==='frost') items.push({kind:'warn',text:'Ночью возможны заморозки'});

    const danger=items.some(item=>item.kind==='danger');
    const warn=!danger&&items.length>0;
    summary.classList.remove('is-loading','is-ok','is-warn','is-danger');
    summary.classList.add(danger?'is-danger':warn?'is-warn':'is-ok');

    const title=document.getElementById('carAttentionTitle');
    const text=document.getElementById('carAttentionText');
    if(title) title.textContent=items.length?attentionCountLabel(items.length):'Всё в порядке';
    if(text){
      text.textContent=items.length
        ?items.map(item=>item.text).join(' · ')
        :'Активных неисправностей и срочных задач нет';
    }
    const chips=document.getElementById('carAttentionChips');
    if(chips){
      chips.replaceChildren();
      items.forEach(item=>{
        const chip=document.createElement('span');
        chip.className='is-'+item.kind;
        chip.textContent=item.text;
        chips.appendChild(chip);
      });
    }

    const repairBadge=ensureHomeCarAlert('carHomeRepairBadge','is-danger','Ремонт');
    if(repairBadge){
      repairBadge.hidden=errors.length<1;
      repairBadge.textContent=errors.length>1?'Ремонт '+errors.length:'Ремонт';
    }
    const serviceBadge=ensureHomeCarAlert('carHomeServiceBadge',insight.due?'is-danger':'is-warn','ТО');
    if(serviceBadge){
      serviceBadge.className='car-home-alert '+(insight.due?'is-danger':'is-warn');
      serviceBadge.hidden=!(insight.due||insight.soon);
      serviceBadge.textContent=insight.due?'ТО сейчас':'ТО скоро';
    }
    const tile=document.getElementById('carTile');
    tile?.classList.toggle('has-car-danger',danger);
    tile?.classList.toggle('has-car-warning',!danger&&warn);
  }

  function taskDateLabel(task){
    const timing=String(task?.timing||'');
    if(timing==='today') return 'Сегодня';
    if(timing==='overdue') return task?.date ? 'Просрочено · '+new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}).format(new Date(task.date+'T12:00:00')) : 'Просрочено';
    if(timing==='upcoming' && task?.date){
      const target=new Date(task.date+'T12:00:00');
      const now=new Date();
      const tomorrow=new Date(now);
      tomorrow.setDate(now.getDate()+1);
      const key=d=>d.toISOString().slice(0,10);
      if(key(target)===key(tomorrow)) return 'Завтра';
      return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}).format(target);
    }
    return 'Без даты';
  }

  async function completeCarTask(task,button){
    if(!task?.id || button?.disabled) return;
    if(button){
      button.disabled=true;
      button.textContent='…';
    }
    try{
      const data=await api('complete-task',{taskId:task.id});
      state.car={...state.car,ticktick:data.ticktick};
      renderTasks(state.car.ticktick);
      applyCarSmartOrder({animate:true});
      setStatus('Задача выполнена','success');
      try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(_){
      if(button){
        button.disabled=false;
        button.textContent='Выполнено';
      }
      setStatus('Не удалось отметить задачу в TickTick','error');
      try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }
  }

  function syncCarTodayTaskBadge(tasks){
    const count=(Array.isArray(tasks)?tasks:[]).filter(task=>String(task?.timing||'')==='today').length;
    const label=count===1?'1 задача по машине на сегодня':count+' задач по машине на сегодня';

    const taskBadge=document.getElementById('carTasksTodayBadge');
    if(taskBadge){
      taskBadge.textContent=count?String(Math.min(count,99)):'';
      taskBadge.hidden=count<1;
      taskBadge.setAttribute('aria-label',label);
    }

    const homeTitle=document.getElementById('carHomeTitle');
    let homeBadge=document.getElementById('carTodayTaskBadge');
    if(homeTitle&&!homeBadge){
      homeBadge=document.createElement('span');
      homeBadge.id='carTodayTaskBadge';
      homeBadge.className='car-today-task-badge';
      homeTitle.appendChild(homeBadge);
    }
    if(homeBadge){
      homeBadge.textContent=count?String(Math.min(count,99)):'';
      homeBadge.hidden=count<1;
      homeBadge.setAttribute('aria-label',label);
    }

    document.documentElement.dataset.carTodayTaskCount=String(count);
    try{window.dispatchEvent(new CustomEvent('rudi:attention-change',{detail:{source:'car-tasks',count}}))}catch(_){}
  }

  function setNoteFormOpen(open){
    const form=document.getElementById('carNoteForm');
    if(!form) return;
    form.hidden=!open;
    if(open) requestAnimationFrame(()=>document.getElementById('carNoteText')?.focus());
    else form.reset();
  }

  function appendNoteContent(root,text){
    const value=String(text||'');
    const urlPattern=/https?:\/\/[^\s<>"']+/giu;
    let last=0;
    for(const match of value.matchAll(urlPattern)){
      const index=Number(match.index||0);
      if(index>last) root.appendChild(document.createTextNode(value.slice(last,index)));
      let raw=String(match[0]||'');
      let suffix='';
      while(/[),.;!?]$/u.test(raw)){suffix=raw.slice(-1)+suffix;raw=raw.slice(0,-1);}
      try{
        const url=new URL(raw);
        if(['http:','https:'].includes(url.protocol)){
          const link=document.createElement('a');
          link.href=url.toString();
          link.textContent=raw;
          link.rel='noopener noreferrer';
          root.appendChild(link);
        }else root.appendChild(document.createTextNode(raw));
      }catch(_){root.appendChild(document.createTextNode(raw))}
      if(suffix) root.appendChild(document.createTextNode(suffix));
      last=index+String(match[0]||'').length;
    }
    if(last<value.length) root.appendChild(document.createTextNode(value.slice(last)));
  }

  function formatNoteDate(value){
    const date=new Date(value);
    if(Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ru-RU',{
      timeZone:'Europe/Moscow',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'
    }).format(date);
  }

  function renderNotes(car){
    const root=document.getElementById('carNotesList');
    const meta=document.getElementById('carNotesMeta');
    if(!root) return;
    root.replaceChildren();
    const notes=Array.isArray(car?.state?.notes)?car.state.notes:[];
    if(meta) meta.textContent=notes.length?String(notes.length):'';
    if(!notes.length){
      const empty=document.createElement('div');
      empty.className='car-notes-empty';
      empty.textContent='Заметок пока нет';
      root.appendChild(empty);
      return;
    }
    for(const note of notes){
      const row=document.createElement('article');
      row.className='car-note-row';
      const copy=document.createElement('div');
      copy.className='car-note-copy';
      const text=document.createElement('p');
      appendNoteContent(text,note.text);
      const date=document.createElement('span');
      date.className='car-note-date';
      date.textContent=formatNoteDate(note.createdAt);
      copy.append(text,date);

      const expand=document.createElement('button');
      expand.type='button';
      expand.className='car-note-expand';
      expand.textContent='Показать полностью';
      expand.hidden=true;
      expand.addEventListener('click',()=>{
        const expanded=text.classList.toggle('is-expanded');
        expand.textContent=expanded?'Свернуть':'Показать полностью';
      });
      copy.appendChild(expand);
      requestAnimationFrame(()=>{
        const line=parseFloat(getComputedStyle(text).lineHeight)||15;
        if(text.scrollHeight>line*5.25){
          text.classList.add('is-collapsed');
          expand.hidden=false;
        }
      });

      const remove=document.createElement('button');
      remove.type='button';
      remove.className='car-note-remove';
      remove.setAttribute('aria-label','Удалить заметку');
      remove.textContent='×';
      remove.addEventListener('click',()=>removeCarNote(note,remove));
      row.append(copy,remove);
      root.appendChild(row);
    }
  }

  function hideNoteUndo(){
    if(pendingNoteUndoTimer){clearTimeout(pendingNoteUndoTimer);pendingNoteUndoTimer=null;}
    pendingNoteUndo=null;
    const bar=document.getElementById('carNoteUndo');
    if(bar) bar.hidden=true;
  }

  function showNoteUndo(note){
    if(pendingNoteUndoTimer) clearTimeout(pendingNoteUndoTimer);
    pendingNoteUndo=note;
    const bar=document.getElementById('carNoteUndo');
    if(bar) bar.hidden=false;
    pendingNoteUndoTimer=setTimeout(()=>hideNoteUndo(),5000);
  }

  async function saveCarNote(event){
    event?.preventDefault?.();
    const input=document.getElementById('carNoteText');
    const button=document.getElementById('carNoteSave');
    const text=String(input?.value||'').trim();
    if(!text){setStatus('Напиши текст или вставь ссылку','error');input?.focus();return;}
    if(button){button.disabled=true;button.textContent='Сохраняю…';}
    try{
      const data=await api('add-note',{text});
      state.car={...state.car,...data};
      renderNotes(state.car);
      setNoteFormOpen(false);
      applyCarSmartOrder({animate:true});
      setStatus('Заметка сохранена','success');
      try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(_){
      setStatus('Не удалось сохранить заметку','error');
      try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }finally{
      if(button){button.disabled=false;button.textContent='Сохранить';}
    }
  }

  async function removeCarNote(note,button){
    if(!note?.id||button?.disabled) return;
    button.disabled=true;
    try{
      const data=await api('remove-note',{noteId:note.id});
      state.car={...state.car,...data};
      renderNotes(state.car);
      showNoteUndo(data.removedNote||note);
      setStatus('');
      try{tg?.HapticFeedback?.impactOccurred?.('light')}catch(_){}
    }catch(_){
      button.disabled=false;
      setStatus('Не удалось удалить заметку','error');
    }
  }

  async function undoCarNoteRemoval(){
    const note=pendingNoteUndo;
    if(!note) return;
    const button=document.getElementById('carNoteUndoButton');
    if(button) button.disabled=true;
    try{
      const data=await api('restore-note',{note});
      state.car={...state.car,...data};
      hideNoteUndo();
      renderNotes(state.car);
      applyCarSmartOrder({animate:true});
      setStatus('Заметка восстановлена','success');
      try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(_){
      setStatus('Не удалось восстановить заметку','error');
    }finally{
      if(button) button.disabled=false;
    }
  }

  function renderTasks(ticktick){
    const root=document.getElementById('carTasksList');
    const meta=document.getElementById('carTasksMeta');
    if(!root) return;
    root.replaceChildren();

    if(!ticktick?.available){
      syncCarTodayTaskBadge([]);
      if(meta) meta.textContent='';
      const empty=document.createElement('div');
      empty.className='car-tasks-empty';
      empty.textContent='TickTick временно недоступен';
      root.appendChild(empty);
      return;
    }

    const tasks=Array.isArray(ticktick?.tasks)?ticktick.tasks:[];
    syncCarTodayTaskBadge(tasks);
    if(meta) meta.textContent=tasks.length ? String(tasks.length) : '';
    if(!tasks.length){
      const empty=document.createElement('div');
      empty.className='car-tasks-empty';
      empty.textContent='Дел по машине пока нет';
      root.appendChild(empty);
      return;
    }

    for(const task of tasks){
      const row=document.createElement('article');
      row.className='car-task-row';

      const copy=document.createElement('div');
      copy.className='car-task-copy';
      const title=document.createElement('strong');
      title.textContent=task.title||'Задача по машине';
      const date=document.createElement('span');
      date.className='car-task-date'+(task.timing==='overdue'?' is-overdue':'');
      date.textContent=taskDateLabel(task)+(task.repeat?' · повтор':'');
      copy.append(title,date);

      const button=document.createElement('button');
      button.type='button';
      button.className='car-task-done';
      button.textContent='Выполнено';
      button.addEventListener('click',()=>completeCarTask(task,button));

      row.append(copy,button);
      root.appendChild(row);
    }
  }


  function openCarDocumentOriginal(photo){
    const target=String(photo?.originalUrl||photo?.fullUrl||photo?.url||'').trim();
    if(!/^https:\/\//i.test(target)) return;
    try{
      if(tg?.openLink) tg.openLink(target);
      else window.open(target,'_blank','noopener,noreferrer');
    }catch(_){
      window.open(target,'_blank','noopener,noreferrer');
    }
  }

  function openCarDocumentViewer(photo,index,photos){
    const viewer=window.RUDI_PHOTO_VIEWER;
    if(viewer&&typeof viewer.open==='function'){
      try{
        if(viewer.open(photos,index,{
          albumUrl:String(state.documents?.albumUrl||'').trim(),
          preferOriginal:true,
          hideOriginal:true,
        })) return;
      }catch(_){}
    }
    openCarDocumentOriginal(photo);
  }

  function renderCarDocuments(documents=state.documents){
    const grid=document.getElementById('carDocumentsGrid');
    const meta=document.getElementById('carDocumentsMeta');
    const status=document.getElementById('carDocumentsStatus');
    if(!grid||!meta||!status) return;
    const photos=Array.isArray(documents?.photos)?documents.photos:[];
    meta.textContent=documents?.configured===false?'':photos.length+' фото';
    grid.replaceChildren();

    if(state.documentsLoading){
      status.hidden=false;
      status.textContent='Загружаю документы…';
      return;
    }
    if(documents?.configured===false){
      status.hidden=false;
      status.textContent='Альбом документов не настроен';
      return;
    }
    if(documents?.error){
      status.hidden=false;
      status.textContent='Не удалось загрузить документы';
      return;
    }
    if(!photos.length){
      status.hidden=false;
      status.textContent='В альбоме пока нет фото';
      return;
    }

    status.hidden=!documents?.stale;
    status.textContent=documents?.stale?'Показана сохранённая копия':'';
    photos.forEach((photo,index)=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='car-document-photo';
      button.setAttribute('aria-label','Открыть документ '+(index+1)+' в просмотрщике');
      const image=document.createElement('img');
      image.src=String(photo?.url||photo?.fullUrl||'');
      image.alt=String(photo?.caption||'Автодокумент '+(index+1));
      image.loading=index<5?'eager':'lazy';
      image.decoding='async';
      image.draggable=false;
      image.addEventListener('error',()=>{
        const full=String(photo?.fullUrl||'');
        if(full&&image.src!==full) image.src=full;
      },{once:true});
      button.appendChild(image);
      button.addEventListener('click',()=>openCarDocumentViewer(photo,index,photos));
      grid.appendChild(button);
    });
  }

  async function loadCarDocuments({force=false}={}){
    if(!document.body.classList.contains('auth-ok')) return;
    if(state.documentsLoading) return;
    if(state.documents&&!force){renderCarDocuments();return state.documents}
    state.documentsLoading=true;
    renderCarDocuments();
    try{
      const data=await api('documents');
      if(!data.visible) return null;
      state.documents=data.documents||{configured:false,photos:[]};
      renderCarDocuments();
      return state.documents;
    }catch(_){
      state.documents={configured:true,photos:[],error:true};
      renderCarDocuments();
      return null;
    }finally{
      state.documentsLoading=false;
      renderCarDocuments();
    }
  }

  function render() {
    if(!state.car) return;
    renderService(state.car);
    renderWeather(state.weather);
    renderErrors(state.car);
    renderCarWashGuideAction(state.weather);
    renderTasks(state.car.ticktick);
    renderCarDocuments();
    renderNotes(state.car);
    renderCarAttention(state.car,state.weather);
  }

  async function loadWeather() {
    try {
      const data=await window.RUDI_WEATHER.get();
      const mins=(data.daily?.temperature_2m_min||[]).map(Number).filter(Number.isFinite);
      const maxs=(data.daily?.temperature_2m_max||[]).map(Number).filter(Number.isFinite);
      const means=mins.map((min,index)=>(min+Number(maxs[index]))/2).filter(Number.isFinite);
      const precipitation=(data.daily?.precipitation_sum||[]).map(Number).filter(Number.isFinite);
      const value={
        savedAt:data.fetchedAt,
        stale:data.stale,
        temperature:Number(data.current?.temperature_2m),
        code:Number(data.current?.weather_code),
        minForecast:mins.length?Math.min(...mins):null,
        maxForecast:maxs.length?Math.max(...maxs):null,
        avgMean:means.length?means.reduce((a,b)=>a+b,0)/means.length:null,
        precipitationSum:precipitation.reduce((a,b)=>a+b,0),
        dailyPrecipitation:precipitation.slice(0,7),
        dailyMin:mins.slice(0,7),
        dailyCodes:(data.daily?.weather_code||[]).slice(0,7).map(Number),
        dailyDates:(data.daily?.time||[]).slice(0,7)
      };
      state.weather=value;
    } catch(_) {
      state.weather=null;
    }
    render();
    if(document.body.dataset.appTab==='car') applyCarSmartOrder({animate:true});
    return state.weather;
  }

  async function loadCar() {
    if(!document.body.classList.contains('auth-ok') || state.loading) return;
    state.loading=true;
    try {
      const data=await api('get');
      const tile=document.getElementById('carTile');
      const page=document.getElementById('carPage');
      if(!data.visible) {
        if(tile) tile.hidden=true;
        if(page) page.hidden=true;
        return;
      }
      state.car=data;
      if(tile){
        tile.dataset.tabAvailable='1';
        tile.hidden=document.body.dataset.appTab!=='home';
      }
      if(page){
        page.dataset.tabAvailable='1';
        page.hidden=document.body.dataset.appTab!=='car';
      }
      render();
      applyCarSmartOrder({animate:false});
      if(document.body.dataset.appTab==='car') loadCarDocuments().catch(()=>{});
      loadWeather();
    } catch(_) {
      const tile=document.getElementById('carTile');
      const page=document.getElementById('carPage');
      if(tile) tile.hidden=true;
      if(page) page.hidden=true;
    } finally {
      state.loading=false;
    }
  }

  async function saveMileage(event) {
    event?.preventDefault?.();
    const input=document.getElementById('carMileageInput');
    const button=document.getElementById('carMileageSave');
    const mileage=Number(input?.value);
    if(!Number.isInteger(mileage) || mileage<0 || mileage>999999) {
      setStatus('Укажи пробег целым числом от 0 до 999 999 км','error');
      return;
    }

    if(button) {
      button.disabled=true;
      button.textContent='Сохраняю…';
    }
    try {
      const data=await api('set-mileage',{mileage});
      state.car={...state.car,...data};
      render();
      applyCarSmartOrder({animate:true});
      setStatus('Пробег сохранён','success');
      try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    } catch(_) {
      setStatus('Не удалось сохранить пробег','error');
      try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    } finally {
      if(button) {
        button.disabled=false;
        button.textContent='Сохранить';
      }
    }
  }

  function start() {
    setupCarSmartCards();
    setupCarWashModal();
    setupCarTabObserver();
    window.addEventListener('rudi:ui-preferences-applied',syncCarCardCollapseStates);
    document.getElementById('carMileageForm')?.addEventListener('submit',saveMileage);
    document.getElementById('carErrorAdd')?.addEventListener('click',()=>setErrorFormOpen(true));
    document.getElementById('carErrorCancel')?.addEventListener('click',()=>setErrorFormOpen(false));
    document.getElementById('carErrorForm')?.addEventListener('submit',saveDashboardError);
    document.getElementById('carNoteAdd')?.addEventListener('click',()=>setNoteFormOpen(true));
    document.getElementById('carNoteCancel')?.addEventListener('click',()=>setNoteFormOpen(false));
    document.getElementById('carNoteForm')?.addEventListener('submit',saveCarNote);
    document.getElementById('carNoteUndoButton')?.addEventListener('click',undoCarNoteRemoval);
    document.getElementById('carWashGuideBack')?.addEventListener('click',()=>setWashGuideOpen(false));
    document.getElementById('carWashGuideOpen')?.addEventListener('click',()=>setWashGuideOpen(true));
    let attempts=0;
    const wait=()=>{
      attempts++;
      if(document.body.classList.contains('auth-ok')) {
        const actor=String(document.body.dataset.rudiActor||'');
        if(actor&&actor!=='Рустам') {
          document.getElementById('carTile')?.remove();
          document.getElementById('carPage')?.remove();
          return;
        }
        loadCar();
        return;
      }
      if(attempts<50) setTimeout(wait,250);
    };
    wait();
  }

  window.RUDI_CAR={refresh:()=>loadCar()};

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
/* v2.135 production release marker */
