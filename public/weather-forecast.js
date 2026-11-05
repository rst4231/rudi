/* Forecast details and calendar days share the cached weather service. */
(function(){
'use strict';
let modal=null,payload=null,view='day',selected='',month='',generation=0,active=false,activation=null,returnTab='home',monthlyPayload=null,monthlyLoading=false,monthlyError=false,monthlyAttempted=false;
const cities=window.RUDI_WEATHER?.locations||{murino:{label:'Мурино',where:'Мурино',latitude:60.0479,longitude:30.452},spb:{label:'Санкт-Петербург',where:'Санкт-Петербурге',latitude:59.9386,longitude:30.3141},moscow:{label:'Москва',where:'Москве',latitude:55.7558,longitude:37.6173},belgorod:{label:'Белгород',where:'Белгороде',latitude:50.5954,longitude:36.5873},bali:{label:'Бали',where:'Бали',latitude:-8.65,longitude:115.2167},bangkok:{label:'Бангкок',where:'Бангкоке',latitude:13.7563,longitude:100.5018},antalya:{label:'Анталья',where:'Анталье',latitude:36.8969,longitude:30.7133},cairo:{label:'Каир',where:'Каире',latitude:30.0444,longitude:31.2357}};
let city='spb',locationNote='';
const cityKey=()=> 'rudi:forecast-city:'+(document.body.dataset.rudiActor==='Диана'?'diana':'rustam');
function savedCity(){try{const value=localStorage.getItem(cityKey());return value==='auto'||Object.hasOwn(cities,value)?value:'auto'}catch(_){return 'auto'}}
function nearestCity(latitude,longitude){return Object.keys(cities).sort((a,b)=>{const distance=key=>{const place=cities[key],r=Math.PI/180;return Math.sin((latitude-place.latitude)*r/2)**2+Math.cos(latitude*r)*Math.cos(place.latitude*r)*Math.sin((longitude-place.longitude)*r/2)**2};return distance(a)-distance(b)})[0]}
async function resolveCity(choice){
 if(choice!=='auto')return {city:choice,note:''};
 if(window.RUDI_WEATHER?.getAutomaticLocation)return window.RUDI_WEATHER.getAutomaticLocation();
 try{
  const position=await new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(Error('Unavailable'));navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:6000,maximumAge:300000})});
  return {city:nearestCity(position.coords.latitude,position.coords.longitude),note:''};
 }catch(_){return {city:'spb',note:'Геопозиция недоступна. Показан Санкт-Петербург.'}}
}
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
function close(){
 if(!active)return;
 if(typeof window.RUDI_GO_BACK==='function')window.RUDI_GO_BACK(returnTab);
 else window.RUDI_NAVIGATE_TO_TAB?.(returnTab,{scroll:true});
}
function setupPage(){
 if(modal)return true;modal=document.getElementById?.('weatherForecastPage');if(!modal)return false;
 document.body.append(modal);
 modal.querySelector('.weather-forecast-back').addEventListener('click',close);
 modal.querySelector('#weatherForecastCity').addEventListener('change',event=>{
  const choice=event.target.value;try{localStorage.setItem(cityKey(),choice)}catch(_){}
  void loadForecast(choice);
 });
 for(const button of modal.querySelectorAll('[data-forecast-view]'))button.addEventListener('click',()=>{view=button.dataset.forecastView;render()});
 return true;
}
function ensureMonthly(){
 if(monthlyLoading||monthlyAttempted||!active)return;
 monthlyLoading=true;monthlyAttempted=true;monthlyError=false;const revision=generation;
 Promise.resolve().then(()=>window.RUDI_WEATHER.getMonthly({city})).then(data=>{if(active&&generation===revision)monthlyPayload=data}).catch(()=>{if(active&&generation===revision)monthlyError=true}).finally(()=>{if(active&&generation===revision){monthlyLoading=false;if(view==='month')render()}});
}
function renderAppearance(){
 const code=payload?.current?.weather_code;
 const kind=!Number.isFinite(code)?'idle':code===0||code===1?'clear':code===2?'partly':code===3?'cloudy':[45,48].includes(code)?'fog':[51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)?'rain':[71,73,75,77,85,86].includes(code)?'snow':[95,96,99].includes(code)?'storm':'idle';
 modal.dataset.weather=kind;
 const now=modal.querySelector('.weather-forecast-now'),temperature=payload?.current?.temperature_2m;
 now.querySelector('div>span').textContent='Сейчас в '+cities[city].where;
 now.hidden=kind==='idle'||!Number.isFinite(temperature);
 if(!now.hidden){
  now.querySelector('.weather-forecast-now-temperature').textContent=number(temperature,'°');
  now.querySelector('.weather-forecast-now-description').textContent={clear:'Солнечно',partly:'Переменная облачность',cloudy:'Облачно',rain:'Дождь',snow:'Снег',fog:'Туман',storm:'Гроза'}[kind];
 }
 let animate=!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 if(['rain','snow','storm'].includes(kind))try{const actor=document.body.dataset.rudiActor==='Диана'?'diana':'rustam';animate=animate&&localStorage.getItem('rudi:weather-effects:'+(kind==='snow'?'snow':'rain')+':'+actor)!=='0'}catch(_){}
 modal.dataset.weatherAnimation=animate?'on':'off';
}
function render(){
 if(!modal||!active)return;
 renderAppearance();
 const content=modal.querySelector('.weather-forecast-content'),controls=modal.querySelector('.weather-forecast-controls'),status=modal.querySelector('.weather-forecast-status');content.replaceChildren();controls.replaceChildren();content.scrollTop=0;
 for(const button of modal.querySelectorAll('[data-forecast-view]')){const active=button.dataset.forecastView===view;button.setAttribute('aria-selected',String(active));button.classList.toggle('is-active',active)}
 if(!payload)return;
 const data=model(payload),days=data.days.filter(day=>day.date>=today()),hours=data.hours,first=days[0]?.date,last=days.at(-1)?.date;
 status.textContent=(payload.stale||navigator.onLine===false?'Сохранённый прогноз · ':'')+(locationNote?locationNote+' ':'')+cities[city].label+' · '+(first&&last?label(first)+' — '+label(last):'Нет данных')+'. За этим горизонтом данных нет.';
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
  if(currentRow){const activeModal=modal;const revealCurrent=()=>{if(modal===activeModal&&active&&currentRow.isConnected&&view==='day')content.scrollTop=Math.max(0,content.scrollTop+currentRow.getBoundingClientRect().top-content.getBoundingClientRect().top)};revealCurrent();window.requestAnimationFrame(()=>window.requestAnimationFrame(revealCurrent))}return;
 }
 if(view==='week'){
  const list=node('div',undefined,'weather-forecast-week');
  for(const day of days.slice(0,7)){const row=node('div',undefined,'weather-forecast-day');row.append(node('strong',label(day.date)),node('b',(Number.isFinite(day.code)?emoji(day.code)+' ':'')+number(day.min,'°')+'…'+number(day.max,'°')),node('span','Осадки '+number(day.rain,' мм')+' · '+number(day.probability,'%')),node('span','Ветер до '+number(day.wind,' км/ч')));list.append(row)}
  content.append(list);return;
 }
 ensureMonthly();
 status.textContent=(locationNote?locationNote+' ':'')+cities[city].label+' · Текущий и следующий месяц';
 const monthlyDays=new Map((monthlyPayload?.days||[]).map(day=>[day.date,{...day,preliminary:true}]));for(const day of days)monthlyDays.set(day.date,day);
 const current=today().slice(0,7),nextDate=new Date(current+'-01T12:00:00Z');nextDate.setUTCMonth(nextDate.getUTCMonth()+1);
 const chooser=node('div',undefined,'weather-forecast-month-buttons');chooser.setAttribute('role','group');chooser.setAttribute('aria-label','Месяц прогноза');
 for(const [key,title] of [[current,'Текущий месяц'],[nextDate.toISOString().slice(0,7),'Следующий месяц']]){
  const button=node('button',title);button.type='button';button.setAttribute('aria-pressed',String(key===month));button.classList.toggle('is-active',key===month);
  button.addEventListener('click',()=>{month=key;render()});chooser.append(button);
 }
 controls.append(chooser);
 content.append(node('p',new Date(month+'-01T12:00:00Z').toLocaleDateString('ru-RU',{month:'long',year:'numeric',timeZone:'Europe/Moscow'}),'weather-forecast-month-title'));
 if(monthlyLoading||monthlyError)content.append(node('p',monthlyLoading?'Загружаю долгосрочный прогноз…':'Долгосрочный прогноз сейчас недоступен. Показываю доступные дни.','weather-forecast-hint'));
 if(monthlyPayload?.stale)content.append(node('p','Долгосрочные данные сохранены ранее.','weather-forecast-hint'));
 const grid=node('div',undefined,'weather-forecast-month');grid.setAttribute('aria-label','Прогноз на месяц');
 for(const weekday of ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'])grid.append(node('strong',weekday));
 const firstDate=month===current?today():month+'-01',start=new Date(firstDate+'T12:00:00Z'),offset=(start.getUTCDay()+6)%7,total=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
 for(let i=0;i<offset;i++)grid.append(node('div'));
 for(let day=start.getUTCDate();day<=total;day++){
  const date=month+'-'+String(day).padStart(2,'0'),forecast=monthlyDays.get(date),cell=node('div',undefined,'weather-forecast-cell'+(forecast?'':' is-unavailable'));
  if(date===today())cell.classList.add('is-today');
  if(forecast?.preliminary){cell.classList.add('is-preliminary');cell.title='Предварительный долгосрочный прогноз ECMWF';}
  cell.append(node('b',String(day)));
  if(forecast&&Number.isFinite(forecast.code)){const icon=node('span',emoji(forecast.code),'weather-forecast-cell-icon');icon.setAttribute('aria-hidden','true');cell.append(icon)}
  cell.append(node('span',forecast?(forecast.preliminary?'≈ ':'')+number(forecast.min,'°')+'…'+number(forecast.max,'°'):'нет данных','weather-forecast-cell-temperature'));grid.append(cell);
 }
 content.append(grid);
}
async function loadForecast(choice){
 const revision=++generation;payload=null;monthlyPayload=null;monthlyLoading=false;monthlyError=false;monthlyAttempted=false;
 modal.querySelector('.weather-forecast-status').textContent=choice==='auto'?'Определяю город…':'Загружаю прогноз…';render();
 try{
  const resolved=await resolveCity(choice);if(!active||generation!==revision)return;city=resolved.city;locationNote=resolved.note;
  const data=await window.RUDI_WEATHER.get({forecast:true,city});if(!active||generation!==revision)return;
  payload=data;if(!data.daily?.time?.includes(selected))selected=data.daily?.time?.find(date=>date>=today())||selected;render();
 }catch(_){if(active&&generation===revision)modal.querySelector('.weather-forecast-status').textContent=navigator.onLine===false?'Офлайн. Свежий прогноз недоступен.':'Не удалось загрузить прогноз. Выбери город ещё раз.'}
}
async function activate(){
 if(!setupPage())return;if(active)return activation;
 active=true;selected=today();month=selected.slice(0,7);view='day';
 const choice=savedCity();modal.querySelector('#weatherForecastCity').value=choice;
 activation=loadForecast(choice);return activation;
}
async function open(){
 const source=document.body?.dataset.appTab||'home';if(source!=='weather')returnTab=source;
 window.RUDI_NAVIGATE_TO_TAB?.('weather',{scroll:true});
 // Animated navigation reveals the section later; its route event activates it.
 if(document.body?.dataset.appTab==='weather')return activate();
}
function routeChanged(event){
 if((event?.detail?.tab||document.body?.dataset.appTab)==='weather')void activate();
 else if(active){active=false;generation++}
}
window.addEventListener?.('rudi:app-tab-change',routeChanged);
document.addEventListener('click',event=>{const trigger=event.target.closest?.('[data-weather-forecast]');if(trigger){event.preventDefault();void open()}});
function initialize(){setupPage();if(document.body?.dataset.appTab==='weather')void activate()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
async function renderCalendarDay(target,date){
 for(const existing of target.querySelectorAll('.calendar-day-weather'))existing.remove();
 const card=node('section',undefined,'calendar-day-weather');card.dataset.date=date;card.setAttribute('aria-label','Погода на '+label(date));
 card.append(node('strong','Прогноз на день'),node('p','Загружаю прогноз…'));target.append(card);
 if(date<today()){card.querySelector('p').textContent='Прогноз на прошедшие даты недоступен.';return}
 try{
  const data=await window.RUDI_WEATHER.get(),day=model(data).days.find(item=>item.date===date);
  if(!card.isConnected)return;
  card.replaceChildren(node('strong','Прогноз на день'));
  if(!day||!Number.isFinite(day.min)||!Number.isFinite(day.max)){
   card.append(node('p','Прогноз на эту дату пока недоступен.'));return;
  }
  card.append(node('b',(Number.isFinite(day.code)?emoji(day.code)+' ':'')+number(day.min,'°')+'…'+number(day.max,'°'),'calendar-day-weather-temperature'));
  const detail=['Санкт-Петербург'];
  if(Number.isFinite(day.probability))detail.push('Осадки '+number(day.probability,'%'));
  else if(Number.isFinite(day.rain))detail.push('Осадки '+number(day.rain,' мм'));
  if(Number.isFinite(day.wind))detail.push('Ветер до '+number(day.wind,' км/ч'));
  if(data.stale||navigator.onLine===false)detail.push('Сохранённый прогноз');
  card.append(node('p',detail.join(' · ')));
 }catch(_){if(card.isConnected)card.querySelector('p').textContent='Не удалось загрузить прогноз.'}
}
function periodTemperatures(data,date){
 const groups={morning:[],day:[],evening:[]};
 for(const item of model(data).hours){if(item.date!==date||!Number.isFinite(item.temperature))continue;const h=Number(item.time.slice(11,13));const key=h>=6&&h<12?'morning':h>=12&&h<18?'day':h>=18&&h<24?'evening':'';if(key)groups[key].push(item.temperature)}
 return Object.fromEntries(Object.entries(groups).map(([key,values])=>[key,values.length?{min:Math.min(...values),max:Math.max(...values)}:null]));
}
function periodForecast(data,date){
 const groups={morning:[],day:[],evening:[]},validCodes=new Set([0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
 for(const item of model(data).hours){if(item.date!==date)continue;const h=Number(item.time.slice(11,13)),key=h>=6&&h<12?'morning':h>=12&&h<18?'day':h>=18&&h<24?'evening':'';if(key)groups[key].push(item)}
 return Object.fromEntries(Object.entries(groups).map(([key,rows])=>{
  if(!rows.length)return [key,null];const temps=rows.map(x=>x.temperature).filter(Number.isFinite),winds=rows.map(x=>x.wind).filter(v=>Number.isFinite(v)&&v>=0),chances=rows.map(x=>x.probability).filter(v=>Number.isFinite(v)&&v>=0&&v<=100),codes=rows.map(x=>x.code).filter(v=>Number.isFinite(v)&&validCodes.has(v)),counts=new Map();
  for(const code of codes)counts.set(code,(counts.get(code)||0)+1);
  const code=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]??null;
  return [key,{min:temps.length?Math.min(...temps):null,max:temps.length?Math.max(...temps):null,code,wind:winds.length?Math.round(Math.max(...winds)/3.6*10)/10:null,probability:chances.length?Math.max(...chances):null}];
 }));
}
async function renderCalendarPeriods(target,date){
 if(date<today())return;
 try{const data=await window.RUDI_WEATHER.get({forecast:true});if(!target.isConnected||target.dataset.calendarWeatherDate!==date)return;const periods=periodForecast(data,date);for(const el of target.querySelectorAll('[data-weather-period]')){const value=periods[el.dataset.weatherPeriod],parts=[];if(value){if(value.code!==null)parts.push(emoji(value.code));if(value.min!==null&&value.max!==null)parts.push(number(value.min)+'…'+number(value.max,'°'));if(value.wind!==null)parts.push('💨 до '+String(value.wind).replace('.',',')+' м/с');if(value.probability!==null)parts.push('☔ до '+number(value.probability,'%'))}el.textContent=parts.length?' ('+parts.join(' · ')+')':'';el.title=parts.length?(data.stale?'Сохранённый почасовой прогноз; ветер и вероятность — максимум за период':'Почасовой прогноз; ветер и вероятность — максимум за период'):''}}catch(_){}
}
async function renderCalendarHours(target,date){
 if(date<today())return;
 try{
  const data=await window.RUDI_WEATHER.get({forecast:true});
  if(!target.isConnected||target.dataset.calendarWeatherDate!==date)return;
  const hours=new Map(model(data).hours.filter(row=>row.date===date).map(row=>[row.time.slice(11,13),row]));
  for(const el of target.querySelectorAll('[data-weather-hour]')){
   const row=hours.get(el.dataset.weatherHour),parts=[];
   if(Number.isFinite(row?.temperature)){const code=Number.isFinite(row.code)&&[0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(row.code)?emoji(row.code)+' ':'';parts.push(code+number(row.temperature,'°'))}
   el.replaceChildren(...parts.map(part=>node('span',part)));
   const precipitation=[71,73,75,77,85,86].includes(row?.code)?'snow':[51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(row?.code)?'rain':'';
   if(parts.length&&precipitation){
    el.dataset.precipitation=precipitation;
    const particles=node('span',undefined,'calendar-hour-precipitation');particles.setAttribute('aria-hidden','true');
    for(let i=0;i<3;i++)particles.appendChild(node('i'));
    el.appendChild(particles);
   }else delete el.dataset.precipitation;
   el.hidden=!parts.length;
   el.setAttribute('aria-label',el.dataset.weatherHour+':00: '+parts.join(', '));
   el.title=(data.stale?'Сохранённый почасовой прогноз':'Почасовой прогноз')+' · '+date+' '+el.dataset.weatherHour+':00';
  }
 }catch(_){}
}
window.RUDI_WEATHER_FORECAST={nearestCity,model,open,close,currentHourTime,renderCalendarDay,periodTemperatures,periodForecast,renderCalendarPeriods,renderCalendarHours};
})();
