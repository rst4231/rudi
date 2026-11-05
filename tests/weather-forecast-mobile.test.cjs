'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={},document={addEventListener(){}};
vm.runInNewContext(fs.readFileSync('public/weather-forecast.js','utf8'),{window,document});
const api=window.RUDI_WEATHER_FORECAST;
const hours=['08','09','10','11','23'].map(hour=>({date:'2026-10-18',time:'2026-10-18T'+hour+':00'}));
test('opening today reveals the current Moscow hour, regardless of device timezone',()=>{
 assert.equal(api.currentHourTime(hours,'2026-10-18',Date.parse('2026-10-18T06:37:00Z')),'2026-10-18T09:00');
});
test('other forecast dates start at the beginning instead of jumping to the current hour',()=>{
 assert.equal(api.currentHourTime(hours,'2026-10-19',Date.parse('2026-10-18T06:37:00Z')),null);
});
test('a missing current hour reveals the next available hour without fabricating a row',()=>{
 assert.equal(api.currentHourTime(hours.filter(h=>!h.time.includes('T09')),'2026-10-18',Date.parse('2026-10-18T06:37:00Z')),'2026-10-18T10:00');
 assert.equal(api.currentHourTime([],'2026-10-18',Date.parse('2026-10-18T06:37:00Z')),null);
});
test('Moscow midnight selects the new day while UTC is still on the previous day',()=>{
 const midnight=[{date:'2026-10-19',time:'2026-10-19T00:00'}];
 assert.equal(api.currentHourTime(midnight,'2026-10-19',Date.parse('2026-10-18T21:05:00Z')),'2026-10-19T00:00');
});
const {JSDOM}=require('jsdom');
function interactiveFixture(now='2026-10-18T06:37:00Z',options={}){
 const fixed=Date.parse(now);class Clock extends Date{constructor(...args){super(...(args.length?args:[fixed]))}static now(){return fixed}}
 const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'https://rudi.test/',runScripts:'outside-only'}),window=dom.window,document=window.document;window.Date=Clock;
 document.body.dataset.appTab=options.initialTab||'home';window.scrollTo=()=>{};window.requestAnimationFrame=options.deferAnimationFrame?()=>{}:fn=>fn();
 const calls={get:0,months:0};let back;
 const navigate=tab=>{document.body.dataset.appTab=tab;window.history.pushState({},'',tab==='home'?'/':'/?tab='+tab);window.dispatchEvent(new window.CustomEvent('rudi:app-tab-change',{detail:{tab}}));document.querySelectorAll('[data-app-tab-section]').forEach(section=>section.hidden=section.dataset.appTabSection!==tab)};
 window.RUDI_NAVIGATE_TO_TAB=tab=>{if(options.deferNavigation)window.completeNavigation=()=>navigate(tab);else navigate(tab)};
 window.RUDI_GO_BACK=fallback=>{back=fallback;window.RUDI_NAVIGATE_TO_TAB(fallback)};
 const fixtureHours=Array.from({length:48},(_,i)=>'2026-10-'+(i<24?'18':'19')+'T'+String(i%24).padStart(2,'0')+':00');
 const data={daily:{time:['2026-10-18','2026-10-19'],temperature_2m_min:[5,4],temperature_2m_max:[10,8],weather_code:[0,61]},hourly:{time:fixtureHours,temperature_2m:fixtureHours.map(()=>9),weather_code:fixtureHours.map(()=>61)}};
 window.RUDI_WEATHER={get:async()=>{calls.get++;return data},getMonthly:async()=>{calls.months++;return {days:[{date:'2026-10-18',min:-99,max:99},{date:'2026-11-25',min:-5,max:1}]}}};
 if(options.get)window.RUDI_WEATHER.get=options.get;if(options.monthly)window.RUDI_WEATHER.getMonthly=options.monthly;
 window.eval(fs.readFileSync('public/weather-forecast.js','utf8'));document.dispatchEvent(new window.Event('DOMContentLoaded'));
 return {api:window.RUDI_WEATHER_FORECAST,root:()=>document.getElementById('weatherForecastPage'),window,document,calls,get back(){return back},dom,make:tag=>{const el=document.createElement(tag);document.body.append(el);return el}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('weekly hour gaps show condition emoji and temperature without wind or rain percentages',async()=>{
 const f=interactiveFixture(undefined,{get:async()=>({hourly:{time:['2026-10-18T12:00','2026-10-18T13:00','2026-10-19T12:00'],temperature_2m:[6,7,99],weather_code:[0,3,61],precipitation_probability:[0,35,99],wind_speed_10m:[10.8,0,99]}})});
 try{const host=f.make('div');host.dataset.calendarWeatherDate='2026-10-18';host.innerHTML='<span data-weather-hour="12" hidden></span><span data-weather-hour="13" hidden></span><span data-weather-hour="14" hidden></span>';
 await f.api.renderCalendarHours(host,'2026-10-18');const labels=host.querySelectorAll('[data-weather-hour]');assert.equal(labels[0].hidden,false);assert.deepEqual([...labels[0].children].map(x=>x.textContent),['☀️ 6°']);assert.deepEqual([...labels[1].children].map(x=>x.textContent),['☁️ 7°']);assert.equal(labels[2].hidden,true);
 }finally{f.dom.window.close()}
});
test('late hourly weather cannot fill a different selected date',async()=>{
 let resolve;const f=interactiveFixture(undefined,{get:()=>new Promise(done=>{resolve=done})});try{const host=f.make('div');host.dataset.calendarWeatherDate='2026-10-18';host.innerHTML='<span data-weather-hour="12" hidden></span>';const request=f.api.renderCalendarHours(host,'2026-10-18');await tick();host.dataset.calendarWeatherDate='2026-10-19';resolve({hourly:{time:['2026-10-18T12:00'],temperature_2m:[6]}});await request;assert.equal(host.firstChild.hidden,true);assert.equal(host.firstChild.textContent,'')}finally{f.dom.window.close()}
});
test('hourly precipitation decoration follows rain and snow codes and stays absent for clouds',async()=>{
 const f=interactiveFixture(undefined,{get:async()=>({hourly:{time:['2026-10-18T12:00','2026-10-18T13:00','2026-10-18T14:00'],temperature_2m:[5,-2,6],weather_code:[61,73,3],precipitation_probability:[90,95,0]}})});
 try{const host=f.make('div');host.dataset.calendarWeatherDate='2026-10-18';host.innerHTML=[12,13,14].map(h=>'<span data-weather-hour="'+h+'" hidden></span>').join('');await f.api.renderCalendarHours(host,'2026-10-18');const rows=host.children;assert.equal(rows[0].dataset.precipitation,'rain');assert.equal(rows[1].dataset.precipitation,'snow');assert.equal(rows[2].dataset.precipitation,undefined);for(const row of [rows[0],rows[1]]){assert.equal(row.querySelector('.calendar-hour-precipitation').getAttribute('aria-hidden'),'true');assert.equal(row.querySelectorAll('i').length,3);assert.ok(!row.textContent.includes('%'))}assert.equal(rows[2].querySelector('.calendar-hour-precipitation'),null);
 }finally{f.dom.window.close()}
});
const clickView=(f,view)=>f.root().querySelector('[data-forecast-view="'+view+'"]').click();
test('forecast opens as a routed page without a dialog or locking the body',async()=>{
 const f=interactiveFixture();await f.api.open();assert.equal(f.document.body.dataset.appTab,'weather');assert.equal(f.window.location.search,'?tab=weather');assert.ok(f.root());assert.equal(f.root().matches('[role="dialog"]'),false);assert.equal(f.document.querySelector('.weather-forecast-backdrop'),null);assert.equal(f.document.body.style.position,'');assert.equal(f.root().querySelectorAll('.weather-forecast-hour').length,24);assert.equal(f.root().querySelector('.is-current').dataset.forecastTime,'2026-10-18T09:00');assert.equal(f.calls.months,0);f.dom.window.close();
});
test('opening positions the current hour immediately before animation frames run',async()=>{
 const f=interactiveFixture(undefined,{deferAnimationFrame:true});
 f.window.HTMLElement.prototype.getBoundingClientRect=function(){const content=f.root()?.querySelector('.weather-forecast-content'),row=this.classList.contains('weather-forecast-hour'),index=row?[...this.parentNode.children].indexOf(this):0;return {top:120+(row?index*64-(content?.scrollTop||0):0)}};
 await f.api.open();assert.equal(f.root().querySelector('.weather-forecast-content').scrollTop,9*64);f.dom.window.close();
});
test('current-hour positioning waits for a delayed app page transition to reveal the section',async()=>{
 const f=interactiveFixture(undefined,{deferAnimationFrame:true,deferNavigation:true});
 f.window.HTMLElement.prototype.getBoundingClientRect=function(){if(f.root().hidden)return {top:0};const content=f.root().querySelector('.weather-forecast-content'),row=this.classList.contains('weather-forecast-hour');return {top:120+(row?[...this.parentNode.children].indexOf(this)*64-content.scrollTop:0)}};
 await f.api.open();assert.equal(f.calls.get,0);f.window.completeNavigation();await tick();assert.equal(f.root().hidden,false);assert.equal(f.root().querySelector('.weather-forecast-content').scrollTop,576);f.dom.window.close();
});
test('pulling down anywhere on the weather page never requests an app refresh',async()=>{
 const f=interactiveFixture();await f.api.open();let refreshes=0;
 f.window.isStandalonePwa=()=>true;f.window.appAccessReady=true;f.window.currentActor='Рустам';f.window.calendarDisplayMode='month';f.window.refreshAppDataNow=()=>{refreshes++};
 const app=fs.readFileSync('public/app.js','utf8'),start=app.indexOf('      function setupBrowserPullToRefresh(){'),end=app.indexOf('\n      function ',start+1);f.window.eval(app.slice(start,end)+';setupBrowserPullToRefresh();');
 for(const [type,y] of [['touchstart',0],['touchmove',400],['touchend',400]]){const event=new f.window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:type==='touchend'?[]:[{clientY:y}]});f.document.body.dispatchEvent(event)}
 assert.equal(refreshes,0);assert.equal(f.root().dataset.noPullRefresh,'true');f.dom.window.close();
});
test('page appearance follows current conditions and stays unchanged when viewing another forecast day',async()=>{
 for(const [code,kind,label] of [[0,'clear','Солнечно'],[2,'partly','Переменная облачность'],[3,'cloudy','Облачно'],[61,'rain','Дождь'],[75,'snow','Снег'],[45,'fog','Туман'],[95,'storm','Гроза']]){
  const f=interactiveFixture(undefined,{get:async()=>({current:{temperature_2m:4,weather_code:code},daily:{time:['2026-10-18','2026-10-19'],temperature_2m_min:[1,2],temperature_2m_max:[4,5],weather_code:[code,99]}})});
  await f.api.open();assert.equal(f.root().dataset.weather,kind);assert.match(f.root().querySelector('.weather-forecast-now').textContent,new RegExp(label));clickView(f,'week');assert.equal(f.root().dataset.weather,kind);f.dom.window.close();
 }
});
test('missing current conditions use a neutral page instead of claiming sunshine',async()=>{
 const f=interactiveFixture(undefined,{get:async()=>({daily:{time:[]}})});await f.api.open();assert.equal(f.root().dataset.weather,'idle');assert.equal(f.root().querySelector('.weather-forecast-now').hidden,true);f.dom.window.close();
});
test('month requests long-range once and keeps real short-range values over estimates',async()=>{
 const f=interactiveFixture();await f.api.open();clickView(f,'month');await tick();let cells=f.root().querySelectorAll('.weather-forecast-cell');assert.equal(cells.length,14);assert.equal(cells[0].querySelector('.weather-forecast-cell-temperature').textContent,'5°…10°');assert.equal(cells[0].classList.contains('is-preliminary'),false);
 f.root().querySelectorAll('.weather-forecast-month-buttons button')[1].click();await tick();cells=f.root().querySelectorAll('.weather-forecast-cell');assert.equal(cells.length,30);assert.match(cells[24].textContent,/≈.*-5°.*1°/);assert.equal(cells[24].querySelector('.weather-forecast-cell-icon'),null);assert.equal(f.calls.months,1);assert.doesNotMatch(f.root().textContent,/Предварительный долгосрочный прогноз/);assert.equal(f.root().querySelector('.weather-forecast-hint'),null);assert.equal(cells[24].classList.contains('is-preliminary'),true);f.dom.window.close();
});
test('smart-home weather opens the same page and back returns to its origin',async()=>{
 const f=interactiveFixture(undefined,{initialTab:'smart-home'}),trigger=f.document.querySelector('#smartHomePage .smart-home-climate-card.is-weather');assert.equal(trigger.tagName,'BUTTON');trigger.click();await tick();assert.equal(f.document.body.dataset.appTab,'weather');f.root().querySelector('.weather-forecast-back').click();assert.equal(f.back,'smart-home');f.dom.window.close();
});
test('direct weather startup loads the existing page without a click',async()=>{
 const f=interactiveFixture(undefined,{initialTab:'weather'});await tick();assert.equal(f.calls.get,1);assert.equal(f.root().querySelectorAll('.weather-forecast-hour').length,24);f.dom.window.close();
});
test('December switches to January and month request failures retain precise weather',async()=>{
 const f=interactiveFixture('2026-12-31T12:00:00Z',{monthly:async()=>{throw Error('unavailable')}});await f.api.open();clickView(f,'month');await tick();assert.equal(f.root().querySelectorAll('.weather-forecast-cell').length,1);f.root().querySelectorAll('.weather-forecast-month-buttons button')[1].click();assert.equal(f.root().querySelectorAll('.weather-forecast-cell').length,31);assert.match(f.root().querySelector('.weather-forecast-month-title').textContent,/январь 2027/);assert.match(f.root().textContent,/Долгосрочный прогноз.*недоступен/);f.dom.window.close();
});
test('a late weather response cannot navigate back from a different page',async()=>{
 let finish;const f=interactiveFixture(undefined,{get:()=>new Promise(resolve=>finish=resolve)});const opening=f.api.open();await tick();f.window.RUDI_NAVIGATE_TO_TAB('products');finish({daily:{time:[]}});await opening;assert.equal(f.document.body.dataset.appTab,'products');assert.equal(f.document.querySelector('.weather-forecast-backdrop'),null);f.dom.window.close();
});
test('calendar forecast still uses precise selected-date data and ignores detached older cards',async()=>{
 const f=interactiveFixture(),target=f.make('div');await f.api.renderCalendarDay(target,'2026-10-19');assert.match(target.querySelector('.calendar-day-weather-temperature').textContent,/4°.*8°/);await f.api.renderCalendarDay(target,'2026-11-25');assert.match(target.querySelector('p').textContent,/пока недоступен/);assert.equal(f.calls.months,0);f.dom.window.close();
});
test('calendar dayparts use only hourly temperatures for the selected date',()=>{
 const f=interactiveFixture();const data={hourly:{time:['2026-10-18T02:00','2026-10-18T06:00','2026-10-18T11:00','2026-10-18T12:00','2026-10-18T17:00','2026-10-18T18:00','2026-10-18T23:00','2026-10-19T08:00'],temperature_2m:[-99,8,10,12,15,9,6,99]}};
 assert.equal(JSON.stringify(f.api.periodTemperatures(data,'2026-10-18')),JSON.stringify({morning:{min:8,max:10},day:{min:12,max:15},evening:{min:6,max:9}}));
 assert.equal(JSON.stringify(f.api.periodTemperatures(data,'2026-10-20')),JSON.stringify({morning:null,day:null,evening:null}));
});

