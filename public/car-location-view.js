(function(root){
  'use strict';
  function describeLocation(point){
    if(!point||typeof point.latitude!=='number'||typeof point.longitude!=='number'||!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude)||Math.abs(point.latitude)>90||Math.abs(point.longitude)>180||!Number.isFinite(Date.parse(point.capturedAt)))return {available:false};
    return {available:true,when:new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(point.capturedAt)),accuracy:'Точность около '+Math.round(point.accuracy)+' м',url:'https://yandex.ru/maps/?rtext=~'+point.latitude+','+point.longitude+'&ll='+point.longitude+','+point.latitude+'&z=16&rtt=auto'};
  }
  if(typeof module!=='undefined')module.exports={describeLocation};
  if(!root.document)return;
  const $=id=>document.getElementById(id);let busy=false;
  function owner(){return document.body.classList.contains('auth-ok')&&document.body.dataset.rudiActor==='Рустам';}
  function visible(){return owner()&&document.body.dataset.appTab==='car'&&!document.hidden;}
  function message(text){$('carDeviceMessage').textContent=text;}
  async function api(operation,payload){
    const response=await fetch('/api/index?route=car',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,initData:root.Telegram?.WebApp?.initData||'',...payload}),cache:'no-store',signal:AbortSignal.timeout(12000)});
    const data=await response.json();if(!response.ok||!data.ok||!data.visible)throw Error(data.error||'request-failed');return data;
  }
  function render(data){
    const p=describeLocation(data.lastLocation);$('carDeviceState').textContent=data.carDevice?.paired?'Магнитола подключена':'Магнитола не подключена';
    if(data.carDevice?.paired)$('carDeviceCode').textContent='';
    $('carLocationTime').textContent=p.available?'GPS: '+p.when+' · '+p.accuracy:'Координаты пока не получены';
    $('carLocationRoute').hidden=!p.available;if(p.available)$('carLocationRoute').href=p.url;else $('carLocationRoute').removeAttribute('href');
    $('carDeviceRevoke').hidden=!data.carDevice?.paired;
  }
  async function refresh(){
    if(!visible()||busy)return;busy=true;
    try{const data=await api('get-location');if(owner())render(data);}
    catch(_){message('Не удалось проверить связь. Повтори при наличии интернета.');}
    finally{busy=false;}
  }
  function start(){
    const card=$('carDeviceCard');if(!card)return;
    let wasVisible=false;
    function sync(){const allowed=owner();card.hidden=!allowed;if(!allowed){$('carDeviceCode').textContent='';$('carAdminPassword').value='';$('carLocationTime').textContent='';$('carLocationRoute').hidden=true;$('carLocationRoute').removeAttribute('href');}const shown=visible();if(shown&&!wasVisible)refresh();wasVisible=shown;}
    new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class','data-rudi-actor','data-app-tab']});
    document.addEventListener('visibilitychange',sync);root.addEventListener('rudi:auth-ready',sync);sync();
    setInterval(function(){if(visible())refresh();},60000);
    $('carDeviceRefresh').onclick=refresh;
    $('carDevicePair').onclick=async function(){if(!owner())return;this.disabled=true;try{const d=await api('create-device-pairing');$('carDeviceCode').textContent=d.pairing.code;message('Код действует 10 минут. Введи его в UNI V OS → Настройки → Админ-панель. Новый код отключает прежнюю привязку.');await refresh();}catch(_){message('Не удалось создать код. Проверь подключение.');}finally{this.disabled=false;}};
    $('carDeviceRevoke').onclick=async function(){if(!owner())return;this.disabled=true;try{await api('revoke-car-device');$('carDeviceCode').textContent='';message('Связь отключена. Последняя полученная точка сохранена.');await refresh();}catch(_){message('Не удалось отключить связь. Повтори.');}finally{this.disabled=false;}};
    $('carAdminPasswordForm').onsubmit=async function(event){event.preventDefault();if(!owner())return;const input=$('carAdminPassword'),password=input.value;input.value='';$('carAdminPasswordSave').disabled=true;try{await api('set-device-admin-password',{password});message('Пароль админ-панели сохранён. Используй его для входа на магнитоле.');$('carAdminPasswordDetails').open=false;}catch(error){message(error.message==='car-admin-password-format'?'Пароль должен содержать от 8 до 128 символов.':'Не удалось сохранить пароль. Повтори.');}finally{$('carAdminPasswordSave').disabled=false;}};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(typeof window==='undefined'?globalThis:window);
