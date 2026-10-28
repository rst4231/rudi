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
function interactiveFixture(now='2026-10-18T06:37:00Z'){
 const fixed=Date.parse(now);
 class Clock extends Date{constructor(...args){super(...(args.length?args:[fixed]))}static now(){return fixed}}
 let root;
 function make(tag){
  const el={tag,children:[],handlers:{},dataset:{},style:{},attrs:{},className:'',scrollTop:0,isConnected:true,
   append(...items){for(const item of items){item.parent=this;this.children.push(item)}},
   replaceChildren(...items){for(const child of this.children)child.isConnected=false;this.children=[];this.append(...items)},
   addEventListener(type,fn){this.handlers[type]=fn},setAttribute(key,value){this.attrs[key]=value},focus(){},remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);if(root===this)root=null},
   querySelectorAll(selector){const all=[];const visit=node=>{for(const child of node.children){if(selector==='[data-forecast-view]'?!!child.dataset.forecastView:selector.startsWith('.')?child.className.split(' ').includes(selector.slice(1)):child.tag===selector)all.push(child);visit(child)}};visit(this);return all},
   querySelector(selector){return this.querySelectorAll(selector)[0]}};
  el.classList={add(...names){el.className=[...new Set([...el.className.split(' '),...names])].join(' ').trim()},toggle(name,active){if(active)this.add(name);else el.className=el.className.split(' ').filter(x=>x!==name).join(' ')}};
  Object.defineProperty(el,'offsetTop',{get(){return el.className.includes('weather-forecast-hour')&&el.parent?el.parent.children.indexOf(el)*64:0}});
  Object.defineProperty(el,'innerHTML',{set(html){for(const match of html.matchAll(/<([a-z][a-z0-9-]*)([^>]*)>/gi)){const child=make(match[1]);for(const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)){if(attr[1]==='class')child.className=attr[2];else if(attr[1]==='data-forecast-view')child.dataset.forecastView=attr[2];else child.setAttribute(attr[1],attr[2])}this.append(child)}}});
  return el;
 }
 const document={createElement:make,addEventListener(){},querySelector(){return null},documentElement:{style:{}},body:{style:{},append(value){root=value}}};
 const fixtureHours=Array.from({length:48},(_,i)=>'2026-10-'+(i<24?'18':'19')+'T'+String(i%24).padStart(2,'0')+':00');
 const window={scrollTo(){},requestAnimationFrame(fn){fn()},RUDI_WEATHER:{get:async()=>({daily:{time:['2026-10-18','2026-10-19'],temperature_2m_min:[5,4],temperature_2m_max:[10,8],weather_code:[0,61]},hourly:{time:fixtureHours,temperature_2m:fixtureHours.map(()=>9),weather_code:fixtureHours.map(()=>61)}})}};
 vm.runInNewContext(fs.readFileSync('public/weather-forecast.js','utf8'),{window,document,Date:Clock,Intl,navigator:{onLine:true}});
 return {api:window.RUDI_WEATHER_FORECAST,root:()=>root,window,document,make};
}
test('real forecast rendering scrolls today, retains all hours, and resets a different date',async()=>{
 const f=interactiveFixture();await f.api.open();
 const content=f.root().querySelector('.weather-forecast-content');
 assert.equal(content.querySelectorAll('.weather-forecast-hour').length,24);
 assert.equal(content.querySelector('.is-current').dataset.forecastTime,'2026-10-18T09:00');
 assert.ok(content.scrollTop>0);
 const select=f.root().querySelector('.weather-forecast-controls').querySelector('select');select.value='2026-10-19';select.handlers.change();
 assert.equal(content.scrollTop,0);assert.equal(content.querySelector('.is-current'),undefined);
 f.api.close();
});
test('month rendering adds actual weather icons only to days with known forecasts',async()=>{
 const f=interactiveFixture();await f.api.open();
 f.root().querySelectorAll('[data-forecast-view]').find(b=>b.dataset.forecastView==='month').handlers.click();
 const content=f.root().querySelector('.weather-forecast-content');
 assert.equal(content.querySelectorAll('.weather-forecast-cell').length,14);
 assert.equal(content.querySelectorAll('.weather-forecast-cell')[0].children[0].textContent,'18');
 assert.deepEqual(content.querySelectorAll('.weather-forecast-cell-icon').map(x=>x.textContent),['☀️','🌧️']);
 assert.equal(content.querySelectorAll('.is-unavailable').length,12);
 assert.equal(content.querySelector('.is-today').children[0].textContent,'18');
 f.api.close();
});

