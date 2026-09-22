(() => {
  const tg = window.Telegram?.WebApp;
  const API = '/api/index?route=smart-home';
  const HOME_STALE_MS = 5 * 60 * 1000;
  const WEATHER_STALE_MS = 15 * 60 * 1000;
  const state = { loading:false, lastLoadedAt:0, data:null };

  function onOff(device){
    return (device?.capabilities || []).find(cap =>
      cap?.type === 'devices.capabilities.on_off' &&
      typeof cap?.state?.value === 'boolean'
    ) || null;
  }

  function property(device, instance){
    const item=(device?.properties||[]).find(row=>row?.parameters?.instance===instance);
    return item?.state?.value;
  }

  function capability(device,type,instance){
    return (device?.capabilities||[]).find(cap=>
      cap?.type===type &&
      String(cap?.state?.instance||cap?.parameters?.instance||'')===String(instance||'')
    ) || null;
  }

  function speedLabel(value){
    return ({fast:'Быстрый',medium:'Средний',slow:'Медленный',min:'Минимальный'})[String(value||'')] || String(value||'');
  }

  async function api(operation,payload={}){
    const response=await fetch(API,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({initData:tg?.initData||'',operation,...payload}),
      cache:'no-store'
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok) throw new Error(data.error||'smart-home-request-failed');
    return data;
  }

  function setStatus(text,kind=''){
    const node=document.getElementById('smartHomeStatus');
    if(!node)return;
    node.textContent=String(text||'');
    node.className='smart-home-status'+(kind?' is-'+kind:'');
    node.hidden=!node.textContent;
  }

  function isAudioDevice(device){
    const type=String(device?.type||'').toLowerCase();
    const name=String(device?.name||'').toLowerCase();
    return /headphone|smart[_-]?speaker|speaker|audio/.test(type)
      || /наушник/.test(name);
  }

  function isHiddenForActor(device,data){
    if(isAudioDevice(device)) return true;
    if(String(data?.actor||'')!=='Диана') return false;
    const name=String(device?.name||'').trim().toLowerCase();
    return name==='камера' || name==='переключатель';
  }

  function visibleDevices(data){
    return (Array.isArray(data?.devices)?data.devices:[]).filter(device=>!isHiddenForActor(device,data));
  }

  function setUpdated(){
    const node=document.getElementById('smartHomeUpdated');
    if(node) node.textContent='Обновлено только что · '+visibleDevices(state.data).length+' устройств';
  }

  function roomGroups(data){
    const rooms=new Map((data?.rooms||[]).map(room=>[room.id,room.name||'Без комнаты']));
    const homes=new Map((data?.households||[]).map(home=>[home.id,home]));
    const groups=new Map();

    for(const device of visibleDevices(data)){
      const home=homes.get(device.householdId);
      const room=rooms.get(device.room)||(home?.type==='households.types.portable'?'Портативные':'Без комнаты');
      if(!groups.has(room))groups.set(room,[]);
      groups.get(room).push(device);
    }

    return [...groups.entries()].sort(([a],[b])=>{
      if(a==='Портативные')return 1;
      if(b==='Портативные')return -1;
      return a.localeCompare(b,'ru');
    });
  }

  function prependActivity(activity){
    if(!activity?.text)return;
    const list=document.getElementById('homeActivityList');
    const empty=document.getElementById('homeActivityEmpty');
    if(!list)return;

    const row=document.createElement('button');
    row.type='button';
    row.className='home-activity-row';

    const icon=document.createElement('span');
    icon.className='home-activity-icon';
    icon.textContent=activity.icon||'🏠';

    const copy=document.createElement('span');
    copy.className='home-activity-copy';
    const text=document.createElement('strong');
    text.textContent=activity.text;
    const time=document.createElement('time');
    time.textContent='Только что';
    copy.append(text,time);

    const arrow=document.createElement('span');
    arrow.className='home-activity-arrow';
    arrow.textContent='›';

    row.append(icon,copy,arrow);
    list.prepend(row);
    while(list.children.length>6)list.lastElementChild?.remove();
    if(empty)empty.hidden=true;
  }

  async function toggleDevice(device,button,cap){
    const next=!Boolean(cap.state.value);
    if(button.disabled)return;
    button.disabled=true;
    button.classList.add('is-busy');

    try{
      const result=await api('switch',{
        deviceId:device.id,
        deviceName:device.name,
        value:next
      });
      if(result.status&&result.status!=='DONE') throw new Error('action-not-done');

      cap.state.value=next;
      renderDevices(state.data);
      prependActivity(result.activity);
      setStatus(device.name+' '+(next?'включён':'выключен'),'success');
      try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(_){
      button.disabled=false;
      button.classList.remove('is-busy');
      setStatus('Не удалось изменить состояние '+device.name,'error');
      try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }
  }

  async function runCapability(device,cap,value,control){
    if(!cap||control?.disabled)return;
    if(control){
      control.disabled=true;
      control.classList.add('is-busy');
    }
    try{
      const result=await api('capability',{
        deviceId:device.id,
        deviceName:device.name,
        capabilityType:cap.type,
        instance:cap.state?.instance||cap.parameters?.instance,
        value
      });
      if(result.status&&result.status!=='DONE') throw new Error('action-not-done');
      if(!cap.state)cap.state={instance:cap.parameters?.instance||''};
      cap.state.value=value;
      renderDevices(state.data);
      prependActivity(result.activity);
      setStatus(device.name+': команда выполнена','success');
      try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
    }catch(_){
      if(control){
        control.disabled=false;
        control.classList.remove('is-busy');
      }
      setStatus('Не удалось изменить режим '+device.name,'error');
      try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }
  }

  function deviceArt(device){
    const type=String(device?.type||'').toLowerCase();
    const name=String(device?.name||'').toLowerCase();

    if(/vacuum/.test(type)||/пылесос/.test(name)){
      return '<svg class="smart-home-device-svg is-vacuum" viewBox="0 0 120 92" aria-hidden="true"><ellipse cx="60" cy="54" rx="43" ry="24" fill="currentColor" opacity=".12"/><ellipse cx="60" cy="44" rx="38" ry="23" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="47" cy="39" r="5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M29 52c17 8 45 9 62 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M26 68l-8 6M94 68l8 6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
    }
    if(/camera/.test(type)||/камера/.test(name)){
      return '<svg class="smart-home-device-svg is-camera" viewBox="0 0 120 92" aria-hidden="true"><rect x="28" y="24" width="64" height="42" rx="11" fill="currentColor" opacity=".08"/><rect x="28" y="24" width="64" height="42" rx="11" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="60" cy="45" r="12" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="60" cy="45" r="4" fill="currentColor"/><path d="M49 67h22l5 10H44l5-10Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>';
    }
    if(/switch/.test(type)||/переключатель/.test(name)){
      return '<svg class="smart-home-device-svg is-switch" viewBox="0 0 120 92" aria-hidden="true"><rect x="33" y="14" width="54" height="64" rx="13" fill="currentColor" opacity=".10"/><rect x="35" y="12" width="50" height="62" rx="13" fill="none" stroke="currentColor" stroke-width="3"/><path d="M46 44h28" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="44" r="8" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
    }
    if(/socket/.test(type)||/розет/.test(name)){
      return '<svg class="smart-home-device-svg is-socket" viewBox="0 0 120 92" aria-hidden="true"><rect x="36" y="14" width="48" height="55" rx="12" fill="currentColor" opacity=".10"/><rect x="38" y="12" width="44" height="54" rx="12" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="52" cy="39" r="3.5" fill="currentColor"/><circle cx="68" cy="39" r="3.5" fill="currentColor"/><path d="M60 48v8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
    }
    if(/light/.test(type)||/лента|торшер|свет/.test(name)){
      return '<svg class="smart-home-device-svg is-light" viewBox="0 0 120 92" aria-hidden="true"><path d="M60 13v11M37 26l8 8M83 26l-8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M42 51c0-12 8-21 18-21s18 9 18 21c0 7-4 11-9 15H51c-5-4-9-8-9-15Z" fill="currentColor" opacity=".12"/><path d="M42 51c0-12 8-21 18-21s18 9 18 21c0 7-4 11-9 15H51c-5-4-9-8-9-15Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M52 74h16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
    }
    if(/sensor/.test(type)||/датчик/.test(name)){
      return '<svg class="smart-home-device-svg is-sensor" viewBox="0 0 120 92" aria-hidden="true"><rect x="30" y="15" width="60" height="58" rx="15" fill="currentColor" opacity=".10"/><rect x="32" y="13" width="56" height="58" rx="15" fill="none" stroke="currentColor" stroke-width="3"/><path d="M48 45h24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="31" r="5" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
    }
    return '<svg class="smart-home-device-svg is-generic" viewBox="0 0 120 92" aria-hidden="true"><rect x="31" y="14" width="58" height="58" rx="15" fill="currentColor" opacity=".10"/><rect x="33" y="12" width="54" height="58" rx="15" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="60" cy="41" r="10" fill="none" stroke="currentColor" stroke-width="3"/><path d="M52 74h16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
  }

  function deviceCard(device){
    const card=document.createElement('article');
    card.className='smart-home-device-card';

    const visual=document.createElement('div');
    visual.className='smart-home-device-visual';
    visual.innerHTML=deviceArt(device);

    const power=onOff(device);
    if(power){
      const button=document.createElement('button');
      button.type='button';
      button.className='smart-home-power-icon '+(power.state.value?'is-on':'is-off');
      button.setAttribute('aria-label',(power.state.value?'Выключить ':'Включить ')+(device.name||'устройство'));
      button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9"/><path d="M6.6 6.6a7 7 0 1 0 10.8 0"/></svg>';
      button.addEventListener('click',()=>toggleDevice(device,button,power));
      visual.appendChild(button);
    }

    const pause=capability(device,'devices.capabilities.toggle','pause');
    if(pause){
      const button=document.createElement('button');
      button.type='button';
      button.className='smart-home-pause-icon '+(pause.state?.value?'is-on':'is-off');
      button.setAttribute('aria-label',pause.state?.value?'Продолжить уборку':'Поставить уборку на паузу');
      button.innerHTML=pause.state?.value
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
      button.addEventListener('click',()=>runCapability(device,pause,!Boolean(pause.state?.value),button));
      visual.appendChild(button);
    }

    const copy=document.createElement('div');
    copy.className='smart-home-device-card-copy';

    const titleRow=document.createElement('div');
    titleRow.className='smart-home-device-title-row';

    const title=document.createElement('strong');
    title.textContent=device.name||'Устройство';
    titleRow.appendChild(title);

    if(power){
      const indicator=document.createElement('span');
      indicator.className='smart-home-state-dot '+(power.state.value?'is-on':'is-off');
      indicator.setAttribute('aria-label',power.state.value?'Включено':'Выключено');
      indicator.title=power.state.value?'Включено':'Выключено';
      titleRow.appendChild(indicator);
    }

    const meta=document.createElement('span');
    meta.className='smart-home-device-meta';
    const battery=property(device,'battery_level');
    const temp=property(device,'temperature');
    const humidity=property(device,'humidity');
    const parts=[];
    if(Number.isFinite(Number(temp)))parts.push(Number(temp).toFixed(1)+'°C');
    if(Number.isFinite(Number(humidity)))parts.push(Math.round(Number(humidity))+'%');
    if(Number.isFinite(Number(battery)))parts.push('Батарея '+Math.round(Number(battery))+'%');
    meta.textContent=parts.join(' · ');
    meta.hidden=!parts.length;

    copy.append(titleRow,meta);
    card.append(visual,copy);

    const speed=capability(device,'devices.capabilities.mode','work_speed');
    const modes=Array.isArray(speed?.parameters?.modes)?speed.parameters.modes:[];
    if(speed&&modes.length){
      const controls=document.createElement('div');
      controls.className='smart-home-speed-control';

      const label=document.createElement('span');
      label.className='smart-home-speed-label';
      label.textContent='Скорость';

      const options=document.createElement('div');
      options.className='smart-home-speed-options';

      for(const mode of modes){
        const value=String(mode?.value||'');
        if(!value)continue;
        const button=document.createElement('button');
        button.type='button';
        button.className='smart-home-speed-option'+(String(speed.state?.value||'')===value?' is-active':'');
        button.textContent=speedLabel(value);
        button.addEventListener('click',()=>runCapability(device,speed,value,button));
        options.appendChild(button);
      }

      controls.append(label,options);
      card.appendChild(controls);
    }

    return card;
  }

  function renderDevices(data){
    const root=document.getElementById('smartHomeRooms');
    if(!root)return;
    root.replaceChildren();

    for(const [room,devices] of roomGroups(data)){
      const section=document.createElement('section');
      section.className='smart-home-room';

      const head=document.createElement('div');
      head.className='smart-home-room-head';
      const title=document.createElement('strong');
      title.textContent=room;
      const count=document.createElement('span');
      count.textContent=String(devices.length);
      head.append(title,count);

      const list=document.createElement('div');
      list.className='smart-home-device-grid';
      devices
        .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ru'))
        .forEach(device=>list.appendChild(deviceCard(device)));

      section.append(head,list);
      root.appendChild(section);
    }
  }

  function renderClimate(data){
    const climate=(data?.devices||[]).find(device=>
      (device.properties||[]).some(row=>row?.parameters?.instance==='temperature')
    );

    const temp=property(climate,'temperature');
    const humidity=property(climate,'humidity');
    const battery=property(climate,'battery_level');

    const tempNode=document.getElementById('smartHomeTemperature');
    const humidityNode=document.getElementById('smartHomeHumidity');
    const humidityHint=document.getElementById('smartHomeHumidityHint');

    if(tempNode)tempNode.textContent=Number.isFinite(Number(temp))?Number(temp).toFixed(1)+'°C':'—';
    if(humidityNode)humidityNode.textContent=Number.isFinite(Number(humidity))?Math.round(Number(humidity))+'%':'—';
    if(humidityHint)humidityHint.textContent=Number.isFinite(Number(battery))?'Датчик · '+Math.round(Number(battery))+'%':'Датчик климата';
  }

  async function runScenario(scenario,button){
    if(button.disabled)return;
    button.disabled=true;
    const old=button.textContent;
    button.textContent='Запускаю…';

    try{
      await api('scenario',{scenarioId:scenario.id});
      button.textContent='Запущено';
      setStatus('Сценарий «'+scenario.name+'» запущен','success');
      setTimeout(()=>{button.textContent=old;button.disabled=!scenario.active},1000);
    }catch(_){
      button.textContent='Ошибка';
      setStatus('Не удалось запустить сценарий','error');
      setTimeout(()=>{button.textContent=old;button.disabled=!scenario.active},1000);
    }
  }

  function renderScenarios(data){
    const wrap=document.getElementById('smartHomeScenarios');
    const list=document.getElementById('smartHomeScenarioList');
    if(!wrap||!list)return;

    list.replaceChildren();
    const scenarios=String(data?.actor||'')==='Рустам' && Array.isArray(data?.scenarios)
      ? data.scenarios
      : [];
    wrap.hidden=!scenarios.length;

    for(const scenario of scenarios){
      const button=document.createElement('button');
      button.type='button';
      button.className='smart-home-scenario';
      button.disabled=!scenario.active;
      button.textContent=scenario.name;
      button.addEventListener('click',()=>runScenario(scenario,button));
      list.appendChild(button);
    }
  }

  function weatherCache(){
    try{
      const saved=JSON.parse(localStorage.getItem('rudi-smart-home-weather-v1')||'null');
      if(saved&&Date.now()-Number(saved.at||0)<WEATHER_STALE_MS)return saved;
    }catch(_){}
    return null;
  }

  function renderWeather(value){
    const weather=document.getElementById('smartHomeWeather');
    const text=document.getElementById('smartHomeWeatherText');
    if(weather)weather.textContent=value?.temperature!=null?Math.round(Number(value.temperature))+'°C':'—';
    if(text)text.textContent=value?.text||'Погода недоступна';
  }

  async function loadWeather(){
    const cached=weatherCache();
    if(cached){
      renderWeather(cached);
      return;
    }

    try{
      const url='https://api.open-meteo.com/v1/forecast?latitude=59.9386&longitude=30.3141&current=temperature_2m,weather_code,precipitation,rain&forecast_days=1&timezone=Europe%2FMoscow';
      const response=await fetch(url,{cache:'no-store'});
      if(!response.ok)throw new Error('weather');

      const data=await response.json();
      const c=data.current||{};
      const labels={
        0:'Ясно',1:'Преимущественно ясно',2:'Облачно',3:'Пасмурно',
        45:'Туман',48:'Туман',51:'Морось',53:'Морось',55:'Морось',
        61:'Дождь',63:'Дождь',65:'Сильный дождь',
        71:'Снег',73:'Снег',75:'Сильный снег',
        80:'Ливень',81:'Ливень',82:'Сильный ливень',95:'Гроза'
      };
      const value={
        at:Date.now(),
        temperature:Number(c.temperature_2m),
        text:(labels[c.weather_code]||'Погода')+((Number(c.rain||0)>0||Number(c.precipitation||0)>0)?' · осадки':'')
      };
      try{localStorage.setItem('rudi-smart-home-weather-v1',JSON.stringify(value))}catch(_){}
      renderWeather(value);
    }catch(_){
      renderWeather(null);
    }
  }

  async function loadHome({force=false,silent=false}={}){
    if(!tg?.initData||state.loading)return;
    if(!force&&state.data&&Date.now()-state.lastLoadedAt<HOME_STALE_MS){
      renderClimate(state.data);
      renderDevices(state.data);
      return;
    }

    state.loading=true;
    const refresh=document.getElementById('smartHomeRefresh');
    if(refresh)refresh.classList.add('is-loading');
    if(!silent)setStatus('Обновляю устройства…');

    try{
      state.data=await api('list',{force});
      state.lastLoadedAt=Date.now();
      renderClimate(state.data);
      renderDevices(state.data);
      renderScenarios(state.data);
      setUpdated();
      setStatus('');
    }catch(error){
      if(String(error?.message||'').includes('yandex-iot-not-configured')){
        setStatus('Умный дом ещё не подключён к production','muted');
      }else{
        setStatus('Не удалось обновить умный дом','error');
      }
    }finally{
      state.loading=false;
      if(refresh)refresh.classList.remove('is-loading');
    }
  }

  function start(){
    document.getElementById('smartHomeRefresh')?.addEventListener('click',()=>loadHome({force:true}));
    loadWeather();

    let attempts=0;
    const waitForAuth=()=>{
      attempts++;
      if(document.body.classList.contains('auth-ok')&&tg?.initData){
        loadHome();
        return;
      }
      if(attempts<50)setTimeout(waitForAuth,250);
    };
    waitForAuth();

    let hiddenAt=0;
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='hidden'){
        hiddenAt=Date.now();
        return;
      }
      if(hiddenAt&&Date.now()-state.lastLoadedAt>HOME_STALE_MS){
        loadHome({silent:true});
      }
      hiddenAt=0;
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