test('calendar dayparts include prevailing weather, maximum hourly wind and precipitation chance',()=>{
 const f=interactiveFixture(),data={hourly:{time:['2026-10-18T06:00','2026-10-18T07:00','2026-10-18T12:00'],temperature_2m:[8,10,12],weather_code:[3,3,0],wind_speed_10m:[10.8,18,7.2],precipitation_probability:[15,40,0]}};
 const p=f.api.periodForecast(data,'2026-10-18');
 assert.equal(JSON.stringify(p.morning),JSON.stringify({min:8,max:10,code:3,wind:5,probability:40}));
 assert.equal(JSON.stringify(p.day),JSON.stringify({min:12,max:12,code:0,wind:2,probability:0}));
 assert.equal(p.evening,null);
});

test('city choice persists and changes the forecast and current city label',async()=>{
 const requested=[];const f=interactiveFixture(undefined,{get:async options=>{requested.push(options.city);return {current:{temperature_2m:5,weather_code:3},daily:{time:['2026-10-18']}}}});
 try{
  await f.api.open();const select=f.document.getElementById('weatherForecastCity');assert.deepEqual([...select.options].map(o=>o.value),['murino','spb','moscow','belgorod','bali','bangkok','antalya','cairo','auto']);
  select.value='moscow';select.dispatchEvent(new f.window.Event('change'));await tick();
  assert.equal(requested.at(-1),'moscow');assert.match(f.root().querySelector('.weather-forecast-now').textContent,/Москве/);
  f.api.close();await f.api.open();assert.equal(select.value,'moscow');assert.equal(requested.at(-1),'moscow');
  assert.equal(f.root().parentElement,f.document.body);
 }finally{f.dom.window.close()}
});
test('automatic city uses geolocation and shows a fallback notice when denied',async()=>{
 const f=interactiveFixture();try{
  await f.api.open();Object.defineProperty(f.window.navigator,'geolocation',{configurable:true,value:{getCurrentPosition:resolve=>resolve({coords:{latitude:60.05,longitude:30.45}})}});
  const select=f.document.getElementById('weatherForecastCity');select.value='auto';select.dispatchEvent(new f.window.Event('change'));await tick();assert.match(f.root().querySelector('.weather-forecast-status').textContent,/Мурино/);
  Object.defineProperty(f.window.navigator,'geolocation',{value:{getCurrentPosition:(_resolve,reject)=>reject(Error('denied'))}});
  select.dispatchEvent(new f.window.Event('change'));await tick();assert.match(f.root().querySelector('.weather-forecast-status').textContent,/Геопозиция недоступна/);
  assert.equal(f.api.nearestCity(55.75,37.62),'moscow');assert.equal(f.api.nearestCity(59.94,30.31),'spb');
 }finally{f.dom.window.close()}
});
test('late city response cannot replace the currently selected city',async()=>{
 let finish;const f=interactiveFixture(undefined,{get:options=>options.city==='moscow'?new Promise(resolve=>finish=resolve):Promise.resolve({daily:{time:['2026-10-18']}})});
 try{
  await f.api.open();const select=f.document.getElementById('weatherForecastCity');select.value='moscow';select.dispatchEvent(new f.window.Event('change'));await tick();
  select.value='murino';select.dispatchEvent(new f.window.Event('change'));await tick();finish({daily:{time:['2026-10-18']}});await tick();assert.match(f.root().querySelector('.weather-forecast-status').textContent,/Мурино/);
 }finally{f.dom.window.close()}
});

