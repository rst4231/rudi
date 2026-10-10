(() => {
  const tg = window.Telegram?.WebApp;
  const API = '/api/index?route=smart-home';
  const HOME_STALE_MS = 5 * 60 * 1000;
  const state = { loading:false, lastLoadedAt:0, data:null, expandedVacuumIds:new Set() };

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

  function lowBatteryDevices(data){
    return visibleDevices(data).filter(device=>{
      const raw=property(device,'battery_level');
      if(raw===null||raw===undefined||raw==='')return false;
      const value=Number(raw);
      return Number.isFinite(value)&&value>=0&&value<10;
    });
  }
  function syncSmartHomeBatteryBadge(data){
    const title=document.getElementById('smartHomeTitle');
    if(!title)return;
    let badge=document.getElementById('smartHomeBatteryBadge');
    if(!badge){
      badge=document.createElement('span');
      badge.id='smartHomeBatteryBadge';
      badge.className='smart-home-battery-badge';
      badge.hidden=true;
      title.appendChild(badge);
    }
    const low=lowBatteryDevices(data);
    badge.textContent=low.length?String(Math.min(low.length,99)):'';
    badge.hidden=low.length===0;
    badge.setAttribute('aria-label',low.length===1?'У одного устройства заряд ниже 10%':'У '+low.length+' устройств заряд ниже 10%');
    badge.title=low.length?low.map(device=>String(device.name||'Устройство')).join(', '):'';
  }

  function setUpdated(){
    const node=document.getElementById('smartHomeUpdated');
    if(node){const count=visibleDevices(state.data).length,mod10=count%10,mod100=count%100,word=mod10===1&&mod100!==11?'устройство':mod10>=2&&mod10<=4&&(mod100<12||mod100>14)?'устройства':'устройств';node.textContent=count+' '+word+' · Обновлено только что';}
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

  function deviceStatusText(device,power){
    const name=String(device?.name||'').toLowerCase();
    const battery=property(device,'battery_level');
    const temp=property(device,'temperature');
    const humidity=property(device,'humidity');
    const parts=[];

    if(Number.isFinite(Number(temp))) parts.push(Number(temp).toFixed(1)+'°C');
    if(Number.isFinite(Number(humidity))) parts.push(Math.round(Number(humidity))+'%');

    if(power){
      if(/камера/.test(name)) parts.push(power.state.value?'Онлайн':'Выключено');
      else if(/пылесос/.test(name)) parts.push(power.state.value?'Включён':'Выключен');
      else parts.push(power.state.value?'Включено':'Выключено');
    }

    if(battery!==null&&battery!==undefined&&battery!==''&&Number.isFinite(Number(battery))&&Number(battery)>=0&&Number(battery)<=100) parts.push('Батарея '+Math.round(Number(battery))+'%');
    return parts;
  }

  function deviceCard(device){
    const card=document.createElement('article');
    card.className='smart-home-device-card';
    if(lowBatteryDevices({devices:[device]}).length){
      card.classList.add('is-battery-low');
      card.setAttribute('aria-label',(device.name||'Устройство')+': низкий заряд батареи');
    }

    const speed=capability(device,'devices.capabilities.mode','work_speed');
    const modes=Array.isArray(speed?.parameters?.modes)?speed.parameters.modes:[];
    const hasSpeeds=Boolean(speed&&modes.length);
    const deviceId=String(device?.id||'');
    const expanded=hasSpeeds&&state.expandedVacuumIds.has(deviceId);
    if(hasSpeeds){
      card.classList.add('is-vacuum');
      card.classList.toggle('is-expanded',expanded);
      card.setAttribute('role','button');
      card.setAttribute('tabindex','0');
      card.setAttribute('aria-expanded',expanded?'true':'false');
    }

    const row=document.createElement('div');
    row.className='smart-home-device-row';

    const visual=document.createElement('div');
    visual.className='smart-home-device-visual';
    visual.innerHTML=deviceArt(device);

    const copy=document.createElement('div');
    copy.className='smart-home-device-card-copy';

    const titleRow=document.createElement('div');
    titleRow.className='smart-home-device-title-row';
    const title=document.createElement('strong');
    title.textContent=device.name||'Устройство';
    titleRow.appendChild(title);

    const power=onOff(device);
    if(power){
      const indicator=document.createElement('span');
      indicator.className='smart-home-state-dot '+(power.state.value?'is-on':'is-off');
      indicator.setAttribute('aria-label',power.state.value?'Включено':'Выключено');
      indicator.title=power.state.value?'Включено':'Выключено';
      titleRow.appendChild(indicator);
    }

    const meta=document.createElement('span');
    meta.className='smart-home-device-meta';
    const parts=deviceStatusText(device,power);
    meta.textContent=parts.join(' · ');
    meta.hidden=!parts.length;
    copy.append(titleRow,meta);

    const actions=document.createElement('div');
    actions.className='smart-home-device-actions';

    if(power){
      const button=document.createElement('button');
      button.type='button';
      button.className='smart-home-power-icon '+(power.state.value?'is-on':'is-off');
      button.setAttribute('aria-label',(power.state.value?'Выключить ':'Включить ')+(device.name||'устройство'));
      button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9"/><path d="M6.6 6.6a7 7 0 1 0 10.8 0"/></svg>';
      button.addEventListener('click',event=>{
        event.stopPropagation();
        if(hasSpeeds) state.expandedVacuumIds.add(deviceId);
        toggleDevice(device,button,power);
      });
      actions.appendChild(button);
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
      button.addEventListener('click',event=>{
        event.stopPropagation();
        state.expandedVacuumIds.add(deviceId);
        runCapability(device,pause,!Boolean(pause.state?.value),button);
      });
      actions.appendChild(button);
    }

    row.append(visual,copy,actions);
    card.appendChild(row);

    if(hasSpeeds){
      const controls=document.createElement('div');
      controls.className='smart-home-speed-control';
      controls.hidden=!expanded;

      const head=document.createElement('div');
      head.className='smart-home-speed-head';
      const label=document.createElement('span');
      label.className='smart-home-speed-label';
      label.textContent='Скорость уборки';
      const current=document.createElement('span');
      current.className='smart-home-speed-current';
      current.textContent=speedLabel(speed.state?.value);
      head.append(label,current);

      const options=document.createElement('div');
      options.className='smart-home-speed-options';

      for(const mode of modes){
        const value=String(mode?.value||'');
        if(!value)continue;
        const button=document.createElement('button');
        button.type='button';
        button.className='smart-home-speed-option'+(String(speed.state?.value||'')===value?' is-active':'');
        button.textContent=speedLabel(value);
        button.addEventListener('click',event=>{
          event.stopPropagation();
          state.expandedVacuumIds.add(deviceId);
          runCapability(device,speed,value,button);
        });
        options.appendChild(button);
      }

      controls.append(head,options);
      card.appendChild(controls);

      const toggleExpanded=()=>{
        if(state.expandedVacuumIds.has(deviceId)) state.expandedVacuumIds.delete(deviceId);
        else state.expandedVacuumIds.add(deviceId);
        renderDevices(state.data);
      };
      card.addEventListener('click',toggleExpanded);
      card.addEventListener('keydown',event=>{
        if(event.target!==card) return;
        if(event.key==='Enter'||event.key===' '){
          event.preventDefault();
          toggleExpanded();
        }
      });
    }

    return card;
  }

  function cloudCamCard(){
    const card=document.createElement('article');
    card.className='smart-home-device-card smart-home-cloudcam-card';
    card.innerHTML='<div class="smart-home-device-row">'
      +'<div class="smart-home-device-visual" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="3"/><circle cx="12" cy="12.5" r="3.2"/><path d="M7 3h10"/></svg></div>'
      +'<div class="smart-home-device-card-copy"><div class="smart-home-device-title-row"><strong>CloudCam</strong></div><span class="smart-home-device-meta">EyePlus · удалённый просмотр</span></div>'
      +'<div class="smart-home-device-actions"><a class="smart-home-camera-open" aria-label="Смотреть CloudCam в Safari">Смотреть</a></div></div>';
    const link=card.querySelector('.smart-home-camera-open');
    link.href=CLOUDCAM_URL;
    link.target='_blank';
    link.rel='noopener noreferrer';
    link.referrerPolicy='no-referrer';
    return card;
  }

  function renderDevices(data){
    const root=document.getElementById('smartHomeRooms');
    if(!root)return;
    root.replaceChildren();
    syncSmartHomeBatteryBadge(data);
    const groups=roomGroups(data);
    const isHallway=room=>String(room||'').trim().toLocaleLowerCase('ru-RU')==='прихожая';
    // CloudCam is independent of Yandex. Keep it in Hallway, immediately
    // above the Yandex "Камера" row. Diana must never see this device.
    if(String(data?.actor||'')==='Рустам'){
      if(!groups.some(([room])=>isHallway(room)))groups.push(['Прихожая',[]]);
    }
    for(const [room,devices] of groups){
      const hallway=isHallway(room);
      const canShowCloudCam=hallway&&String(data?.actor||'')==='Рустам';
      const section=document.createElement('section');
      section.className='smart-home-room';

      const head=document.createElement('div');
      head.className='smart-home-room-head';
      const title=document.createElement('strong');
      title.textContent=room;
      const count=document.createElement('span');
      count.textContent='('+(devices.length+(canShowCloudCam?1:0))+')';
      const group=document.createElement('div');
      group.className='smart-home-room-title';
      group.append(title,count);
      head.appendChild(group);

      const list=document.createElement('div');
      list.className='smart-home-device-list';
      const sorted=devices.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ru'));
      sorted.forEach(device=>list.appendChild(deviceCard(device)));
      if(canShowCloudCam){
        const cameraIndex=sorted.findIndex(device=>String(device?.name||'').trim().toLocaleLowerCase('ru-RU')==='камера');
        list.insertBefore(cloudCamCard(),cameraIndex>=0?list.children[cameraIndex]:null);
      }
      section.append(head,list);
      root.appendChild(section);
    }
  }

  const CLOUDCAM_URL='https://eyeplus.closeli.com/login';

  // Calendar-based seasons approximate the Russian indoor comfort standards.
  function indoorClimateSeason(at=new Date()){
    let month;
    try{month=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',month:'numeric'}).format(at))}
    catch(_){month=at.getMonth()+1}
    return month>=5&&month<=9?'warm':'cold';
  }
  function indoorClimateNumber(value,type){
    if(value===null||value===undefined||value==='')return null;
    const n=Number(value);
    if(!Number.isFinite(n))return null;
    if(type==='humidity'&&(n<0||n>100))return null;
    if(type==='temperature'&&(n<-30||n>60))return null;
    return n;
  }
  function assessIndoorClimate(type,value,at=new Date()){
    const raw=indoorClimateNumber(value,type);
    if(raw===null)return null;
    if(type==='humidity'){
      if(raw<30)return {label:'Сухо',level:'alert'};
      if(raw<=50)return {label:'Норма',level:'normal'};
      if(raw<=60)return {label:'Влажновато',level:'caution'};
      return {label:'Слишком влажно',level:'alert'};
    }
    if(type==='temperature'){
      const n=Number(raw.toFixed(1)),warm=indoorClimateSeason(at)==='warm';
      const minimum=warm?20:18,low=warm?22:20,high=warm?25:22,maximum=warm?28:25;
      if(n<minimum)return {label:'Холодно',level:'alert'};
      if(n<low)return {label:'Прохладно',level:'caution'};
      if(n<=high)return {label:'Норма',level:'normal'};
      if(n<=maximum)return {label:'Тепловато',level:'caution'};
      return {label:'Жарко',level:'alert'};
    }
    return null;
  }
  function renderIndoorClimateAssessment(id,assessment){
    const node=document.getElementById(id);
    if(!node)return;
    node.textContent=assessment?.label||'';
    node.className='smart-home-climate-assessment'+(assessment?' is-'+assessment.level:'');
    node.hidden=!assessment;
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

    const validTemp=indoorClimateNumber(temp,'temperature');
    const validHumidity=indoorClimateNumber(humidity,'humidity');
    if(tempNode)tempNode.textContent=validTemp===null?'—':validTemp.toFixed(1)+'°C';
    if(humidityNode)humidityNode.textContent=validHumidity===null?'—':Math.round(validHumidity)+'%';
    if(humidityHint)humidityHint.textContent='Влажность';
    renderIndoorClimateAssessment('smartHomeTemperatureAssessment',assessIndoorClimate('temperature',validTemp));
    renderIndoorClimateAssessment('smartHomeHumidityAssessment',assessIndoorClimate('humidity',validHumidity));
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

  function renderWeather(value){
    const weather=document.getElementById('smartHomeWeather');
    const text=document.getElementById('smartHomeWeatherText');
    if(weather)weather.textContent=value?.temperature!=null?Math.round(Number(value.temperature))+'°C':'—';
    if(text)text.textContent=value?.text||'Погода недоступна';
  }

  async function loadWeather(){
    try{
      const data=await window.RUDI_WEATHER.get();
      const c=data.current||{};
      const labels={
        0:'Ясно',1:'Преимущественно ясно',2:'Облачно',3:'Пасмурно',
        45:'Туман',48:'Туман',51:'Морось',53:'Морось',55:'Морось',
        61:'Дождь',63:'Дождь',65:'Сильный дождь',
        71:'Снег',73:'Снег',75:'Сильный снег',
        80:'Ливень',81:'Ливень',82:'Сильный ливень',95:'Гроза'
      };
      const value={
        at:data.fetchedAt,
        temperature:Number(c.temperature_2m),
        text:(data.stale?'Сохранённый прогноз · ':'')+(labels[c.weather_code]||'Погода')+((Number(c.rain||0)>0||Number(c.precipitation||0)>0)?' · осадки':'')
      };
      renderWeather(value);
    }catch(_){
      renderWeather(null);
    }
  }

  async function loadHome({force=false,silent=false}={}){
    if(!document.body.classList.contains('auth-ok')||state.loading)return;
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
      if(document.body.classList.contains('auth-ok')){
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

  window.RUDI_SMART_HOME={refresh:()=>loadHome({force:true,silent:true}),assessClimate:assessIndoorClimate};

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
