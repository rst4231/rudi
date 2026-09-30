(() => {
  const tg = window.Telegram?.WebApp;
  const API = '/api/index?route=car';
  const state = { car:null, weather:null, loading:false };

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
      document.querySelector('.car-recommendation-wash-button')?.focus?.({preventScroll:true});
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

  function confirmRemoveError(title) {
    const message='Убрать запись «'+String(title||'Ошибка')+'» из журнала?';
    return new Promise(resolve=>{
      if(typeof tg?.showConfirm==='function'){
        tg.showConfirm(message,value=>resolve(Boolean(value)));
        return;
      }
      resolve(window.confirm(message));
    });
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
      title.textContent=error.title||'Ошибка';

      const date=document.createElement('span');
      date.className='car-error-date';
      date.textContent=formatErrorDate(error.occurredAt);

      copy.append(title,date);

      if(error.comment){
        const comment=document.createElement('p');
        comment.textContent='После чего началось: '+error.comment;
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
      remove.textContent='Удалить';
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
        archivedMeta.textContent='Починено '+formatErrorDate(item.repairedAt);
        archivedRow.append(archivedTitle,archivedMeta);
        if(item.comment){
          const archivedComment=document.createElement('p');
          archivedComment.textContent=item.comment;
          archivedRow.appendChild(archivedComment);
        }
        list.appendChild(archivedRow);
      }
      details.append(summary,list);
      root.appendChild(details);
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

  async function repairDashboardError(error,button) {
    if(!error?.id || button?.disabled) return;
    const row=button.closest('.car-error-row');
    const buttons=[...(row?.querySelectorAll('button')||[])];
    buttons.forEach(node=>node.disabled=true);
    const original=button.textContent;
    button.textContent='…';
    try{
      const data=await api('repair-error',{errorId:error.id});
      state.car={...state.car,...data};
      renderErrors(state.car);
      applyCarSmartOrder({animate:true});
      setStatus('Перенесено в архив ремонта','success');
      try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(_){
      buttons.forEach(node=>node.disabled=false);
      button.textContent=original;
      setStatus('Не удалось отправить в архив','error');
      try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }
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

  const CAR_SMART_DEFAULT_ORDER=['mileage','errors','tasks'];
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

  function readCarCardCollapsed(id){
    const key=carCardViewKey(id);
    try{
      if(typeof window.RUDI_UI_PREFERENCES?.getViewState==='function'){
        return Boolean(window.RUDI_UI_PREFERENCES.getViewState(key,false));
      }
      return localStorage.getItem('rudi:'+key+':collapsed')==='1';
    }catch(_){return false}
  }

  function writeCarCardCollapsed(id,collapsed){
    const key=carCardViewKey(id);
    try{localStorage.setItem('rudi:'+key+':collapsed',collapsed?'1':'0')}catch(_){}
    try{window.RUDI_UI_PREFERENCES?.setViewState?.(key,Boolean(collapsed))}catch(_){}
  }

  function setCarCardCollapsed(card,collapsed,{persist=true}={}){
    if(!card) return;
    const value=Boolean(collapsed);
    card.classList.toggle('is-collapsed',value);
    const button=card.querySelector('[data-car-collapse]');
    button?.setAttribute('aria-expanded',value?'false':'true');
    if(persist) writeCarCardCollapsed(card.dataset.carCard,value);
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
    const progress=body.querySelector(':scope > .car-service-progress');
    const status=body.querySelector('#carStatus');

    const mileageService=document.createElement('div');
    mileageService.className='car-mileage-service-content';
    if(mileage) mileageService.appendChild(mileage);
    if(service) mileageService.appendChild(service);
    if(progress) mileageService.appendChild(progress);

    const cards=[
      buildCarSmartCard('mileage','Пробег и ТО',mileageService),
      buildCarSmartCard('errors','Требует ремонт',errors),
      buildCarSmartCard('tasks','Задачи по машине',tasks)
    ].filter(Boolean);

    service?.querySelector('.car-card-title')?.remove();
    mileage?.querySelector('.car-card-title')?.remove();

    const errorCard=cards.find(card=>card.dataset.carCard==='errors');
    const errorActions=errors?.querySelector('.car-errors-head-actions');
    if(errorActions&&errorCard) errorCard.querySelector('.car-smart-card-actions')?.prepend(errorActions);
    errors?.querySelector('.car-section-head')?.remove();

    const taskCard=cards.find(card=>card.dataset.carCard==='tasks');
    const taskMeta=tasks?.querySelector('#carTasksMeta');
    if(taskMeta&&taskCard) taskCard.querySelector('.car-smart-card-title')?.appendChild(taskMeta);
    tasks?.querySelector('.car-section-head')?.remove();

    const fragment=document.createDocumentFragment();
    cards.forEach(card=>fragment.appendChild(card));
    if(status) fragment.appendChild(status);
    body.replaceChildren(fragment);
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
    const ranked=cards.map(card=>{
      const priority=carCardPriority(card.dataset.carCard);
      card.dataset.priorityScore=String(priority.score);
      card.dataset.priorityReason=priority.reason;
      return {card,score:priority.score,rank:Number(card.dataset.carDefaultRank)||0};
    }).sort((a,b)=>b.score-a.score||a.rank-b.rank);

    ranked.forEach(({card})=>host.insertBefore(card,document.getElementById('carStatus')||null));
    if(animate) animateCarCardOrder(host,before);
  }

  function setupCarTabObserver(){
    if(carTabObserver) return;
    let previous=String(document.body.dataset.appTab||'');
    carTabObserver=new MutationObserver(()=>{
      const next=String(document.body.dataset.appTab||'');
      if(next==='car'&&previous!=='car'){
        requestAnimationFrame(()=>applyCarSmartOrder({animate:false}));
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

  function renderService(car) {
    const mileage=car?.state?.mileage;
    const next=car?.nextService;
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

    if(modelNode){
      modelNode.dataset.mileage=mileage==null?'Пробег не указан':'Пробег · '+formatKm(mileage);
      modelNode.dataset.service=next
        ? 'Следующее ТО · ТО-'+next.number+' на '+formatKm(next.mileage)
        : 'Следующее ТО · не определено';
    }
    const mileageText=mileage==null?'Не указан':formatKm(mileage);
    const serviceText=next?'ТО-'+next.number+' на '+formatKm(next.mileage):'Не определено';
    if(collapsedMileageNode) collapsedMileageNode.textContent=mileageText;
    if(collapsedServiceNode) collapsedServiceNode.textContent=serviceText;
    if(homeMileageNode) homeMileageNode.textContent=mileageText;
    if(homeServiceNode) homeServiceNode.textContent=serviceText;
    if(mileageNode) mileageNode.textContent=mileage==null?'Не указан':formatKm(mileage);
    if(updatedNode) updatedNode.textContent=formatUpdated(car?.state?.mileageUpdatedAt||car?.state?.updatedAt);
    if(input && document.activeElement!==input) input.value=mileage==null?'':String(mileage);

    if(!next || mileage==null) {
      if(nextNode) nextNode.textContent='Добавь пробег';
      if(meta) meta.textContent='Покажу ближайшее ТО по пробегу';
      if(progress) progress.style.width='0%';
      if(collapsedProgress) collapsedProgress.style.width='0%';
      if(collapsedPercent) collapsedPercent.textContent='—';
      if(homeProgress) homeProgress.style.width='0%';
      if(homePercent) homePercent.textContent='—';
      return;
    }

    const remaining=Math.max(0,Number(next.mileage)-Number(mileage));
    if(nextNode) nextNode.textContent='ТО-'+next.number+' · '+formatKm(next.mileage);
    if(meta) {
      meta.textContent=remaining===0
        ? 'Пора на ТО'
        : 'До ТО '+formatKm(remaining)+' · учитывается и срок эксплуатации';
    }

    const previous=next.mileage===5000?0:next.mileage-10000;
    const span=Math.max(1,next.mileage-previous);
    const pct=Math.max(0,Math.min(100,((Number(mileage)-previous)/span)*100));
    if(progress) progress.style.width=pct.toFixed(1)+'%';
    if(collapsedProgress) collapsedProgress.style.width=pct.toFixed(1)+'%';
    if(collapsedPercent) collapsedPercent.textContent=Math.round(pct)+'% пройдено';
    if(homeProgress) homeProgress.style.width=pct.toFixed(1)+'%';
    if(homePercent) homePercent.textContent=Math.round(pct)+'%';
  }

  function tyreAdvice(weather) {
    if(!weather) return 'Прогноз временно недоступен. Ориентир для смены шин — устойчивая среднесуточная температура около +7°C.';
    const avg=Number(weather.avgMean);
    const min=Number(weather.minForecast);

    if(Number.isFinite(min) && min<=0) {
      return 'В прогнозе есть заморозки. Если стоят летние шины, уже стоит планировать переход на зимние.';
    }
    if(Number.isFinite(avg) && avg<=7) {
      return 'Средняя температура на неделе около +7°C или ниже. Пора планировать зимние шины.';
    }
    if(Number.isFinite(avg) && avg>=10 && Number.isFinite(min) && min>5) {
      return 'Температура устойчиво выше +7°C. По погоде условия подходят для летних шин.';
    }
    return 'Температура около порога +7°C. Лучше дождаться устойчивых значений выше или ниже +7°C.';
  }

  function carWashAdvice(weather) {
    if(!weather) {
      return {kind:'info',title:'Стоит ли мыть машину',text:'Прогноз на неделю недоступен. Лучше проверить погоду перед мойкой.'};
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

    const firstWet=wetDays.length?wetDays[0]:-1;
    const total=precipitation.filter(Number.isFinite).reduce((sum,value)=>sum+value,0);
    const snowSoon=codes.slice(0,3).some(code=>[71,73,75].includes(Number(code)));
    const frost=mins.some(value=>Number.isFinite(value)&&value<=0);

    if(snowSoon) {
      return {kind:'cold',title:'Стоит ли мыть машину',text:'Лучше отложить: в ближайшие дни возможен снег, машина быстро снова испачкается.'};
    }
    if(firstWet===0||firstWet===1) {
      return {kind:'rain',title:'Стоит ли мыть машину',text:'Лучше отложить: дождь или другие осадки ожидаются в ближайшие 1–2 дня.'};
    }
    if(wetDays.length>=3||total>=8) {
      return {kind:'rain',title:'Стоит ли мыть машину',text:'Скорее не стоит: неделя ожидается влажной, чистой машина останется ненадолго.'};
    }
    if(firstWet>=2) {
      const days=firstWet;
      return {kind:'info',title:'Стоит ли мыть машину',text:'Можно помыть сейчас, но примерно через '+days+' '+(days===2?'дня':'дней')+' ожидаются осадки.',canWash:true};
    }
    if(frost) {
      return {kind:'cold',title:'Стоит ли мыть машину',text:'Можно, если после мойки хорошо просушат кузов, уплотнители и замки: на неделе возможны заморозки.',canWash:true};
    }
    return {kind:'ok',title:'Стоит ли мыть машину',text:'Да. На ближайшую неделю существенных осадков не видно — хороший момент для мойки.',canWash:true};
  }

  function compactWashAdvice(weather) {
    const advice=carWashAdvice(weather);
    const text=String(advice?.text||'');
    if(/снег/i.test(text)) return 'Отложить · возможен снег.';
    if(/1–2 дня/i.test(text)) return 'Отложить · осадки в ближайшие 1–2 дня.';
    if(/неделя ожидается влажной/i.test(text)) return 'Скорее не стоит · на неделе ожидаются осадки.';
    const delayed=text.match(/через\s+(\d+)\s+/i);
    if(delayed) return 'Можно · осадки примерно через '+delayed[1]+' дн.';
    if(/замороз/i.test(text)) return 'Можно · после мойки хорошо просушить.';
    if(advice?.kind==='ok') return 'Да · существенных осадков на неделе не ожидается.';
    return 'Проверь погоду перед мойкой.';
  }

  function weatherTyresRecommendation(weather) {
    if(!weather) return {kind:'info',title:'Погода и шины',text:'Прогноз временно недоступен. '+tyreAdvice(null)};
    const min=Number(weather.minForecast);
    const avg=Number(weather.avgMean);
    const kind=Number.isFinite(min)&&min<=0?'cold':(Number.isFinite(avg)&&avg<=7?'warn':'ok');
    const current=Number(weather.temperature);
    const prefix=Number.isFinite(current)?Math.round(current)+'°C · '+weatherLabel(weather.code)+'. ':'';
    return {kind,title:'Погода и шины',text:(weather.stale?'Сохранённый прогноз. ':'')+prefix+tyreAdvice(weather)};
  }

  function buildRecommendations(car,weather) {
    const items=[weatherTyresRecommendation(weather),carWashAdvice(weather)];
    const remaining=serviceRemaining(car);

    if(remaining===0 && car?.state?.mileage!=null) {
      items.push({kind:'warn',title:'ТО по пробегу',text:'Ты на регламентном рубеже. Проверь, пройдено ли это ТО, и при необходимости запишись.'});
    } else if(Number.isFinite(remaining) && remaining<=1000) {
      items.push({kind:'warn',title:'ТО скоро',text:'До следующего ТО осталось '+formatKm(remaining)+'. Лучше уже выбрать дату сервиса.'});
    } else if(Number.isFinite(remaining) && remaining<=2500) {
      items.push({kind:'info',title:'Планируй ТО',text:'До следующего ТО '+formatKm(remaining)+'. Можно заранее подобрать удобное окно у сервиса.'});
    }

    return items.slice(0,4);
  }

  function renderRecommendations(car,weather) {
    const root=document.getElementById('carRecommendationsList');
    if(!root) return;
    root.replaceChildren();
    for(const item of buildRecommendations(car,weather)) {
      const row=document.createElement('article');
      row.className='car-recommendation is-'+item.kind;
      const dot=document.createElement('span');
      dot.className='car-recommendation-dot';
      dot.setAttribute('aria-hidden','true');
      const copy=document.createElement('div');
      copy.className='car-recommendation-copy';
      const title=document.createElement('strong');
      title.textContent=item.title;
      const text=document.createElement('p');
      text.textContent=item.text;
      copy.append(title,text);
      if(item.canWash){
        const guide=document.createElement('button');
        guide.type='button';
        guide.className='car-recommendation-wash-button';
        guide.textContent='Как мыть машину';
        guide.setAttribute('aria-controls','carWashGuidePage');
        guide.addEventListener('click',()=>setWashGuideOpen(true));
        copy.appendChild(guide);
      }
      row.append(dot,copy);
      root.appendChild(row);
    }
  }

  function renderWeather(weather) {
    const now=document.getElementById('carWeatherNow');
    const advice=document.getElementById('carTyreAdvice');
    if(now) {
      now.textContent=weather
        ? Math.round(Number(weather.temperature))+'°C · '+weatherLabel(weather.code)
        : 'Погода недоступна';
    }
    if(advice) advice.textContent=(weather?.stale?'Сохранённый прогноз · ':'')+tyreAdvice(weather);
    const washText=compactWashAdvice(weather);
    const collapsedWash=document.getElementById('carCollapsedWashValue');
    const homeWash=document.getElementById('carHomeWashValue');
    if(collapsedWash) collapsedWash.textContent=washText;
    if(homeWash) homeWash.textContent=washText;
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
      empty.textContent='Актуальных задач по машине нет';
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

  function render() {
    if(!state.car) return;
    renderService(state.car);
    renderWeather(state.weather);
    renderErrors(state.car);
    renderRecommendations(state.car,state.weather);
    renderTasks(state.car.ticktick);
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
        dailyCodes:(data.daily?.weather_code||[]).slice(0,7).map(Number)
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
    document.getElementById('carMileageForm')?.addEventListener('submit',saveMileage);
    document.getElementById('carErrorAdd')?.addEventListener('click',()=>setErrorFormOpen(true));
    document.getElementById('carErrorCancel')?.addEventListener('click',()=>setErrorFormOpen(false));
    document.getElementById('carErrorForm')?.addEventListener('submit',saveDashboardError);
    document.getElementById('carWashGuideBack')?.addEventListener('click',()=>setWashGuideOpen(false));
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
