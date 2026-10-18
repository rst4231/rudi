/* Forecast details share the existing weather service; nothing fetches until tap. */
(function(){
'use strict';
let modal=null,returnFocus=null,payload=null,view='day',selected='',month='',generation=0,restoreScroll=null;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function currentHourTime(hours,date,now=Date.now()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(part=>[part.type,part.value]));
 const current=parts.year+'-'+parts.month+'-'+parts.day;
 if(date!==current)return null;
 const key=current+'T'+parts.hour;
 const available=hours.filter(hour=>hour.date===date).sort((a,b)=>a.time.localeCompare(b.time));
 return available.find(hour=>hour.time.slice(0,13)>=key)?.time||available.at(-1)?.time||null;
}
const number=(value,suffix='')=>Number.isFinite(value)?Math.round(value)+suffix:'—';
const emoji=code=>code===0?'☀️':code===1?'🌤️':code===2?'⛅':code===3?'☁️':[45,48].includes(code)?'🌫️':[71,73,75,77,85,86].includes(code)?'❄️':[95,96,99].includes(code)?'⛈️':'🌧️';
function model(data){
 const daily=data?.daily||{},hourly=data?.hourly||{};
 return {days:(daily.time||[]).map((date,i)=>({date,min:daily.temperature_2m_min?.[i],max:daily.temperature_2m_max?.[i],code:daily.weather_code?.[i],rain:daily.precipitation_sum?.[i],probability:daily.precipitation_probability_max?.[i],wind:daily.wind_speed_10m_max?.[i]})),
 hours:(hourly.time||[]).map((time,i)=>({time,date:time.slice(0,10),temperature:hourly.temperature_2m?.[i],feels:hourly.apparent_temperature?.[i],code:hourly.weather_code?.[i],rain:hourly.precipitation?.[i],probability:hourly.precipitation_probability?.[i],wind:hourly.wind_speed_10m?.[i]}))};
}
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el}
const label=date=>new Date(date+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'short',weekday:'short',timeZone:'Europe/Moscow'});
function lockBackground(){
 const body=document.body,root=document.documentElement,x=window.scrollX||0,y=window.scrollY||0;
 const before=Object.fromEntries(['position','top','left','width','overflow'].map(key=>[key,body.style[key]]));
 const overflow=root.style.overflow,behavior=root.style.scrollBehavior;
 body.style.position='fixed';body.style.top=-y+'px';body.style.left=-x+'px';body.style.width='100%';body.style.overflow='hidden';root.style.overflow='hidden';
 return ()=>{for(const [key,value] of Object.entries(before))body.style[key]=value;root.style.overflow=overflow;root.style.scrollBehavior='auto';window.scrollTo(x,y);root.style.scrollBehavior=behavior};
}
function close(){if(!modal)return;generation++;modal.remove();modal=null;restoreScroll?.();restoreScroll=null;const target=returnFocus?.isConnected?returnFocus:document.querySelector('[data-weather-forecast]');target?.focus?.({preventScroll:true});}
function render(){
 if(!modal)return;
 const content=modal.querySelector('.weather-forecast-content'),controls=modal.querySelector('.weather-forecast-controls'),status=modal.querySelector('.weather-forecast-status');content.replaceChildren();controls.replaceChildren();content.scrollTop=0;
 for(const button of modal.querySelectorAll('[data-forecast-view]')){const active=button.dataset.forecastView===view;button.setAttribute('aria-selected',String(active));button.classList.toggle('is-active',active)}
 if(!payload)return;
 const {days,hours}=model(payload),first=days[0]?.date,last=days.at(-1)?.date;
 status.textContent=(payload.stale||navigator.onLine===false?'Сохранённый прогноз · ':'')+'Санкт-Петербург · '+(first&&last?label(first)+' — '+label(last):'Нет данных')+'. За этим горизонтом данных нет.';
 if(view==='day'){
  const select=node('select');select.setAttribute('aria-label','День почасового прогноза');
  for(const day of days){const option=node('option',label(day.date));option.value=day.date;option.selected=day.date===selected;select.append(option)}
  select.addEventListener('change',()=>{selected=select.value;render()});controls.append(select);
  const list=node('div',undefined,'weather-forecast-hours');list.setAttribute('role','list');
  const reveal=currentHourTime(hours,selected);let currentRow=null;
  for(const hour of hours.filter(item=>item.date===selected)){
   const row=node('div',undefined,'weather-forecast-hour');row.setAttribute('role','listitem');
   row.dataset.forecastTime=hour.time;
   if(hour.time===reveal){currentRow=row;row.classList.add('is-current');row.setAttribute('aria-current','time')}
   row.append(node('strong',hour.time.slice(11,16),'weather-hour-time'),node('b',(Number.isFinite(hour.code)?emoji(hour.code)+' ':'')+number(hour.temperature,'°'),'weather-hour-temperature'),
    node('span','Ощущается '+number(hour.feels,'°'),'weather-hour-feels'),node('span','Осадки '+number(hour.probability,'%')+' · '+number(hour.rain,' мм'),'weather-hour-rain'),node('span','Ветер '+number(hour.wind,' км/ч'),'weather-hour-wind'));list.append(row);
  }
  content.append(list);if(!list.children.length)content.append(node('p','Почасовой прогноз недоступен. Открой неделю или повтори позже.'));
  if(currentRow){const activeModal=modal;window.requestAnimationFrame(()=>{if(modal===activeModal&&currentRow.isConnected&&view==='day')content.scrollTop=Math.max(0,currentRow.offsetTop-list.offsetTop)})}return;
 }
 if(view==='week'){
  const list=node('div',undefined,'weather-forecast-week');
  for(const day of days.slice(0,7)){const row=node('div',undefined,'weather-forecast-day');row.append(node('strong',label(day.date)),node('b',(Number.isFinite(day.code)?emoji(day.code)+' ':'')+number(day.min,'°')+'…'+number(day.max,'°')),node('span','Осадки '+number(day.rain,' мм')+' · '+number(day.probability,'%')),node('span','Ветер до '+number(day.wind,' км/ч')));list.append(row)}
  content.append(list);return;
 }
 const chooser=node('select');chooser.setAttribute('aria-label','Месяц прогноза');
 const current=today().slice(0,7),nextDate=new Date(current+'-01T12:00:00Z');nextDate.setUTCMonth(nextDate.getUTCMonth()+1);
 for(const key of [current,nextDate.toISOString().slice(0,7)]){const option=node('option',new Date(key+'-01T12:00:00Z').toLocaleDateString('ru-RU',{month:'long',year:'numeric'}));option.value=key;option.selected=key===month;chooser.append(option)}
 chooser.addEventListener('change',()=>{month=chooser.value;render()});controls.append(chooser);content.append(node('p','Прогноз есть только на доступные дни.','weather-forecast-hint'));
 const grid=node('div',undefined,'weather-forecast-month');grid.setAttribute('aria-label','Прогноз на месяц');
 for(const weekday of ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'])grid.append(node('strong',weekday));
 const start=new Date(month+'-01T12:00:00Z'),offset=(start.getUTCDay()+6)%7,total=new Date(start.getUTCFullYear(),start.getUTCMonth()+1,0).getDate();
 for(let i=0;i<offset;i++)grid.append(node('div'));
 for(let day=1;day<=total;day++){
  const date=month+'-'+String(day).padStart(2,'0'),forecast=days.find(item=>item.date===date),cell=node('div',undefined,'weather-forecast-cell'+(forecast?'':' is-unavailable'));
  if(date===today())cell.classList.add('is-today');
  cell.append(node('b',String(day)));
  if(forecast&&Number.isFinite(forecast.code)){const icon=node('span',emoji(forecast.code),'weather-forecast-cell-icon');icon.setAttribute('aria-hidden','true');cell.append(icon)}
  cell.append(node('span',forecast?number(forecast.min,'°')+'…'+number(forecast.max,'°'):'нет данных','weather-forecast-cell-temperature'));grid.append(cell);
 }
 content.append(grid);
}
async function open(trigger){
 if(modal)return;returnFocus=trigger;view='day';selected=today();month=selected.slice(0,7);payload=null;const revision=++generation;
 modal=node('div',undefined,'weather-forecast-backdrop');modal.innerHTML='<section class="weather-forecast-dialog" role="dialog" aria-modal="true" aria-labelledby="weatherForecastTitle"><header><h2 id="weatherForecastTitle">Прогноз погоды</h2><button type="button" class="weather-forecast-close" aria-label="Закрыть прогноз">×</button></header><div class="weather-forecast-tabs" role="tablist" aria-label="Период прогноза"><button type="button" role="tab" data-forecast-view="day">По часам</button><button type="button" role="tab" data-forecast-view="week">Неделя</button><button type="button" role="tab" data-forecast-view="month">Месяц</button></div><p class="weather-forecast-status" role="status" aria-live="polite">Загружаю прогноз…</p><div class="weather-forecast-controls"></div><div class="weather-forecast-content" tabindex="0"></div><footer>Open-Meteo · время московское</footer></section>';
 restoreScroll=lockBackground();
 document.body.append(modal);modal.querySelector('.weather-forecast-close').addEventListener('click',close);modal.addEventListener('click',event=>{if(event.target===modal)close()});
 for(const type of ['touchmove','wheel'])modal.addEventListener(type,event=>{if(!event.target.closest?.('.weather-forecast-content'))event.preventDefault()},{passive:false});
 for(const button of modal.querySelectorAll('[data-forecast-view]'))button.addEventListener('click',()=>{view=button.dataset.forecastView;render()});
 modal.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close();return}
  if(event.key==='Tab'){const controls=[...modal.querySelectorAll('button,select,[tabindex="0"]')],first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
 });
 modal.querySelector('.weather-forecast-close').focus();render();
 try{const data=await window.RUDI_WEATHER.get({forecast:true});if(!modal||generation!==revision)return;payload=data;if(!data.daily?.time?.includes(selected))selected=data.daily?.time?.[0]||selected;render()}
 catch(_){if(modal&&generation===revision)modal.querySelector('.weather-forecast-status').textContent=navigator.onLine===false?'Офлайн. Свежий прогноз недоступен.':'Не удалось загрузить прогноз. Закрой и попробуй ещё раз.'}
}
document.addEventListener('click',event=>{const trigger=event.target.closest?.('[data-weather-forecast]');if(trigger)void open(trigger)});
window.RUDI_WEATHER_FORECAST={model,open,close,currentHourTime};
})();