test('forecast defaults to automatic and keeps an explicit saved city',async()=>{
 const f=interactiveFixture();try{
  await f.api.open();const select=f.document.getElementById('weatherForecastCity');assert.equal(select.value,'auto');
  select.value='murino';select.dispatchEvent(new f.window.Event('change'));await tick();
  f.api.close();await f.api.open();assert.equal(select.value,'murino');
 }finally{f.dom.window.close()}
});

test('all added locations are selected automatically and used for hourly and monthly requests',async()=>{
 const places=[['belgorod',50.5954,36.5873,'Белгород'],['bali',-8.65,115.2167,'Бали'],['bangkok',13.7563,100.5018,'Бангкок'],['antalya',36.8969,30.7133,'Анталья'],['cairo',30.0444,31.2357,'Каир']];
 const requested=[],monthly=[];
 const f=interactiveFixture(undefined,{get:async options=>{requested.push(options.city);return {daily:{time:['2026-10-18']}}},monthly:async options=>{monthly.push(options.city);return {days:[]}}});
 try{
  await f.api.open();const select=f.document.getElementById('weatherForecastCity');
  for(const [city,latitude,longitude,label] of places){
   assert.equal(f.api.nearestCity(latitude,longitude),city);
   select.value=city;select.dispatchEvent(new f.window.Event('change'));await tick();assert.equal(requested.at(-1),city);assert.match(f.root().querySelector('.weather-forecast-status').textContent,new RegExp(label));
   clickView(f,'month');await tick();assert.equal(monthly.at(-1),city);
  }
 }finally{f.dom.window.close()}
});

test('calendar hourly weather follows the saved city or automatic location',async()=>{
 const requests=[];const f=interactiveFixture(undefined,{get:async options=>{requests.push(options.city);return {hourly:{time:['2026-10-18T12:00'],temperature_2m:[24],weather_code:[0]}}}});
 try{
  const host=f.make('div');host.dataset.calendarWeatherDate='2026-10-18';host.innerHTML='<span data-weather-hour="12" hidden></span>';
  f.window.localStorage.setItem('rudi:forecast-city:rustam','bali');await f.api.renderCalendarHours(host,'2026-10-18');assert.equal(requests.at(-1),'bali');assert.match(host.textContent,/24°/);
  f.window.localStorage.setItem('rudi:forecast-city:rustam','auto');Object.defineProperty(f.window.navigator,'geolocation',{value:{getCurrentPosition:resolve=>resolve({coords:{latitude:13.75,longitude:100.50}})}});
  await f.api.renderCalendarHours(host,'2026-10-18');assert.equal(requests.at(-1),'bangkok');
 }finally{f.dom.window.close()}
});