test('month has two direct buttons, next month starts on day one, and switching back starts today',async()=>{
 const f=interactiveFixture();await f.api.open();
 f.root().querySelectorAll('[data-forecast-view]').find(b=>b.dataset.forecastView==='month').handlers.click();
 const controls=()=>f.root().querySelector('.weather-forecast-controls');
 assert.equal(controls().querySelectorAll('select').length,0);
 let buttons=controls().querySelectorAll('button');
 assert.deepEqual(buttons.map(b=>b.textContent),['Текущий месяц','Следующий месяц']);
 buttons[1].handlers.click();
 let cells=f.root().querySelectorAll('.weather-forecast-cell');
 assert.equal(cells.length,30);assert.equal(cells[0].children[0].textContent,'1');
 buttons=controls().querySelectorAll('button');buttons[0].handlers.click();
 cells=f.root().querySelectorAll('.weather-forecast-cell');
 assert.equal(cells.length,14);assert.equal(cells[0].children[0].textContent,'18');
 f.api.close();
});
test('opening locks body position and root scrolling, closing restores both',async()=>{
 const f=interactiveFixture();Object.assign(f.document.body.style,{position:'relative',top:'2px',overflow:'auto'});
 f.window.scrollY=320;f.window.scrollX=0;let restored;
 f.window.scrollTo=(x,y)=>{restored=[x,y]};await f.api.open();
 assert.equal(f.root().attrs['data-no-pull-refresh'],'true');assert.equal(f.root().attrs['data-no-swipe-back'],'true');
 assert.equal(f.document.body.style.position,'fixed');assert.equal(f.document.body.style.top,'-320px');
 assert.equal(f.document.documentElement.style.overflow,'hidden');
 f.api.close();assert.equal(f.document.body.style.position,'relative');assert.equal(f.document.body.style.top,'2px');
 assert.equal(f.document.body.style.overflow,'auto');assert.deepEqual(restored,[0,320]);
});
test('calendar forecast uses the selected date and does not invent unavailable temperatures',async()=>{
 const f=interactiveFixture(),target=f.make('div');
 await f.api.renderCalendarDay(target,'2026-10-19');
 const card=target.querySelector('.calendar-day-weather');
 assert.ok(card);assert.equal(card.querySelector('strong').textContent,'Прогноз на день');
 assert.match(card.querySelector('.calendar-day-weather-temperature').textContent,/4°.*8°/);
 await f.api.renderCalendarDay(target,'2026-11-25');
 assert.equal(target.querySelectorAll('.calendar-day-weather').length,1);
 assert.match(target.querySelector('.calendar-day-weather').querySelector('p').textContent,/Прогноз на эту дату пока недоступен/);
});

test('swiping beyond forecast edges is contained while swiping the middle remains scrollable',async()=>{
 const f=interactiveFixture();await f.api.open();
 const content=f.root().querySelector('.weather-forecast-content');
 Object.assign(content,{scrollHeight:600,clientHeight:200,scrollTop:0});
 let prevented=false;const wheel=deltaY=>{prevented=false;f.root().handlers.wheel({target:{closest:()=>content},deltaY,preventDefault(){prevented=true}});return prevented};
 assert.equal(wheel(-30),true);assert.equal(wheel(30),false);
 content.scrollTop=400;assert.equal(wheel(30),true);
 content.scrollTop=200;assert.equal(wheel(-30),false);
 f.api.close();
});

test('December month buttons correctly move into January of the following year',async()=>{
 const f=interactiveFixture('2026-12-31T12:00:00Z');await f.api.open();
 f.root().querySelectorAll('[data-forecast-view]').find(b=>b.dataset.forecastView==='month').handlers.click();
 assert.equal(f.root().querySelectorAll('.weather-forecast-cell').length,1);
 f.root().querySelector('.weather-forecast-controls').querySelectorAll('button')[1].handlers.click();
 assert.equal(f.root().querySelectorAll('.weather-forecast-cell').length,31);
 assert.match(f.root().querySelector('.weather-forecast-month-title').textContent,/январь 2027/);
 f.api.close();
});
test('a slow response for the previous calendar day never replaces the new selection',async()=>{
 const f=interactiveFixture(),target=f.make('div');let resolve;
 f.window.RUDI_WEATHER.get=()=>new Promise(done=>{resolve=done});
 const old=f.api.renderCalendarDay(target,'2026-10-18'),finishOld=resolve;
 const current=f.api.renderCalendarDay(target,'2026-10-19'),finishCurrent=resolve;
 const payload={daily:{time:['2026-10-18','2026-10-19'],temperature_2m_min:[1,4],temperature_2m_max:[2,8]}};
 finishCurrent(payload);await current;finishOld(payload);await old;
 assert.equal(target.querySelectorAll('.calendar-day-weather').length,1);
 assert.equal(target.querySelector('.calendar-day-weather').dataset.date,'2026-10-19');
 assert.equal(target.querySelector('.calendar-day-weather-temperature').textContent,'4°…8°');
});
