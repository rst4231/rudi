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
function interactiveFixture(){
 const fixed=Date.parse('2026-10-18T06:37:00Z');
 class Clock extends Date{constructor(...args){super(...(args.length?args:[fixed]))}static now(){return fixed}}
 let root;
 function make(tag){
  const el={tag,children:[],handlers:{},dataset:{},style:{},attrs:{},className:'',scrollTop:0,isConnected:true,
   append(...items){for(const item of items){item.parent=this;this.children.push(item)}},
   replaceChildren(){for(const child of this.children)child.isConnected=false;this.children=[]},
   addEventListener(type,fn){this.handlers[type]=fn},setAttribute(key,value){this.attrs[key]=value},focus(){},remove(){this.isConnected=false;root=null},
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
 return {api:window.RUDI_WEATHER_FORECAST,root:()=>root};
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
 assert.equal(content.querySelectorAll('.weather-forecast-cell').length,31);
 assert.deepEqual(content.querySelectorAll('.weather-forecast-cell-icon').map(x=>x.textContent),['☀️','🌧️']);
 assert.equal(content.querySelectorAll('.is-unavailable').length,29);
 assert.equal(content.querySelector('.is-today').children[0].textContent,'18');
 f.api.close();
});
