(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RUDI_CAR_LOCATION=factory()})(typeof window!=='undefined'?window:this,function(){'use strict';
function describeLocation(point){
 const empty={available:false,title:'Магнитола ещё не передала GPS-точку',when:'Точка появится после подключения и получения GPS в машине.'};
 if(!point||!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude)||Math.abs(point.latitude)>90||Math.abs(point.longitude)>180||!Number.isFinite(Date.parse(point.capturedAt)))return empty;
 const latitude=point.latitude.toFixed(5),longitude=point.longitude.toFixed(5);
 return {available:true,title:latitude+', '+longitude,when:'Получена '+new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(new Date(point.capturedAt)),accuracy:Number.isFinite(point.accuracy)?'Точность около '+Math.round(point.accuracy)+' м':'Точность не указана',url:'https://yandex.ru/maps/?ll='+encodeURIComponent(longitude+','+latitude)+'&z=17&pt='+encodeURIComponent(longitude+','+latitude)+',pm2blm'};
}
function mount({api,getCar,onUpdate}){
 const $=id=>document.getElementById(id);let inFlight=false,expires=0,pairingTimer=null;
 function render(){
  const data=getCar()||{},description=describeLocation(data.lastLocation),paired=Boolean(data.carDevice?.paired);
  $('carLocationPoint').textContent=description.title;$('carLocationWhen').textContent=description.when;
  $('carLocationAccuracy').textContent=description.available?description.accuracy:'';
  const link=$('carLocationMap');link.hidden=!description.available;if(description.available)link.href=description.url;else link.removeAttribute('href');
  $('carLocationConnection').textContent=paired?'Магнитола подключена':'Магнитола не подключена';
  $('carLocationPair').textContent=paired?'Переподключить магнитолу':'Подключить магнитолу';
  $('carLocationDisconnect').hidden=!paired;
  if(paired&&expires){expires=0;$('carLocationPairing').hidden=true;clearInterval(pairingTimer)}
 }
 async function refresh(){
  if(inFlight||!document.body.classList.contains('auth-ok'))return;
  inFlight=true;try{const data=await api('get-location');onUpdate(data);render();$('carLocationStatus').textContent=''}catch(_){$('carLocationStatus').textContent='Не удалось обновить связь. Сохранённая точка остаётся на экране.'}finally{inFlight=false}
 }
 $('carLocationRefresh').addEventListener('click',refresh);
 $('carLocationPair').addEventListener('click',async()=>{
  const button=$('carLocationPair');button.disabled=true;$('carLocationStatus').textContent='Создаю код подключения…';
  try{const data=await api('create-device-pairing');expires=Date.parse(data.pairing.expiresAt);$('carLocationPairCode').textContent=data.pairing.code;$('carLocationPairExpiry').textContent='Введи в UNI-V OS → Настройки → Руди до '+new Date(expires).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});$('carLocationPairing').hidden=false;onUpdate({carDevice:{paired:false}});render();$('carLocationStatus').textContent='';clearInterval(pairingTimer);pairingTimer=setInterval(()=>{if(Date.now()>=expires){clearInterval(pairingTimer);$('carLocationPairCode').textContent='Срок кода истёк';$('carLocationPairExpiry').textContent='Создай новый код для подключения.';return}if(!document.hidden)refresh()},10000)}catch(_){$('carLocationStatus').textContent='Код не создан. Попробуй ещё раз.'}finally{button.disabled=false}
 });
 $('carLocationDisconnect').addEventListener('click',async()=>{
  const button=$('carLocationDisconnect');button.disabled=true;
  try{await api('revoke-car-device');onUpdate({carDevice:{paired:false}});expires=0;clearInterval(pairingTimer);$('carLocationPairing').hidden=true;render();$('carLocationStatus').textContent='Передача новых точек отключена. Последняя сохранённая точка осталась.'}catch(_){$('carLocationStatus').textContent='Не удалось отключить магнитолу. Попробуй ещё раз.'}finally{button.disabled=false}
 });
 setInterval(()=>{if(!document.hidden&&document.body.dataset.appTab==='car')refresh()},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.body.dataset.appTab==='car')refresh()});
 return {render,refresh};
}
return {describeLocation,mount};
});
