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

  function setUpdated(){
    const node=document.getElementById('smartHomeUpdated');
    if(node) node.textContent='Обновлено только что · '+(state.data?.devices?.length||0)+' устройств';
  }

  function roomGroups(data){
    const rooms=new Map((data?.rooms||[]).map(room=>[room.id,room.name||'Без комнаты']));
    const homes=new Map((data?.households||[]).map(home=>[home.id,home]));
    const groups=new Map();

    for(const device of data?.devices||[]){
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
    const old=button.textContent;
    button.textContent='…';

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
      button.textContent=old;
      button.disabled=false;
      setStatus('Не удалось изменить состояние '+device.name,'error');
      try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }
  }

  function deviceRow(device){
    const row=document.createElement('div');
    row.className='smart-home-device';

    const copy=document.createElement('div');
    copy.className='smart-home-device-copy';
    const title=document.createElement('strong');
    title.textContent=device.name||'Устройство';

    const meta=document.createElement('span');
    const battery=property(device,'battery_level');
    const parts=[];
    if(Number.isFinite(Number(battery)))parts.push('Батарея '+Math.round(Number(battery))+'%');
    meta.textContent=parts.join(' · ')||String(device.type||'').replace('devices.types.','').replaceAll('_',' ');

    copy.append(title,meta);
    row.appendChild(copy);

    const cap=onOff(device);
    if(cap){
      const button=document.createElement('button');
      button.type='button';
      button.className='smart-home-power '+(cap.state.value?'is-on':'is-off');
      button.textContent=cap.state.value?'Выкл':'Вкл';
      button.setAttribute('aria-label',(cap.state.value?'Выключить ':'Включить ')+(device.name||'устройство'));
      button.addEventListener('click',()=>toggleDevice(device,button,cap));
      row.appendChild(button);
    }else{
      const status=document.createElement('span');
      status.className='smart-home-readonly';
      const temp=property(device,'temperature');
      const humidity=property(device,'humidity');
      if(Number.isFinite(Number(temp))) status.textContent=Number(temp).toFixed(1)+'°';
      else if(Number.isFinite(Number(humidity))) status.textContent=Math.round(Number(humidity))+'%';
      else status.textContent='Данные';
      row.appendChild(status);
    }

    return row;
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
      list.className='smart-home-device-list';
      devices
        .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ru'))
        .forEach(device=>list.appendChild(deviceRow(device)));

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
    const scenarios=Array.isArray(data?.scenarios)?data.scenarios:[];
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
