const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const prefs=require('../api/ui-preferences-store.cjs');
const {normalizeUiPreferences}=require('../api/rudi-backup.cjs');
const alert=()=>require('../api/smart-home-temperature-alert.cjs');
const snapshot=value=>({devices:[{properties:[{parameters:{instance:'temperature'},state:{value}},{parameters:{instance:'humidity'},state:{value:45}}]}]});
function setup(){
  let state=null;const pushes=[];
  return {pushes,options:{
    db:{read:async()=>structuredClone(state),write:async next=>{state=structuredClone(next)}},
    readUiPreferencesImpl:async()=>({temperatureAlertEnabled:true}),
    sendPushNotificationImpl:async(actor,payload)=>{pushes.push({actor,payload});return {sent:true}},
    now:'2026-10-17T00:00:00Z',
  }};
}
test('temperature preference defaults on, survives actor-specific partial saves and backup',async()=>{
  assert.equal(prefs.normalizeUiPreferencesState({}).temperatureAlertEnabled,true);
  const map=new Map(),options={uiPreferencesCache:{get:async k=>map.get(k),set:async(k,v)=>map.set(k,v)}};
  await prefs.saveUiPreferences('Диана',{temperatureAlertEnabled:false,humidityAlertEnabled:false},options);
  await prefs.saveUiPreferences('Диана',{themeMode:'dark'},options);
  assert.equal((await prefs.readUiPreferences('Диана',options)).temperatureAlertEnabled,false);
  assert.equal((await prefs.readUiPreferences('Рустам',options)).temperatureAlertEnabled,true);
  assert.equal(normalizeUiPreferences({'Диана':{temperatureAlertEnabled:false}})['Диана'].temperatureAlertEnabled,false);
  const seeded=await prefs.seedUiPreferences('Рустам',{temperatureAlertEnabled:false},options);
  assert.equal(seeded.temperatureAlertEnabled,false);
});
test('seasonal temperature warnings match the existing climate assessment at boundaries',async()=>{
  const window={},document={readyState:'loading',addEventListener(){}};
  vm.runInNewContext(fs.readFileSync('public/smart-home.js','utf8'),{window,document,Intl,Date,console,setTimeout,clearTimeout});
  for(const date of ['2026-10-17T00:00:00Z','2026-07-17T00:00:00Z','2026-04-30T21:00:00Z','2026-09-30T21:00:00Z']){
    for(const value of [17,17.96,18,19.9,20,22,25,25.04,25.1,28,28.1]){
      const expected=window.RUDI_SMART_HOME.assessClimate('temperature',value,new Date(date));
      const {options}=setup();
      const result=await alert().evaluateTemperatureAlert(snapshot(value),{...options,now:date});
      assert.equal(result.sent.length,expected.level==='alert'?2:0,`${date} ${value} ${expected.label}`);
    }
  }
});
test('temperature sends push with home deep link and remains quiet until recovery',async()=>{
  const {options,pushes}=setup();
  const first=await alert().evaluateTemperatureAlert(snapshot(17),options);
  assert.deepEqual(first.sent,['Рустам','Диана']);assert.equal(first.condition,'cold');
  assert.match(pushes[0].payload.body,/17.*°C/);
  assert.equal(pushes[0].payload.url,'/?tab=home&item=smart-home');
  assert.equal(pushes[0].payload.tag,'home-temperature');
  const sustained=await alert().evaluateTemperatureAlert(snapshot(16),{...options,now:'2026-10-19T00:00:00Z'});
  assert.deepEqual(sustained.sent,[]);
  await alert().evaluateTemperatureAlert(snapshot(19),{...options,now:'2026-10-19T01:00:00Z'});
  assert.deepEqual((await alert().evaluateTemperatureAlert(snapshot(17),{...options,now:'2026-10-19T02:00:00Z'})).sent,[]);
  await alert().evaluateTemperatureAlert(snapshot(21),{...options,now:'2026-10-19T03:00:00Z'});
  assert.deepEqual((await alert().evaluateTemperatureAlert(snapshot(17),{...options,now:'2026-10-19T04:00:00Z'})).sent,['Рустам','Диана']);
});
test('cooldown does not consume a recovered alert and expires after twelve hours',async()=>{
  const {options}=setup();
  await alert().evaluateTemperatureAlert(snapshot(27),options);
  await alert().evaluateTemperatureAlert(snapshot(21),{...options,now:'2026-10-17T01:00:00Z'});
  assert.deepEqual((await alert().evaluateTemperatureAlert(snapshot(27),{...options,now:'2026-10-17T02:00:00Z'})).sent,[]);
  assert.deepEqual((await alert().evaluateTemperatureAlert(snapshot(27),{...options,now:'2026-10-17T12:00:00Z'})).sent,['Рустам','Диана']);
});
test('disabled recipients and failed deliveries retain the ability to receive a later alert',async()=>{
  const {options}=setup();let fail=true,disabled=true;
  options.readUiPreferencesImpl=async actor=>({temperatureAlertEnabled:actor!=='Диана'||!disabled});
  options.sendPushNotificationImpl=async()=>{if(fail)throw Error('failed');return {sent:true}};
  assert.deepEqual((await alert().evaluateTemperatureAlert(snapshot(27),options)).sent,[]);
  fail=false;
  assert.deepEqual((await alert().evaluateTemperatureAlert(snapshot(27),options)).sent,['Рустам']);
  disabled=false;
  assert.deepEqual((await alert().evaluateTemperatureAlert(snapshot(27),options)).sent,['Диана']);
});
test('unconfigured push and preference lookup failure do not consume alerts',async()=>{
  const {options}=setup();options.sendPushNotificationImpl=async()=>({sent:false});
  assert.deepEqual((await alert().evaluateTemperatureAlert(snapshot(27),options)).sent,[]);
  options.sendPushNotificationImpl=async()=>({sent:true});options.readUiPreferencesImpl=async()=>{throw Error('unavailable')};
  assert.deepEqual((await alert().evaluateTemperatureAlert(snapshot(27),options)).sent,[]);
  options.readUiPreferencesImpl=async()=>({temperatureAlertEnabled:true});
  assert.deepEqual((await alert().evaluateTemperatureAlert(snapshot(27),options)).sent,['Рустам','Диана']);
});
test('missing, malformed and offline sensor readings never alert or rearm',async()=>{
  for(const value of [null,undefined,'',' ','invalid',NaN,Infinity,false,[],{},-31,61]){
    assert.equal(alert().extractTemperature(snapshot(value)),null,String(value));
  }
  assert.equal(alert().extractTemperature({devices:[]}),null);
  for(const metadata of [{state:'offline'},{online:false},{reachable:false},{error_code:'DEVICE_UNREACHABLE'}]){
    const data=snapshot(17);Object.assign(data.devices[0],metadata);
    const {options,pushes}=setup();const result=await alert().evaluateTemperatureAlert(data,options);
    assert.equal(result.temperature,null);assert.equal(pushes.length,0);
  }
  const bad=snapshot(17);bad.devices[0].properties[0].state.error_code='DEVICE_UNREACHABLE';
  assert.equal(alert().extractTemperature(bad),null);
});
test('settings expose a separate temperature toggle and existing cron evaluates the same snapshot',()=>{
  const app=fs.readFileSync('public/app.js','utf8'),api=fs.readFileSync('api/index.js','utf8');
  assert.match(app,/id="settingsTemperatureAlertToggle"/);
  assert.match(app,/temperatureAlertEnabled:next/);
  assert.match(app,/temperatureAlertStorageKey\(\),remote.temperatureAlertEnabled===false/);
  assert.match(api,/evaluateTemperatureAlert\(snapshot,/);
});
test('snapshot normalization preserves explicit offline and property errors',async()=>{
  const {readSmartHomeSnapshot}=require('../api/smart-home-client.cjs');
  for(const metadata of [{state:'offline'},{online:false},{reachable:false},{error_code:'DEVICE_UNREACHABLE'}]){
    const data=snapshot(17);Object.assign(data.devices[0],metadata);
    const normalized=await readSmartHomeSnapshot(true,{tokenValue:'test',observeCamera:false,fetchImpl:async()=>({ok:true,json:async()=>data})});
    assert.equal(alert().extractTemperature(normalized),null,JSON.stringify(metadata));
  }
  const data=snapshot(17);data.devices[0].properties[0].error_code='NOT_FOUND';
  const normalized=await readSmartHomeSnapshot(true,{tokenValue:'test',observeCamera:false,fetchImpl:async()=>({ok:true,json:async()=>data})});
  assert.equal(alert().extractTemperature(normalized),null);
});
test('temperature toggle updates only the active actor and synchronizes its patch',()=>{
  const app=fs.readFileSync('public/app.js','utf8'),values=new Map(),patches=[];
  const toggle={checked:null,setAttribute(key,value){if(key==='aria-checked')this.checked=value}};
  const context={currentActor:'Рустам',localStorage:{getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,value)},document:{getElementById:()=>toggle},markUiPreferencesChanged:patch=>patches.push(patch),tg:null};
  for(const name of ['temperatureAlertStorageKey','temperatureAlertEnabled','updateTemperatureAlertSettingsUi','setTemperatureAlertEnabled']){
    const fn=app.match(new RegExp('      function '+name+'\\([^]*?^      }','m'))?.[0];assert.ok(fn,name);vm.runInNewContext(fn,context);
  }
  vm.runInNewContext('setTemperatureAlertEnabled(false)',context);
  assert.equal(toggle.checked,'false');assert.equal(patches[0].temperatureAlertEnabled,false);
  context.currentActor='Диана';
  assert.equal(vm.runInNewContext('temperatureAlertEnabled()',context),true);
  context.currentActor='Рустам';
  assert.equal(vm.runInNewContext('temperatureAlertEnabled()',context),false);
});
test('hot readings rearm only below comfort ceiling; offline recovery cannot rearm',async()=>{
  const {options}=setup();
  await alert().evaluateTemperatureAlert(snapshot(27),options);
  await alert().evaluateTemperatureAlert(snapshot(24),{...options,now:'2026-10-18T00:00:00Z'});
  const offline=snapshot(21);offline.devices[0].online=false;
  await alert().evaluateTemperatureAlert(offline,{...options,now:'2026-10-18T01:00:00Z'});
  assert.deepEqual((await alert().evaluateTemperatureAlert(snapshot(27),{...options,now:'2026-10-18T02:00:00Z'})).sent,[]);
  await alert().evaluateTemperatureAlert(snapshot(22),{...options,now:'2026-10-18T03:00:00Z'});
  assert.deepEqual((await alert().evaluateTemperatureAlert(snapshot(27),{...options,now:'2026-10-18T04:00:00Z'})).sent,['Рустам','Диана']);
});
