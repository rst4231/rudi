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
  let active='',scheduled=false;
  const node=(tag,cls,value)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(value!==undefined)el.textContent=String(value);
    return el;
  };
  const section=title=>{
    const part=node('section','calendar-recap-block');
    part.append(node('h3','calendar-recap-block-title',title));panel.append(part);return part;
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
    const expense=section('Расходы');
    if(!missing(expense,data.expenses)){
      const rows=data.expenses.items||[];
      if(!rows.length)empty(expense,'Нет записанных расходов');
      else{
        expense.append(node('strong','calendar-recap-money',money.format(data.expenses.totalRub)));
        rows.forEach(item=>line(expense,(item.categoryIcon?item.categoryIcon+' ':'')+item.category,
          money.format(item.amountRub),[item.label,item.note].filter(Boolean).join(' · ')));
      }
    }
    const habits=section('Привычки');
    if(!missing(habits,data.habits)){
      const rows=data.habits.habits||[];
      if(!rows.length)empty(habits,'Привычки на этот день не найдены');
      else{
        habits.append(node('span','calendar-recap-caption','Выполнено '+rows.filter(x=>x.status==='done').length+' из '+rows.length));
        rows.forEach(item=>{
          const kind=item.status==='done'?'done':item.status==='notdone'?'missed':'pending';
          line(habits,(item.emoji?item.emoji+' ':'')+item.name,
            kind==='done'?'✓ Выполнено':kind==='missed'?'✕ Не выполнено':'Нет отметки','',kind);
        });
      }
    }
    const fasting=section('Голодание');
    if(!missing(fasting,data.fasting)){
      const rows=data.fasting.sessions||[];
      if(!rows.length)empty(fasting,'Нет записей о голодании');
      else rows.forEach(item=>line(fasting,'Голодание',item.durationMinutes==null?'В процессе':minutes(item.durationMinutes),
        [format(item.startedAt,fullLabel),item.endedAt?format(item.endedAt,fullLabel):'продолжается'].filter(Boolean).join(' – ')));
    }
    const mood=section('Среднее настроение');
    if(!missing(mood,data.mood)){
      if(data.mood.averageMood){
        mood.append(node('strong','calendar-recap-mood',moodNames[data.mood.averageMood]||data.mood.averageMood));
        if(data.mood.sampleCount)mood.append(node('span','calendar-recap-caption','Отметок за день: '+data.mood.sampleCount));
      }else empty(mood,'Настроение не отмечалось');
    }
    const supplements=section('БАДы');
    if(!missing(supplements,data.supplements)){
      const rows=data.supplements.items||[];
      if(!rows.length)empty(supplements,'Приёмов за день не записано');
      else rows.forEach(item=>line(supplements,item.name,format(item.at,timeLabel)||'Время неизвестно'));
    }
    panel.hidden=false;
  }
  const showable=()=>document.body.dataset.appTab==='schedule'&&
    document.body.dataset.calendarScope==='personal'&&grid.dataset.calendarMode==='month';
  const fetchMonth=month=>{
    const found=cache.get(month);
    if(found&&Date.now()-found.at<ttl)return Promise.resolve(found.data);
    if(pending.has(month))return pending.get(month);
    const req=fetch('/api/calendar-day-summary',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({initData:window.Telegram?.WebApp?.initData||'',month})
    }).then(async response=>{
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||'unavailable');
      cache.set(month,{at:Date.now(),data});
      while(cache.size>4)cache.delete(cache.keys().next().value);
      return data;
    }).finally(()=>pending.delete(month));
    pending.set(month,req);return req;
  };
  function sync(){
    if(!showable()){panel.hidden=true;active='';return}
    const date=String(grid.querySelector('.calendar-day-cell.selected[data-date]')?.dataset.date||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>=moscowDate.format(new Date())){
      panel.hidden=true;active='';return;
    }
    if(active===date&&!panel.hidden)return;
    active=date;panel.hidden=false;
    panel.replaceChildren(node('p','calendar-recap-loading','Загружаю итоги дня…'));
    fetchMonth(date.slice(0,7)).then(data=>{
      if(!showable()||active!==date)return;
      if(data.days?.[date])render(date,data.days[date]);
      else panel.replaceChildren(node('p','calendar-recap-empty','Нет данных за этот день'));
    }).catch(()=>{
      if(active===date&&showable())panel.replaceChildren(
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
  new MutationObserver(queue).observe(document.body,{attributes:true,attributeFilter:['data-app-tab','data-calendar-scope']});
  window.addEventListener('pageshow',queue);
  queue();
})();
