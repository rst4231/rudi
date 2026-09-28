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
    const body=document.getElementById('carBody');
    const page=document.getElementById('carWashGuidePage');
    const tile=document.getElementById('carTile');
    if(!body || !page) return;
    body.hidden=Boolean(open);
    page.hidden=!open;
    tile?.classList.toggle('is-wash-guide-open',Boolean(open));
    if(open){
      page.scrollIntoView({block:'start',behavior:'smooth'});
      try{tg?.HapticFeedback?.impactOccurred?.('light')}catch(_){}
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
      empty.textContent='Ошибок не добавлено';
      root.appendChild(empty);
      return;
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

      const button=document.createElement('button');
      button.type='button';
      button.className='car-error-remove';
      button.textContent='Убрать';
      button.addEventListener('click',async()=>{
        if(!(await confirmRemoveError(error.title))) return;
        await removeDashboardError(error,button);
      });

      row.append(marker,copy,button);
      root.appendChild(row);
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
      setStatus('Ошибка убрана из журнала','success');
      try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(_){
      if(button){
        button.disabled=false;
        button.textContent='Убрать';
      }
      setStatus('Не удалось убрать ошибку','error');
      try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }
  }

  function serviceRemaining(car) {
    const mileage=Number(car?.state?.mileage);
    const next=Number(car?.nextService?.mileage);
    if(!Number.isFinite(mileage)||!Number.isFinite(next)) return null;
    return Math.max(0,next-mileage);
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
    const modelNode=document.querySelector('#carTile .car-model');
    const collapsedMileageNode=document.getElementById('carCollapsedMileageValue');
    const collapsedServiceNode=document.getElementById('carCollapsedServiceValue');
    const collapsedProgress=document.getElementById('carCollapsedServiceProgress');
    const collapsedPercent=document.getElementById('carCollapsedServicePercent');

    if(modelNode){
      modelNode.dataset.mileage=mileage==null?'Пробег не указан':'Пробег · '+formatKm(mileage);
      modelNode.dataset.service=next
        ? 'Следующее ТО · ТО-'+next.number+' на '+formatKm(next.mileage)
        : 'Следующее ТО · не определено';
    }
    if(collapsedMileageNode) collapsedMileageNode.textContent=mileage==null?'Не указан':formatKm(mileage);
    if(collapsedServiceNode) collapsedServiceNode.textContent=next
      ? 'ТО-'+next.number+' на '+formatKm(next.mileage)
      : 'Не определено';
    if(mileageNode) mileageNode.textContent=mileage==null?'Не указан':formatKm(mileage);
    if(updatedNode) updatedNode.textContent=formatUpdated(car?.state?.mileageUpdatedAt||car?.state?.updatedAt);
    if(input && document.activeElement!==input) input.value=mileage==null?'':String(mileage);

    if(!next || mileage==null) {
      if(nextNode) nextNode.textContent='Добавь пробег';
      if(meta) meta.textContent='Покажу ближайшее ТО по пробегу';
      if(progress) progress.style.width='0%';
      if(collapsedProgress) collapsedProgress.style.width='0%';
      if(collapsedPercent) collapsedPercent.textContent='—';
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
      return {kind:'info',title:'Стоит ли мыть машину',text:'Можно помыть сейчас, но примерно через '+days+' '+(days===2?'дня':'дней')+' ожидаются осадки.'};
    }
    if(frost) {
      return {kind:'cold',title:'Стоит ли мыть машину',text:'Можно, если после мойки хорошо просушат кузов, уплотнители и замки: на неделе возможны заморозки.'};
    }
    return {kind:'ok',title:'Стоит ли мыть машину',text:'Да. На ближайшую неделю существенных осадков не видно — хороший момент для мойки.'};
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

  function buildRecommendations(car,weather) {
    const items=[carWashAdvice(weather)];
    const remaining=serviceRemaining(car);

    if(remaining===0 && car?.state?.mileage!=null) {
      items.push({kind:'warn',title:'ТО по пробегу',text:'Ты на регламентном рубеже. Проверь, пройдено ли это ТО, и при необходимости запишись.'});
    } else if(Number.isFinite(remaining) && remaining<=1000) {
      items.push({kind:'warn',title:'ТО скоро',text:'До следующего ТО осталось '+formatKm(remaining)+'. Лучше уже выбрать дату сервиса.'});
    } else if(Number.isFinite(remaining) && remaining<=2500) {
      items.push({kind:'info',title:'Планируй ТО',text:'До следующего ТО '+formatKm(remaining)+'. Можно заранее подобрать удобное окно у сервиса.'});
    }

    if(weather) {
      if(Number(weather.minForecast)<=3) {
        items.push({kind:'cold',title:'Похолодание',text:'Ночью около +3°C или ниже. Проверь омывающую жидкость, состояние аккумулятора и давление в шинах.'});
      }
      if(Number(weather.precipitationSum)>=5) {
        items.push({kind:'rain',title:'Осадки',text:'На неделе ожидаются осадки. Проверь щётки, омыватель и учитывай увеличенный тормозной путь.'});
      }
      const spread=Number(weather.maxForecast)-Number(weather.minForecast);
      if(Number.isFinite(spread) && spread>=10) {
        items.push({kind:'temp',title:'Перепад температуры',text:'Температура заметно меняется. После похолодания проверь давление в шинах на холодных колёсах.'});
      }
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
      const title=document.createElement('strong');
      title.textContent=item.title;
      const text=document.createElement('p');
      text.textContent=item.text;
      copy.append(title,text);
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
    const collapsedWash=document.getElementById('carCollapsedWashValue');
    if(collapsedWash) collapsedWash.textContent=compactWashAdvice(weather);
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

  function renderTasks(ticktick){
    const root=document.getElementById('carTasksList');
    const meta=document.getElementById('carTasksMeta');
    if(!root) return;
    root.replaceChildren();

    if(!ticktick?.available){
      if(meta) meta.textContent='';
      const empty=document.createElement('div');
      empty.className='car-tasks-empty';
      empty.textContent='TickTick временно недоступен';
      root.appendChild(empty);
      return;
    }

    const tasks=Array.isArray(ticktick?.tasks)?ticktick.tasks:[];
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
  }

  async function loadCar() {
    if(!document.body.classList.contains('auth-ok') || state.loading) return;
    state.loading=true;
    try {
      const data=await api('get');
      const tile=document.getElementById('carTile');
      if(!data.visible) {
        if(tile) tile.hidden=true;
        return;
      }
      state.car=data;
      if(tile){
        tile.dataset.tabAvailable='1';
        tile.hidden=document.body.dataset.appTab!=='home';
      }
      render();
      loadWeather();
    } catch(_) {
      const tile=document.getElementById('carTile');
      if(tile) tile.hidden=true;
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
    document.getElementById('carMileageForm')?.addEventListener('submit',saveMileage);
    document.getElementById('carErrorAdd')?.addEventListener('click',()=>setErrorFormOpen(true));
    document.getElementById('carErrorCancel')?.addEventListener('click',()=>setErrorFormOpen(false));
    document.getElementById('carErrorForm')?.addEventListener('submit',saveDashboardError);
    document.getElementById('carWashGuideOpen')?.addEventListener('click',()=>setWashGuideOpen(true));
    document.getElementById('carWashGuideBack')?.addEventListener('click',()=>setWashGuideOpen(false));
    let attempts=0;
    const wait=()=>{
      attempts++;
      if(document.body.classList.contains('auth-ok')) {
        const actor=String(document.body.dataset.rudiActor||'');
        if(actor&&actor!=='Рустам') {
          document.getElementById('carTile')?.remove();
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
