const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const script=fs.readFileSync('public/smart-home.js','utf8');
const index=fs.readFileSync('public/index.html','utf8');
const markup=index.slice(index.indexOf('<section id="smartHomeTile"'),index.indexOf('<section id="carTile"'));
const device=(id,name,type,on,battery,extra={})=>({id,name,type,room:'living',capabilities:on===null?[]:[{type:'devices.capabilities.on_off',state:{instance:'on',value:on}}],properties:battery===undefined?[]:[{type:'devices.properties.float',parameters:{instance:'battery_level'},state:{instance:'battery_level',value:battery}}],...extra});
const devices=[device('light-123','Торшер','devices.types.light',true),device('socket-123','Розетка','devices.types.socket',false),device('lost-123','Нет связи','devices.types.light',true,undefined,{online:false}),device('sensor-123','Датчик','devices.types.sensor',null,5),device('sensor-456','Датчик 10','devices.types.sensor',null,10),device('sensor-789','Без батареи','devices.types.sensor',null,null),device('camera-123','Камера','devices.types.camera',true)];
async function setup(actor='Рустам',items=devices){
 const dom=new JSDOM('<!doctype html><body class="auth-ok" data-rudi-actor="'+actor+'">'+markup+'</body>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[];let fail=false;
 w.RUDI_WEATHER={get:async()=>({current:{temperature_2m:8,weather_code:3}})};
 w.RUDI_NAVIGATE_TO_TAB=tab=>{w.document.body.dataset.appTab=tab};w.RUDI_GO_BACK=()=>{w.document.body.dataset.appTab='home'};
 w.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);if(fail)throw new Error('network failed');return {ok:true,json:async()=>body.operation==='list'?{ok:true,actor:w.document.body.dataset.rudiActor,rooms:[{id:'living',name:'Гостиная'}],devices:structuredClone(items),scenarios:[]}:{ok:true,status:'DONE'}}};
 w.eval(script);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 await new Promise(r=>setTimeout(r,30));
 return {dom,w,d:w.document,calls,setFail:v=>{fail=v},close:()=>dom.window.close()};
}
test('home summary excludes unavailable devices and shows only valid low batteries',async()=>{
 const t=await setup();try{
 const summary=t.d.getElementById('smartHomeSummary');assert.ok(summary,'home device overview exists');
 assert.match(summary.textContent,/Торшер/);assert.doesNotMatch(t.d.getElementById('smartHomeActiveDevices').textContent,/Нет связи|Розетка/);
 const low=t.d.getElementById('smartHomeLowBattery');assert.match(low.textContent,/Датчик.*5%/);assert.doesNotMatch(low.textContent,/Датчик 10|Без батареи/);
 assert.equal(t.d.getElementById('smartHomeTile').contains(t.d.getElementById('smartHomeRooms')),false);
 assert.equal(t.d.getElementById('smartHomePage').contains(t.d.getElementById('smartHomeRooms')),true);
 t.d.getElementById('smartHomePageOpen').click();assert.equal(t.d.body.dataset.appTab,'smart-home');
 t.d.getElementById('smartHomePageBack').click();assert.equal(t.d.body.dataset.appTab,'home');
 assert.equal(t.calls.filter(x=>x.operation==='list').length,1);
 }finally{t.close()}
});
test('quick power control updates both views with one command and locks offline',async()=>{
 const t=await setup();try{
 const control=t.d.querySelector('#smartHomeActiveDevices button[aria-label="Выключить Торшер"]');assert.ok(control,'direct power control');control.click();await new Promise(r=>setTimeout(r,20));
 assert.equal(t.calls.filter(x=>x.operation==='switch').length,1);assert.doesNotMatch(t.d.getElementById('smartHomeActiveDevices').textContent,/Торшер/);
 assert.ok(t.d.querySelector('#smartHomeRooms button[aria-label="Включить Торшер"]'));
 t.d.body.dataset.offlineMode='1';t.w.dispatchEvent(new t.w.Event('offline'));
 assert.ok([...t.d.querySelectorAll('#smartHomeRooms .smart-home-power-icon')].every(x=>x.disabled));
 assert.match(t.d.getElementById('smartHomeSummaryUpdated').textContent,/Последние данные/);
 }finally{t.close()}
});
test('actor privacy and failed refresh preserve honest states without exposing previous actor',async()=>{
 const t=await setup('Диана');try{
 assert.doesNotMatch(t.d.getElementById('smartHomeActiveDevices')?.textContent||'',/Камера/);
 t.setFail(true);t.d.body.dataset.rudiActor='Рустам';await t.w.RUDI_SMART_HOME.refresh();
 assert.equal(t.d.getElementById('smartHomeActiveDevices')?.children.length,0);
 assert.match(t.d.getElementById('smartHomeSummaryUpdated')?.textContent||'',/Нет данных/);
 }finally{t.close()}
});
test('elapsed freshness updates on navigation and on both screens without another request',async()=>{
 const t=await setup();try{
 const now=t.w.Date.now();t.w.Date.now=()=>now+6*60*1000;
 t.w.dispatchEvent(new t.w.CustomEvent('rudi:app-tab-change',{detail:{tab:'smart-home'}}));
 assert.match(t.d.getElementById('smartHomeActiveLabel').textContent,/Были включены/);
 assert.match(t.d.getElementById('smartHomePageUpdated')?.textContent||'',/Последние данные/);
 assert.equal(t.calls.filter(x=>x.operation==='list').length,1);
 }finally{t.close()}
});
test('a failed quick command reports the error on home and keeps the actual power state',async()=>{
 const t=await setup();try{
 t.setFail(true);t.d.querySelector('#smartHomeActiveDevices button[aria-label="Выключить Торшер"]').click();
 await new Promise(r=>setTimeout(r,20));
 const status=t.d.getElementById('smartHomeSummaryStatus');assert.ok(status,'home action feedback exists');
 assert.equal(status.hidden,false);assert.match(status.textContent,/Не удалось изменить состояние Торшер/);
 assert.match(t.d.getElementById('smartHomeActiveDevices').textContent,/Торшер/);
 }finally{t.close()}
});
