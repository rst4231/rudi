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

  function setStatus(text,kind='') {
    const node=document.getElementById('carStatus');
    if(!node) return;
    node.textContent=String(text||'');
    node.className='car-status'+(kind?' is-'+kind:'');
    node.hidden=!node.textContent;
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
    if(updatedNode) updatedNode.textContent=formatUpdated(car?.state?.updatedAt);
    if(input && document.activeElement!==input) input.value=mileage==null?'':String(mileage);

    if(!next || mileage==null) {
      if(nextNode) nextNode.textContent='Добавь пробег';
      if(meta) meta.textContent='Покажу ближайшее ТО по пробегу';
      if(progress) progress.style.width='0%';
      return;
    }

    const remaining=Math.max(0,Number(next.mileage)-Number(mileage));
    if(nextNode) nextNode.textContent='ТО-'+next.number+' · '+formatKm(next.mileage);
    if(meta) {
      meta.textContent=remaining===0
        ? 'Регламентный рубеж достигнут'
        : 'Осталось '+formatKm(remaining)+' · срок эксплуатации тоже учитывается';
    }

    const previous=next.mileage===5000?0:next.mileage-10000;
    const span=Math.max(1,next.mileage-previous);
    const pct=Math.max(0,Math.min(100,((Number(mileage)-previous)/span)*100));
    if(progress) progress.style.width=pct.toFixed(1)+'%';
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
    return 'Температура пограничная. Лучше дождаться устойчивых значений выше или ниже +7°C.';
  }

  function buildRecommendations(car,weather) {
    const items=[];
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

    if(!items.length) {
      items.push({kind:'ok',title:'Всё спокойно',text:'По погоде и пробегу срочных действий нет. Следи за давлением, жидкостями и необычными звуками.'});
    }
    return items.slice(0,3);
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
      setStatus('Задача отмечена выполненной','success');
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
        precipitationSum:precipitation.reduce((a,b)=>a+b,0)
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
