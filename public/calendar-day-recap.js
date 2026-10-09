/* Personal calendar month recap: one request per month, cached across day changes. */
(()=>{
  const grid=document.getElementById('workCalendarDays'),panel=document.getElementById('calendarPersonalDayRecap');
  if(!grid||!panel)return;
  const money=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'});
  const dateLabel=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'});
  const timeLabel=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});
  const fullLabel=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});
  const moscowDate=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Europe/Moscow'});
  const moodNames={joy:'Радость',love:'Любовь',neutral:'Спокойствие',fatigue:'Усталость',anger:'Злость',boredom:'Скука',sadness:'Грусть'};
  const cache=new Map(),pending=new Map(),ttl=300000;
  const storagePrefix='rudi:calendar-recap:v4.136:';
  const actorKey=()=>String(document.body.dataset.rudiActor||'')+':'+String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id||'local');
  const storedKey=month=>storagePrefix+actorKey()+':'+month;
  const validFor=month=>month===moscowDate.format(new Date()).slice(0,7)?24*60*60*1000:30*24*60*60*1000;
  function readStored(month){
    try{
      const row=JSON.parse(localStorage.getItem(storedKey(month))||'null');
      if(row?.data?.ok&&row.data.days&&Number.isFinite(row.at)&&Date.now()-row.at<validFor(month))return row;
    }catch(_){}
    return null;
  }
  function saveStored(month,data){
    try{
      localStorage.setItem(storedKey(month),JSON.stringify({at:Date.now(),data}));
      const prefix=storagePrefix+actorKey()+':';
      const keys=[];
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if(key?.startsWith(prefix))keys.push(key);
      }
      keys.sort();
      for(const key of keys.slice(0,-6))localStorage.removeItem(key);
    }catch(_){}
  }
  function clearStored(){
    try{
      const prefix=storagePrefix+actorKey()+':';
      for(let i=localStorage.length-1;i>=0;i--){
        const key=localStorage.key(i);
        if(key?.startsWith(prefix))localStorage.removeItem(key);
      }
    }catch(_){}
  }
  let active='',scheduled=false,lastActor='',revision=0;
  const node=(tag,cls,value)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(value!==undefined)el.textContent=String(value);
    return el;
  };
  const section=(title,hint='')=>{
    const part=node('section','calendar-recap-block');
    const heading=node('div','calendar-recap-section-head');
    heading.append(node('h3','calendar-recap-block-title',title));
    if(hint)heading.append(node('small','calendar-recap-section-hint',hint));
    part.append(heading);panel.append(part);return part;
  };
  const metric=(target,label,value,kind)=>{
    const tile=node('div','calendar-recap-metric is-'+kind);
    tile.append(node('span','calendar-recap-metric-label',label),node('strong','calendar-recap-metric-value',value));
    target.append(tile);
  };
  const empty=(part,value)=>part.append(node('p','calendar-recap-empty',value));
  const line=(part,title,value,meta='',status='')=>{
    const item=node('div','calendar-recap-row'+(status?' is-'+status:''));
    const left=node('span','calendar-recap-row-copy');
    left.append(node('span','calendar-recap-row-title',title));
    if(meta)left.append(node('small','calendar-recap-row-meta',meta));
    item.append(left,node('strong','calendar-recap-row-value',value));part.append(item);
  };
  const format=(value,fmt)=>{
    const n=Date.parse(String(value||''));
    return Number.isFinite(n)?fmt.format(new Date(n)):'';
  };
  const minutes=value=>{
    const n=Math.max(0,Math.round(Number(value)||0));
    return [n>=60?Math.floor(n/60)+' ч':'',n%60?n%60+' мин':''].filter(Boolean).join(' ')||'Меньше минуты';
  };
  const missing=(part,data)=>{
    if(data?.available)return false;
    empty(part,'Не удалось загрузить данные');return true;
  };
  function render(date,data){
    if(date!==active||!data)return;
    panel.replaceChildren();
    const head=node('header','calendar-recap-head');
    head.append(node('span','calendar-recap-kicker','Итоги дня'));
    head.append(node('h2','calendar-recap-date',dateLabel.format(new Date(date+'T12:00:00Z'))));
    panel.append(head);

    const overview=node('div','calendar-recap-overview');
    if(data.expenses?.available)metric(overview,'Потрачено',money.format(data.expenses.totalRub||0),'expenses');
    if(data.habits?.available){
      const habits=data.habits.habits||[];
      metric(overview,'Привычки',habits.filter(item=>item.status==='done').length+' / '+habits.length,'habits');
    }
    if(overview.childElementCount)panel.append(overview);

    const expenseRows=data.expenses?.items||[];
    const expense=section('Расходы',expenseRows.length?expenseRows.length+' операций':'');
    if(!missing(expense,data.expenses)){
      if(!expenseRows.length)empty(expense,'Нет записанных расходов');
      else expenseRows.forEach(item=>line(expense,(item.categoryIcon?item.categoryIcon+' ':'')+item.category,
        money.format(item.amountRub),[item.label,item.note].filter(Boolean).join(' · ')));
    }

    const habitsRows=data.habits?.habits||[];
    const habits=section('Привычки',habitsRows.length?habitsRows.filter(x=>x.status==='done').length+' из '+habitsRows.length+' выполнено':'');
    if(!missing(habits,data.habits)){
      if(!habitsRows.length)empty(habits,'Привычки на этот день не найдены');
      else habitsRows.forEach(item=>{
        const kind=item.status==='done'?'done':item.status==='notdone'?'missed':'pending';
        const name=String(item.name||'');
        const icon=/алкогол|спирт|пив|вино/i.test(name)?'🍷'
          :/никотин|курю|курить|сигар|вейп/i.test(name)?'🚭'
          :/кофе|кофеин/i.test(name)?'☕'
          :item.emoji||'🌱';
        line(habits,icon+' '+name,
          kind==='done'?'✓ Выполнено':kind==='missed'?'✕ Не выполнено':'— Нет отметки','',kind);
      });
    }

    const fastingRows=data.fasting?.sessions||[];
    const fasting=section('Голодание',fastingRows.length?fastingRows.length+' сеанса':'');
    if(!missing(fasting,data.fasting)){
      if(!fastingRows.length)empty(fasting,'Нет записей о голодании');
      else fastingRows.forEach((item,index)=>line(fasting,'Сеанс '+(index+1),
        item.durationMinutes==null?'В процессе':minutes(item.durationMinutes),
        [format(item.startedAt,fullLabel),item.endedAt?format(item.endedAt,fullLabel):'продолжается'].filter(Boolean).join(' – ')));
    }

    const mood=section('Среднее настроение');
    if(!missing(mood,data.mood)){
      if(data.mood.averageMood){
        mood.append(node('strong','calendar-recap-mood',moodNames[data.mood.averageMood]||data.mood.averageMood));
        if(data.mood.sampleCount)mood.append(node('span','calendar-recap-caption','Отметок за день: '+data.mood.sampleCount));
      }else empty(mood,'Настроение не отмечалось');
    }

    const supplementRows=data.supplements?.items||[];
    const supplements=section('БАДы',supplementRows.length?supplementRows.length+' приёма':'');
    if(!missing(supplements,data.supplements)){
      if(!supplementRows.length)empty(supplements,'Приёмов за день не записано');
      else supplementRows.forEach(item=>line(supplements,item.name,format(item.at,timeLabel)||'Время неизвестно'));
    }
    panel.hidden=false;
  }
  const showable=()=>document.body.dataset.appTab==='schedule'&&
    document.body.dataset.calendarScope==='personal'&&grid.dataset.calendarMode==='month';
  const fetchMonth=month=>{
    const key=String(document.body.dataset.rudiActor||'')+':'+month;
    const found=cache.get(key);
    if(found&&Date.now()-found.at<ttl)return Promise.resolve(found.data);
    const saved=readStored(month);
    if(saved){cache.set(key,{at:Date.now(),data:saved.data});return Promise.resolve(saved.data)}
    if(pending.has(key))return pending.get(key);
    const requestRevision=revision;
    const req=fetch('/api/calendar-day-summary',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({initData:window.Telegram?.WebApp?.initData||'',month})
    }).then(async response=>{
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||'unavailable');
      if(requestRevision===revision){
        cache.set(key,{at:Date.now(),data});
        const complete=Object.values(data.days||{}).every(day=>['expenses','habits','fasting','mood','supplements'].every(source=>day?.[source]?.available!==false));
        if(complete)saveStored(month,data);
        while(cache.size>4)cache.delete(cache.keys().next().value);
      }
      return data;
    }).finally(()=>{if(pending.get(key)===req)pending.delete(key)});
    pending.set(key,req);return req;
  };
  function sync(){
    const actor=String(document.body.dataset.rudiActor||'');
    if(actor!==lastActor){lastActor=actor;active='';panel.hidden=true;revision++;cache.clear();pending.clear()}
    if(!showable()){panel.hidden=true;active='';return}
    const date=String(grid.querySelector('.calendar-day-cell.selected[data-date]')?.dataset.date||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>=moscowDate.format(new Date())){
      panel.hidden=true;active='';return;
    }
    if(active===date&&!panel.hidden)return;
    active=date;panel.hidden=false;
    panel.replaceChildren(node('p','calendar-recap-loading','Загружаю итоги дня…'));
    fetchMonth(date.slice(0,7)).then(data=>{
      if(!showable()||active!==date||lastActor!==actor)return;
      if(data.days?.[date])render(date,data.days[date]);
      else panel.replaceChildren(node('p','calendar-recap-empty','Нет данных за этот день'));
    }).catch(()=>{
      if(active===date&&showable()&&lastActor===actor)panel.replaceChildren(
        node('p','calendar-recap-empty','Не удалось загрузить итоги. Нажми на день для повтора.'));
    });
  }
  const queue=()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;sync()})};
  grid.addEventListener('click',event=>{
    if(!event.target.closest('.calendar-day-cell[data-date]'))return;
    if(panel.textContent.includes('Не удалось загрузить итоги'))active='';
    queue();
  });
  new MutationObserver(queue).observe(grid,{childList:true});
  new MutationObserver(queue).observe(document.body,{attributes:true,attributeFilter:['data-app-tab','data-calendar-scope','data-rudi-actor']});
  const invalidate=()=>{revision++;cache.clear();pending.clear();clearStored();active='';queue()};
  document.addEventListener('rudi:calendar-recap-dirty',invalidate);
  document.addEventListener('rudi:supplement-intake-updated',invalidate);
  window.addEventListener('pageshow',queue);
  queue();
})();
